"""Decide WHO gets WHICH retention action under a budget.

For every at-risk customer and every action:

    revenue_saved = P(churn) x value_90d x uplift(action, customer)
    net_value     = revenue_saved x margin_rate - cost(action, customer)

Then pick each customer's best action (net_value > 0) and fund them in
order of net_value / cost until the budget runs out.

The uplift and cost numbers below are ASSUMPTIONS, typical of retention
campaigns. They live in one table so a merchant can replace them with
their own A/B test results.
"""

from dataclasses import dataclass

import pandas as pd

COUPON_REDEMPTION = 0.5   # share of coupons actually used


@dataclass(frozen=True)
class Action:
    key: str
    label: str
    base_uplift: float        # share of at-risk revenue it wins back
    fixed_cost: float = 0.0   # $ per customer
    discount: float = 0.0     # % off the next order


ACTIONS = [
    Action("free_shipping", "Free shipping for 30 days", 0.08, fixed_cost=6.0),
    Action("coupon_10", "10% off next order", 0.14, discount=0.10),
    Action("coupon_20", "20% off next order", 0.24, discount=0.20),
    Action("personal_call", "Personal call + issue resolved", 0.30, fixed_cost=15.0),
]


def uplift(a: Action, c: pd.Series) -> float:
    """How well this action works on THIS customer - the personalisation."""
    u = a.base_uplift
    if a.discount:                      # deal-seekers respond to coupons, others less
        u *= 0.5 + c["discount_share"]
    if a.key == "personal_call":        # a call fixes complaints; otherwise it's just noise
        u *= 1.0 if (c["complaints_90"] > 0 or c["churn_threat_90"]) else 0.25
    return min(u, 0.6)


def cost(a: Action, c: pd.Series) -> float:
    return a.fixed_cost + a.discount * c["aov"] * COUPON_REDEMPTION


def best_action(c: pd.Series, only_profitable: bool = True) -> dict | None:
    options = []
    for a in ACTIONS:
        saved = c["churn_prob"] * c["value_90"] * uplift(a, c)
        spend = cost(a, c)
        options.append({"action": a.key, "label": a.label, "revenue_saved": saved,
                        "cost": spend, "net_value": saved * c["margin_rate"] - spend})
    best = max(options, key=lambda o: o["net_value"])
    return best if best["net_value"] > 0 or not only_profitable else None


def plan(scored: pd.DataFrame, budget: float, min_prob: float = 0.2) -> dict:
    """Build the campaign: one row per funded customer, plus totals."""
    rows = []
    for cid, c in scored[scored["churn_prob"] >= min_prob].iterrows():
        choice = best_action(c)
        if choice:
            rows.append({"customer_id": cid, "name": c["name"], "tier": c["tier"],
                         "churn_prob": c["churn_prob"], **choice})

    rows.sort(key=lambda r: r["net_value"] / max(r["cost"], 0.01), reverse=True)
    funded, spent = [], 0.0
    for r in rows:
        if spent + r["cost"] <= budget:
            funded.append(r)
            spent += r["cost"]

    saved = sum(r["revenue_saved"] for r in funded)
    net = sum(r["net_value"] for r in funded)
    mix = pd.Series([r["label"] for r in funded]).value_counts().to_dict() if funded else {}
    return {"budget": budget, "spent": spent, "customers": len(funded), "candidates": len(rows),
            "revenue_saved": saved, "net_margin_gain": net, "roi": net / spent if spent else 0.0,
            "action_mix": mix, "rows": funded}
