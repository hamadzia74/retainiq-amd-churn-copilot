"""Sign-in: password hashing, session tokens and the route guards.

A session is a signed JWT in an httpOnly cookie (SameSite=Lax; Secure on HTTPS), so page scripts
never see it. State-changing requests that rely on the cookie must also send `X-RetainIQ: 1`,
which a cross-site form cannot do. Scripts and Swagger can use `Authorization: Bearer <token>`
instead (from POST /api/auth/token); a bearer token is never sent automatically, so it skips that check.
"""

import logging
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from sqlalchemy import func, select

from . import db, settings

log = logging.getLogger(__name__)

ALGORITHM = "HS256"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_hasher = PasswordHash.recommended()            # Argon2id
_dummy_hash: str | None = None
_secret: str | None = None


def _key() -> str:
    global _secret
    if _secret is None:
        _secret = settings.jwt_secret()
    return _secret


# ---------------------------------------------------------------------------- passwords
def normalize_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    return bool(EMAIL.match(email)) and len(email) <= 254


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _hasher.verify(password, hashed)
    except Exception:                             # malformed hash
        return False


def authenticate(email: str, password: str) -> db.User | None:
    """The active user with these credentials, or None. Takes the same time whether or not the email exists."""
    global _dummy_hash
    with db.session() as s:
        user = s.scalar(select(db.User).where(db.User.email == normalize_email(email)))
        if user is None:
            _dummy_hash = _dummy_hash or hash_password("not-a-real-password")
            verify_password(password, _dummy_hash)
            return None
        if not verify_password(password, user.password_hash) or not user.is_active:
            return None
        user.last_login_at = db.utcnow()
        return user


# ---------------------------------------------------------------------------- tokens
@dataclass(frozen=True)
class CurrentUser:
    id: int
    email: str
    name: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @classmethod
    def of(cls, u: db.User) -> "CurrentUser":
        return cls(u.id, u.email, u.name, u.role)


def _password_version(password_hash: str) -> str:
    """Changes whenever the password does, so a new password signs out every old session."""
    return password_hash[-10:]


def issue_token(user: db.User) -> str:
    now = db.utcnow()
    claims = {"sub": str(user.id), "pv": _password_version(user.password_hash),
              "iat": now, "exp": now + timedelta(days=settings.SESSION_DAYS)}
    return jwt.encode(claims, _key(), algorithm=ALGORITHM)


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(settings.COOKIE_NAME, token, max_age=settings.SESSION_DAYS * 86400, path="/",
                        httponly=True, samesite="lax", secure=settings.COOKIE_SECURE or request.url.scheme == "https")


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.COOKIE_NAME, path="/")


# ---------------------------------------------------------------------------- guards
def require_app_header(request: Request) -> None:
    """State-changing cookie requests must come from the app itself (see module docstring)."""
    if request.method not in SAFE_METHODS and request.headers.get(settings.CSRF_HEADER) != "1":
        raise HTTPException(403, f"Missing {settings.CSRF_HEADER} header.")


# Lets Swagger's "Authorize" button sign in (POST /api/auth/token) and send a bearer token.
_bearer_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def current_user(request: Request, bearer: Annotated[str | None, Depends(_bearer_scheme)] = None) -> CurrentUser:
    """Route guard: the signed-in user, or 401. Also enforces the CSRF header for cookie sessions."""
    token = bearer or request.cookies.get(settings.COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Sign in to continue.")
    if not bearer:
        require_app_header(request)
    try:
        claims = jwt.decode(token, _key(), algorithms=[ALGORITHM])
        user_id = int(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "Your session has expired. Sign in again.") from None
    with db.session() as s:
        user = s.get(db.User, user_id)
        if user is None or not user.is_active or claims.get("pv") != _password_version(user.password_hash):
            raise HTTPException(401, "Your session has expired. Sign in again.")
        return CurrentUser.of(user)


def require_admin(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(403, "Only admins can do that.")
    return user


UserDep = Annotated[CurrentUser, Depends(current_user)]
AdminDep = Annotated[CurrentUser, Depends(require_admin)]


# ---------------------------------------------------------------------------- brute force
class LoginThrottle:
    """At most LIMIT failed sign-ins per key (email + IP) in WINDOW seconds."""
    LIMIT = 5
    WINDOW = 15 * 60

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self._fails: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> deque[float]:
        q = self._fails.setdefault(key, deque())
        while q and self.clock() - q[0] > self.WINDOW:
            q.popleft()
        return q

    def wait_seconds(self, key: str) -> int:
        """0 if this key may try again now, else how long until it may."""
        with self._lock:
            q = self._recent(key)
            return 0 if len(q) < self.LIMIT else max(1, int(self.WINDOW - (self.clock() - q[0])))

    def failed(self, key: str) -> None:
        with self._lock:
            self._recent(key).append(self.clock())

    def clear(self, key: str) -> None:
        with self._lock:
            self._fails.pop(key, None)


throttle = LoginThrottle()


# ---------------------------------------------------------------------------- startup
def ensure_accounts() -> None:
    """Create the admin (and demo account) from the environment if they don't exist yet."""
    with db.session() as s:
        if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
            if not s.scalar(select(db.User).where(db.User.email == settings.ADMIN_EMAIL)):
                s.add(db.User(email=settings.ADMIN_EMAIL, name=settings.ADMIN_NAME,
                              password_hash=hash_password(settings.ADMIN_PASSWORD), role="admin"))
                log.info("Created admin account %s", settings.ADMIN_EMAIL)
        if demo_enabled():
            demo = s.scalar(select(db.User).where(db.User.email == settings.DEMO_EMAIL))
            if demo is None:
                s.add(db.User(email=settings.DEMO_EMAIL, name="Demo user",
                              password_hash=hash_password(settings.DEMO_PASSWORD), role="demo"))
            elif not verify_password(settings.DEMO_PASSWORD, demo.password_hash):
                demo.password_hash = hash_password(settings.DEMO_PASSWORD)       # .env changed
        s.flush()
        if not s.scalar(select(func.count()).select_from(db.User).where(db.User.role == "admin", db.User.is_active)):
            log.warning("No admin account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart, "
                        "or run: python -m api.manage create-user you@example.com --role admin")


def demo_enabled() -> bool:
    return bool(settings.DEMO_EMAIL and settings.DEMO_PASSWORD)
