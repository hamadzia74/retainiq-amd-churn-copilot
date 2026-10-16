"""Tests never touch the real AMD endpoint, your daily quota, or your database.

Environment variables win over .env (load_dotenv doesn't override them), so this points the
LLM at a closed local port and the app at a throwaway database before anything is imported:
a temporary SQLite file by default (no server needed), or a PostgreSQL database you name with
TEST_DATABASE_URL - its tables are DROPPED and recreated, so never point it at real data:

    TEST_DATABASE_URL=postgresql+psycopg://retainiq:retainiq@localhost:5433/retainiq_test pytest -q
"""

import os
import tempfile
from pathlib import Path

os.environ["LLM_PROVIDER"] = "token_factory"
os.environ["LLM_BASE_URL"] = "http://127.0.0.1:9/v1"
os.environ["LLM_API_KEY"] = "test-key"
os.environ["LLM_RPM"] = "0"          # no pacing against the fake client (limiter has its own tests)

os.environ["DATABASE_URL"] = (os.getenv("TEST_DATABASE_URL", "").strip()
                              or f"sqlite:///{(Path(tempfile.mkdtemp(prefix='retainiq-tests-')) / 'test.db').as_posix()}")
os.environ["JWT_SECRET"] = "test-secret-that-is-long-enough-for-hs256-signing"
os.environ["ADMIN_EMAIL"] = ADMIN_EMAIL = "admin@test.local"
os.environ["ADMIN_PASSWORD"] = ADMIN_PASSWORD = "admin-password"
os.environ["DEMO_EMAIL"] = DEMO_EMAIL = "demo@test.local"
os.environ["DEMO_PASSWORD"] = "demo-password"
os.environ["DAILY_AI_CALLS_ADMIN"] = "100000"     # the limit itself is tested with a patched value
os.environ.pop("ALLOW_SIGNUP", None)

# Tests work on a copy of data/signals.json, so nothing they save or restore touches the real one.
import shutil                                            # noqa: E402

from retainiq import config                              # noqa: E402

_signals_copy = Path(tempfile.mkdtemp(prefix="retainiq-signals-")) / "signals.json"
if config.SIGNALS_CACHE.exists():
    shutil.copyfile(config.SIGNALS_CACHE, _signals_copy)
config.SIGNALS_CACHE = _signals_copy

if os.getenv("TEST_DATABASE_URL", "").strip():           # a PostgreSQL test database: start from empty tables
    from sqlalchemy import create_engine

    from api.db import Base
    from api.settings import DATABASE_URL
    _e = create_engine(DATABASE_URL)
    Base.metadata.drop_all(_e)
    _e.dispose()


def sign_in(client, email: str = ADMIN_EMAIL, password: str = ADMIN_PASSWORD):
    """Sign a TestClient in (it keeps the session cookie) and send the app header like the browser does."""
    client.headers["X-RetainIQ"] = "1"
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return client
