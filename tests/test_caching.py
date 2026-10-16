"""The API must not turn frontend polling into provider traffic, and paging must not overlap.

    pytest -q tests/test_caching.py
"""

import time
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from api.main import app

from .conftest import sign_in


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        sign_in(c)
        yield c


@pytest.fixture
def provider_calls(monkeypatch):
    """Count every call that would leave the server for the LLM provider."""
    llm = app.state.retainiq.engine.llm
    calls = {"models": 0, "usage": 0}

    def models_list():
        calls["models"] += 1
        return NS(data=[NS(id=llm.model)])

    fake_client = NS(models=NS(list=models_list))
    fake_client.with_options = lambda **kw: fake_client
    monkeypatch.setattr(llm, "client", fake_client)

    def fake_get(url, **kw):
        calls["usage"] += 1
        return NS(raise_for_status=lambda: None,
                  json=lambda: {"rpm_limit": 20, "daily_cost_limit_usd": 1, "daily_cost_used_usd": 0.1,
                                "daily_cost_remaining_usd": 0.9, "daily_reset_at": "2026-10-16T16:00:00Z"})
    monkeypatch.setattr("retainiq.llm.httpx.get", fake_get)
    yield llm, calls
    llm._available, llm._checked_at, llm._usage = False, float("inf"), (0.0, None)


def test_health_polling_does_not_call_the_provider_per_request(client, provider_calls):
    llm, calls = provider_calls
    llm._available, llm._usage = True, (0.0, None)
    for _ in range(5):
        h = client.get("/api/health").json()
    assert h["llm_available"] and h["quota"]["daily_cost_remaining_usd"] == 0.9
    assert calls == {"models": 0, "usage": 1}         # availability cached; quota cached for a minute


def test_offline_availability_is_rechecked_at_most_every_30s(client, provider_calls):
    llm, calls = provider_calls
    llm._available, llm._checked_at = False, time.monotonic()
    for _ in range(5):
        assert client.get("/api/health").json()["llm_available"] is False
    assert calls["models"] == 0


def test_frontend_cache_headers(client):
    """index.html is revalidated on every load (so new builds show up); hashed assets are cached for good."""
    from api.main import DIST
    if not (DIST / "index.html").exists():
        pytest.skip("frontend not built")
    for path in ("/", "/customers/C0139"):                     # the app shell and an SPA route
        assert client.get(path).headers["cache-control"] == "no-cache"
    asset = next((DIST / "assets").glob("*.js")).name
    assert "immutable" in client.get(f"/assets/{asset}").headers["cache-control"]


def test_unknown_api_paths_are_404_for_every_method(client):
    for method in ("GET", "POST", "DELETE"):
        r = client.request(method, "/api/agent/no-such-endpoint")
        assert r.status_code == 404 and "Unknown API endpoint" in r.json()["detail"]
    assert client.post("/api/agent/suggestions", json={"session_id": "x"}).status_code == 200   # real routes still win


def test_at_risk_pages_line_up_with_one_big_request(client):
    one = client.get("/api/customers/at-risk?limit=50&sort=value").json()
    p1 = client.get("/api/customers/at-risk?limit=25&sort=value").json()
    p2 = client.get("/api/customers/at-risk?limit=25&offset=25&sort=value").json()
    assert [r["customer_id"] for r in p1 + p2] == [r["customer_id"] for r in one]
    assert client.get("/api/customers/at-risk?offset=-1").status_code == 422
