"""One wrapper around the OpenAI-compatible endpoint on AMD (Token Factory or vLLM).

Every LLM call in the project goes through `LLM.chat`, so this is the one
place that respects the provider's limits:

    - at most LLM_RPM requests in any 60 s window (sliding window, shared by all threads)
    - at most LLM_CONCURRENCY requests in flight
    - 429 / 502 / 503 and dropped connections are retried, honouring Retry-After;
      anything else (bad key, unknown model, account in review) fails fast with a clear message
"""

import json
import logging
import random
import re
import threading
import time
from collections import deque
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Callable

import httpx
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

from . import config

log = logging.getLogger(__name__)

RECHECK_S = 30          # while offline, re-check the endpoint this often
USAGE_TTL_S = 60        # cache the quota lookup
MAX_TRIES = 5
RETRYABLE = {429, 502, 503}

OnWait = Callable[[float, str], None]   # (seconds, reason)
OnDelta = Callable[[str], None]         # a new piece of streamed answer text

# Called with the provider's response after every successful call. The web app sets it to bill
# each call to the signed-in user (api/usage.py); a ContextVar, so every request has its own.
# Code that hands LLM work to other threads must carry the context along (contextvars.copy_context).
USAGE_HOOK: ContextVar[Callable[[object], None] | None] = ContextVar("llm_usage_hook", default=None)


@dataclass
class StreamResult:
    """A streamed completion, reassembled: the full text plus any tool calls (OpenAI dict shape)."""
    content: str
    tool_calls: list[dict]


class LLMError(Exception):
    """An LLM failure with a human-readable message. `fatal` = retrying won't help."""

    def __init__(self, message: str, fatal: bool = False, status: int | None = None):
        super().__init__(message)
        self.fatal = fatal
        self.status = status          # provider HTTP status, when there was one


class RateLimiter:
    """Allows at most `rpm` acquisitions in any 60-second window. rpm=0 means unlimited."""

    def __init__(self, rpm: int, clock=time.monotonic, sleep=time.sleep):
        self.rpm, self.clock, self.sleep = rpm, clock, sleep
        self.calls: deque[float] = deque()
        self.lock = threading.Lock()

    def acquire(self, on_wait: OnWait | None = None) -> None:
        if not self.rpm:
            return
        while True:
            with self.lock:
                now = self.clock()
                while self.calls and now - self.calls[0] >= 60:
                    self.calls.popleft()
                if len(self.calls) < self.rpm:
                    self.calls.append(now)
                    return
                wait = 60 - (now - self.calls[0]) + 0.05
            if on_wait:
                on_wait(wait, "pacing to stay under the provider's requests-per-minute limit")
            self.sleep(wait)


def _retry_after(exc: APIStatusError) -> float | None:
    try:
        return float(exc.response.headers.get("retry-after"))
    except (TypeError, ValueError):
        return None


def _friendly(exc: APIStatusError) -> LLMError:
    code, msg = exc.status_code, getattr(exc, "message", str(exc))
    if code == 401:
        return LLMError("The AMD API key was rejected (401). Check LLM_API_KEY in .env.", fatal=True)
    if code == 403:
        return LLMError("Access denied (403): the AMD account may still be in review.", fatal=True)
    if code == 404:
        return LLMError(f"Endpoint not found (404) at {config.LLM_BASE_URL}.", fatal=True)
    # Token Factory says "Requested model <name> not supported" - but "stream not supported" is not a retired model.
    if code == 400 and "not supported" in msg.lower() and "model" in msg.lower() and "stream" not in msg.lower():
        return LLMError(f"Model {config.LLM_MODEL} is no longer offered. Pick one from GET /v1/models.", fatal=True)
    if code == 429:
        return LLMError("Still rate limited by the provider after several retries. Try again in a minute.")
    return LLMError(f"LLM request failed ({code}): {msg}", status=code)


