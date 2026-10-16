"""The web app's database: accounts, saved Copilot chats, enrichment runs and AI usage.

SQLAlchemy 2.0 on PostgreSQL (psycopg 3); DATABASE_URL says where. Tables are created at
startup. The tests run the same code on a throwaway SQLite file, so nothing here may depend
on one database - the few dialect differences (JSONB, upserts) are handled explicitly.
Customers, orders and the churn model are NOT here: they are the synthetic demo dataset
(data/*.csv) and stay as files.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    """ISO 8601 in UTC. SQLite hands datetimes back without a zone; they were stored as UTC."""
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


# JSONB on Postgres (compact, indexable); plain JSON elsewhere.
Json = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="analyst")          # admin | analyst | demo
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ChatSession(Base):
    """One Copilot conversation. `state` is the agent's memory (LLM history + tool results)."""
    __tablename__ = "chat_sessions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    state: Mapped[dict] = mapped_column(Json, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", order_by="ChatMessage.id", cascade="all, delete-orphan", passive_deletes=True)


class ChatMessage(Base):
    """What the user saw: their question, or an answer with its progress trace and follow-ups."""
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))                                # user | assistant
    text: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list] = mapped_column(Json, default=list)
    suggestions: Mapped[list | None] = mapped_column(Json)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    session: Mapped[ChatSession] = relationship(back_populates="messages")


class EnrichRun(Base):
    __tablename__ = "enrich_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    force: Mapped[bool] = mapped_column(Boolean, default=False)
    state: Mapped[str] = mapped_column(String(16), default="running")         # running | done | error
    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_done: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StoredValue(Base):
    """Small named blobs the app must keep across restarts on hosts that wipe their disk
    (e.g. the LLM's reading of every ticket and review - see signal_store.py)."""
    __tablename__ = "app_values"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(Json)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Usage(Base):
    """AI calls per user, per UTC day, per feature (chat, suggest, message, transcribe, enrich)."""
    __tablename__ = "llm_usage"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    feature: Mapped[str] = mapped_column(String(16), primary_key=True)
    calls: Mapped[int] = mapped_column(Integer, default=0)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)


# ---------------------------------------------------------------------------- engine
_engine: Engine | None = None
_Session: sessionmaker[Session] | None = None


class DatabaseUnavailable(RuntimeError):
    """The database can't be reached at startup (message says how to fix it)."""


def init(url: str) -> Engine:
    """Connect and create any missing tables. Safe to call again (tests point it at a fresh database)."""
    global _engine, _Session
    if _engine is not None:
        _engine.dispose()
    if url.startswith("sqlite"):                          # the tests
        _engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15})

        @event.listens_for(_engine, "connect")
        def _pragmas(conn, _):
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")        # readers don't block the writer
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    else:
        # The SSE chat and the enrichment job hold a thread each, so allow a few more than the default 5.
        _engine = create_engine(url, pool_size=10, max_overflow=10, pool_pre_ping=True, pool_recycle=1800,
                                connect_args={"connect_timeout": 5, "application_name": "retainiq"})
    try:
        Base.metadata.create_all(_engine)
    except OperationalError as exc:
        where = _engine.url.render_as_string(hide_password=True)
        raise DatabaseUnavailable(
            f"Can't connect to the database at {where}. Start it with `docker compose up -d db` "
            f"or set DATABASE_URL in .env.\n  {str(exc.orig).strip().splitlines()[0]}") from None
    _Session = sessionmaker(_engine, expire_on_commit=False)
    return _engine


@contextmanager
def session() -> Iterator[Session]:
    """A unit of work: commits on success, rolls back on error."""
    if _Session is None:
        raise RuntimeError("database not initialised: call db.init() first")
    s = _Session()
    try:
        yield s
        s.commit()
    except BaseException:
        s.rollback()
        raise
    finally:
        s.close()


def dialect() -> str:
    return _engine.dialect.name if _engine is not None else ""


def get_db() -> Iterator[Session]:
    """FastAPI dependency."""
    with session() as s:
        yield s
