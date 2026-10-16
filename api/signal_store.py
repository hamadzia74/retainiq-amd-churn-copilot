"""Keeps the LLM's reading of tickets and reviews (data/signals.json) in the database too.

Enrichment is the expensive part - it spends AMD quota - and free hosts wipe their disk on every
restart. So after each enrichment run the signals are saved to Postgres, and at startup they are
restored before the Engine loads. The two copies are merged per message: an LLM reading always
beats a keyword one, so neither a CLI run (file only) nor a web run (database) is ever lost.
"""

import logging

from retainiq import signals

from . import db

log = logging.getLogger(__name__)
KEY = "signals"


def _is_llm(s) -> bool:
    return isinstance(s, dict) and s.get("source") == "llm"


def merge(local: dict, stored: dict) -> dict:
    """Union of both; where both have a message, keep the LLM's reading."""
    out = dict(local)
    for rid, s in stored.items():
        if rid not in out or (_is_llm(s) and not _is_llm(out[rid])):
            out[rid] = s
    return out


def restore() -> int:
    """Before the Engine starts: bring saved signals back into data/signals.json.
    Returns how many LLM readings are available afterwards."""
    with db.session() as s:
        row = s.get(db.StoredValue, KEY)
        stored = row.value if row else {}
    if not stored:
        return 0
    local = signals.load_cache()
    merged = merge(local, stored)
    if merged != local:
        signals.save_cache(merged)
    n = sum(_is_llm(v) for v in merged.values())
    log.info("Restored %d LLM-read messages from the database", n)
    return n


def save(current: dict) -> None:
    """After an enrichment run: keep the signals (merged with whatever is stored) in the database."""
    with db.session() as s:
        row = s.get(db.StoredValue, KEY)
        if row is None:
            s.add(db.StoredValue(key=KEY, value=current))
        else:
            row.value = merge(current, row.value or {})        # newest readings win (e.g. a forced re-read)
