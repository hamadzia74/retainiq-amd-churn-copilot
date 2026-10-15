"""Follow-up question suggestions for the Copilot.

After each answer the LLM writes 3 follow-ups from the exchange itself: the user's question,
the Copilot's answer, and a compact summary of the tool results behind it (real names, IDs,
amounts). Its output is checked before anyone sees it - no duplicates, nothing already asked,
nothing too long, no customer IDs that never appeared. If the LLM is offline, slow, rate
limited or returns junk, suggestions are built from the tool results by simple rules instead.
"""

import json
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from .agent import Turn, ToolUse
from .llm import LLM
from .prompts import SUGGEST_SYSTEM

MAX_SUGGESTIONS = 3
MAX_WORDS = 14
TIMEOUT_S = 8.0
ANSWER_CHARS = 1500

STARTERS = [
    "Which VIP customers are at risk, and why?",
    "Plan a $500 retention campaign and summarise it.",
    "What are high-risk customers complaining about?",
    "Draft a win-back message for my riskiest VIP.",
]

CUSTOMER_ID = re.compile(r"\bC\d{4}\b", re.I)

# The LLM call runs here so a slow or retrying provider can't hold the request past TIMEOUT_S.
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="suggest")


# ------------------------------------------------------------------ context for the LLM
def _first_names(rows: list, n: int = 5) -> str:
    return "; ".join(
        f"{r.get('customer_id')} {r.get('name')} ({r.get('tier')}, churn {round(100 * r.get('churn_prob', 0))}%"
        + (f", ${r['value_at_risk']:,.0f} at risk" if "value_at_risk" in r else "")
        + (f", {r['label']}" if "label" in r else "") + ")"
        for r in rows[:n] if isinstance(r, dict))


def summarize_tool(use: ToolUse) -> str:
    """One compact line per tool call: what it was asked and the key facts it returned."""
    r = use.result
    args = ", ".join(f"{k}={v}" for k, v in use.args.items())
    head = f"{use.name}({args})"
    if isinstance(r, dict) and "error" in r:
        return f"{head}: error"
    if use.name == "list_at_risk" and isinstance(r, list):
        return f"{head}: {len(r)} customers - {_first_names(r)}"
    if use.name == "get_customer" and isinstance(r, dict):
        action = (r.get("recommended_action") or {}).get("label", "?")
        return (f"{head}: {r.get('customer_id')} {r.get('name')}, {r.get('tier')}, churn {round(100 * r.get('churn_prob', 0))}%, "
                f"drivers {', '.join(r.get('drivers', []))}; recommended {action}")
    if use.name == "plan_campaign" and isinstance(r, dict):
        mix = ", ".join(f"{k} x{v}" for k, v in (r.get("action_mix") or {}).items())
        return (f"{head}: budget ${r.get('budget', 0):,.0f}, spent ${r.get('spent', 0):,.0f}, {r.get('customers')} customers, "
                f"ROI {round(100 * r.get('roi', 0))}%, mix {mix}; top: {_first_names(r.get('rows') or [], 4)}")
    if use.name == "draft_message" and isinstance(r, dict):
        return f"{head}: message for {r.get('customer_id')} {r.get('name')} ({r.get('language')}), offer {r.get('offer')}"
    if use.name == "get_dashboard" and isinstance(r, dict):
        complaints = ", ".join((r.get("top_complaints") or {}).keys())
        return (f"{head}: ${r.get('revenue_at_risk_90', 0):,.0f} at risk, {r.get('high_risk')} high-risk "
                f"({r.get('vip_high_risk')} VIP), top complaints {complaints}")
    return f"{head}: {json.dumps(r, default=str)[:300]}"


def build_request(turn: Turn, asked: list[str]) -> str:
    data = "\n".join(f"- {summarize_tool(t)}" for t in turn.tools) or "- (no tools used)"
    earlier = "\n".join(f"- {q}" for q in asked) or "- (none)"
    return (f"Questions already asked:\n{earlier}\n\n"
            f"Latest question: {turn.question}\n\n"
            f"Copilot answer:\n{(turn.answer or '')[:ANSWER_CHARS]}\n\n"
            f"Data the answer used:\n{data}")


