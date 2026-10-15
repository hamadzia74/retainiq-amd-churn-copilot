"""Agent chat streamed as Server-Sent Events, plus suggestions and voice transcription.

    event: step         data: {"id": "tool-1", "status": "done", "label": "Checked your dashboard",
                               "summary": "$27,468 at risk across 73 high-risk customers", "details": [...], "ms": 840}
    event: delta        data: {"text": "Your riskiest"}            the next piece of the answer
    event: delta_reset  data: {}                                  drop streamed text (it was a preamble)
    event: status       data: {"message": "rate limited by the provider, retrying in 12s", "seconds": 12}
    event: answer       data: {"text": "..."}                     the complete answer, authoritative
    event: error        data: {"message": "..."}
    event: done         data: {}
"""

import json
import queue
import threading
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from retainiq import voice
from retainiq.llm import LLMError
from retainiq.suggestions import suggest

from ..deps import AppState, get_state, require_llm
from ..schemas import ChatRequest, Suggestions, SuggestionsRequest, Transcript

router = APIRouter(prefix="/agent", tags=["agent"])
StateDep = Annotated[AppState, Depends(get_state)]


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.post("/chat")
def chat(req: ChatRequest, state: StateDep):
    require_llm(state.engine)
    agent = state.agent(req.session_id)
    events: queue.Queue = queue.Queue()

    def work() -> None:
        try:
            reply = agent.ask(
                req.message,
                on_step=lambda step: events.put(("step", step)),
                on_delta=lambda text: events.put(("delta", {"text": text})),
                on_reset=lambda: events.put(("delta_reset", {})),
                on_wait=lambda seconds, reason: events.put(
                    ("status", {"message": f"{reason}, retrying in {seconds:.0f}s", "seconds": round(seconds)})),
            )
            events.put(("answer", {"text": reply}))
        except LLMError as exc:
            events.put(("error", {"message": str(exc)}))
        except Exception as exc:
            events.put(("error", {"message": f"{type(exc).__name__}: {exc}"}))
        finally:
            events.put(("done", {}))

    threading.Thread(target=work, daemon=True, name="agent").start()

    def stream():
        while True:
            event, data = events.get()
            yield _sse(event, data)
            if event == "done":
                return

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/suggestions", response_model=Suggestions)
def suggestions(req: SuggestionsRequest, state: StateDep):
    """Up to 3 follow-up questions for the session's latest exchange.

    Written by the LLM from the question, the answer and the data behind it (one short call,
    at most ~8 s); falls back to rules built from the tool results when the LLM is unavailable.
    A new or unknown session gets the starter questions.
    """
    agent = state.existing_agent(req.session_id)
    items, source = suggest(state.engine.llm, agent.last_turn if agent else None, agent.asked if agent else [])
    return {"suggestions": [{"text": t} for t in items], "source": source}


@router.post("/transcribe", response_model=Transcript,
             openapi_extra={"requestBody": {"required": True, "content": {"audio/wav": {"schema": {"type": "string", "format": "binary"}}}}})
async def transcribe(request: Request, state: StateDep):
    """Voice input: a WAV recording (16 kHz mono, up to 60 s) in, its transcript out.

    Uses the audio-capable model on AMD Token Factory (MiMo-V2.6-Flash). Recordings are not stored.
    413 too large/long, 415 not a WAV, 422 no speech, 503 voice unavailable.
    """
    if int(request.headers.get("content-length") or 0) > voice.MAX_BYTES:
        raise HTTPException(413, "That recording is too large. Keep it under a minute.")
    data = await request.body()
    try:
        text = await run_in_threadpool(voice.transcribe, state.engine.llm, data)
    except voice.VoiceError as exc:
        raise HTTPException(exc.status, str(exc)) from None
    return {"text": text}


@router.delete("/sessions/{session_id}", status_code=204)
def reset(session_id: str, state: StateDep):
    """Forget a conversation (the 'New chat' button)."""
    state.reset(session_id)
