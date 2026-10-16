"""Saved Copilot conversations: each user's chats, what was shown, and the agent's memory.

The database is the record; AppState keeps recently used agents in memory as a cache, and a
cache miss (restart, eviction) rebuilds the agent from its saved state.
"""

from fastapi import HTTPException
from sqlalchemy import func, select

from retainiq.agent import Agent

from . import db
from .auth import CurrentUser

TITLE_CHARS = 60


def title_from(question: str) -> str:
    """The first question, cut at a word boundary."""
    text = " ".join(question.split())
    if len(text) <= TITLE_CHARS:
        return text
    return text[:TITLE_CHARS].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def owned(s, session_id: str, user: CurrentUser) -> db.ChatSession | None:
    """The user's chat with this id; None if it doesn't exist; 404 if it is someone else's
    (we don't reveal that it exists)."""
    chat = s.get(db.ChatSession, session_id)
    if chat is not None and chat.user_id != user.id:
        raise HTTPException(404, "No such conversation.")
    return chat


def open_chat(session_id: str, user: CurrentUser, question: str) -> dict:
    """The saved agent state for this chat, creating the chat (titled by its first question) if new."""
    with db.session() as s:
        chat = owned(s, session_id, user)
        if chat is None:
            chat = db.ChatSession(id=session_id, user_id=user.id, title=title_from(question), state={})
            s.add(chat)
        return chat.state or {}


def load_state(session_id: str, user: CurrentUser) -> dict | None:
    """Saved agent state, or None if the chat doesn't exist (404 if it isn't the user's)."""
    with db.session() as s:
        chat = owned(s, session_id, user)
        return (chat.state or {}) if chat else None


def save_turn(session_id: str, question: str, answer: str, *, error: bool, steps: list[dict],
              duration_ms: int, agent: Agent) -> None:
    """Store one exchange as the user saw it, plus the agent's updated memory."""
    with db.session() as s:
        chat = s.get(db.ChatSession, session_id)
        if chat is None:                                   # deleted while the answer was being written
            return
        s.add(db.ChatMessage(session_id=session_id, role="user", text=question))
        s.add(db.ChatMessage(session_id=session_id, role="assistant", text=answer, steps=steps,
                             duration_ms=duration_ms, error=error))
        chat.state = agent.to_state()
        chat.updated_at = db.utcnow()


def save_suggestions(session_id: str, suggestions: list[str]) -> None:
    """Attach follow-ups to the latest answer, so a reopened chat shows them again."""
    with db.session() as s:
        last = s.scalar(select(db.ChatMessage)
                        .where(db.ChatMessage.session_id == session_id, db.ChatMessage.role == "assistant")
                        .order_by(db.ChatMessage.id.desc()).limit(1))
        if last is not None:
            last.suggestions = suggestions


def list_chats(user: CurrentUser) -> list[dict]:
    with db.session() as s:
        counts = (select(db.ChatMessage.session_id, func.count().label("n"))
                  .where(db.ChatMessage.role == "user").group_by(db.ChatMessage.session_id).subquery())
        rows = s.execute(select(db.ChatSession, func.coalesce(counts.c.n, 0))
                         .outerjoin(counts, counts.c.session_id == db.ChatSession.id)
                         .where(db.ChatSession.user_id == user.id)
                         .order_by(db.ChatSession.updated_at.desc())).all()
        return [{"id": c.id, "title": c.title, "questions": n,
                 "created_at": db.iso(c.created_at), "updated_at": db.iso(c.updated_at)} for c, n in rows]


def get_chat(session_id: str, user: CurrentUser) -> dict:
    with db.session() as s:
        chat = owned(s, session_id, user)
        if chat is None:
            raise HTTPException(404, "No such conversation.")
        return {"id": chat.id, "title": chat.title, "created_at": db.iso(chat.created_at),
                "updated_at": db.iso(chat.updated_at),
                "messages": [{"id": m.id, "role": m.role, "text": m.text, "steps": m.steps or [],
                              "suggestions": m.suggestions, "duration_ms": m.duration_ms, "error": m.error,
                              "created_at": db.iso(m.created_at)} for m in chat.messages]}


def rename_chat(session_id: str, user: CurrentUser, title: str) -> dict:
    with db.session() as s:
        chat = owned(s, session_id, user)
        if chat is None:
            raise HTTPException(404, "No such conversation.")
        chat.title = " ".join(title.split())[:120]
    return {"id": session_id, "title": chat.title}


def delete_chat(session_id: str, user: CurrentUser) -> None:
    with db.session() as s:
        chat = owned(s, session_id, user)
        if chat is not None:
            s.delete(chat)
