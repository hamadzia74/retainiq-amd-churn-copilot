# RetainIQ: churn prevention powered by AMD

**AMD Developer Hackathon Act III · Track 3: Reinvent Commerce**

**▶ Live demo: [retainiq-amd-churn-copilot.vercel.app](https://retainiq-amd-churn-copilot.vercel.app)**
Click **Try the demo** on the sign-in page: no account needed. The first load after a quiet spell
can take ~15 seconds while the server starts and trains the churn model.

LLM: DeepSeek-V4-Flash on **AMD Token Factory** (AMD GPUs) · License: [MIT](LICENSE)

RetainIQ tells an online retailer which customers are about to stop buying, why, and what
to do about each of them within a marketing budget. It then writes the win-back message in
the customer's own language.

```
/risk 8 $
 ID     Name           Tier     Churn risk       Spend 180d  $ at risk  Why
 C0139  James Patel    VIP      ██████░░░░  63%      $1,477       $467  threatened to leave; recent complaints; ...
/customer C0139  →  Recommended: Personal call + issue resolved · revenue saved $140 · cost $15
/plan 1000       →  79 customers · revenue saved $2,963 · net margin +$556 · ROI 80%
```

## The problem

A store's churn signals live in places that don't talk to each other. Orders sit in the
shop database, complaints in the help desk, and 1-star reviews on product pages. By the time
someone notices that a customer has stopped buying, the customer is gone. The usual fix is a
blanket discount, which spends margin on people who were never going to leave.

## How it works

```
 tickets + reviews ──► LLM on AMD GPUs ──► sentiment · category · "threat to leave"
 (en / es / de)        (Token Factory or            │
                        MI300X + vLLM)              │
                                                       ▼
 orders + catalogue ───────────────────────► features per customer ──► logistic regression ──► P(churn, 90d)
                                                                                                    │
                                    budget ──► expected-value optimizer ◄─────────────── drivers ───┘
                                                       │
                                                       ▼
                         who gets which offer · $ saved · ROI ──► LLM writes the message (on AMD)
```

| Step | Technology | Where |
|---|---|---|
| Read ~6,700 tickets and reviews into structured signals | DeepSeek-V4-Flash on **AMD Token Factory** (default), or your own model on an **AMD Instinct MI300X** with ROCm + vLLM | `signals.py` |
| Predict churn and explain it | scikit-learn logistic regression (no LLM) | `model.py` |
| Choose actions under a budget | Expected-value optimizer | `optimizer.py` |
| Personalized win-back messages, multilingual | LLM on AMD | `engine.py` |
| Free-text questions answered with tool calls | LLM on AMD + function calling | `agent.py`, `tools.py` |

### How the churn prediction is calculated

1. Rebuild every customer's features **as they were 90 days ago**, so nothing after that date leaks in.
2. Label = 1 if the customer then placed **no order in the next 90 days**.
3. Fit a logistic regression on 8 order features (recency, frequency trend, spend, discount share,
   returns, …) plus 5 text features from the LLM (complaints, negative tone, threats to leave, …).
4. Apply the fitted model to today's features to get P(churn in the next 90 days).
5. Explain each score with **coefficient × standardized value** for every feature.

The LLM never predicts churn. It turns free text into features. On the demo data, adding those
text features raises 5-fold cross-validated **ROC-AUC from 0.734 to 0.806**. That gain is what
reading tickets and reviews adds.

### How actions are chosen

```
revenue_saved = P(churn) × expected 90-day revenue × uplift(action, customer)
net_value     = revenue_saved × margin − cost(action, customer)
```

The four actions are free shipping, a 10% coupon, a 20% coupon and a personal call. Uplift is
personalized: coupons work better on deal-seekers, and a personal call works only when there is
a complaint to fix. Each customer gets their best action with positive net value. The budget is
then filled in order of value per dollar. **Uplift and cost figures are stated assumptions** in
one table in `optimizer.py`, so a merchant can replace them with their own A/B test results.

## Run it

**Locally (no GPU needed for the analytics):**

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows  (source .venv/bin/activate on Linux/macOS)
pip install -r requirements.txt
cp .env.example .env
python main.py --demo           # scripted walkthrough
python main.py                  # interactive
```

If no LLM is reachable, RetainIQ falls back to keyword signals and template messages, and
labels them that way on screen. The analytics still work.

### Which AMD service runs the LLM

| Profile (`LLM_PROVIDER`) | AMD service | Cost and limits | How RetainIQ uses it |
|---|---|---|---|
| `token_factory` (default) | **AMD Token Factory**: shared OpenAI-compatible endpoints on AMD GPUs | Free · per team key: 20 requests/min, 8 concurrent, $1/day | 50 messages per request, at most 18 requests/min and 7 at once |
| `vllm` | **AMD Developer Cloud**: your own model on an Instinct MI300X (ROCm + vLLM) | Credits · no rate limits | 1 message per request, 32 at once, and vLLM batches them on the GPU |

**AMD Token Factory (the full product, free):**

1. Sign in at [notebooks.amd.com/tokenfactory](https://notebooks.amd.com/tokenfactory) with
   your AMD AI Developer Program account and redeem the team API key.
2. Put it in `.env` as `LLM_API_KEY=rc-…`. `.env` is gitignored; never commit the key.
3. Run `python main.py`, then `/enrich`.

`/enrich` shows its cost up front (messages, requests and an estimated time), then a progress bar.
At the end it shows tokens/s and the model's ROC-AUC before and after. It saves after every batch,
so Ctrl+C is safe: run `/enrich` again to resume, or `/enrich all` to re-read everything.
Rate limits (429) are retried using the server's `Retry-After`. A bad key or a retired model
stops the run straight away with a clear message.

**Your own model on an AMD Instinct MI300X (optional):**

```bash
bash scripts/serve_amd.sh                     # on the droplet
ssh -N -L 8000:localhost:8000 root@<droplet-ip>   # on your laptop
# .env: LLM_PROVIDER=vllm  LLM_API_KEY=EMPTY
python main.py
```

## Web app

A FastAPI backend (`api/`) and a React frontend (`frontend/`) sit on top of the same `Engine`.
They don't change what the system calculates. They only add HTTP and a browser UI.

**Light, dark and system themes** sit in the sidebar (or the mobile menu). The choice is remembered.

**Guided Tours** (header button, or the book icon on phones) walk through each module:
Dashboard, Customers (At-risk list, Customer 360), Campaign planner, Copilot and Powered by AMD.
A spotlight moves across the real page while a step card explains it, and each step is **read
aloud** with the browser's built-in speech. Narration is on by default; the speaker button mutes it,
and that choice is remembered. Tours are read-only: the page is locked while a tour runs, so they
never submit, draft, enrich or chat for you. Esc closes a tour, ← and → move between steps, and
completed tours get a ✓.

**Development** (two terminals, after starting the database once):

```bash
docker compose up -d db                           # PostgreSQL 18 on localhost:5433 (docker-compose.yml)
# .env: ADMIN_EMAIL=you@example.com  ADMIN_PASSWORD=...   (the first admin is created at startup)
uvicorn api.main:app --reload --port 8080        # API, docs at http://localhost:8080/docs
cd frontend && npm install && npm run dev         # UI at http://localhost:5173 (proxies /api)
```

Already have PostgreSQL? Skip Docker and set `DATABASE_URL=postgresql://user:password@localhost:5432/retainiq`
(create the database first). Tables are created on startup.

**Accounts and saved chats.** Everything except `/api/health` and sign-in needs an account.
- **Sign-in** is email + password (Argon2id hashes). The session is a signed token in an httpOnly,
  SameSite=Lax cookie (Secure on HTTPS), valid 7 days. The app adds an `X-RetainIQ` header to
  every change, which blocks cross-site requests. Five wrong passwords lock that email + IP for 15 minutes.
- **Invite-only by default.** The first admin comes from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; admins
  invite others on the **Users** page (or `python -m api.manage create-user you@x.com --role admin`).
  `ALLOW_SIGNUP=true` opens self sign-up.
- **Roles:** analysts use everything except enrichment; admins also run enrichment and manage users;
  the optional **demo** account (`DEMO_EMAIL`/`DEMO_PASSWORD`) adds a one-click "Try the demo" button.
- **Daily AI limits per person** (default 500 admin / 150 analyst / 40 demo calls) protect the AMD
  quota on a public URL. Every LLM call is counted against whoever caused it, with its tokens; the
  account menu shows "42 / 150 AI calls today". At the limit, the Copilot and win-back drafts answer
  429 and follow-ups fall back to rules.
- **Copilot conversations are saved** as they were shown: answer, progress trace and follow-ups. The
  history panel opens, renames and deletes them; a reopened chat continues with its full context,
  even after a restart. Nobody can see anyone else's chats.
- Swagger (`/docs`): click **Authorize** and sign in with your email as the username.

**Production on Vercel (free, no card):** import the GitHub repo in Vercel (the FastAPI preset is
detected from `app.py`; `vercel.json` builds React), paste `.env.production` into Environment Variables,
deploy. Neon runs PostgreSQL. Enrichment takes longer than a serverless request may run, so run it once
from your computer straight into the production database; the site loads the results at startup:

```bash
python -m api.manage --env-file .env.production enrich   # spends AMD quota; asks first
```

**Production on a Docker host** (any provider): a Hugging Face Space (Docker) or similar runs the app,
Neon runs PostgreSQL. See [PROMPT_DEPLOY.md](PROMPT_DEPLOY.md) for the one-time setup, then:

```bash
copy .env.production.example .env.production      # real values; gitignored, never uploaded
python scripts/deploy_space.py <hf-user>/retainiq  # creates the Space, sets Secrets, uploads code only
```

The `Dockerfile` builds React and serves UI + API on port 7860 (`docker build -t retainiq .` works on any
Docker host). Enrichment results are also kept in Postgres, so a restart that wipes the disk doesn't
lose the AI's reading of tickets and reviews. Share the direct `https://<user>-retainiq.hf.space` URL:
inside the huggingface.co page the app is in a frame, where browsers block sign-in cookies.
Without Docker, `bash scripts/run_web.sh` builds React and serves everything on `:8080`; with the `vllm`
profile, run that on the MI300X droplet next to `scripts/serve_amd.sh`.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | LLM status, model, hardware, share of LLM-extracted signals |
| `GET /api/dashboard` | KPIs, CV ROC-AUC (orders only vs. with text), top complaints |
| `GET /api/customers/at-risk?limit&offset&tier&sort=prob\|value` | At-risk list with reasons, paged |
| `GET /api/customers/{id}` | Customer 360: contributions, messages, orders, best action |
| `POST /api/customers/{id}/message` | Win-back message (`source: llm` or `template`) |
| `POST /api/campaigns/plan` `{budget}` | Budget-optimized campaign |
| `GET /api/model` | Model weights and accuracy |
| `POST /api/enrich` · `GET /api/enrich/status` | LLM enrichment on AMD as a background job (409 if already running) |
| `POST /api/agent/chat` `{session_id, message}` | Copilot, streamed as Server-Sent Events: `step` (progress) · `delta` (answer text) → `answer` → `done` |
| `POST /api/agent/transcribe` (WAV body) | Voice input: 16 kHz mono WAV up to 60 s → transcript (off unless `LLM_TRANSCRIBE_MODEL` is set: Token Factory doesn't accept audio yet) |
| `POST /api/agent/suggestions` `{session_id}` | 3 follow-up questions for the latest exchange, `source: llm` or `rules` |
| `GET /api/agent/sessions` · `GET/PATCH/DELETE /api/agent/sessions/{id}` | Your saved conversations: list, open, rename, delete |
| `GET /api/auth/config` · `POST /api/auth/login` · `/demo` · `/logout` · `/signup` · `/password` | Sign-in (session cookie) |
| `GET /api/auth/me` | You and today's AI usage |
| `POST /api/auth/token` | Bearer token for Swagger and scripts |
| `GET/POST /api/users` · `PATCH /api/users/{id}` | Admins: invite, change role, deactivate, reset password |
| `GET /api/enrich/runs` | Admins: who ran enrichment, when, and how it ended |

**Copilot progress, streaming and voice.** Answers stream in word by word. Above each one, a collapsible
"How I got this" trace lists the steps the Copilot took in plain English ("Looked up at-risk VIP customers:
3 found, led by James Patel (63%)"), built from its real tool calls with no extra AI cost. The trace is open
while it works and collapses when it's done, and each step expands for details. The mic in the input bar records
a question (up to 60 s), transcribes it on AMD, and places the text in the box so you can check it before
pressing Send. Recordings are never stored.

**Copilot follow-ups.** After each answer the Copilot shows three suggested next questions;
tapping one sends it straight away. The LLM writes them from the question, the answer and the
data behind it, so they name real customers and figures. This is one short call per answer
(about $0.0002) with an 8-second limit. Before they're shown, duplicates, already-asked questions,
overlong items and invented customer IDs are filtered out. If the LLM is offline, slow or rate
limited, suggestions are built from the tool results instead.

When the LLM is unavailable, `/api/enrich` and `/api/agent/chat` return 503 with the reason
(unreachable, bad key, model retired), and every other endpoint keeps working on the keyword
fallback. `/api/health` reports the provider and the remaining daily quota. `/api/enrich/status`
returns the plan for the next run (pending messages, requests, estimated minutes). Chat streams
`status` events while it waits on a rate limit.

**API calls are kept to one per data need.** All cache keys and fetch options live in
`frontend/src/api/queries.ts`:
- **Model-derived data** (dashboard, customers, plans, weights) never goes stale on a timer. It
  refreshes once, when an enrichment run finishes.
- **Health and quota** are polled at most once a minute, only while the tab is visible. The
  server caches the provider lookups, so polling never turns into Token Factory traffic.
- **"Show more"** fetches only the next page (`offset`). The dashboard's top 5 reuses the
  Customers page's first page.
- **The budget slider** is debounced, and budgets you've already tried come from cache.
- **Housekeeping:** superseded requests are cancelled, and 4xx errors aren't retried.

The same scripted session went from 21 requests to 12:

| Interaction | Before | After |
|---|---|---|
| Customers page after the dashboard | 1 | 0 |
| Show more | 1 (re-downloaded rows 1–25) | 1 (only the next 25) |
| Opening a customer | 2 | 1 |
| Copilot page | 1 | 0 |
| Idle 2 minutes | 8 | 2 |

**Tests** never call the real LLM endpoint or touch your database:
- **`pytest -q`:** every endpoint with the LLM offline, the enrich job and SSE chat against a
  mocked LLM, the rate limiter, 429 retries, batch parsing, resume, health/quota caching and paging;
  sign-in, CSRF, lockout, roles, saved and private chats, and daily limits. They use a temporary SQLite
  file; to run them on PostgreSQL, point `TEST_DATABASE_URL` at an **empty test database** (its tables
  are dropped first): `TEST_DATABASE_URL=postgresql://retainiq:retainiq@localhost:5433/retainiq_test pytest -q`.
- **`cd frontend && npm test` (Vitest):** tour catalogue integrity, card placement, the tour store,
  narration (never overlaps), chart label layout and the data layer's request behaviour.

## Commands

| Command | What it does |
|---|---|
| `/dashboard` | Revenue at risk, high-risk counts, model accuracy, top complaint types |
| `/risk [n] [tier] [$]` | Riskiest customers with reasons (`$` sorts by revenue at risk) |
| `/customer <id>` | Customer 360: score, feature contributions, tickets and reviews, best action |
| `/plan <budget>` | Budget-optimized campaign: who gets what, revenue saved, ROI |
| `/message <id>` | Personalized win-back message in the customer's language |
| `/enrich` | Re-read all text with the LLM on AMD and retrain |
| `/model` | How the prediction is made, with model weights |
| anything else | Ask the agent, e.g. *"Which VIPs should I call this week, and why?"* |

## Project layout

```
main.py                 CLI wiring: REPL, slash commands, --demo
retainiq/
  config.py             paths, dates, LLM endpoint (.env)
  data.py               the 4 data sources (synthetic, seeded, causally structured)
  llm.py                OpenAI-compatible client for vLLM on AMD
  prompts.py            every prompt in one place
  signals.py            text → sentiment / category / threat (LLM, keyword fallback)
  features.py           joins the sources into one row per customer, as of a date
  model.py              logistic regression, CV ROC-AUC, per-customer explanations
  optimizer.py          action economics and budget allocation
  engine.py             the pipeline in one object (used by the CLI, the agent, and a future web UI)
  serializers.py        Engine results → JSON (shared by the agent tools and the API)
  tools.py · agent.py   tool-calling agent
  ui.py                 all terminal rendering (rich)
api/
  main.py               FastAPI app: lifespan builds ONE Engine, serves frontend/dist in prod
  deps.py               shared state: engine, enrichment lock + job, cache of chat agents
  schemas.py            Pydantic request/response models
  settings.py           database, sign-in and daily-limit settings (.env)
  db.py                 PostgreSQL tables: users, chats, messages, enrichment runs, AI usage
  auth.py               passwords, session cookie, CSRF header, route guards, lockout
  usage.py · chats.py   per-user AI metering + limits; saved conversations
  manage.py             command-line account admin
  routers/              system · account · users · dashboard · customers · campaigns · model · enrich · agent
frontend/src/
  app/                  providers (theme, query cache, router, motion) and lazy routes
  api/                  typed client, query keys + cache rules (queries.ts), SSE reader
  components/ui/        generic building blocks: Button, Card, Badge, Stat, Drawer, ProgressBar, …
  components/layout/    AppShell, Sidebar, MobileNav, header
  components/charts/    lazy, theme-aware Recharts charts with responsive label layout
  features/             customers · dashboard · campaign · copilot · amd · tours
  features/tours/       Guided Tours: catalogue, store, placement, narration, runner, panel
  hooks/ theme/ motion/ shared hooks, light/dark/system theme, animation variants
  pages/                thin compositions, one lazy chunk each
tests/                  API tests (LLM offline), LLM paths with a mocked client, caching and paging
scripts/serve_amd.sh    vLLM on ROCm / MI300X
scripts/run_web.sh      build React + serve everything on one port
```

## About the data

There is no public dataset that links one customer's orders to their support tickets and
reviews, so `data.py` generates one: 1,200 customers, about 18,000 orders, and about 6,700
tickets and reviews in English, Spanish and German. It is seeded and causally structured: a bad
experience leads to complaints, then fewer orders, then often churn. Some customers also leave
silently, and some complain but stay. To use real data, replace the CSVs in `data/` with files
that have the same columns.