"""RetainIQ web API.

    uvicorn api.main:app --reload --port 8080        # dev (React runs on Vite :5173)
    bash scripts/run_web.sh                          # prod: builds React, serves everything on :8080

All business logic stays in retainiq/; this file only wires HTTP to it.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from retainiq.config import ROOT
from retainiq.engine import Engine
from retainiq.llm import LLMError

from .deps import AppState
from .routers import agent, campaigns, customers, dashboard, enrich, model, system

DIST = ROOT / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One Engine per process: data load + model training happen once, here.
    engine = await run_in_threadpool(Engine)
    await run_in_threadpool(lambda: engine.llm.available)
    app.state.retainiq = AppState(engine)
    yield


app = FastAPI(title="RetainIQ API", version="0.2.0", lifespan=lifespan,
              description="Churn-prevention copilot for online retailers, powered by AMD.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LLMError)
def llm_error(_: Request, exc: LLMError):
    """LLM trouble (rate limit after retries, bad key, model gone) -> 503 with a readable reason."""
    return JSONResponse({"detail": str(exc)}, status_code=503)


for r in (system, dashboard, customers, campaigns, model, enrich, agent):
    app.include_router(r.router, prefix="/api")


# Production: serve the built React app from the same origin (one URL for judges).
# index.html must never be cached, or browsers keep loading an old build after a rebuild.
# Files under assets/ have a content hash in their name, so they can be cached for good.
NO_CACHE = {"Cache-Control": "no-cache"}
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def unknown_api(path: str):
    """Unknown API paths get a clear 404 (any method), never the SPA route's 405."""
    raise HTTPException(404, f"Unknown API endpoint: /api/{path}")


if DIST.exists():
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        file = (DIST / path).resolve()
        if path and file.is_file() and file.is_relative_to(DIST.resolve()):
            return FileResponse(file, headers=IMMUTABLE if path.startswith("assets/") else NO_CACHE)
        return FileResponse(DIST / "index.html", headers=NO_CACHE)       # client-side routes
