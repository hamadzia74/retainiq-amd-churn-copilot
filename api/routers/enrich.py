"""LLM enrichment on AMD as a background job: POST starts it, GET polls it. Admins only start it
(it spends the most quota); every run is recorded with who started it and how it ended."""

import logging
import threading
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from retainiq import config
from retainiq.llm import LLMError

from .. import db, signal_store, usage

log = logging.getLogger(__name__)
from ..auth import AdminDep, UserDep
from ..deps import AppState, get_state, require_llm
from ..schemas import EnrichRunRow, EnrichStatus

router = APIRouter(prefix="/enrich", tags=["enrich"])
StateDep = Annotated[AppState, Depends(get_state)]


def _finish_run(run_id: int, **fields) -> None:
    with db.session() as s:
        run = s.get(db.EnrichRun, run_id)
        if run is not None:
            for k, v in fields.items():
                setattr(run, k, v)
            run.finished_at = db.utcnow()


@router.post("", response_model=EnrichStatus, status_code=202)
def start(state: StateDep, admin: AdminDep, force: bool = False):
    """Read pending tickets & reviews with the LLM on AMD (resumable). `force` re-reads everything. Admins only."""
    engine = state.engine
    if config.SERVERLESS:
        raise HTTPException(409, "Enrichment takes several minutes, longer than this host allows per request. "
                                 "Run it once with `python -m api.manage enrich`; this site loads the results "
                                 "from the database.")
    require_llm(engine)
    usage.check_limit(admin)
    if not state.enrich_lock.acquire(blocking=False):
        raise HTTPException(409, "Enrichment is already running")

    plan = engine.enrich_plan(force)
    if not plan["pending"]:
        state.enrich_lock.release()
        raise HTTPException(409, "Every message has already been read by the LLM. Use force=true to re-read.")
    job = state.job
    job.update(state="running", done=0, total=plan["pending"], stats=None, error=None)
    with db.session() as s:
        run = db.EnrichRun(user_id=admin.id, force=force, rows_total=plan["pending"])
        s.add(run)
        s.flush()
        run_id = run.id

    def advance(n: int) -> None:
        job["done"] += n

    def run() -> None:
        try:
            job["stats"] = engine.enrich(on_progress=advance, force=force)
            job["state"] = "done"
        except LLMError as exc:
            job.update(state="error", error=f"{exc} Progress so far is saved; start again to resume.")
        except Exception as exc:
            job.update(state="error", error=f"{type(exc).__name__}: {exc}")
        finally:
            try:
                if job["done"]:
                    signal_store.save(engine.signals)       # keep what was read, even after an error
            except Exception:
                log.exception("could not save enrichment results to the database")
            state.enrich_lock.release()
            _finish_run(run_id, state=job["state"], rows_done=job["done"], error=job["error"])

    ctx = usage.metered(admin, "enrich")
    threading.Thread(target=ctx.run, args=(run,), daemon=True, name="enrich").start()
    return {**job, "plan": plan}


@router.get("/status", response_model=EnrichStatus)
def status(state: StateDep, _: UserDep, force: bool = False):
    """Job progress, plus what a (re)run would cost right now."""
    return {**state.job, "plan": state.engine.enrich_plan(force)}


@router.get("/runs", response_model=list[EnrichRunRow])
def runs(_: AdminDep, limit: int = 20):
    """Recent enrichment runs, newest first. Admins only."""
    with db.session() as s:
        rows = s.execute(select(db.EnrichRun, db.User.email).outerjoin(db.User, db.User.id == db.EnrichRun.user_id)
                         .order_by(db.EnrichRun.id.desc()).limit(max(1, min(limit, 100)))).all()
        return [{"id": r.id, "user": email, "force": r.force, "state": r.state, "rows_done": r.rows_done,
                 "rows_total": r.rows_total, "error": r.error, "started_at": db.iso(r.started_at),
                 "finished_at": db.iso(r.finished_at)} for r, email in rows]
