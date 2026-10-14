"""The pipeline in one object: data -> signals -> features -> model -> actions.

The CLI, the agent's tools and (later) a web frontend all call this class,
so none of them needs to know how the pieces fit together.
"""

import math
from datetime import timedelta

import pandas as pd

from . import config, data, features, optimizer, signals
from .config import HORIZON_DAYS, TODAY
from .llm import LLM
from .model import ChurnModel, train
from .prompts import MESSAGE_SYSTEM

TEMPLATES = {
    "en": "Hi {first},\n\nWe noticed we haven't seen you in a while{issue}. We'd love to welcome you back, "
          "so here's something just for you: {offer}.\n\nThe Northwind Outfitters team",
    "es": "Hola {first}:\n\nHace tiempo que no te vemos{issue}. Nos encantaría verte de nuevo, "
          "así que tenemos algo para ti: {offer}.\n\nEl equipo de Northwind Outfitters",
    "de": "Hallo {first},\n\nwir haben dich eine Weile nicht gesehen{issue}. Wir würden uns freuen, "
          "dich wiederzusehen - deshalb für dich: {offer}.\n\nDein Northwind Outfitters Team",
}
ISSUE = {"en": " - and we're sorry about your recent experience", "es": " - y sentimos tu última experiencia",
         "de": " - und es tut uns leid, was zuletzt passiert ist"}


