"""Per-user AI usage and daily limits.

Every provider call made while serving a user is counted against them (llm.USAGE_HOOK), with
the tokens the provider reports. Before any AI work starts, `check_limit` refuses with 429 once
the user has used today's calls - so a public demo URL can't drain the AMD quota.
"""

import contextvars
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from retainiq.llm import USAGE_HOOK

from . import db, settings
from .auth import CurrentUser

FEATURES = ("chat", "suggest", "message", "transcribe", "enrich")


def today():
    return datetime.now(timezone.utc).date()


def record(user_id: int, feature: str, calls: int = 1, tokens_in: int = 0, tokens_out: int = 0) -> None:
    """Add to today's counters in one atomic upsert, so concurrent calls (threads, or several
    server processes) never lose an increment."""
    insert = pg_insert if db.dialect() == "postgresql" else sqlite_insert
    stmt = insert(db.Usage).values(user_id=user_id, day=today(), feature=feature, calls=calls,
                                   tokens_in=tokens_in, tokens_out=tokens_out)
    t = db.Usage.__table__.c
    stmt = stmt.on_conflict_do_update(
        index_elements=[t.user_id, t.day, t.feature],
        set_={"calls": t.calls + stmt.excluded.calls, "tokens_in": t.tokens_in + stmt.excluded.tokens_in,
              "tokens_out": t.tokens_out + stmt.excluded.tokens_out})
    with db.session() as s:
        s.execute(stmt)


def metered(user: CurrentUser, feature: str) -> contextvars.Context:
    """A context in which every LLM call is billed to `user` under `feature`.
    Run the AI work with `ctx.run(fn, ...)` - also when it happens on another thread."""
    def hook(response) -> None:
        u = getattr(response, "usage", None)
        record(user.id, feature, 1, getattr(u, "prompt_tokens", 0) or 0, getattr(u, "completion_tokens", 0) or 0)

    ctx = contextvars.copy_context()
    ctx.run(USAGE_HOOK.set, hook)
    return ctx


def limit_for(role: str) -> int:
    return settings.DAILY_AI_CALLS.get(role, settings.DAILY_AI_CALLS["analyst"])


def calls_today(user_id: int) -> int:
    with db.session() as s:
        return s.scalar(select(func.coalesce(func.sum(db.Usage.calls), 0))
                        .where(db.Usage.user_id == user_id, db.Usage.day == today())) or 0


def check_limit(user: CurrentUser) -> None:
    """429 when the user has no AI calls left today."""
    limit = limit_for(user.role)
    if calls_today(user.id) >= limit:
        raise HTTPException(429, f"You've used today's {limit} AI calls. The limit resets at midnight UTC.")


def summary(user_id: int, role: str) -> dict:
    """Today's usage for one user: total calls, the limit, tokens and a per-feature split."""
    with db.session() as s:
        rows = s.scalars(select(db.Usage).where(db.Usage.user_id == user_id, db.Usage.day == today())).all()
    calls = sum(r.calls for r in rows)
    limit = limit_for(role)
    return {"day": today().isoformat(), "calls": calls, "limit": limit, "remaining": max(0, limit - calls),
            "tokens_in": sum(r.tokens_in for r in rows), "tokens_out": sum(r.tokens_out for r in rows),
            "by_feature": {r.feature: r.calls for r in rows}}
