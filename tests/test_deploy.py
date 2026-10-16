"""Deployment safety: enrichment results survive a wiped disk, and the Space upload never ships secrets."""

import importlib.util
from pathlib import Path

from api import db, signal_store
from retainiq import config, signals

ROOT = Path(__file__).resolve().parent.parent

llm = lambda s: {"sentiment": s, "category": "delivery", "churn_threat": False, "summary": "", "source": "llm"}   # noqa: E731
kw = lambda s: {"sentiment": s, "category": "other", "churn_threat": False, "summary": "", "source": "heuristic"}  # noqa: E731


def test_merge_prefers_llm_readings_and_keeps_everything():
    local = {"a": kw(0.1), "b": llm(0.2), "c": kw(0.3)}
    stored = {"a": llm(-0.5), "b": kw(0.9), "d": llm(0.4)}
    m = signal_store.merge(local, stored)
    assert m == {"a": llm(-0.5), "b": llm(0.2), "c": kw(0.3), "d": llm(0.4)}


def test_signals_are_restored_after_the_disk_is_wiped(tmp_path, monkeypatch):
    db.init(f"sqlite:///{(tmp_path / 'store.db').as_posix()}")
    monkeypatch.setattr(config, "SIGNALS_CACHE", tmp_path / "signals.json")
    assert signal_store.restore() == 0                                # nothing stored yet: no-op

    signal_store.save({"t1": llm(-0.8), "t2": kw(0.0)})               # after an enrichment run
    (tmp_path / "signals.json").unlink(missing_ok=True)               # the host restarts: disk wiped
    assert signal_store.restore() == 1
    assert signals.load_cache() == {"t1": llm(-0.8), "t2": kw(0.0)}

    signal_store.save({"t1": llm(0.5), "t2": llm(0.1)})               # a forced re-read: newest wins
    with db.session() as s:
        assert s.get(db.StoredValue, "signals").value == {"t1": llm(0.5), "t2": llm(0.1)}


def _deploy_module():
    spec = importlib.util.spec_from_file_location("deploy_space", ROOT / "scripts" / "deploy_space.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_space_upload_is_code_only():
    deploy = _deploy_module()
    files = deploy.files_to_upload(ROOT)
    assert "Dockerfile" in files and "requirements.txt" in files
    assert "api/main.py" in files and "retainiq/engine.py" in files and "frontend/package.json" in files
    for f in files:
        name = f.split("/")[-1]
        assert not name.startswith(".env"), f
        assert "node_modules" not in f and "__pycache__" not in f and not f.startswith(("data/", ".venv/", "frontend/dist/")), f
        assert not name.endswith((".db", ".pyc")) and name != ".jwt_secret", f


def test_env_file_parsing(tmp_path):
    deploy = _deploy_module()
    env = tmp_path / ".env.production"
    env.write_text('# comment\nLLM_API_KEY=rc-abc\n\nADMIN_NAME="Hamad Zia"\nEMPTY=\nDATABASE_URL=postgresql://u:p@h/db?sslmode=require\n')
    assert deploy.read_env(env) == {"LLM_API_KEY": "rc-abc", "ADMIN_NAME": "Hamad Zia",
                                    "DATABASE_URL": "postgresql://u:p@h/db?sslmode=require"}
