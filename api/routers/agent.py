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

from ..deps import AppState, get_state, require_llm
from ..schemas import ChatRequest

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


@router.delete("/sessions/{session_id}", status_code=204)
def reset(session_id: str, state: StateDep):
    """Forget a conversation (the 'New chat' button)."""
    state.reset(session_id)
