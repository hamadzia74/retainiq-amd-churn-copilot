"""Sign in and out, the current user, optional self sign-up, and password changes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from .. import auth, db, settings, usage
from ..auth import CurrentUser, UserDep
from ..schemas import AuthConfig, LoginRequest, Me, PasswordChange, SignupRequest, Token

router = APIRouter(prefix="/auth", tags=["auth"])


def me_payload(user: CurrentUser) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role,
            "usage": usage.summary(user.id, user.role)}


def _check_credentials(request: Request, email: str, password: str) -> db.User:
    """The user, or 401 - with at most 5 failures per email + IP every 15 minutes."""
    key = f"{auth.normalize_email(email)}|{request.client.host if request.client else '?'}"
    if wait := auth.throttle.wait_seconds(key):
        raise HTTPException(429, f"Too many sign-in attempts. Try again in {max(1, round(wait / 60))} min.")
    user = auth.authenticate(email, password)
    if user is None:
        auth.throttle.failed(key)
        raise HTTPException(401, "Wrong email or password.")
    auth.throttle.clear(key)
    return user


def _start_session(request: Request, response: Response, user: db.User) -> dict:
    auth.set_session_cookie(response, request, auth.issue_token(user))
    return me_payload(CurrentUser.of(user))


@router.get("/config", response_model=AuthConfig)
def config():
    """What the sign-in page should offer."""
    return {"signup": settings.ALLOW_SIGNUP, "demo": auth.demo_enabled()}


@router.post("/login", response_model=Me, dependencies=[Depends(auth.require_app_header)])
def login(body: LoginRequest, request: Request, response: Response):
    """Email + password -> a session cookie (httpOnly, 7 days)."""
    return _start_session(request, response, _check_credentials(request, body.email, body.password))


@router.post("/demo", response_model=Me, dependencies=[Depends(auth.require_app_header)])
def demo(request: Request, response: Response):
    """One-click sign-in to the shared demo account (only when DEMO_EMAIL/DEMO_PASSWORD are set)."""
    if not auth.demo_enabled():
        raise HTTPException(404, "The demo account is not enabled.")
    return _start_session(request, response, _check_credentials(request, settings.DEMO_EMAIL, settings.DEMO_PASSWORD))


@router.post("/token", response_model=Token)
def token(request: Request, form: Annotated[OAuth2PasswordRequestForm, Depends()]):
    """For Swagger's Authorize button and scripts: email (as username) + password -> a bearer token."""
    return {"access_token": auth.issue_token(_check_credentials(request, form.username, form.password))}


@router.post("/logout", status_code=204, dependencies=[Depends(auth.require_app_header)])
def logout():
    response = Response(status_code=204)
    auth.clear_session_cookie(response)
    return response


@router.get("/me", response_model=Me)
def me(user: UserDep):
    """The signed-in user and today's AI usage."""
    return me_payload(user)


@router.post("/signup", response_model=Me, status_code=201, dependencies=[Depends(auth.require_app_header)])
def signup(body: SignupRequest, request: Request, response: Response):
    """Create an analyst account - only when ALLOW_SIGNUP is on; otherwise an admin invites people."""
    if not settings.ALLOW_SIGNUP:
        raise HTTPException(403, "Sign-up is closed. Ask an admin for an account.")
    email = auth.normalize_email(body.email)
    if not auth.valid_email(email):
        raise HTTPException(422, "Enter a valid email address.")
    with db.session() as s:
        if s.scalar(select(db.User).where(db.User.email == email)):
            raise HTTPException(409, "An account with this email already exists. Sign in instead.")
        user = db.User(email=email, name=body.name.strip(), password_hash=auth.hash_password(body.password),
                       role="analyst", last_login_at=db.utcnow())
        s.add(user)
    return _start_session(request, response, user)


@router.post("/password", status_code=204)
def change_password(body: PasswordChange, user: UserDep, request: Request):
    """Change your own password. Other sessions are signed out; this one gets a fresh cookie."""
    if user.role == "demo":
        raise HTTPException(403, "The demo account's password can't be changed.")
    with db.session() as s:
        row = s.get(db.User, user.id)
        if not auth.verify_password(body.current_password, row.password_hash):
            raise HTTPException(400, "Your current password is wrong.")
        row.password_hash = auth.hash_password(body.new_password)
    response = Response(status_code=204)
    auth.set_session_cookie(response, request, auth.issue_token(row))
    return response
