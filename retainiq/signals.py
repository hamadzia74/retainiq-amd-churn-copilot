"""Turn free text (tickets + reviews) into numbers the churn model can use.

This is the main AMD workload: thousands of short messages in three
languages, read by an LLM on AMD GPUs. On AMD Token Factory (20 requests/min)
we pack LLM_BATCH_SIZE messages into each request; on our own vLLM / MI300X we
send one message per request, LLM_CONCURRENCY at once, and vLLM batches them.

Without an LLM we fall back to a keyword heuristic so the rest of the app
still runs - but it misses nuance and is clearly labelled.

Each signal: {sentiment, category, churn_threat, summary, source}
"""

import contextvars
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable

from . import config
from .llm import LLM, LLMError
from .prompts import BATCH_SIGNAL_SYSTEM, CATEGORIES

log = logging.getLogger(__name__)

# Keyword fallback, per concept, across en/es/de.
NEGATIVE = ["late", "damaged", "refund", "twice", "terrible", "not acceptable", "frustrating", "disappointed",
            "fell apart", "crushed", "not worth", "retraso", "dañado", "reembolso", "dos veces", "inaceptable",
            "decepcionado", "rompió", "aplastada", "zu spät", "beschädigt", "rückerstattung", "doppelt",
            "inakzeptabel", "enttäuscht", "kaputt", "zerdrückt"]
POSITIVE = ["love", "perfect", "great", "would buy again", "good value", "solid", "thanks", "encanta",
            "gracias", "volvería", "super", "danke", "gerne wieder", "tolle"]
THREAT = ["close my account", "elsewhere", "darme de baja", "otra tienda", "kündigen", "woanders"]
CATEGORY_WORDS = {
    "delivery": ["late", "retraso", "zu spät", "crushed", "aplastada", "zerdrückt"],
    "product_quality": ["damaged", "quality", "fell apart", "dañado", "rompió", "beschädigt", "kaputt"],
    "refund_billing": ["refund", "charged", "reembolso", "cobraron", "rückerstattung", "abgebucht"],
    "customer_service": ["support", "closed my ticket", "replied", "responde", "antwortet"],
}


def heuristic(text: str) -> dict:
    t = text.lower()
    neg = sum(w in t for w in NEGATIVE)
    pos = sum(w in t for w in POSITIVE)
    category = next((c for c, words in CATEGORY_WORDS.items() if any(w in t for w in words)),
                    "praise" if pos else "question" if "?" in t else "other")
    return {"sentiment": max(-1.0, min(1.0, 0.5 * pos - 0.5 * neg)), "category": category,
            "churn_threat": any(w in t for w in THREAT), "summary": "", "source": "heuristic"}


def _clean(raw: dict) -> dict:
    """Coerce whatever the model returned into the expected shape."""
    try:
        sentiment = max(-1.0, min(1.0, float(raw.get("sentiment", 0))))
    except (TypeError, ValueError):
        sentiment = 0.0
    category = raw.get("category") if raw.get("category") in CATEGORIES else "other"
    threat = raw.get("churn_threat")
    threat = threat if isinstance(threat, bool) else str(threat).strip().lower() in ("true", "1", "yes")
    return {"sentiment": sentiment, "category": category, "churn_threat": threat,
            "summary": str(raw.get("summary", ""))[:80], "source": "llm"}


