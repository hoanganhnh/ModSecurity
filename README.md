# Nginx + Node.js + ModSecurity + OWASP CRS Demo

Local demo stack showing how OWASP CRS (via ModSecurity on Nginx) allows normal traffic and blocks attack-like payloads before they reach a Node.js app.

## Stack
- `demo-app`: Node.js (Express) API + static UI
- `waf-gateway`: `owasp/modsecurity-crs:4.25-nginx-lts`
- `postgres`: backing store for the demo API
- `elasticsearch`: stores gateway/app observability events
- `kibana`: operator view for log search and trace correlation
- `filebeat`: ships app, Nginx, and ModSecurity logs into Elasticsearch
- Flow: Browser -> Nginx + ModSecurity + CRS -> Node API -> PostgreSQL
- Observability: `waf-gateway` + `demo-app` -> Filebeat -> Elasticsearch -> Kibana

## Prerequisites
- Docker + Docker Compose v2
- `bash` and `curl`
- Node.js 20+ and npm (only needed for `npm run lint` and `npm test`)
- Port `8080` free (or override with `DEMO_PORT`)

## Quick Start
1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Start stack:
   ```bash
   docker compose up -d --build
   ```
3. Open demo UI:
   - `http://localhost:8080`
   - Or `http://localhost:${DEMO_PORT}` if set in `.env`
4. Open Kibana:
   - `http://localhost:5601/app/discover`
5. Health check:
   ```bash
   curl -i "http://localhost:${DEMO_PORT:-8080}/health"
   ```

## Step-by-Step Run Guide
1. **Prepare environment**
   - Use `.env.example` as baseline.
   - Keep `MANUAL_MODE=0` for blocking behavior by default.
2. **Boot services**
   - Run `docker compose up -d --build`.
   - Wait until gateway/app/ELK are ready.
3. **Run demo scenario**
   - Select an endpoint from the UI request tester.
   - Choose one of the supported HTTP methods for that endpoint.
   - Fill the generated request fields (body, query, or header inputs depend on the endpoint).
   - Submit a normal request (expect allow).
   - Submit attack-like payload from UI quick actions (expect block).
   - Confirm the UI shows the ELK/Kibana hint and request ID.
4. **Inspect observability**
   - Open `http://localhost:5601/app/discover`.
   - Search `requestId` from the UI response to correlate app and gateway logs.
5. **Validate behavior from CLI**
   ```bash
   npm run smoke
   ```
   This verifies:
   - health endpoint returns `200`
   - benign request returns `200`
   - SQLi-like request returns `403`
5. **Run local checks (optional, requires Node.js + npm on host)**
   ```bash
   npm run lint
   npm test
   ```

## Operations
- Stop services:
  ```bash
  docker compose down
  ```
- Reset stack (remove volumes):
  ```bash
  npm run rollback -- reset
  ```
- Start in detection-only mode:
  ```bash
  npm run rollback -- detection-only
  ```

## Useful Endpoints
- Health: `GET /health`
- Demo API: `POST /api/search`
- Stats API: `GET /api/stats/security`
- Kibana Discover: `http://localhost:5601/app/discover`
- Elasticsearch: `http://localhost:9200`

## Project Scripts
- `npm run start` - start app (container command)
- `npm run lint` - syntax checks
- `npm test` - e2e/security specs
- `npm run smoke` - gateway allow/block smoke test
- `npm run rollback -- <mode>` - reset or detection-only

## Observability Notes
- ELK is started by default with `docker compose up -d --build`.
- App logs are written to `logs/demo-app/application.log` and mirrored to stdout.
- Gateway logs are written under `logs/nginx/` and ModSecurity audit logs under `logs/modsecurity/`.
- Filebeat ingests those files into Elasticsearch index pattern `modsecurity-demo-*`.
- Request correlation depends on shared `requestId` propagation between gateway and app using `ELK_PROXY_TOKEN`.

## Documentation
- Deployment: [`docs/deployment-guide.md`](./docs/deployment-guide.md)
- Architecture: [`docs/system-architecture.md`](./docs/system-architecture.md)
- Codebase Summary: [`docs/codebase-summary.md`](./docs/codebase-summary.md)
- Roadmap: [`docs/project-roadmap.md`](./docs/project-roadmap.md)
- Changelog: [`docs/project-changelog.md`](./docs/project-changelog.md)
