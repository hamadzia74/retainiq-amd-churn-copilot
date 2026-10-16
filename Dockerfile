# RetainIQ as one container: the React build + FastAPI on one port.
# Made for Hugging Face Spaces (port 7860, runs as uid 1000) but works on any Docker host:
#   docker build -t retainiq .
#   docker run -p 7860:7860 --env-file .env.production retainiq

# ---- 1. build the web app -----------------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. the API, serving the build ----------------------------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=7860

RUN useradd -m -u 1000 user
WORKDIR /home/user/app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --chown=user api/ api/
COPY --chown=user retainiq/ retainiq/
COPY --from=web --chown=user /web/dist frontend/dist
# The synthetic dataset is generated here on first start (seeded, so always the same numbers).
RUN mkdir -p data && chown user:user data

USER user
EXPOSE 7860
# --proxy-headers: behind the host's HTTPS proxy the app sees https, so session cookies get "Secure".
# One worker: the Token Factory rate limiter and the enrichment job live in this process's memory.
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*' --workers 1"]
