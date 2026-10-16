"""Web-only settings: database, sign-in and daily AI limits. (LLM settings live in retainiq/config.py.)

    DATABASE_URL            PostgreSQL, default postgresql+psycopg://retainiq:retainiq@localhost:5433/retainiq
                            (the docker-compose.yml database). postgres:// URLs are accepted as-is.
    JWT_SECRET              signs session cookies; generated into data/.jwt_secret when unset
    SESSION_DAYS            how long a sign-in lasts (default 7)
    COOKIE_SECURE           force the Secure cookie flag (it is set automatically on HTTPS requests)
    ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME   the first admin, created at startup if missing
    DEMO_EMAIL / DEMO_PASSWORD                  optional one-click demo account (role "demo")
    ALLOW_SIGNUP            true = anyone can create an analyst account (default: invite-only)
    DAILY_AI_CALLS_ADMIN / _ANALYST / _DEMO     AI calls per user per day (default 500 / 150 / 40)
"""

import logging
import os
import secrets

from retainiq.config import DATA_DIR

log = logging.getLogger(__name__)


def _str(key: str, default: str = "") -> str:
    return os.getenv(key, "").strip() or default


def _int(key: str, default: int) -> int:
    value = os.getenv(key, "").strip()
    return int(value) if value else default


def _bool(key: str) -> bool:
    return os.getenv(key, "").strip().lower() in {"1", "true", "yes", "on"}


def database_url(url: str) -> str:
    """Use the psycopg 3 driver for plain postgres:// and postgresql:// URLs (what hosts hand out)."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = database_url(_str("DATABASE_URL", "postgresql+psycopg://retainiq:retainiq@localhost:5433/retainiq"))
SESSION_DAYS = _int("SESSION_DAYS", 7)
COOKIE_NAME = "retainiq_session"
COOKIE_SECURE = _bool("COOKIE_SECURE")
# Every state-changing request from the app carries this header. A cross-site form can't add it,
# so together with SameSite=Lax cookies it blocks CSRF.
CSRF_HEADER = "X-RetainIQ"

ADMIN_EMAIL = _str("ADMIN_EMAIL").lower()
ADMIN_PASSWORD = _str("ADMIN_PASSWORD")
ADMIN_NAME = _str("ADMIN_NAME", "Admin")
DEMO_EMAIL = _str("DEMO_EMAIL").lower()
DEMO_PASSWORD = _str("DEMO_PASSWORD")
ALLOW_SIGNUP = _bool("ALLOW_SIGNUP")

ROLES = ("admin", "analyst", "demo")
DAILY_AI_CALLS = {
    "admin": _int("DAILY_AI_CALLS_ADMIN", 500),
    "analyst": _int("DAILY_AI_CALLS_ANALYST", 150),
    "demo": _int("DAILY_AI_CALLS_DEMO", 40),
}

MIN_PASSWORD = 8


def jwt_secret() -> str:
    """JWT_SECRET, or a random secret kept in data/.jwt_secret so sign-ins survive restarts."""
    if secret := _str("JWT_SECRET"):
        return secret
    path = DATA_DIR / ".jwt_secret"
    if path.exists():
        return path.read_text().strip()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    secret = secrets.token_urlsafe(48)
    path.write_text(secret)
    log.warning("JWT_SECRET is not set: generated one in %s. Set JWT_SECRET in production.", path)
    return secret
