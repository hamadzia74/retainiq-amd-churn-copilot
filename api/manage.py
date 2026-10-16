"""Account admin from the command line (works before anyone can sign in).

    python -m api.manage create-user you@example.com --name "Your Name" --role admin
    python -m api.manage set-password you@example.com
    python -m api.manage list-users

Passwords are asked for interactively (or pass --password for scripts).
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from . import auth, db, settings


def _password(given: str | None) -> str:
    if given:
        password = given
    else:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Repeat password: ") != password:
            sys.exit("Passwords don't match.")
    if len(password) < settings.MIN_PASSWORD:
        sys.exit(f"Use at least {settings.MIN_PASSWORD} characters.")
    return password


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="python -m api.manage", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-user")
    c.add_argument("email")
    c.add_argument("--name", default="")
    c.add_argument("--role", choices=settings.ROLES, default="analyst")
    c.add_argument("--password")
    sp = sub.add_parser("set-password")
    sp.add_argument("email")
    sp.add_argument("--password")
    sub.add_parser("list-users")
    args = p.parse_args(argv)

    db.init(settings.DATABASE_URL)
    with db.session() as s:
        if args.cmd == "list-users":
            for u in s.scalars(select(db.User).order_by(db.User.id)):
                print(f"{u.id:>4}  {u.email:<36} {u.role:<8} {'active' if u.is_active else 'inactive'}")
            return
        email = auth.normalize_email(args.email)
        user = s.scalar(select(db.User).where(db.User.email == email))
        if args.cmd == "create-user":
            if not auth.valid_email(email):
                sys.exit("Enter a valid email address.")
            if user:
                sys.exit(f"{email} already exists. Use set-password to change the password.")
            s.add(db.User(email=email, name=args.name or email.split("@")[0], role=args.role,
                          password_hash=auth.hash_password(_password(args.password))))
            print(f"Created {args.role} {email}")
        else:
            if not user:
                sys.exit(f"No user {email}.")
            user.password_hash = auth.hash_password(_password(args.password))
            print(f"Password changed for {email} (their other sessions are signed out).")


if __name__ == "__main__":
    main()