def known_ids(turn: Turn) -> set[str]:
    """Every customer ID that appeared in the exchange: the only IDs a suggestion may name."""
    text = " ".join([turn.question, turn.answer or ""] + [json.dumps(t.result, default=str) for t in turn.tools])
    return {m.upper() for m in CUSTOMER_ID.findall(text)}


# ------------------------------------------------------------------ checking suggestions
def _norm(text: str) -> str:
    return re.sub(r"[^\w\s$]", "", text.casefold()).strip()


def _similar(a: str, b: str) -> bool:
    wa, wb = set(_norm(a).split()), set(_norm(b).split())
    return bool(wa and wb) and len(wa & wb) / len(wa | wb) >= 0.8


def clean(raw: object, asked: list[str], known: set[str] | None = None) -> list[str]:
    """Keep at most 3 usable, distinct, new suggestions. `known=None` skips the customer-ID check."""
    items = raw if isinstance(raw, list) else []
    out: list[str] = []
    for item in items:
        text = item.get("text") if isinstance(item, dict) else item
        if not isinstance(text, str):
            continue
        text = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", text).strip().strip('"').strip()
        if not text or len(text.split()) > MAX_WORDS:
            continue
        if known is not None and any(m.upper() not in known for m in CUSTOMER_ID.findall(text)):
            continue                                    # names a customer that never appeared
        if any(_similar(text, q) for q in asked + out):
            continue
        out.append(text)
        if len(out) == MAX_SUGGESTIONS:
            break
    return out


# ------------------------------------------------------------------ rules fallback
def rule_suggestions(turn: Turn | None, asked: list[str]) -> list[str]:
    ideas: list[str] = []
    for use in (turn.tools if turn else []):
        r = use.result
        if use.name == "list_at_risk" and isinstance(r, list) and r and isinstance(r[0], dict):
            top = r[0]
            ideas += [f"Why is {top['name']} at risk?", f"Draft a win-back message for {top['name']}"]
            if use.args.get("tier") != "VIP":
                ideas.append("Show only VIP customers at risk")
        elif use.name == "get_customer" and isinstance(r, dict) and "name" in r:
            ideas += [f"Draft a win-back message for {r['name']}", f"What should I offer {r['name']}?"]
        elif use.name == "plan_campaign" and isinstance(r, dict) and "budget" in r:
            ideas += [f"What if I spend ${2 * r['budget']:,.0f} instead?", "Which customers get a personal call?"]
        elif use.name == "draft_message" and isinstance(r, dict) and "name" in r:
            ideas += [f"Plan a campaign that includes {r['name']}", "Who else is at risk for the same reason?"]
        elif use.name == "get_dashboard":
            ideas += ["Who are my riskiest VIPs?", "What are high-risk customers complaining about?"]
    return clean(ideas + STARTERS, asked)


# ------------------------------------------------------------------ entry point
def suggest(llm: LLM, turn: Turn | None, asked: list[str], timeout: float = TIMEOUT_S) -> tuple[list[str], str]:
    """Return (suggestions, source) where source is "llm" or "rules"."""
    if turn is None or turn.answer is None or not llm.available:
        return rule_suggestions(turn, asked), "rules"
    future = _pool.submit(llm.json, SUGGEST_SYSTEM, build_request(turn, asked), 200)
    try:
        data, _, _ = future.result(timeout=timeout)
    except FutureTimeout:                              # slow provider: don't keep the user waiting
        return rule_suggestions(turn, asked), "rules"
    except Exception:                                  # rate limited, offline, error...
        return rule_suggestions(turn, asked), "rules"
    picked = clean(data.get("suggestions") if isinstance(data, dict) else None, asked, known_ids(turn))
    if not picked:
        return rule_suggestions(turn, asked), "rules"
    # Top up a short LLM list with rule-based ideas so there are always 3.
    extra = [s for s in rule_suggestions(turn, asked + picked) if not any(_similar(s, p) for p in picked)]
    return (picked + extra)[:MAX_SUGGESTIONS], "llm"
