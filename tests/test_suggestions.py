"""Copilot follow-up suggestions: LLM-written from the exchange, checked, with a rules fallback.
Fake LLMs only - nothing here reaches a real provider."""

import time
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from api.main import app
from retainiq.agent import Agent, ToolUse, Turn
from retainiq.llm import LLMError
from retainiq.suggestions import STARTERS, build_request, clean, known_ids, rule_suggestions, suggest

AT_RISK = [{"customer_id": "C0139", "name": "James Patel", "tier": "VIP", "churn_prob": 0.63, "value_at_risk": 467.0},
           {"customer_id": "C1045", "name": "Mia Schneider", "tier": "VIP", "churn_prob": 0.6, "value_at_risk": 360.0}]


def vip_turn() -> Turn:
    return Turn("Which VIP customers are at risk?", "James Patel (63%) and Mia Schneider (60%) are your riskiest VIPs.",
                [ToolUse("list_at_risk", {"limit": 5, "tier": "VIP"}, AT_RISK)])


class FakeLLM:
    def __init__(self, reply=None, error=None, delay=0.0, available=True):
        self.reply, self.error, self.delay, self.available = reply, error, delay, available
        self.requests: list[str] = []

    def json(self, system, user, max_tokens=200):
        self.requests.append(user)
        time.sleep(self.delay)
        if self.error:
            raise self.error
        return self.reply, 120, 40


# ------------------------------------------------------------------ the request to the LLM
def test_request_carries_question_answer_and_real_data():
    req = build_request(vip_turn(), asked=["Show me the dashboard"])
    assert "Which VIP customers are at risk?" in req
    assert "James Patel (63%)" in req                                 # the answer
    assert "C0139 James Patel (VIP, churn 63%, $467 at risk)" in req   # the tool data
    assert "Show me the dashboard" in req                             # what was already asked
    assert known_ids(vip_turn()) == {"C0139", "C1045"}


# ------------------------------------------------------------------ checking output
def test_clean_filters_duplicates_asked_long_and_invented_ids():
    asked = ["Which VIP customers are at risk?"]
    raw = ["1. Why is James Patel at risk?", "why is james patel at risk",           # numbering stripped; duplicate
           "Which VIP customers are at risk?",                                         # already asked
           "Tell me absolutely everything about every single customer in the whole store today and tomorrow please",  # too long
           "Draft a message for C9999",                                                # never appeared
           "Draft a win-back message for C1045", "Plan a $500 campaign", "One more"]
    out = clean(raw, asked, {"C0139", "C1045"})
    assert out == ["Why is James Patel at risk?", "Draft a win-back message for C1045", "Plan a $500 campaign"]


def test_clean_ignores_junk_shapes():
    assert clean(None, []) == [] and clean("text", []) == [] and clean([1, None, {"x": 1}], []) == []
    assert clean([{"text": "Why is Mia at risk?"}], []) == ["Why is Mia at risk?"]


# ------------------------------------------------------------------ suggest()
def test_llm_suggestions_are_used_when_valid():
    llm = FakeLLM({"suggestions": ["Why is James Patel at risk?", "Draft a win-back message for Mia Schneider",
                                   "Plan a $1,000 campaign for these VIPs"]})
    items, source = suggest(llm, vip_turn(), ["Which VIP customers are at risk?"])
    assert source == "llm" and len(items) == 3 and items[0] == "Why is James Patel at risk?"
    assert len(llm.requests) == 1                                      # exactly one LLM call


def test_short_llm_list_is_topped_up_from_rules():
    items, source = suggest(FakeLLM({"suggestions": ["Why is James Patel at risk?", "Message C4242 now"]}),
                            vip_turn(), [])
    assert source == "llm" and items[0] == "Why is James Patel at risk?"
    assert len(items) == 3 and not any("C4242" in s for s in items)  # invented ID dropped


@pytest.mark.parametrize("llm", [
    FakeLLM(error=LLMError("rate limited")),
    FakeLLM(error=RuntimeError("boom")),
    FakeLLM(reply={"nope": 1}),
    FakeLLM(reply={"suggestions": []}),
    FakeLLM(available=False),
], ids=["rate-limited", "error", "bad-json", "empty", "offline"])
def test_falls_back_to_rules(llm):
    items, source = suggest(llm, vip_turn(), ["Which VIP customers are at risk?"])
    assert source == "rules" and items[0] == "Why is James Patel at risk?" and len(items) == 3


