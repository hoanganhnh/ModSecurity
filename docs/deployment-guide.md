# Deployment Guide

## Overview
The demo stack runs entirely via Docker Compose so you can inspect WAF decisions without building a full production pipeline. A predefined `waf-gateway` service (Nginx + ModSecurity + OWASP CRS) protects a Node.js Express backend and serves the static UI.

## Prerequisites
- Docker and Docker Compose installed (Compose v2 recommended).
- Port `8080` (or the `DEMO_PORT` you configure) available on the host.
- `curl` and `bash` for the smoke and rollback scripts.
- Node.js 20+ and npm for host-side `npm run lint` and `npm test`.

## Environment
Copy `.env.example` to `.env` to override the defaults shown in `docker-compose.yml`. The stack exposes the following knobs:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEMO_PORT` | `8080` | Host port forwarded to the gateway. |
| `BACKEND` | `http://demo-app:3000` | Internal target for Nginx proxying. |
| `MANUAL_MODE` | `0` | Ensures ModSecurity blocks detected threats by default. Set to `1` for manual phase testing, or start detection-only with `scripts/rollback-local.sh detection-only` (sets `MODSEC_RULE_ENGINE=DetectionOnly`). |
| `MODSEC_RULE_ENGINE`, `PARANOIA`, `BLOCKING_PARANOIA`, `ANOMALY_*`, `REPORTING_LEVEL` | See `docker-compose.yml` | Tuned for CRS baseline behavior. |

The gateway uses the published `owasp/modsecurity-crs:4.25-nginx-lts` image, mounts `nginx/conf.d/default.conf.template` for routing, and exposes only the configured host port.

## Quick start
1. `cp .env.example .env`
2. `docker compose up -d --build` (the demo-app service runs `npm install && npm run start` inside the container).
3. Wait for the containers to warm up, then open `http://localhost:${DEMO_PORT:-8080}` or your configured port to reach the demo UI.
4. Optional: exercise quick attack buttons on the UI to see a matching WAF decision.

## Validation
- Health endpoint: `curl http://localhost:${DEMO_PORT:-8080}/health` should return `200`.
- Lint: `npm run lint` (host Node.js required; runs `node --check` against the server, controllers, routes, middleware, and UI script).
- Unit/security tests: `npm test` (host Node.js required) runs the `tests/e2e` and `tests/security` suites against the Express app.
- Smoke test: `bash scripts/smoke-test.sh` brings up the stack, then programs an allow and a block payload, ensuring the gateway blocks SQLi-like traffic with `403` while letting benign traffic through.

## Operations
- Stop: `docker compose down`
- Reset (with volumes, rebuilds assets): `bash scripts/rollback-local.sh reset` (runs `docker compose down -v --remove-orphans`).
- Detection-only: `bash scripts/rollback-local.sh detection-only` (restores the stack and sets `MODSEC_RULE_ENGINE=DetectionOnly` to keep CRS in pass-through for tuning).

## Notes
- `README.md` is the quick entrypoint; `/docs` remains the detailed source of truth for architecture and operations.
- `scripts/rollback-local.sh` is the safest way to clean or change gateway mode while preserving the volume layout.
