"""Shared server state: the one Engine, the enrichment job, the chat sessions."""

import threading
from collections import OrderedDict

from fastapi import HTTPException, Request

from retainiq import config
from retainiq.agent import Agent
from retainiq.engine import Engine

MAX_SESSIONS = 100


class AppState:
    def __init__(self, engine: Engine):
        self.engine = engine
        # Only one enrichment at a time; reads keep using the old model meanwhile.
        self.enrich_lock = threading.Lock()
        self.job = {"state": "idle", "done": 0, "total": 0, "stats": None, "error": None}
        self._sessions: OrderedDict[str, Agent] = OrderedDict()
        self._sessions_lock = threading.Lock()

    def agent(self, session_id: str) -> Agent:
        """The chat agent for a session (kept in memory, least-recently-used dropped first)."""
        with self._sessions_lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = Agent(self.engine)
                if len(self._sessions) > MAX_SESSIONS:
                    self._sessions.popitem(last=False)
            self._sessions.move_to_end(session_id)
            return self._sessions[session_id]

    def reset(self, session_id: str) -> None:
        with self._sessions_lock:
            self._sessions.pop(session_id, None)


def get_state(request: Request) -> AppState:
    return request.app.state.retainiq


def get_engine(request: Request) -> Engine:
    return request.app.state.retainiq.engine


def require_llm(engine: Engine) -> None:
    if not engine.llm.available:
        raise HTTPException(503, f"LLM unavailable on {config.LLM_PROVIDER_NAME}: {engine.llm.problem}")
