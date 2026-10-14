"""Engine results (pandas rows, numpy numbers) -> plain JSON-able dicts.

Shared by the agent's tools and the web API, so both describe a customer,
a plan or the model in exactly the same shape.
"""

import math

import pandas as pd

from .engine import Engine
from .features import FEATURE_NAMES


def num(x, n: int = 2) -> float:
    x = float(x)
    return 0.0 if math.isnan(x) else round(x, n)


def _clean(d: dict) -> dict:
    return {k: (num(v, 3) if isinstance(v, float) else v) for k, v in d.items()}


def dashboard(engine: Engine) -> dict:
    return _clean(engine.dashboard())


def at_risk(df: pd.DataFrame) -> list[dict]:
    return [{"customer_id": cid, "name": r["name"], "tier": r["tier"], "risk": r["risk"],
             "churn_prob": num(r["churn_prob"], 3), "revenue_180": num(r["revenue_180"]),
             "value_at_risk": num(r["value_at_risk"]), "days_since_order": int(r["recency_days"]),
             "drivers": list(r["drivers"])}
            for cid, r in df.iterrows()]


def action(a: dict) -> dict:
    return _clean(a)


def customer(c: dict, full: bool = False) -> dict:
    r = c["row"]
    texts = c["texts"] if full else c["texts"].tail(5)
    out = {"customer_id": c["id"], "name": r["name"], "language": r["language"], "tier": r["tier"],
           "risk": r["risk"], "churn_prob": num(r["churn_prob"], 3), "drivers": list(r["drivers"]),
           "revenue_180": num(r["revenue_180"]), "value_at_risk": num(r["value_at_risk"]),
           "orders_90": int(r["orders_90"]), "days_since_order": int(r["recency_days"]),
           "discount_share": num(r["discount_share"]), "return_rate": num(r["return_rate"]),
           "recent_messages": [{"id": t["id"], "date": str(t["date"].date()), "kind": t["kind"],
                                "sentiment": num(t["sentiment"]), "category": t["category"],
                                "threat": bool(t["churn_threat"]), "summary": t["summary"], "text": t["text"]}
                               for _, t in texts.iterrows()],
           "recommended_action": action(c["action"])}
    if full:
        out["contributions"] = [{"feature": k, "label": FEATURE_NAMES[k], "effect": num(v, 3)}
                                for k, v in c["contributions"].items()]
        out["orders"] = [{"order_id": o["order_id"], "date": str(o["date"].date()), "product": o["name"],
                          "revenue": num(o["revenue"]), "discount_used": bool(o["discount_used"]),
                          "returned": bool(o["returned"])}
                         for _, o in c["orders"].iterrows()]
    return out


def plan(p: dict, top: int | None = None) -> dict:
    out = _clean({k: v for k, v in p.items() if k != "rows"})
    rows = p["rows"] if top is None else p["rows"][:top]
    out["rows"] = [_clean({k: r[k] for k in ("customer_id", "name", "tier", "churn_prob", "action", "label",
                                             "cost", "revenue_saved", "net_value")}) for r in rows]
    return out


def message(m: dict) -> dict:
    r = m["customer"]["row"]
    return {"customer_id": m["customer"]["id"], "name": r["name"], "language": r["language"],
            "offer": m["action"]["label"], "message": m["message"], "source": m["source"]}


def model(engine: Engine) -> dict:
    m = engine.model
    return {"auc_full": num(m.auc_full, 3), "auc_orders_only": num(m.auc_orders_only, 3),
            "n_train": m.n_train, "base_rate": num(m.base_rate, 3),
            "weights": [{"feature": k, "label": FEATURE_NAMES[k], "weight": num(v, 3)}
                        for k, v in m.weights().items()]}
