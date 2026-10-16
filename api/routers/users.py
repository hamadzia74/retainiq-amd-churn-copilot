"""Admins manage accounts: invite people, change roles, deactivate, reset passwords, see usage."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import auth, db, usage
from ..auth import AdminDep
from ..schemas import NewUser, UserRow, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _row(u: db.User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "is_active": u.is_active,
            "created_at": db.iso(u.created_at), "last_login_at": db.iso(u.last_login_at),
            "usage": usage.summary(u.id, u.role)}


@router.get("", response_model=list[UserRow])
def list_users(_: AdminDep):
    with db.session() as s:
        users = s.scalars(select(db.User).order_by(db.User.created_at)).all()
    return [_row(u) for u in users]


@router.post("", response_model=UserRow, status_code=201)
def create_user(body: NewUser, _: AdminDep):
    """Invite someone: they sign in with this email and password (share it with them privately)."""
    email = auth.normalize_email(body.email)
    if not auth.valid_email(email):
        raise HTTPException(422, "Enter a valid email address.")
    with db.session() as s:
        if s.scalar(select(db.User).where(db.User.email == email)):
            raise HTTPException(409, "An account with this email already exists.")
        user = db.User(email=email, name=body.name.strip(), password_hash=auth.hash_password(body.password),
                       role=body.role)
        s.add(user)
        s.flush()
        return _row(user)


@router.patch("/{user_id}", response_model=UserRow)
def update_user(user_id: int, body: UserUpdate, admin: AdminDep):
    """Rename, change role, (de)activate, or set a new password (which signs them out everywhere)."""
    if user_id == admin.id and (body.is_active is False or (body.role and body.role != "admin")):
        raise HTTPException(400, "You can't remove your own admin access. Ask another admin.")
    with db.session() as s:
        user = s.get(db.User, user_id)
        if user is None:
            raise HTTPException(404, "No such user.")
        if body.name is not None:
            user.name = body.name.strip()
        if body.role is not None:
            user.role = body.role
        if body.is_active is not None:
            user.is_active = body.is_active
        if body.password is not None:
            user.password_hash = auth.hash_password(body.password)
        s.flush()
        return _row(user)
