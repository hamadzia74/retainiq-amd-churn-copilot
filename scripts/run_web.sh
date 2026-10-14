#!/usr/bin/env bash
# Build the React app and serve app + API from one process (one URL for judges).
#
# On the AMD Developer Cloud droplet, run scripts/serve_amd.sh first (vLLM on 127.0.0.1:8000),
# then this. Open http://<droplet-ip>:${PORT:-8080}
set -euo pipefail
cd "$(dirname "$0")/.."

(cd frontend && npm ci --no-audit --no-fund && npm run build)
exec "${PYTHON:-python}" -m uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1
