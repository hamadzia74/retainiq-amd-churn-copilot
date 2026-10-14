"""API tests with the LLM forced offline, so they run anywhere (no GPU).

    pytest -q
"""

import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:                     # runs the lifespan (builds the Engine)
        engine = app.state.retainiq.engine
        engine.llm._available = False              # behave as if vLLM were down
        engine.llm._checked_at = float("inf")      # ...and don't re-check during the tests
        yield c


@pytest.fixture(scope="module")
def top_id(client):
    return client.get("/api/customers/at-risk?limit=1&sort=value").json()[0]["customer_id"]


def test_health(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["llm_available"] is False and h["active_customers"] > 0


def test_dashboard(client):
    d = client.get("/api/dashboard").json()
    assert d["revenue_at_risk_90"] > 0
    assert 0.5 < d["auc_orders_only"] < d["auc_full"] <= 1     # text signals add lift


def test_at_risk_sorting_and_filter(client):
    rows = client.get("/api/customers/at-risk?limit=10&sort=value").json()
    values = [r["value_at_risk"] for r in rows]
    assert len(rows) == 10 and values == sorted(values, reverse=True)
    vips = client.get("/api/customers/at-risk?tier=VIP").json()
    assert vips and all(r["tier"] == "VIP" for r in vips)


def test_customer_360(client, top_id):
    c = client.get(f"/api/customers/{top_id}").json()
    assert c["customer_id"] == top_id
    assert c["contributions"] and c["orders"] and c["recommended_action"]["label"]
    assert client.get(f"/api/customers/{top_id.lower()}").status_code == 200   # case-insensitive


def test_message_falls_back_to_template(client, top_id):
    m = client.post(f"/api/customers/{top_id}/message").json()
    assert m["source"] == "template"
    assert m["name"].split()[0] in m["message"]


def test_plan_respects_budget(client):
    p = client.post("/api/campaigns/plan", json={"budget": 500}).json()
    assert 0 < p["spent"] <= 500 and p["customers"] == len(p["rows"])


def test_model(client):
    m = client.get("/api/model").json()
    assert len(m["weights"]) == 13


def test_enrich_status_idle(client):
    assert client.get("/api/enrich/status").json()["state"] == "idle"


@pytest.mark.parametrize("method,url,body,code", [
    ("get", "/api/customers/C9999", None, 404),
    ("post", "/api/customers/C9999/message", None, 404),
    ("post", "/api/campaigns/plan", {"budget": 0}, 422),
    ("post", "/api/campaigns/plan", {"budget": -5}, 422),
    ("get", "/api/customers/at-risk?tier=Gold", None, 422),
    ("post", "/api/enrich", None, 503),
    ("post", "/api/agent/chat", {"session_id": "t", "message": "hi"}, 503),
    ("get", "/api/nope", None, 404),
])
def test_errors(client, method, url, body, code):
    assert client.request(method.upper(), url, json=body).status_code == code
