"""Vercel entrypoint: the FastAPI preset looks for an `app` object in app.py.

Locally, run the same app with `uvicorn api.main:app --reload --port 8080`.
"""

from api.main import app  # noqa: F401
