"""Unit tests for the rate-limit-safe client and batched enrichment (no network)."""

import json
from types import SimpleNamespace as NS

import httpx
import pytest
from openai import APIStatusError

from retainiq import llm as llm_mod
from retainiq import signals
from retainiq.llm import LLM, LLMError, RateLimiter

USAGE = NS(prompt_tokens=10, completion_tokens=5)


def _reply(content):
    return NS(choices=[NS(message=NS(content=content, tool_calls=None))], usage=USAGE)


def _status_error(code: int, retry_after: str | None = None) -> APIStatusError:
    headers = {"retry-after": retry_after} if retry_after else {}
    response = httpx.Response(code, headers=headers, request=httpx.Request("POST", "http://x/v1/chat/completions"))
    return APIStatusError(f"error {code}", response=response, body=None)


@pytest.fixture
def no_sleep(monkeypatch):
    waits = []
    monkeypatch.setattr(llm_mod.time, "sleep", lambda s: waits.append(s))
    return waits


def make_llm(create):
    llm = LLM()
    llm.client = NS(chat=NS(completions=NS(create=create)))
    return llm


# ------------------------------------------------------------- rate limiter
def test_limiter_allows_rpm_per_window_then_waits():
    now = [0.0]
    slept = []

    def sleep(s):
        slept.append(s)
        now[0] += s

    lim = RateLimiter(3, clock=lambda: now[0], sleep=sleep)
    for t in (0, 10, 20):                       # 3 calls inside one minute: free
        now[0] = t
        lim.acquire()
    assert slept == []
    lim.acquire()                               # 4th at t=20 waits until the t=0 call is 60 s old
    assert len(slept) == 1 and 39.9 < slept[0] <= 40.1
    assert list(lim.calls) == [10, 20, now[0]]  # sliding window: never more than rpm in any 60 s


def test_limiter_zero_means_unlimited():
    lim = RateLimiter(0, sleep=lambda s: pytest.fail("should not sleep"))
    for _ in range(100):
        lim.acquire()


# ------------------------------------------------------------- retries
def test_429_is_retried_honouring_retry_after(no_sleep):
    calls = []

    def create(**kw):
        calls.append(1)
        if len(calls) < 3:
            raise _status_error(429, retry_after="7")
        return _reply("ok")

    waited = []
    resp = make_llm(create).chat([{"role": "user", "content": "hi"}], on_wait=lambda s, r: waited.append((s, r)))
    assert resp.choices[0].message.content == "ok" and len(calls) == 3
    assert all(7 <= s <= 8 and "rate limited" in r for s, r in waited)       # Retry-After + jitter


def test_bad_key_fails_fast_without_retry(no_sleep):
    calls = []

    def create(**kw):
        calls.append(1)
        raise _status_error(401)

    with pytest.raises(LLMError) as exc:
        make_llm(create).chat([{"role": "user", "content": "hi"}])
    assert exc.value.fatal and "API key" in str(exc.value) and len(calls) == 1


def test_gives_up_after_max_tries(no_sleep):
    def create(**kw):
        raise _status_error(503)

    with pytest.raises(LLMError) as exc:
        make_llm(create).chat([{"role": "user", "content": "hi"}])
    assert not exc.value.fatal and len(no_sleep) == llm_mod.MAX_TRIES - 1


# ------------------------------------------------------------- batched enrichment
RECORDS = [(f"T{i}", text) for i, text in enumerate([
    "My order arrived 5 days late again. I'll be shopping elsewhere from now on.",
    "Love the sweater, great quality.",
    "Still waiting on my refund.",
    "Does the jacket come in a larger size?",
    "Mi pedido llegó dañado.",
])]


def batch_create(drop: set[str], requests: list):
    """Fake model: answers a batch, but 'forgets' ids in `drop` the first time it sees them."""
    def create(messages, **kw):
        items = json.loads(messages[-1]["content"])
        requests.append([i["id"] for i in items])
        results = []
        for item in items:
            if item["id"] in drop:
                drop.discard(item["id"])
                continue
            results.append({"id": item["id"], "sentiment": -0.5, "category": "delivery",
                            "churn_threat": "true", "summary": "x"})
        return _reply("Here you go: " + json.dumps({"results": results}))
    return create


def test_batches_and_retries_missing_ids_once(monkeypatch):
    requests = []
    llm = make_llm(batch_create({"T1"}, requests))
    out, stats = signals.enrich_llm(llm, RECORDS, batch_size=2)
    # 3 batches of 2/2/1, plus one retry containing only the dropped id
    assert sorted(map(sorted, requests)) == sorted([["T0", "T1"], ["T2", "T3"], ["T4"], ["T1"]])
    assert stats["requests"] == 4 and stats["failed"] == 0 and stats["batch_size"] == 2
    assert all(s["source"] == "llm" and s["churn_threat"] is True for s in out.values())


def test_id_missing_twice_falls_back_to_heuristic():
    def create(messages, **kw):                    # never answers T0
        items = [i for i in json.loads(messages[-1]["content"]) if i["id"] != "T0"]
        return _reply(json.dumps({"results": [{"id": i["id"], "sentiment": 0.1, "category": "question",
                                               "churn_threat": False, "summary": ""} for i in items]}))

    out, stats = signals.enrich_llm(make_llm(create), RECORDS, batch_size=5)
    assert stats["failed"] == 1 and out["T0"]["source"] == "heuristic"
    assert out["T0"]["churn_threat"] is True       # heuristic still catches "shopping elsewhere"


def test_fatal_error_stops_the_run():
    def create(messages, **kw):
        raise LLMError("bad key", fatal=True)

    llm = make_llm(lambda **kw: None)
    llm.chat = lambda *a, **kw: create(*a, **kw)
    with pytest.raises(LLMError):
        signals.enrich_llm(llm, RECORDS, batch_size=2)


def test_resume_skips_records_already_read_by_llm():
    cache = {"T0": {"source": "llm"}, "T1": {"source": "heuristic"}, "T2": {"source": "llm"}}
    assert [r[0] for r in signals.pending(RECORDS, cache)] == ["T1", "T3", "T4"]
    assert len(signals.pending(RECORDS, cache, force=True)) == len(RECORDS)


def test_progress_is_saved_after_every_batch():
    saved = []
    signals.enrich_llm(make_llm(batch_create(set(), [])), RECORDS, on_batch=saved.append, batch_size=2)
    assert len(saved) == 3 and sum(len(b) for b in saved) == len(RECORDS)
