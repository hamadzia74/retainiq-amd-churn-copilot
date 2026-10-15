"""Agent chat streamed as Server-Sent Events.

    event: tool    data: {"name": "plan_campaign", "args": {"budget": 500}}
    event: status  data: {"message": "rate limited by the provider, retrying in 12s", "seconds": 12}
    event: answer  data: {"text": "..."}
    event: error   data: {"message": "..."}
    event: done    data: {}
"""

import json
import queue
import threading
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from retainiq.llm import LLMError
from retainiq.suggestions import suggest

from ..deps import AppState, get_state, require_llm
from ..schemas import ChatRequest, Suggestions, SuggestionsRequest

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
                on_tool=lambda name, args: events.put(("tool", {"name": name, "args": args})),
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


@router.delete("/sessions/{session_id}", status_code=204)
def reset(session_id: str, state: StateDep):
    """Forget a conversation (the 'New chat' button)."""
    state.reset(session_id)
