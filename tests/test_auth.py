"""Accounts, sessions, roles, saved chats and daily AI limits. Fake LLM only."""

import json
from types import SimpleNamespace as NS

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api import auth, settings
from api.main import app
from retainiq.agent import Agent, ToolUse, Turn

from .conftest import ADMIN_EMAIL, ADMIN_PASSWORD, sign_in
from .test_llm_paths import fake_create


@pytest.fixture(scope="module")
def admin():
    mp = pytest.MonkeyPatch()
    mp.setattr("retainiq.engine.signals.save_cache", lambda s: None)
    with TestClient(app) as c:
        sign_in(c)
        llm = app.state.retainiq.engine.llm
        llm._available, llm._checked_at = True, float("inf")
        llm.client = NS(chat=NS(completions=NS(create=fake_create)))
        yield c
    mp.undo()


def browser() -> TestClient:
    """Another signed-out browser on the same running app (shares its state; no second startup)."""
    c = TestClient(app)
    c.headers["X-RetainIQ"] = "1"
    return c


def make_user(admin, email, role="analyst", password="analyst-password"):
    r = admin.post("/api/users", json={"email": email, "name": email.split("@")[0], "password": password, "role": role})
    assert r.status_code == 201, r.text
    return r.json()


def ask(client, session_id, message):
    with client.stream("POST", "/api/agent/chat", json={"session_id": session_id, "message": message}) as r:
        status = r.status_code
        lines = list(r.iter_lines())
    return status, lines


# ------------------------------------------------------------------ sign-in
def test_only_health_and_sign_in_are_public(admin):
    anon = browser()
    assert anon.get("/api/health").status_code == 200
    assert anon.get("/api/auth/config").json() == {"signup": False, "demo": True}
    for path in ["/api/dashboard", "/api/customers/at-risk", "/api/model", "/api/enrich/status",
                 "/api/agent/sessions", "/api/users", "/api/auth/me"]:
        assert anon.get(path).status_code == 401, path
    assert anon.post("/api/campaigns/plan", json={"budget": 100}).status_code == 401
    assert anon.post("/api/agent/chat", json={"session_id": "x", "message": "hi"}).status_code == 401


def test_session_cookie_is_httponly(admin):
    r = browser().post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    cookie = r.headers["set-cookie"].lower()
    assert settings.COOKIE_NAME in cookie and "httponly" in cookie and "samesite=lax" in cookie
    assert "secure" not in cookie                                    # plain-HTTP test client


def test_wrong_password_and_too_many_attempts(admin):
    c = browser()
    for _ in range(auth.LoginThrottle.LIMIT):
        assert c.post("/api/auth/login", json={"email": "nobody@test.local", "password": "nope"}).status_code == 401
    r = c.post("/api/auth/login", json={"email": "nobody@test.local", "password": "nope"})
    assert r.status_code == 429 and "Try again" in r.json()["detail"]
    assert c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}).json()["detail"] == "Wrong email or password."


def test_throttle_forgets_old_failures():
    now = [0.0]
    t = auth.LoginThrottle(clock=lambda: now[0])
    for _ in range(t.LIMIT):
        t.failed("k")
    assert t.wait_seconds("k") > 0
    now[0] = t.WINDOW + 1
    assert t.wait_seconds("k") == 0


