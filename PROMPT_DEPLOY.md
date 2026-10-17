# Phase: Deploy RetainIQ over HTTPS (free)

> **Update 2026-10-17: deploying on Vercel.** Hugging Face now requires PRO ($9/month) for Docker
> Spaces, and Render's card check failed. Vercel's free Hobby plan needs no card and fits:
> Python bundles up to 500 MB (ours ~403 MB), 2 GB / 1 vCPU, 300 s per request, streaming and
> FastAPI lifespan supported.
>
> What changed for Vercel:
> - `app.py` (entrypoint) + `vercel.json` (builds React, 300 s max, keeps dev files out of the bundle)
>   + `.python-version` (3.13) + `.vercelignore` (secrets and local data never uploaded).
> - On Vercel (`VERCEL=1`) the dataset and signals cache live in `/tmp` (the only writable place),
>   the database pool is small per instance, and **enrichment is switched off** (it takes ~8 min,
>   longer than a request may run). Run it once from your PC straight into Neon:
>   `python -m api.manage --env-file .env.production enrich`; every Vercel instance loads the
>   results from the database at startup.
> - Steps: push to GitHub → Vercel → Add New → Project → import the repo (FastAPI is detected) →
>   Environment Variables: paste `.env.production` → Deploy. URL: `https://<project>.vercel.app`.
>
> The Hugging Face / Docker notes below still apply to any Docker host.

## Goal
One public HTTPS URL judges can open, sign in to with one click ("Try the demo"), and use
end to end - with the LLM on AMD Token Factory, data in PostgreSQL, and no secret in any repo.

## Architecture
```
Judges ──HTTPS──► https://<user>-retainiq.hf.space      Hugging Face Space (Docker, free CPU: 2 vCPU, 16 GB)
                    one container: FastAPI serves the React build + /api
                         ├─► Neon PostgreSQL (free)     accounts, saved chats, AI usage, enrichment results
                         └─► AMD Token Factory          the LLM (eligibility requirement)
```
Why: one container keeps today's behaviour exactly (startup training, background enrichment,
the shared rate limiter, streamed answers). 16 GB RAM fits pandas + scikit-learn; the Space sleeps
only after ~48 h idle. Neon is separate from the app, so redeploys never touch data.

## What gets built
1. **`Dockerfile`** (multi-stage): Node 22 builds `frontend/dist`; Python 3.13-slim runs
   `uvicorn --proxy-headers` on port 7860 as uid 1000 (what Spaces requires). One worker: the
   rate limiter and enrichment job live in memory.
2. **`.dockerignore`**: never ships `.env*`, `.venv`, `node_modules`, `data/`, tests, docs.
3. **HTTPS-aware cookies**: `--proxy-headers --forwarded-allow-ips=*` so the app sees `https`
   behind the Space proxy and marks the session cookie `Secure`; `COOKIE_SECURE=true` as a backstop.
4. **Enrichment survives restarts**: the Space's disk is wiped on every restart, so the LLM's reading
   of tickets/reviews (the expensive part) is also saved in Postgres (`app_values` table) after each
   run and restored at startup - merged with any local file, an LLM reading always beats a keyword one.
5. **`scripts/deploy_space.py`**: one command creates/updates the Space, uploads an **allow-list** of
   files (code only - `.env` can't slip through), writes the Space README header, and copies the
   secrets from a local, gitignored `.env.production` into the Space's encrypted Secrets.
6. **`.env.production.example`**: the template for those secrets.
7. **Embedded-page notice**: the huggingface.co/spaces page shows the app in an iframe, where browsers
   block sign-in cookies. The sign-in page detects that and offers "Open RetainIQ in a new tab".

## Secrets (Space → Settings → Secrets; set by the script)
| Name | Value |
|---|---|
| `LLM_API_KEY` | Token Factory team key |
| `DATABASE_URL` | Neon connection string (`postgresql://…neon.tech/neondb?sslmode=require`) |
| `JWT_SECRET` | **new** random value (never the local one) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | **new** admin login |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | demo account for judges |
| `COOKIE_SECURE` | `true` |

## Your steps (once)
1. **Neon**: sign up at neon.tech → New project (region near you, Postgres 17/18) → copy the
   connection string ("Connection details" → psycopg / URL).
2. **Hugging Face**: sign up → Settings → Access Tokens → New token, type **Write**.
3. Locally:
   ```
   .venv\Scripts\pip install huggingface_hub
   .venv\Scripts\hf auth login                 # paste the Write token
   copy .env.production.example .env.production   # fill in real values
   .venv\Scripts\python scripts\deploy_space.py <your-hf-username>/retainiq
   ```
4. Watch the build in the Space's **Logs** tab (~5 min first time), then open
   `https://<your-hf-username>-retainiq.hf.space`.

## Smoke test after deploy
- [ ] `/api/health` → `llm_available: true`, provider AMD Token Factory
- [ ] Sign-in page; "Try the demo" works; admin login works
- [ ] Browser devtools → Application → Cookies: `retainiq_session` is **HttpOnly + Secure**
- [ ] Copilot answer streams; the chat appears in History; reload → still there
- [ ] Account menu usage goes up after a question
- [ ] (Admin, spends quota - when you choose) run enrichment once → real ROC-AUC; restart the Space
      (Settings → Restart) → the dashboard still shows the LLM-enriched model
- [ ] `/api/dashboard` without signing in → 401

## Secrets checklist
- `.env` and `.env.production` are gitignored and never uploaded (allow-list upload).
- Fresh `JWT_SECRET` and admin password for production (the local ones were shared in chat).
- GitHub → Settings → Code security → enable **Secret scanning** and **Push protection**.
- If anything leaks: regenerate the Token Factory key, change `JWT_SECRET` (signs everyone out),
  reset the admin password on the Users page.

## Out of scope
Custom domain (paid on Spaces), CI auto-deploy from GitHub (can add a GitHub Action later),
database migrations (Alembic), the MI300X/vLLM profile in production.
