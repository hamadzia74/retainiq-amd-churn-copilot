"""Tests never touch the real AMD endpoint or your daily quota.

Environment variables win over .env (load_dotenv doesn't override them), so this
points the LLM at a closed local port before retainiq.config is imported.
"""

import os

os.environ["LLM_PROVIDER"] = "token_factory"
os.environ["LLM_BASE_URL"] = "http://127.0.0.1:9/v1"
os.environ["LLM_API_KEY"] = "test-key"
os.environ["LLM_RPM"] = "0"          # no pacing against the fake client (limiter has its own tests)
