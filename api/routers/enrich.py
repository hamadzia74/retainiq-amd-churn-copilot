"""LLM enrichment on AMD as a background job: POST starts it, GET polls it."""

import threading
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from retainiq.llm import LLMError

from ..deps import AppState, get_state, require_llm
from ..schemas import EnrichStatus

router = APIRouter(prefix="/enrich", tags=["enrich"])
StateDep = Annotated[AppState, Depends(get_state)]


@router.post("", response_model=EnrichStatus, status_code=202)
def start(state: StateDep, force: bool = False):
    """Read pending tickets & reviews with the LLM on AMD (resumable). `force` re-reads everything."""
    engine = state.engine
    require_llm(engine)
    if not state.enrich_lock.acquire(blocking=False):
        raise HTTPException(409, "Enrichment is already running")

    plan = engine.enrich_plan(force)
    if not plan["pending"]:
        state.enrich_lock.release()
        raise HTTPException(409, "Every message has already been read by the LLM. Use force=true to re-read.")
    job = state.job
    job.update(state="running", done=0, total=plan["pending"], stats=None, error=None)

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
            state.enrich_lock.release()

    threading.Thread(target=run, daemon=True, name="enrich").start()
    return {**job, "plan": plan}


@router.get("/status", response_model=EnrichStatus)
def status(state: StateDep, force: bool = False):
    """Job progress, plus what a (re)run would cost right now."""
    return {**state.job, "plan": state.engine.enrich_plan(force)}
