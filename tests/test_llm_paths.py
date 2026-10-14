"""The LLM-backed endpoints (enrich job, SSE agent chat, LLM messages) against
a fake OpenAI client - checks the plumbing without needing the AMD GPU."""

import json
import time
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient
from openai.types.chat import ChatCompletionMessageToolCall

from api.main import app
from retainiq import signals

USAGE = NS(prompt_tokens=100, completion_tokens=30)


def _reply(content=None, tool_calls=None):
    return NS(choices=[NS(message=NS(content=content, tool_calls=tool_calls))], usage=USAGE)


def fake_create(model, messages, **kw):
    if kw.get("response_format"):                                   # batched signal extraction
        results = []
        for item in json.loads(messages[-1]["content"]):
            h = signals.heuristic(item["text"])
            results.append({"id": item["id"], "sentiment": h["sentiment"], "category": h["category"],
                            "churn_threat": h["churn_threat"], "summary": "s"})
        return _reply(json.dumps({"results": results}))
    if kw.get("tools"):                                             # agent: one tool call, then answer
        if messages[-1]["role"] == "user":
            tc = ChatCompletionMessageToolCall(id="c1", type="function",
                                               function={"name": "plan_campaign", "arguments": '{"budget": 300}'})
            return _reply("", [tc])
        return _reply("Plan ready: " + messages[-1]["content"][:40])
    return _reply("Hi there, come back!")                           # win-back message


@pytest.fixture(scope="module")
def client():
    mp = pytest.MonkeyPatch()
    mp.setattr("retainiq.engine.signals.save_cache", lambda s: None)   # don't touch data/signals.json
    with TestClient(app) as c:
        engine = app.state.retainiq.engine
        engine.signals = signals.heuristic_all(engine.records)     # known start, whatever data/signals.json holds
        llm = engine.llm
        llm._available = True
        llm.client = NS(chat=NS(completions=NS(create=fake_create)))
        yield c
    mp.undo()


def test_llm_message(client):
    top = client.get("/api/customers/at-risk?limit=1").json()[0]["customer_id"]
    m = client.post(f"/api/customers/{top}/message").json()
    assert m["source"] == "llm" and m["message"] == "Hi there, come back!"


def test_agent_chat_streams_tool_then_answer(client):
    with client.stream("POST", "/api/agent/chat", json={"session_id": "s1", "message": "plan $300"}) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        events = [line.split(": ", 1)[1] for line in r.iter_lines() if line.startswith("event: ")]
    assert events == ["tool", "answer", "done"]
    assert client.delete("/api/agent/sessions/s1").status_code == 204


def test_enrich_job_runs_and_retrains(client):
    plan = client.get("/api/enrich/status").json()["plan"]
    assert plan["pending"] == plan["total"] > 0
    assert plan["requests"] == -(-plan["pending"] // plan["batch_size"])   # ceil: many messages per request

    r = client.post("/api/enrich")
    assert r.status_code == 202 and r.json()["state"] == "running"
    assert client.post("/api/enrich").status_code == 409                 # running, or nothing left to do
    for _ in range(200):
        s = client.get("/api/enrich/status").json()
        if s["state"] != "running":
            break
        time.sleep(0.1)
    assert s["state"] == "done" and s["done"] == s["total"] > 0
    assert s["stats"]["failed"] == 0 and s["stats"]["requests"] == plan["requests"]
    assert client.get("/api/health").json()["llm_share"] == 1.0

    # Resumable: nothing left to read, unless forced.
    assert client.get("/api/enrich/status").json()["plan"]["pending"] == 0
    assert client.post("/api/enrich").status_code == 409
    assert client.get("/api/enrich/status?force=true").json()["plan"]["pending"] == plan["total"]