def load_cache() -> dict:
    if config.SIGNALS_CACHE.exists():
        return json.loads(config.SIGNALS_CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(signals: dict) -> None:
    config.SIGNALS_CACHE.parent.mkdir(exist_ok=True)
    config.SIGNALS_CACHE.write_text(json.dumps(signals, ensure_ascii=False), encoding="utf-8")


def heuristic_all(records: list[tuple[str, str]]) -> dict:
    return {rid: heuristic(text) for rid, text in records}


def pending(records: list[tuple[str, str]], signals: dict, force: bool = False) -> list[tuple[str, str]]:
    """Records the LLM still has to read. Already-LLM signals are skipped unless `force`."""
    return [r for r in records if force or signals.get(r[0], {}).get("source") != "llm"]


ROW_KEYS = ("id", "sentiment", "category", "churn_threat", "summary")


def _row(r) -> dict | None:
    """A result row as a dict. Accepts the compact [id, sentiment, category, threat, summary]
    rows we ask for, and keyed objects in case the model answers that way instead."""
    if isinstance(r, list) and len(r) >= 4:
        return dict(zip(ROW_KEYS, r))
    if isinstance(r, dict) and "id" in r:
        return {**r, "churn_threat": r.get("churn_threat", r.get("threat"))}
    return None


def _ask_batch(llm: LLM, batch: list[tuple[str, str]]) -> tuple[dict, int, int]:
    """One request for many messages. Returns ({id: raw result}, prompt_tokens, completion_tokens)."""
    user = json.dumps([{"id": rid, "text": text} for rid, text in batch], ensure_ascii=False)
    data, p, c = llm.json(BATCH_SIGNAL_SYSTEM, user, max_tokens=40 * len(batch) + 200)
    rows = (data.get("r") or data.get("results")) if isinstance(data, dict) else None
    got = {}
    for r in rows if isinstance(rows, list) else []:
        row = _row(r)
        if row:
            got[str(row["id"])] = row
    if len(got) < len(batch):
        log.warning("batch of %d: model returned %d usable rows (%d completion tokens)", len(batch), len(got), c)
    return got, p, c


def enrich_llm(llm: LLM, records: list[tuple[str, str]],
               on_progress: Callable[[int], None] = lambda n: None,
               on_batch: Callable[[dict], None] = lambda sigs: None,
               batch_size: int | None = None) -> tuple[dict, dict]:
    """Read `records` with the LLM, `batch_size` messages per request, several requests in parallel.

    Messages missing from a batch's answer are retried once as a smaller batch, then fall back
    to the heuristic (counted in `failed`). `on_batch` gets each finished batch's signals, so the
    caller can save progress: an interrupted run resumes where it stopped.
    A fatal LLMError (bad key, model gone) stops the run and is re-raised.
    """
    size = max(1, batch_size or config.LLM_BATCH_SIZE)
    batches = [records[i:i + size] for i in range(0, len(records), size)]
    totals = {"prompt_tokens": 0, "completion_tokens": 0, "requests": 0, "failed": 0}
    signals: dict = {}
    start = time.perf_counter()

    def ask(batch):
        try:
            got, p, c = _ask_batch(llm, batch)
            return got, p, c, 1
        except LLMError as exc:
            if exc.fatal:
                raise
            log.warning("batch of %d failed: %s", len(batch), exc)
            return {}, 0, 0, 1

    def work(batch):
        got, p, c, n = ask(batch)
        missing = [r for r in batch if r[0] not in got]
        if missing:                                    # one more try for just the gaps
            got2, p2, c2, n2 = ask(missing)
            got, p, c, n = {**got, **got2}, p + p2, c + c2, n + n2
        out, failed = {}, 0
        for rid, text in batch:
            if rid in got:
                out[rid] = _clean(got[rid])
            else:
                out[rid] = heuristic(text)
                failed += 1
        return out, p, c, n, failed

    pool = ThreadPoolExecutor(max_workers=config.LLM_CONCURRENCY)
    try:
        # Each batch carries the caller's context, so the web app can bill its calls (llm.USAGE_HOOK).
        for fut in as_completed([pool.submit(contextvars.copy_context().run, work, b) for b in batches]):
            out, p, c, n, failed = fut.result()
            signals.update(out)
            for key, v in zip(("prompt_tokens", "completion_tokens", "requests", "failed"), (p, c, n, failed)):
                totals[key] += v
            on_batch(out)
            on_progress(len(out))
    except BaseException:                              # fatal error or Ctrl+C: drop queued batches
        pool.shutdown(wait=False, cancel_futures=True)
        raise
    pool.shutdown()

    seconds = time.perf_counter() - start
    tokens = totals["prompt_tokens"] + totals["completion_tokens"]
    stats = {"records": len(records), "batch_size": size, "seconds": seconds, **totals,
             "tokens_per_s": tokens / seconds if seconds else 0,
             "records_per_s": len(records) / seconds if seconds else 0}
    return signals, stats
