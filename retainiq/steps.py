"""Plain-English progress steps for the Copilot's trace.

Each tool call becomes a step a manager can read: a label ("Checked your dashboard"), a one-line
result from the actual data ("$27,468 at risk across 73 high-risk customers") and a few detail
lines. Raw function names, JSON and bare IDs never reach the user.
"""

from __future__ import annotations

LANGUAGES = {"en": "English", "es": "Spanish", "de": "German"}


def _pct(p) -> str:
    try:
        return f"{round(100 * float(p))}%"
    except (TypeError, ValueError):
        return "?"


def _money(x) -> str:
    try:
        return f"${float(x):,.0f}"
    except (TypeError, ValueError):
        return "?"


def start_label(tool: str, args: dict) -> str:
    """Label while the step is running."""
    tier = args.get("tier")
    return {
        "get_dashboard": "Checking your dashboard",
        "list_at_risk": f"Looking up at-risk {tier + ' ' if tier else ''}customers",
        "get_customer": "Opening the customer's profile",
        "plan_campaign": f"Planning a {_money(args.get('budget', 0))} campaign",
        "draft_message": "Drafting a win-back message",
    }.get(tool, "Running an analysis step")


def _failed(tool: str, args: dict, error: str) -> dict:
    if "No active customer" in error:
        reason = f"Couldn't find customer {args.get('customer_id', '')}".strip()
    else:
        reason = "This step didn't work, so the answer may be incomplete"
    return {"label": start_label(tool, args), "summary": reason, "details": [], "failed": True}


def finish(tool: str, args: dict, result) -> dict:
    """Label, one-line result and detail lines once the step is done."""
    if isinstance(result, dict) and "error" in result:
        return _failed(tool, args, str(result["error"]))

    if tool == "get_dashboard" and isinstance(result, dict):
        complaints = list((result.get("top_complaints") or {}).keys())
        return {
            "label": "Checked your dashboard",
            "summary": f"{_money(result.get('revenue_at_risk_90'))} at risk across {result.get('high_risk')} high-risk customers",
            "details": [f"Active customers: {result.get('active_customers'):,}" if result.get("active_customers") is not None else "",
                        f"High-risk customers: {result.get('high_risk')} ({result.get('vip_high_risk')} VIP)",
                        f"Prediction accuracy (ROC-AUC): {result.get('auc_full')}",
                        f"Top complaint: {complaints[0].replace('_', ' ')}" if complaints else ""],
            "failed": False,
        }

    if tool == "list_at_risk" and isinstance(result, list):
        tier = args.get("tier")
        rows = [r for r in result if isinstance(r, dict)]
        lead = f", led by {rows[0]['name']} ({_pct(rows[0].get('churn_prob'))})" if rows else ""
        return {
            "label": f"Looked up at-risk {tier + ' ' if tier else ''}customers",
            "summary": f"{len(rows)} found{lead}" if rows else "No customers matched",
            "details": [f"Looked at: {tier or 'all'} customers, top {args.get('limit', 10)}, highest churn risk first"]
                       + [f"{r['name']} · {_pct(r.get('churn_prob'))} risk · {_money(r.get('value_at_risk'))} at risk" for r in rows[:5]],
            "failed": False,
        }

    if tool == "get_customer" and isinstance(result, dict):
        action = (result.get("recommended_action") or {}).get("label", "no action")
        return {
            "label": f"Opened {result.get('name', 'the customer')}'s profile",
            "summary": f"{_pct(result.get('churn_prob'))} churn risk · recommended: {action}",
            "details": [f"Tier: {result.get('tier')} · speaks {LANGUAGES.get(result.get('language'), result.get('language'))}",
                        f"Why at risk: {', '.join(result.get('drivers') or []) or 'no strong signals'}",
                        f"Spend in the last 180 days: {_money(result.get('revenue_180'))}",
                        f"Last order: {result.get('days_since_order')} days ago"],
            "failed": False,
        }

    if tool == "plan_campaign" and isinstance(result, dict):
        mix = [f"{label} × {n}" for label, n in (result.get("action_mix") or {}).items()]
        top = [r.get("name") for r in (result.get("top_customers") or result.get("rows") or [])[:3] if isinstance(r, dict)]
        return {
            "label": f"Planned a {_money(result.get('budget'))} campaign",
            "summary": f"{result.get('customers')} customers · {_money(result.get('revenue_saved'))} revenue saved · "
                       f"ROI {_pct(result.get('roi'))}",
            "details": [f"Spend: {_money(result.get('spent'))} of {_money(result.get('budget'))}"]
                       + [f"Offer: {m}" for m in mix]
                       + ([f"First in line: {', '.join(n for n in top if n)}"] if top else []),
            "failed": False,
        }

    if tool == "draft_message" and isinstance(result, dict):
        text = str(result.get("message") or "")
        return {
            "label": f"Drafted a message for {result.get('name', 'the customer')}",
            "summary": f"In {LANGUAGES.get(result.get('language'), result.get('language'))}, offering {result.get('offer')}",
            "details": [text[:160] + ("…" if len(text) > 160 else "")] if text else [],
            "failed": False,
        }

    return {"label": "Ran an analysis step", "summary": "", "details": [], "failed": False}


def clean_details(step: dict) -> dict:
    """Drop empty detail lines."""
    return {**step, "details": [d for d in step.get("details", []) if d]}
