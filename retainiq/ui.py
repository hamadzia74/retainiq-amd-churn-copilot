"""Everything that PRINTS lives here. Other modules return data; this file
decides how it looks. A web frontend later replaces only this file."""

import sys

import pandas as pd
from rich import box
from rich.columns import Columns
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# Windows terminals often default to cp1252; customer names have accents.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

console = Console()
RISK_COLOUR = {"High": "red", "Medium": "yellow", "Low": "green"}
TIER_COLOUR = {"VIP": "magenta", "Regular": "cyan", "Occasional": "white"}


def money(x: float) -> str:
    return f"-${-x:,.0f}" if x < 0 else f"${x:,.0f}"


def prob_bar(p: float, width: int = 10) -> Text:
    colour = "red" if p >= 0.4 else "yellow" if p >= 0.2 else "green"
    filled = round(p * width)
    return Text("█" * filled + "░" * (width - filled) + f" {p:4.0%}", style=colour)


def sentiment(s: float) -> Text:
    return Text(f"{s:+.1f}", style="red" if s < -0.2 else "green" if s > 0.2 else "white")


def info(msg: str) -> None:
    console.print(f"[dim]{msg}[/]")


def error(msg: str) -> None:
    console.print(f"[bold red]✗[/] {msg}")


# ---------------------------------------------------------------- screens
def banner(llm_label: str, llm_share: float) -> None:
    title = Text.assemble(("RetainIQ", "bold red"), "  ·  churn-prevention copilot  ·  ", ("powered by AMD", "bold"))
    body = (f"[bold]LLM:[/] {llm_label}\n"
            f"[bold]Text signals:[/] {llm_share:.0%} extracted by LLM"
            + ("" if llm_share > 0.99 else "  [yellow](run /enrich to read tickets & reviews on AMD)[/]")
            + "\n[bold]Store:[/] Northwind Outfitters (synthetic demo data)   [dim]/help for commands[/]")
    console.print(Panel(body, title=title, border_style="red", box=box.DOUBLE))


def help_screen() -> None:
    t = Table(box=box.SIMPLE, show_header=False)
    for cmd, desc in [
        ("/dashboard", "Store-wide retention KPIs and model accuracy"),
        ("/risk [n] [tier] [$]", "Top-n likely churners (tier: vip|regular|occasional; $ = sort by $ at risk)"),
        ("/customer <id>", "Customer 360: score, why, tickets & reviews, best action"),
        ("/plan <budget>", "Optimise a retention campaign for a $ budget"),
        ("/message <id>", "Draft a personalised win-back message (LLM, their language)"),
        ("/enrich [all]", "Read tickets & reviews with the LLM on AMD, retrain (resumes; 'all' re-reads)"),
        ("/model", "How the churn prediction is calculated"),
        ("/exit", "Quit"),
        ("anything else", "Ask the agent, e.g. 'which VIPs should I call this week?'"),
    ]:
        t.add_row(f"[bold cyan]{cmd}[/]", desc)
    console.print(Panel(t, title="Commands", border_style="cyan"))


def dashboard(d: dict) -> None:
    def kpi(label, value, colour="white"):
        return Panel(Text(value, style=f"bold {colour}", justify="center"), title=label, width=28)

    console.print(Columns([
        kpi("Active customers", f"{d['active_customers']:,}"),
        kpi("Revenue (180d)", money(d["revenue_180"])),
        kpi("Revenue at risk (90d)", money(d["revenue_at_risk_90"]), "red"),
        kpi("High-risk customers", f"{d['high_risk']}  ({d['vip_high_risk']} VIP)", "yellow"),
    ]))
    lift = d["auc_full"] - d["auc_orders_only"]
    model = (f"Logistic regression · trained on {d['n_train']:,} customers · base churn rate {d['base_rate']:.0%}\n"
             f"ROC-AUC (5-fold CV):  orders only [bold]{d['auc_orders_only']:.3f}[/]  →  "
             f"+ text signals [bold green]{d['auc_full']:.3f}[/]  ([green]{lift:+.3f}[/] from reading tickets & reviews)\n"
             f"Text signals source: {d['llm_share']:.0%} LLM on AMD, {1 - d['llm_share']:.0%} keyword fallback")
    console.print(Panel(model, title="Prediction quality", border_style="blue"))
    if d["top_complaints"]:
        t = Table(box=box.SIMPLE, title="Why high-risk customers are unhappy (last 90 days)")
        t.add_column("Complaint category")
        t.add_column("Messages", justify="right")
        for cat, n in d["top_complaints"].items():
            t.add_row(cat.replace("_", " "), str(n))
        console.print(t)


def risk_table(df: pd.DataFrame) -> None:
    t = Table(box=box.ROUNDED, title="Customers most likely to stop buying (next 90 days)", title_style="bold")
    for col, kw in [("ID", {}), ("Name", {}), ("Tier", {}), ("Churn risk", {}),
                    ("Spend 180d", {"justify": "right"}), ("$ at risk", {"justify": "right"}), ("Last order", {"justify": "right"}), ("Why", {})]:
        t.add_column(col, **kw)
    for cid, r in df.iterrows():
        t.add_row(cid, r["name"], f"[{TIER_COLOUR[r['tier']]}]{r['tier']}[/]", prob_bar(r["churn_prob"]),
                  money(r["revenue_180"]), money(r["value_at_risk"]), f"{int(r['recency_days'])}d ago", "; ".join(r["drivers"]) or "-")
    console.print(t)


