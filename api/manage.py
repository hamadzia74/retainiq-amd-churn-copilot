"""Admin tasks from the command line (they work before anyone can sign in).

    python -m api.manage create-user you@example.com --name "Your Name" --role admin
    python -m api.manage set-password you@example.com
    python -m api.manage list-users
    python -m api.manage enrich                 # read tickets/reviews on AMD, save results to the database
    python -m api.manage sync-signals           # upload data/signals.json (e.g. from the CLI's /enrich)

Add --env-file .env.production (before the command) to act on the production database and settings:

    python -m api.manage --env-file .env.production enrich

Passwords are asked for interactively (or pass --password for scripts).
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

ROLES = ("admin", "analyst", "demo")


def load_env_file(path: Path) -> None:
    """Put KEY=value lines into the environment (overriding), before any settings are read."""
    if not path.exists():
        sys.exit(f"{path} not found.")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = (part.strip() for part in line.split("=", 1))
            value = value.split(" #", 1)[0].strip().strip('"').strip("'")
            if key and value:
                os.environ[key] = value


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="python -m api.manage", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--env-file", help="read settings from this file first (e.g. .env.production)")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-user")
    c.add_argument("email")
    c.add_argument("--name", default="")
    c.add_argument("--role", choices=ROLES, default="analyst")
    c.add_argument("--password")
    sp = sub.add_parser("set-password")
    sp.add_argument("email")
    sp.add_argument("--password")
    sub.add_parser("list-users")
    e = sub.add_parser("enrich", help="read every ticket and review with the LLM on AMD (spends quota)")
    e.add_argument("--force", action="store_true", help="re-read messages that were already read")
    e.add_argument("--yes", action="store_true", help="don't ask for confirmation")
    sub.add_parser("sync-signals", help="save data/signals.json to the database")
    args = p.parse_args(argv)

    if args.env_file:
        load_env_file(Path(args.env_file))
    # Imported only now, so settings see the --env-file values.
    from . import db, settings
    db.init(settings.DATABASE_URL)
    print(f"Database: {db._engine.url.render_as_string(hide_password=True)}")

    if args.cmd in ("enrich", "sync-signals"):
        _signals(args)
    else:
        _accounts(args)


def _password(given: str | None) -> str:
    from . import settings
    if given:
        password = given
    else:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Repeat password: ") != password:
            sys.exit("Passwords don't match.")
    if len(password) < settings.MIN_PASSWORD:
        sys.exit(f"Use at least {settings.MIN_PASSWORD} characters.")
    return password


def _accounts(args) -> None:
    from sqlalchemy import select

    from . import auth, db
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


def _signals(args) -> None:
    from retainiq import config, signals

    from . import signal_store
    if args.cmd == "sync-signals":
        current = signals.load_cache()
        if not current:
            sys.exit(f"{config.SIGNALS_CACHE} is empty or missing - run enrichment first.")
        signal_store.save(current)
        n = sum(v.get("source") == "llm" for v in current.values())
        print(f"Saved {len(current):,} signals ({n:,} read by the LLM) to the database.")
        return

    from retainiq.engine import Engine
    signal_store.restore()                          # start from what the database already has: resumable
    engine = Engine()
    if not engine.llm.available:
        sys.exit(f"LLM unavailable: {engine.llm.problem}")
    plan = engine.enrich_plan(args.force)
    if not plan["pending"]:
        print("Every message has already been read by the LLM (use --force to re-read).")
        signal_store.save(engine.signals)
        return
    print(f"{plan['pending']:,} messages -> {plan['requests']} requests on {config.LLM_PROVIDER_NAME} "
          f"(~{plan['est_minutes']} min). This spends your AMD quota.")
    if not args.yes and input("Continue? [y/N] ").strip().lower() != "y":
        sys.exit("Cancelled.")
    done = [0]

    def progress(n: int) -> None:
        done[0] += n
        print(f"\r  {done[0]:,} / {plan['pending']:,} read", end="", flush=True)

    try:
        stats = engine.enrich(on_progress=progress, force=args.force)
    finally:
        print()
        signal_store.save(engine.signals)           # keep progress even if it stopped part-way
        print("Saved to the database.")
    print(f"ROC-AUC {stats['auc_before']:.3f} -> {stats['auc_after']:.3f} "
          f"(orders only: {stats['auc_orders_only']:.3f}); {stats['failed']} messages fell back to keywords.")


if __name__ == "__main__":
    main()
