"""Agent chat streamed as Server-Sent Events, saved conversations, suggestions and voice.

    event: step         data: {"id": "tool-1", "status": "done", "label": "Checked your dashboard",
                               "summary": "$27,468 at risk across 73 high-risk customers", "details": [...], "ms": 840}
    event: delta        data: {"text": "Your riskiest"}            the next piece of the answer
    event: delta_reset  data: {}                                  drop streamed text (it was a preamble)
    event: status       data: {"message": "rate limited by the provider, retrying in 12s", "seconds": 12}
    event: answer       data: {"text": "..."}                     the complete answer, authoritative
    event: error        data: {"message": "..."}
    event: done         data: {}

Every conversation belongs to the signed-in user and is saved as it was shown (answer, progress
trace, follow-ups), so it can be reopened later. AI calls count toward the user's daily limit.
"""

import json
import queue
import threading
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from retainiq import voice
from retainiq.agent import Agent
from retainiq.llm import LLMError
from retainiq.suggestions import rule_suggestions, suggest

from .. import chats, usage
from ..auth import UserDep
from ..deps import AppState, get_state, require_llm
from ..schemas import (ChatDetail, ChatRename, ChatRequest, ChatSummary, Suggestions, SuggestionsRequest,
                       Transcript)

router = APIRouter(prefix="/agent", tags=["agent"])
StateDep = Annotated[AppState, Depends(get_state)]


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _upsert(steps: list[dict], step: dict) -> list[dict]:
    """Same rule as the browser: replace by id, drop cancelled steps."""
    if step.get("status") == "cancelled":
        return [s for s in steps if s["id"] != step["id"]]
    for i, s in enumerate(steps):
        if s["id"] == step["id"]:
            return steps[:i] + [{**s, **step}] + steps[i + 1:]
    return steps + [step]


def _agent(state: AppState, session_id: str, saved: dict | None) -> Agent:
    return state.agent(session_id, lambda: Agent.from_state(state.engine, saved))


@router.post("/chat")
def chat(req: ChatRequest, state: StateDep, user: UserDep):
    """Ask the Copilot. Creates the conversation on its first question; 404 if the id is someone else's."""
    require_llm(state.engine)
    usage.check_limit(user)
    saved = chats.open_chat(req.session_id, user, req.message)
    agent = _agent(state, req.session_id, saved)
    ctx = usage.metered(user, "chat")
    events: queue.Queue = queue.Queue()

    def work() -> None:
        started = time.perf_counter()
        steps: list[dict] = []
        answer, error = "", False

        def on_step(step: dict) -> None:
            nonlocal steps
            steps = _upsert(steps, step)
            events.put(("step", step))

        try:
            answer = agent.ask(
                req.message,
                on_step=on_step,
                on_delta=lambda text: events.put(("delta", {"text": text})),
                on_reset=lambda: events.put(("delta_reset", {})),
                on_wait=lambda seconds, reason: events.put(
                    ("status", {"message": f"{reason}, retrying in {seconds:.0f}s", "seconds": round(seconds)})),
            )
            events.put(("answer", {"text": answer}))
        except LLMError as exc:
            answer, error = str(exc), True
            events.put(("error", {"message": answer}))
        except Exception as exc:
            answer, error = f"{type(exc).__name__}: {exc}", True
            events.put(("error", {"message": answer}))
        finally:
            # Saved even if the browser went away mid-answer. Unfinished steps are shown as finished.
            steps = [{**s, "status": ("failed" if error else "done")} if s["status"] == "running" else s
                     for s in steps]
            try:
                chats.save_turn(req.session_id, req.message, answer, error=error, steps=steps,
                                duration_ms=round((time.perf_counter() - started) * 1000), agent=agent)
            finally:
                events.put(("done", {}))

    threading.Thread(target=ctx.run, args=(work,), daemon=True, name="agent").start()

    def stream():
        while True:
            event, data = events.get()
            yield _sse(event, data)
            if event == "done":
                return

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/suggestions", response_model=Suggestions)
def suggestions(req: SuggestionsRequest, state: StateDep, user: UserDep):
    """Up to 3 follow-up questions for the conversation's latest exchange.

    Written by the LLM from the question, the answer and the data behind it (one short call,
    at most ~8 s); built by rules when the LLM is unavailable or today's AI limit is used up.
    A new or unknown conversation gets the starter questions.
    """
    saved = chats.load_state(req.session_id, user)
    agent = state.existing_agent(req.session_id) or (_agent(state, req.session_id, saved) if saved is not None else None)
    turn, asked = (agent.last_turn, agent.asked) if agent else (None, [])
    if usage.calls_today(user.id) >= usage.limit_for(user.role):
        items, source = rule_suggestions(turn, asked), "rules"
    else:
        items, source = usage.metered(user, "suggest").run(suggest, state.engine.llm, turn, asked)
    if saved is not None and turn is not None:
        chats.save_suggestions(req.session_id, items)
    return {"suggestions": [{"text": t} for t in items], "source": source}


@router.post("/transcribe", response_model=Transcript,
             openapi_extra={"requestBody": {"required": True, "content": {"audio/wav": {"schema": {"type": "string", "format": "binary"}}}}})
async def transcribe(request: Request, state: StateDep, user: UserDep):
    """Voice input: a WAV recording (16 kHz mono, up to 60 s) in, its transcript out.

    Uses the audio-capable model set in LLM_TRANSCRIBE_MODEL. Recordings are not stored.
    413 too large/long, 415 not a WAV, 422 no speech, 429 daily AI limit, 503 voice unavailable.
    """
    if int(request.headers.get("content-length") or 0) > voice.MAX_BYTES:
        raise HTTPException(413, "That recording is too large. Keep it under a minute.")
    await run_in_threadpool(usage.check_limit, user)
    data = await request.body()
    try:
        text = await run_in_threadpool(usage.metered(user, "transcribe").run, voice.transcribe, state.engine.llm, data)
    except voice.VoiceError as exc:
        raise HTTPException(exc.status, str(exc)) from None
    return {"text": text}


# ---------------------------------------------------------------------------- saved conversations
@router.get("/sessions", response_model=list[ChatSummary])
def list_sessions(user: UserDep):
    """Your conversations, most recent first."""
    return chats.list_chats(user)


@router.get("/sessions/{session_id}", response_model=ChatDetail)
def get_session(session_id: str, user: UserDep):
    """One conversation as it was shown: questions, answers, progress traces and follow-ups."""
    return chats.get_chat(session_id, user)


@router.patch("/sessions/{session_id}", response_model=ChatSummary)
def rename_session(session_id: str, body: ChatRename, user: UserDep):
    chats.rename_chat(session_id, user, body.title)
    return next(c for c in chats.list_chats(user) if c["id"] == session_id)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, state: StateDep, user: UserDep):
    """Delete a conversation for good."""
    chats.delete_chat(session_id, user)
    state.reset(session_id)
