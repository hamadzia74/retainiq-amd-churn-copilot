"""Settings shared by every module: paths, dates and the LLM endpoint.

The LLM is any OpenAI-compatible server on AMD hardware. Two profiles:

    token_factory  AMD Token Factory - free shared endpoints on AMD GPUs (default)
    vllm           our own vLLM on an AMD Instinct MI300X (AMD Developer Cloud, ROCm)

LLM_PROVIDER picks the profile; any LLM_* value in .env overrides it.
"""

import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SIGNALS_CACHE = DATA_DIR / "signals.json"

# The synthetic store's "today". Fixed so every run gives the same numbers.
TODAY = date(2026, 10, 1)
SEED = 42

# The churn question we predict: "will this customer place NO order in the
# next HORIZON_DAYS days?"
HORIZON_DAYS = 90

PROFILES = {
    # Measured limits per team key: 20 requests/min, 8 concurrent, $1/day. We stay under them
    # and send many messages per request, so a full /enrich takes minutes, not hours.
    "token_factory": {
        "name": "AMD Token Factory",
        "base_url": "https://developer.amd.com.cn/radeon/api/v1",
        "model": "DeepSeek-V4-Flash",
        "hardware": "AMD Token Factory · AMD GPUs",
        "concurrency": 7,
        "rpm": 18,
        "batch_size": 50,
    },
    # Our own GPU: no rate limits, so many small concurrent requests (vLLM batches them).
    "vllm": {
        "name": "AMD Developer Cloud",
        "base_url": "http://localhost:8000/v1",
        "model": "Qwen/Qwen2.5-7B-Instruct",
        "hardware": "AMD Instinct MI300X · ROCm · vLLM",
        "concurrency": 32,
        "rpm": 0,               # 0 = unlimited
        "batch_size": 1,
    },
}


def _env(key: str, default):
    value = os.getenv(key, "").strip()
    return type(default)(value) if value else default


LLM_PROVIDER = _env("LLM_PROVIDER", "token_factory").lower()
if LLM_PROVIDER not in PROFILES:
    raise SystemExit(f"LLM_PROVIDER={LLM_PROVIDER!r} is not one of {', '.join(PROFILES)}")
_p = PROFILES[LLM_PROVIDER]

LLM_PROVIDER_NAME = _p["name"]
LLM_BASE_URL = _env("LLM_BASE_URL", _p["base_url"])
LLM_API_KEY = _env("LLM_API_KEY", "EMPTY")
LLM_MODEL = _env("LLM_MODEL", _p["model"])
LLM_HARDWARE = _env("LLM_HARDWARE", _p["hardware"])
LLM_CONCURRENCY = _env("LLM_CONCURRENCY", _p["concurrency"])
LLM_RPM = _env("LLM_RPM", _p["rpm"])
LLM_BATCH_SIZE = _env("LLM_BATCH_SIZE", _p["batch_size"])