def test_slow_llm_times_out_to_rules():
    started = time.perf_counter()
    items, source = suggest(FakeLLM({"suggestions": ["late"]}, delay=2.0), vip_turn(), [], timeout=0.2)
    assert source == "rules" and items and time.perf_counter() - started < 1.5


def test_no_turn_gives_starters_and_failed_turn_uses_rules():
    assert suggest(FakeLLM(), None, []) == (STARTERS[:3], "rules")
    failed = Turn("Plan a campaign", None)
    llm = FakeLLM({"suggestions": ["x"]})
    assert suggest(llm, failed, ["Plan a campaign"])[1] == "rules" and not llm.requests


def test_rules_cover_each_tool_with_real_names():
    plan = Turn("Plan $500", "Done", [ToolUse("plan_campaign", {"budget": 500}, {"budget": 500.0, "rows": []})])
    assert "What if I spend $1,000 instead?" in rule_suggestions(plan, [])
    cust = Turn("Tell me about C0218", "...", [ToolUse("get_customer", {"customer_id": "C0218"}, {"name": "Camila López"})])
    assert "What should I offer Camila López?" in rule_suggestions(cust, [])
    msg = Turn("Draft for C1045", "...", [ToolUse("draft_message", {"customer_id": "C1045"}, {"name": "Mia Schneider"})])
    assert "Plan a campaign that includes Mia Schneider" in rule_suggestions(msg, [])


# ------------------------------------------------------------------ the agent records turns
def test_agent_records_question_answer_and_tool_results(client):
    engine = app.state.retainiq.engine
    agent = Agent(engine)
    tc = NS(id="c1", function=NS(name="list_at_risk", arguments='{"limit": 2, "tier": "VIP"}'), model_dump=lambda: {})
    replies = iter([NS(choices=[NS(message=NS(content="", tool_calls=[tc]))]),
                    NS(choices=[NS(message=NS(content="Your riskiest VIPs are ...", tool_calls=None))])])
    engine.llm.chat = lambda *a, **k: next(replies)
    try:
        assert agent.ask("Which VIPs are at risk?") == "Your riskiest VIPs are ..."
    finally:
        del engine.llm.chat
    turn = agent.last_turn
    assert turn.question == "Which VIPs are at risk?" and turn.answer == "Your riskiest VIPs are ..."
    assert turn.tools[0].name == "list_at_risk" and len(turn.tools[0].result) == 2
    assert agent.asked == ["Which VIPs are at risk?"]


# ------------------------------------------------------------------ the endpoint
@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_endpoint_returns_llm_suggestions_for_the_session(client, monkeypatch):
    state = app.state.retainiq
    agent = state.agent("sug-1")
    agent.turns.append(vip_turn())
    fake = FakeLLM({"suggestions": ["Why is James Patel at risk?", "Draft a win-back message for Mia Schneider",
                                    "Plan a $1,000 VIP campaign"]})
    monkeypatch.setattr(state.engine, "llm", fake)
    r = client.post("/api/agent/suggestions", json={"session_id": "sug-1"}).json()
    assert r["source"] == "llm" and [s["text"] for s in r["suggestions"]][0] == "Why is James Patel at risk?"
    assert len(fake.requests) == 1


def test_endpoint_unknown_session_gets_starters_without_creating_one(client):
    r = client.post("/api/agent/suggestions", json={"session_id": "never-used"}).json()
    assert r == {"suggestions": [{"text": t} for t in STARTERS[:3]], "source": "rules"}
    assert app.state.retainiq.existing_agent("never-used") is None


def test_endpoint_works_offline_without_any_provider_call(client):
    llm = app.state.retainiq.engine.llm
    llm._available, llm._checked_at = False, time.monotonic()        # offline, recently checked
    calls = []
    llm.json = lambda *a, **k: calls.append(1)
    try:
        agent = app.state.retainiq.agent("sug-2")
        agent.turns.append(vip_turn())
        r = client.post("/api/agent/suggestions", json={"session_id": "sug-2"}).json()
    finally:
        del llm.json
    assert r["source"] == "rules" and r["suggestions"][0]["text"] == "Why is James Patel at risk?" and not calls


def test_endpoint_validates_input(client):
    assert client.post("/api/agent/suggestions", json={"session_id": ""}).status_code == 422
    assert client.post("/api/agent/suggestions", json={}).status_code == 422