def customer_view(c: dict) -> None:
    r = c["row"]
    head = (f"[bold]{r['name']}[/]  ·  {c['id']}  ·  [{TIER_COLOUR[r['tier']]}]{r['tier']}[/]  ·  "
            f"language: {r['language']}\n"
            f"Spend 180d {money(r['revenue_180'])} · {int(r['orders_90'])} orders in 90d · "
            f"last order {int(r['recency_days'])}d ago · discount share {r['discount_share']:.0%}")
    risk = Text.assemble("Churn risk  ", prob_bar(r["churn_prob"], 20), f"   ({r['risk']})")
    console.print(Panel(Text.from_markup(head + "\n") + risk, title="Customer 360", border_style="cyan"))

    why = Table(box=box.SIMPLE, title="Why the model says so (log-odds contribution)")
    why.add_column("Feature")
    why.add_column("Effect", justify="right")
    for feat, v in pd.concat([c["contributions"].head(4), c["contributions"].tail(2)]).items():
        why.add_row(feat, Text(f"{v:+.2f}", style="red" if v > 0 else "green"))

    msgs = Table(box=box.SIMPLE, title="Tickets & reviews (180d) - extracted signals")
    for col in ["Date", "Type", "Mood", "Category", "Text"]:
        msgs.add_column(col, overflow="fold", max_width=55 if col == "Text" else None)
    for _, m in c["texts"].tail(6).iterrows():
        threat = " [bold red]⚠ threat[/]" if m["churn_threat"] else ""
        msgs.add_row(str(m["date"].date()), m["kind"], sentiment(m["sentiment"]),
                     m["category"].replace("_", " ") + threat, m["summary"] or m["text"])
    console.print(Columns([why, msgs]))

    a = c["action"]
    console.print(Panel(f"[bold green]{a['label']}[/]   expected revenue saved {money(a['revenue_saved'])} · "
                        f"cost {money(a['cost'])} · net margin {money(a['net_value'])}",
                        title="Recommended action", border_style="green"))


def plan_view(p: dict) -> None:
    summary = (f"Budget {money(p['budget'])} → spend [bold]{money(p['spent'])}[/] on [bold]{p['customers']}[/] customers"
               f" (of {p['candidates']} with a profitable action)\n"
               f"Expected revenue saved [bold green]{money(p['revenue_saved'])}[/] · "
               f"net margin gain [bold green]{money(p['net_margin_gain'])}[/] · ROI [bold]{p['roi']:.0%}[/]\n"
               f"Action mix: " + ", ".join(f"{k} × {v}" for k, v in p["action_mix"].items()))
    console.print(Panel(summary, title="Retention campaign plan", border_style="green"))
    t = Table(box=box.ROUNDED, title="Top funded customers (ranked by net value per $)")
    for col in ["ID", "Name", "Tier", "Risk", "Action", "Cost", "Rev. saved", "Net"]:
        t.add_column(col, justify="right" if col in ("Cost", "Rev. saved", "Net") else "left")
    for r in p["rows"][:15]:
        t.add_row(r["customer_id"], r["name"], r["tier"], prob_bar(r["churn_prob"], 6), r["label"],
                  money(r["cost"]), money(r["revenue_saved"]), money(r["net_value"]))
    console.print(t)
    info("EV = P(churn) × expected 90d revenue × uplift(action, customer) × margin − cost. "
         "Uplift/cost assumptions: retainiq/optimizer.py")


def message_view(m: dict) -> None:
    r = m["customer"]["row"]
    src = "LLM on AMD" if m["source"] == "llm" else "template (LLM offline)"
    console.print(Panel(m["message"], title=f"Win-back message → {r['name']} ({r['language']})",
                        subtitle=f"offer: {m['action']['label']} · written by {src}", border_style="magenta"))


def enrich_summary(s: dict) -> None:
    console.print(Panel(
        f"Read [bold]{s['records']:,}[/] tickets & reviews in [bold]{s['seconds']:.1f}s[/] "
        f"([bold]{s['records_per_s']:.1f}[/] msgs/s, [bold]{s['tokens_per_s']:,.0f}[/] tokens/s)\n"
        f"Tokens: {s['prompt_tokens']:,} in / {s['completion_tokens']:,} out · failures fell back to heuristic: {s['failed']}\n"
        f"Model ROC-AUC: {s['auc_before']:.3f} → [bold green]{s['auc_after']:.3f}[/] "
        f"(orders-only baseline {s['auc_orders_only']:.3f})",
        title="LLM enrichment on AMD complete", border_style="red"))


def model_explainer(weights: pd.Series) -> None:
    t = Table(box=box.SIMPLE, title="Model weights (standardised; + pushes toward churn)")
    t.add_column("Feature")
    t.add_column("Weight", justify="right")
    for k, v in weights.items():
        t.add_row(k, Text(f"{v:+.2f}", style="red" if v > 0 else "green"))
    console.print(Panel(
        "1. Rebuild every customer's features as they looked [bold]90 days ago[/] (no peeking ahead).\n"
        "2. Label = 1 if they then placed [bold]no order in the next 90 days[/].\n"
        "3. Fit a logistic regression on order features + LLM text signals; score with 5-fold CV ROC-AUC.\n"
        "4. Apply the fitted model to today's features → P(churn in next 90 days).\n"
        "The LLM never predicts churn: it only turns text into features (sentiment, category, threat).",
        title="How churn is predicted", border_style="blue"))
    console.print(t)


def tool_call(name: str, args: dict) -> None:
    console.print(f"  [dim]⚙ {name}({', '.join(f'{k}={v!r}' for k, v in args.items())})[/]")


def answer(text: str) -> None:
    console.print(Panel(Markdown(text), title="RetainIQ", border_style="blue"))