def test_cookie_requests_need_the_app_header_but_bearer_tokens_dont(admin):
    c = sign_in(browser())
    del c.headers["X-RetainIQ"]
    assert c.get("/api/dashboard").status_code == 200                 # reads are fine
    assert c.post("/api/campaigns/plan", json={"budget": 100}).status_code == 403
    no_header = TestClient(app).post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert no_header.status_code == 403                               # nor can a cross-site form sign you in

    token = TestClient(app).post("/api/auth/token", data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()
    api = TestClient(app, headers={"Authorization": f"Bearer {token['access_token']}"})
    assert api.post("/api/campaigns/plan", json={"budget": 100}).status_code == 200
    assert TestClient(app, headers={"Authorization": "Bearer junk"}).get("/api/dashboard").status_code == 401


def test_me_then_sign_out(admin):
    c = sign_in(browser())
    me = c.get("/api/auth/me").json()
    assert me["email"] == ADMIN_EMAIL and me["role"] == "admin"
    assert set(me["usage"]) >= {"calls", "limit", "remaining", "by_feature"}
    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401


# ------------------------------------------------------------------ roles
def test_demo_account_is_one_click_and_limited(admin):
    demo = browser()
    me = demo.post("/api/auth/demo").json()
    assert me["role"] == "demo" and me["usage"]["limit"] == settings.DAILY_AI_CALLS["demo"]
    assert demo.get("/api/dashboard").status_code == 200
    assert demo.get("/api/users").status_code == 403
    assert demo.post("/api/enrich").status_code == 403
    assert demo.post("/api/auth/password", json={"current_password": "demo-password",
                                                 "new_password": "something-else"}).status_code == 403


def test_admin_invites_changes_and_deactivates_users(admin):
    make_user(admin, "ana@test.local")
    assert admin.post("/api/users", json={"email": "ANA@test.local", "name": "x", "password": "longenough"}).status_code == 409
    assert admin.post("/api/users", json={"email": "not-an-email", "name": "x", "password": "longenough"}).status_code == 422
    assert admin.post("/api/users", json={"email": "s@test.local", "name": "x", "password": "short"}).status_code == 422

    ana = sign_in(browser(), "ana@test.local", "analyst-password")
    assert ana.get("/api/auth/me").json()["role"] == "analyst"
    assert ana.get("/api/users").status_code == 403
    assert ana.post("/api/enrich").status_code == 403                # analysts can't spend the big quota

    users = {u["email"]: u for u in admin.get("/api/users").json()}
    ana_id = users["ana@test.local"]["id"]
    assert users["ana@test.local"]["last_login_at"]
    assert admin.patch(f"/api/users/{ana_id}", json={"is_active": False}).json()["is_active"] is False
    assert ana.get("/api/auth/me").status_code == 401                 # deactivated: signed out at once
    assert browser().post("/api/auth/login", json={"email": "ana@test.local", "password": "analyst-password"}).status_code == 401
    admin.patch(f"/api/users/{ana_id}", json={"is_active": True})

    ana = sign_in(browser(), "ana@test.local", "analyst-password")
    admin.patch(f"/api/users/{ana_id}", json={"password": "reset-by-admin"})
    assert ana.get("/api/auth/me").status_code == 401                 # a new password ends old sessions
    sign_in(browser(), "ana@test.local", "reset-by-admin")

    me = admin.get("/api/auth/me").json()
    assert admin.patch(f"/api/users/{me['id']}", json={"role": "analyst"}).status_code == 400
    assert admin.patch(f"/api/users/{me['id']}", json={"is_active": False}).status_code == 400
    assert admin.patch("/api/users/99999", json={"name": "x"}).status_code == 404


def test_changing_your_password_signs_out_your_other_sessions(admin):
    make_user(admin, "bo@test.local")
    laptop = sign_in(browser(), "bo@test.local", "analyst-password")
    phone = sign_in(browser(), "bo@test.local", "analyst-password")
    assert laptop.post("/api/auth/password", json={"current_password": "wrong-one",
                                                   "new_password": "brand-new-pass"}).status_code == 400
    assert laptop.post("/api/auth/password", json={"current_password": "analyst-password",
                                                   "new_password": "brand-new-pass"}).status_code == 204
    assert laptop.get("/api/auth/me").status_code == 200              # got a fresh cookie
    assert phone.get("/api/auth/me").status_code == 401


def test_sign_up_is_closed_unless_allowed(admin, monkeypatch):
    body = {"email": "new@test.local", "name": "New", "password": "new-password"}
    assert browser().post("/api/auth/signup", json=body).status_code == 403
    monkeypatch.setattr(settings, "ALLOW_SIGNUP", True)
    c = browser()
    r = c.post("/api/auth/signup", json=body)
    assert r.status_code == 201 and r.json()["role"] == "analyst"
    assert c.get("/api/auth/me").status_code == 200
    assert browser().post("/api/auth/signup", json=body).status_code == 409


# ------------------------------------------------------------------ saved chats
def test_chats_are_saved_private_and_resumable(admin):
    status, lines = ask(admin, "saved-1", "plan $300")
    assert status == 200 and "event: answer" in lines
    admin.post("/api/agent/suggestions", json={"session_id": "saved-1"})

    listed = {c["id"]: c for c in admin.get("/api/agent/sessions").json()}
    assert listed["saved-1"]["title"] == "plan $300" and listed["saved-1"]["questions"] == 1

    chat = admin.get("/api/agent/sessions/saved-1").json()
    user, reply = chat["messages"]
    assert (user["role"], user["text"]) == ("user", "plan $300")
    assert reply["role"] == "assistant" and reply["text"] == "Plan ready: 51 customers." and not reply["error"]
    assert [s["id"] for s in reply["steps"]] == ["think", "tool-1", "write"]
    assert all(s["status"] == "done" for s in reply["steps"]) and reply["duration_ms"] >= 0
    assert reply["suggestions"]                                       # follow-ups come back with the chat

    # Someone else can't see, continue, rename or delete it - and can't tell it exists.
    make_user(admin, "cy@test.local")
    cy = sign_in(browser(), "cy@test.local", "analyst-password")
    assert cy.get("/api/agent/sessions/saved-1").status_code == 404
    assert ask(cy, "saved-1", "hello")[0] == 404
    assert cy.post("/api/agent/suggestions", json={"session_id": "saved-1"}).status_code == 404
    assert cy.patch("/api/agent/sessions/saved-1", json={"title": "mine"}).status_code == 404
    assert cy.delete("/api/agent/sessions/saved-1").status_code == 404
    assert cy.get("/api/agent/sessions").json() == []

    # After a restart (empty cache) the conversation continues with its memory.
    app.state.retainiq.reset("saved-1")
    assert ask(admin, "saved-1", "and for VIPs?")[0] == 200
    assert app.state.retainiq.existing_agent("saved-1").asked == ["plan $300", "and for VIPs?"]
    assert len(admin.get("/api/agent/sessions/saved-1").json()["messages"]) == 4

    assert admin.patch("/api/agent/sessions/saved-1", json={"title": "  Q4   plan "}).json()["title"] == "Q4 plan"
    assert admin.delete("/api/agent/sessions/saved-1").status_code == 204
    assert admin.get("/api/agent/sessions/saved-1").status_code == 404


def test_ai_calls_are_counted_and_capped(admin, monkeypatch):
    before = admin.get("/api/auth/me").json()["usage"]
    ask(admin, "metered-1", "plan $300")
    after = admin.get("/api/auth/me").json()["usage"]
    assert after["calls"] == before["calls"] + 2                      # two LLM rounds: tool call, then the answer
    assert after["by_feature"]["chat"] >= 2 and after["tokens_in"] >= before["tokens_in"]

    monkeypatch.setitem(settings.DAILY_AI_CALLS, "admin", after["calls"])      # no calls left today
    status, _ = ask(admin, "metered-2", "plan $300")
    assert status == 429
    assert admin.post("/api/agent/suggestions", json={"session_id": "metered-1"}).json()["source"] == "rules"
    top = admin.get("/api/customers/at-risk?limit=1").json()[0]["customer_id"]
    r = admin.post(f"/api/customers/{top}/message")
    assert r.status_code == 429 and "resets at midnight UTC" in r.json()["detail"]
    assert admin.get("/api/auth/me").json()["usage"]["remaining"] == 0


def test_enrich_runs_are_listed_for_admins(admin):
    assert isinstance(admin.get("/api/enrich/runs").json(), list)


# ------------------------------------------------------------------ agent snapshot
def test_agent_state_round_trips_through_json(admin):
    engine = app.state.retainiq.engine
    a = Agent(engine)
    a.history += [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
    a.turns = [Turn("hi", "hello", [ToolUse("get_dashboard", {}, {"auc": np.float64(0.81), "n": np.int64(3)})])]
    state = json.loads(json.dumps(a.to_state()))                      # what the database stores
    b = Agent.from_state(engine, state)
    assert b.history == a.history and b.history[0]["role"] == "system"
    assert b.asked == ["hi"] and b.last_turn.tools[0].result == {"auc": 0.81, "n": 3}
