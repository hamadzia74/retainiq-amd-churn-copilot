"""The tools the agent may call. Each one wraps an Engine query and returns
plain JSON-able data (via serializers.py), so every number the agent says
comes from here."""

from . import serializers as ser
from .engine import Engine


def get_dashboard(engine: Engine) -> dict:
    return ser.dashboard(engine)


def list_at_risk(engine: Engine, limit: int = 10, tier: str | None = None) -> list[dict]:
    return ser.at_risk(engine.at_risk(min(int(limit), 25), tier))


def get_customer(engine: Engine, customer_id: str) -> dict:
    c = engine.customer(customer_id)
    return ser.customer(c) if c else {"error": f"No active customer {customer_id}"}


def plan_campaign(engine: Engine, budget: float) -> dict:
    return ser.plan(engine.plan(float(budget)), top=8)


def draft_message(engine: Engine, customer_id: str) -> dict:
    m = engine.draft_message(customer_id)
    return ser.message(m) if m else {"error": f"No active customer {customer_id}"}


REGISTRY = {f.__name__: f for f in [get_dashboard, list_at_risk, get_customer, plan_campaign, draft_message]}


def _fn(name: str, description: str, props: dict | None = None, required: list | None = None) -> dict:
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": props or {}, "required": required or []}}}


CID = {"customer_id": {"type": "string", "description": "e.g. C0042"}}

SCHEMAS = [
    _fn("get_dashboard", "Store-wide retention KPIs: revenue at risk, high-risk counts, model accuracy, top complaints."),
    _fn("list_at_risk", "Customers most likely to churn in the next 90 days, with the reasons.",
        {"limit": {"type": "integer", "description": "max 25"},
         "tier": {"type": "string", "enum": ["VIP", "Regular", "Occasional"]}}),
    _fn("get_customer", "Full 360 view of one customer: churn score, drivers, recent tickets/reviews, best action.",
        CID, ["customer_id"]),
    _fn("plan_campaign", "Optimise a retention campaign for a $ budget: who gets which offer, revenue saved, ROI.",
        {"budget": {"type": "number", "description": "USD"}}, ["budget"]),
    _fn("draft_message", "Write a personalised win-back message for one customer in their language.",
        CID, ["customer_id"]),
]