class Engine:
    def __init__(self, regenerate: bool = False):
        self.llm = LLM()
        self.ds = data.load(regenerate)
        self.records = data.texts(self.ds)
        self.signals = signals.load_cache()
        missing = [r for r in self.records if r[0] not in self.signals]
        if missing:                       # first run: cheap fallback until /enrich runs on AMD
            self.signals.update(signals.heuristic_all(missing))
            signals.save_cache(self.signals)
        self.refresh()

    # ---------------------------------------------------------------- pipeline
    def refresh(self) -> None:
        """Retrain on history, then score every active customer as of today.

        Builds into locals and swaps model + scores in at the end, so a web
        request running mid-refresh never sees a new model with old scores.
        """
        cutoff = TODAY - timedelta(days=HORIZON_DAYS)
        train_f = features.build(self.ds, self.signals, cutoff)
        model: ChurnModel = train(train_f, features.churn_labels(self.ds, cutoff, HORIZON_DAYS))

        f = features.build(self.ds, self.signals, TODAY)
        f["churn_prob"] = model.predict(f)
        f["drivers"] = model.drivers(f)
        f["value_90"] = f["revenue_180"] / 2          # expected 90-day revenue if they stay
        f["value_at_risk"] = f["churn_prob"] * f["value_90"]
        rank = f["revenue_180"].rank(pct=True)
        f["tier"] = pd.cut(rank, [0, 0.4, 0.8, 1.0], labels=["Occasional", "Regular", "VIP"]).astype(str)
        f["risk"] = pd.cut(f["churn_prob"], [-0.01, 0.2, 0.4, 1.0], labels=["Low", "Medium", "High"]).astype(str)
        info = self.ds.customers.set_index("customer_id")[["name", "language"]]
        self.model, self.scored = model, f.join(info).sort_values("churn_prob", ascending=False)

    @property
    def llm_share(self) -> float:
        return sum(s["source"] == "llm" for s in self.signals.values()) / max(len(self.signals), 1)

    def enrich_plan(self, force: bool = False) -> dict:
        """What an /enrich run would cost: messages, requests and an estimated duration."""
        todo = len(signals.pending(self.records, self.signals, force))
        requests = math.ceil(todo / max(config.LLM_BATCH_SIZE, 1))
        return {"pending": todo, "total": len(self.records), "requests": requests,
                "batch_size": config.LLM_BATCH_SIZE, "rpm": config.LLM_RPM,
                "est_minutes": round(requests / config.LLM_RPM, 1) if config.LLM_RPM else None}

    def enrich(self, on_progress=lambda n: None, force: bool = False) -> dict:
        """Read tickets and reviews with the LLM on AMD, then retrain.

        Resumable: messages already read by the LLM are skipped (unless `force`), and
        progress is saved after every batch, so an interrupted run loses nothing.
        """
        auc_before = self.model.auc_full
        todo = signals.pending(self.records, self.signals, force)

        def save(batch: dict) -> None:
            self.signals = {**self.signals, **batch}    # swap, don't mutate: readers may be mid-request
            signals.save_cache(self.signals)

        _, stats = signals.enrich_llm(self.llm, todo, on_progress, on_batch=save)
        self.refresh()
        return {**stats, "skipped": len(self.records) - len(todo), "auc_before": auc_before,
                "auc_after": self.model.auc_full, "auc_orders_only": self.model.auc_orders_only}

    # ---------------------------------------------------------------- queries
    def dashboard(self) -> dict:
        s = self.scored
        high = s[s["risk"] == "High"]
        recent = self._texts(TODAY - timedelta(days=90))
        complaints = recent[recent["customer_id"].isin(high.index) & (recent["sentiment"] < -0.2)]
        return {
            "active_customers": len(s),
            "revenue_180": float(s["revenue_180"].sum()),
            "revenue_at_risk_90": float(s["value_at_risk"].sum()),
            "high_risk": len(high),
            "vip_high_risk": int((high["tier"] == "VIP").sum()),
            "avg_churn_prob": float(s["churn_prob"].mean()),
            "auc_full": self.model.auc_full,
            "auc_orders_only": self.model.auc_orders_only,
            "n_train": self.model.n_train,
            "base_rate": self.model.base_rate,
            "llm_share": self.llm_share,
            "top_complaints": complaints["category"].value_counts().head(4).to_dict(),
        }

    def at_risk(self, limit: int = 10, tier: str | None = None, by: str = "churn_prob") -> pd.DataFrame:
        """Riskiest customers, by probability or by $ at risk (by="value_at_risk")."""
        s = self.scored if not tier else self.scored[self.scored["tier"].str.lower() == tier.lower()]
        return s.sort_values(by, ascending=False).head(limit)

    def customer(self, cid: str) -> dict | None:
        cid = cid.upper()
        if cid not in self.scored.index:
            return None
        texts = self._texts(TODAY - timedelta(days=180))
        orders = self.ds.orders[self.ds.orders["customer_id"] == cid].merge(
            self.ds.products[["sku", "name"]], on="sku")
        contrib = self.model.contributions(self.scored.loc[[cid]]).iloc[0].sort_values(ascending=False)
        return {"id": cid, "row": self.scored.loc[cid], "orders": orders.tail(6),
                "texts": texts[texts["customer_id"] == cid], "contributions": contrib,
                "action": optimizer.best_action(self.scored.loc[cid], only_profitable=False)}

    def plan(self, budget: float) -> dict:
        return optimizer.plan(self.scored, budget)

    def draft_message(self, cid: str) -> dict | None:
        c = self.customer(cid)
        if not c:
            return None
        row, action = c["row"], c["action"]
        complaints = c["texts"][c["texts"]["sentiment"] < -0.2]["text"].tail(2).tolist()
        favourite = c["orders"]["name"].mode().iloc[0] if len(c["orders"]) else "our new collection"

        if self.llm.available:
            brief = (f"Customer: {row['name']} (language: {row['language']}, tier: {row['tier']})\n"
                     f"Favourite product: {favourite}\nDays since last order: {int(row['recency_days'])}\n"
                     f"Recent complaints: {complaints or 'none'}\nOffer to include: {action['label']}")
            resp = self.llm.chat([{"role": "system", "content": MESSAGE_SYSTEM},
                                  {"role": "user", "content": brief}], temperature=0.6, max_tokens=300)
            text, source = resp.choices[0].message.content.strip(), "llm"
        else:
            lang = row["language"] if row["language"] in TEMPLATES else "en"
            text = TEMPLATES[lang].format(first=row["name"].split()[0], offer=action["label"],
                                          issue=ISSUE[lang] if complaints else "")
            source = "template"
        return {"customer": c, "action": action, "message": text, "source": source}

    # ---------------------------------------------------------------- helpers
    def _texts(self, since) -> pd.DataFrame:
        """Tickets + reviews since a date, with their extracted signals attached."""
        t = pd.concat([
            self.ds.tickets.rename(columns={"ticket_id": "id"}).assign(kind="ticket"),
            self.ds.reviews.rename(columns={"review_id": "id"}).assign(kind="review"),
        ])
        t = t[t["date"] > pd.Timestamp(since)].copy()
        sig = t["id"].map(lambda i: self.signals.get(i, {}))
        for key, default in [("sentiment", 0.0), ("category", "other"), ("churn_threat", False), ("summary", "")]:
            t[key] = sig.map(lambda s, k=key, d=default: s.get(k, d))
        return t.sort_values("date")
