"""Deploy RetainIQ to a Hugging Face Space (Docker) in one command.

    .venv\\Scripts\\pip install huggingface_hub
    .venv\\Scripts\\hf auth login                      # a token with Write access
    copy .env.production.example .env.production      # fill in real values (gitignored)
    .venv\\Scripts\\python scripts\\deploy_space.py <hf-user>/retainiq [--dry-run]

What it does:
  1. creates the Space (Docker SDK) if it doesn't exist,
  2. copies every value in .env.production into the Space's encrypted Secrets,
  3. uploads an ALLOW-LIST of code files (so .env, data/ and local files can never be included)
     plus the Space's README header, which starts a fresh build.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Only these are uploaded. Everything else (secrets, data, virtualenvs, builds) stays on your machine.
INCLUDE_FILES = ["Dockerfile", ".dockerignore", "requirements.txt"]
INCLUDE_DIRS = ["api", "retainiq", "frontend"]
EXCLUDE_PARTS = {"node_modules", "dist", "__pycache__", ".pytest_cache", ".vite"}
EXCLUDE_SUFFIXES = (".pyc", ".tsbuildinfo", ".db", ".log")

REQUIRED = ["LLM_API_KEY", "DATABASE_URL", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"]

SPACE_README = """---
title: RetainIQ
emoji: 📉
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: Churn-prevention copilot for online stores, powered by AMD
---

# RetainIQ

Churn prevention for online retailers: a churn model, a budget optimizer and a Copilot whose
LLM runs on **AMD Token Factory**. Open the app at the direct `*.hf.space` URL (sign-in cookies
don't work inside the embedded page).
"""


def files_to_upload(root: Path = ROOT) -> list[str]:
    """The allow-listed files, as POSIX paths relative to the project root."""
    out = [f for f in INCLUDE_FILES if (root / f).is_file()]
    for d in INCLUDE_DIRS:
        for p in sorted((root / d).rglob("*")):
            rel = p.relative_to(root)
            if (not p.is_file() or EXCLUDE_PARTS & set(rel.parts) or p.name.startswith(".env")
                    or p.name.endswith(EXCLUDE_SUFFIXES)):
                continue
            out.append(rel.as_posix())
    return out


def read_env(path: Path) -> dict[str, str]:
    """KEY=value lines; comments, blanks and empty values are skipped; surrounding quotes removed."""
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        if key and value:
            values[key] = value
    return values


def check(secrets: dict[str, str]) -> list[str]:
    """Problems that would break or weaken the deployment."""
    problems = [f"{k} is missing" for k in REQUIRED if k not in secrets]
    if len(secrets.get("JWT_SECRET", "")) < 32:
        problems.append("JWT_SECRET should be a long random value (python -c \"import secrets; print(secrets.token_urlsafe(48))\")")
    if len(secrets.get("ADMIN_PASSWORD", "")) < 12:
        problems.append("ADMIN_PASSWORD should be at least 12 characters for a public site")
    url = secrets.get("DATABASE_URL", "")
    if url and ("localhost" in url or "127.0.0.1" in url):
        problems.append("DATABASE_URL points at localhost - use your Neon connection string")
    return problems


def space_url(space_id: str) -> str:
    owner, name = space_id.split("/", 1)
    return f"https://{owner}-{name}".lower().replace("_", "-").replace(".", "-") + ".hf.space"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("space", help="<hf-username>/<space-name>, e.g. hamadzia/retainiq")
    p.add_argument("--env-file", default=str(ROOT / ".env.production"))
    p.add_argument("--dry-run", action="store_true", help="show what would be uploaded and set, change nothing")
    args = p.parse_args()

    env_file = Path(args.env_file)
    if not env_file.exists():
        sys.exit(f"{env_file} not found. Copy .env.production.example to .env.production and fill it in.")
    secrets = read_env(env_file)
    secrets.setdefault("COOKIE_SECURE", "true")
    if problems := check(secrets):
        sys.exit("Fix .env.production first:\n  - " + "\n  - ".join(problems))
    files = files_to_upload()

    print(f"Space:   {args.space}  ->  {space_url(args.space)}")
    print(f"Secrets: {', '.join(sorted(secrets))}  (values never printed)")
    print(f"Files:   {len(files)} (code only; .env, data/ and builds are never uploaded)")
    if args.dry_run:
        print("\n".join(f"  {f}" for f in files))
        return

    try:
        from huggingface_hub import CommitOperationAdd, HfApi
    except ImportError:
        sys.exit("Install the Hugging Face client first:  .venv\\Scripts\\pip install huggingface_hub")
    api = HfApi()
    api.create_repo(args.space, repo_type="space", space_sdk="docker", exist_ok=True)
    for key, value in secrets.items():
        api.add_space_secret(args.space, key, value)
    ops = [CommitOperationAdd(path_in_repo=f, path_or_fileobj=str(ROOT / f)) for f in files]
    ops.append(CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=SPACE_README.encode("utf-8")))
    api.create_commit(args.space, repo_type="space", operations=ops, commit_message="Deploy RetainIQ")
    print(f"\nUploaded. The Space is building (watch its Logs tab, ~5 min the first time).")
    print(f"Then open {space_url(args.space)}")


if __name__ == "__main__":
    main()