class LLM:
    def __init__(self):
        # We do our own retries (with pacing + callbacks), so the SDK's are off.
        self.client = OpenAI(base_url=config.LLM_BASE_URL, api_key=config.LLM_API_KEY, timeout=300, max_retries=0)
        self.model = config.LLM_MODEL
        self.limiter = RateLimiter(config.LLM_RPM)
        self.slots = threading.BoundedSemaphore(config.LLM_CONCURRENCY)
        self.problem: str | None = None
        self.model_ids: list[str] = []         # what the provider offers (set by the availability check)
        self._available: bool | None = None
        self._checked_at = 0.0
        self._usage: tuple[float, dict | None] = (0.0, None)

    # ---------------------------------------------------------------- status
    @property
    def available(self) -> bool:
        """True when the endpoint answers AND offers our model. Once up it stays cached;
        while down it is re-checked every RECHECK_S."""
        if self._available is None or (not self._available and time.monotonic() - self._checked_at > RECHECK_S):
            self._available = self._check()
            self._checked_at = time.monotonic()
        return self._available

    def _check(self) -> bool:
        try:
            self.limiter.acquire()
            ids = [m.id for m in self.client.with_options(timeout=8).models.list().data]
        except APIStatusError as exc:
            self.problem = str(_friendly(exc))
            return False
        except Exception:
            self.problem = f"{config.LLM_BASE_URL} unreachable"
            return False
        self.model_ids = ids
        if ids and self.model not in ids:
            self.problem = f"Model {self.model} not offered. Available: {', '.join(ids[:8])}"
            return False
        self.problem = None
        return True

    @property
    def label(self) -> str:
        if self.available:
            return f"{self.model} on {config.LLM_HARDWARE}"
        return f"offline ({self.problem}) - heuristic fallback"

    def usage(self) -> dict | None:
        """Remaining daily quota (AMD Token Factory only). Cached for a minute."""
        at, cached = self._usage
        if config.LLM_PROVIDER != "token_factory" or time.monotonic() - at < USAGE_TTL_S:
            return cached
        try:
            r = httpx.get(f"{config.LLM_BASE_URL}/usage",
                          headers={"Authorization": f"Bearer {config.LLM_API_KEY}"}, timeout=10)
            r.raise_for_status()
            u = r.json()
            cached = {k: u.get(k) for k in ("rpm_limit", "daily_cost_limit_usd", "daily_cost_used_usd",
                                            "daily_cost_remaining_usd", "daily_reset_at")}
        except Exception:
            cached = None
        self._usage = (time.monotonic(), cached)
        return cached

    # ---------------------------------------------------------------- calls
    def _call(self, fn: Callable, on_wait: OnWait | None, can_retry: Callable[[], bool] = lambda: True):
        """Run one provider call with pacing, the concurrency cap and retries (429/502/503/connection).
        `can_retry` lets streaming refuse a retry once text has already been shown."""
        for attempt in range(1, MAX_TRIES + 1):
            self.limiter.acquire(on_wait)
            with self.slots:
                started = time.perf_counter()
                try:
                    result = fn()
                    log.info("chat ok in %.1fs (try %d)", time.perf_counter() - started, attempt)
                    if hook := USAGE_HOOK.get():
                        try:
                            hook(result)
                        except Exception:                  # usage accounting must never break an answer
                            log.exception("usage hook failed")
                    return result
                except APIStatusError as exc:
                    log.warning("chat HTTP %s after %.1fs (try %d)", exc.status_code, time.perf_counter() - started, attempt)
                    if exc.status_code not in RETRYABLE or attempt == MAX_TRIES or not can_retry():
                        raise _friendly(exc) from exc
                    wait = _retry_after(exc) or min(60.0, 2.0 ** attempt)
                    reason = "rate limited by the provider" if exc.status_code == 429 else "provider busy"
                except (APIConnectionError, APITimeoutError) as exc:
                    log.warning("chat %s after %.1fs (try %d)", type(exc).__name__, time.perf_counter() - started, attempt)
                    if attempt == MAX_TRIES or not can_retry():
                        raise LLMError(f"Could not reach {config.LLM_BASE_URL}: {exc}") from exc
                    wait, reason = min(60.0, 2.0 ** attempt), "connection problem"
            wait += random.uniform(0, 1)                   # jitter, so threads don't retry in lockstep
            if on_wait:
                on_wait(wait, reason)
            time.sleep(wait)
        raise AssertionError("unreachable")

    def chat(self, messages: list[dict], on_wait: OnWait | None = None, model: str | None = None, **kwargs):
        """Chat completion with pacing and retries. Returns the full response (with .usage)."""
        return self._call(
            lambda: self.client.chat.completions.create(model=model or self.model, messages=messages, **kwargs), on_wait)

    def chat_stream(self, messages: list[dict], on_delta: OnDelta, on_wait: OnWait | None = None, **kwargs) -> StreamResult:
        """Stream a completion: `on_delta` gets each new piece of text as it arrives, and tool calls are
        reassembled from their fragments. Retries only happen before the first piece of text, so
        nothing is ever shown twice. Providers that refuse streaming fall back to one complete answer."""
        shown = False

        def run() -> StreamResult:
            nonlocal shown
            stream = self.client.chat.completions.create(model=self.model, messages=messages, stream=True, **kwargs)
            parts: list[str] = []
            calls: dict[int, dict] = {}
            for chunk in stream:
                if not getattr(chunk, "choices", None):
                    continue
                delta = chunk.choices[0].delta
                text = getattr(delta, "content", None)
                if text:
                    shown = True
                    parts.append(text)
                    on_delta(text)
                for tc in getattr(delta, "tool_calls", None) or []:
                    acc = calls.setdefault(tc.index or 0, {"id": None, "name": "", "arguments": ""})
                    acc["id"] = tc.id or acc["id"]
                    if tc.function:
                        acc["name"] += tc.function.name or ""
                        acc["arguments"] += tc.function.arguments or ""
            return StreamResult("".join(parts), [
                {"id": c["id"] or f"call_{i}", "type": "function",
                 "function": {"name": c["name"], "arguments": c["arguments"] or "{}"}}
                for i, c in sorted(calls.items())])

        try:
            return self._call(run, on_wait, can_retry=lambda: not shown)
        except LLMError as exc:
            if shown or "stream" not in str(exc).lower():
                raise
        # The provider rejected streaming: one complete answer, delivered as a single piece.
        msg = self.chat(messages, on_wait, **kwargs).choices[0].message
        if msg.content:
            on_delta(msg.content)
        return StreamResult(msg.content or "", [
            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in (msg.tool_calls or [])])

    def json(self, system: str, user: str, max_tokens: int = 200) -> tuple[dict, int, int]:
        """Ask for a JSON object. Returns (data, prompt_tokens, completion_tokens)."""
        resp = self.chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0, max_tokens=max_tokens, response_format={"type": "json_object"},
        )
        text = resp.choices[0].message.content or "{}"
        match = re.search(r"\{.*\}", text, re.S)   # tolerate stray prose around the JSON
        try:
            data = json.loads(match.group(0)) if match else {}
        except json.JSONDecodeError:
            data = {}
        usage = resp.usage
        return data, (usage.prompt_tokens if usage else 0), (usage.completion_tokens if usage else 0)
