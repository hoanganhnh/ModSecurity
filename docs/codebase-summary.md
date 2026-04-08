# Codebase Summary

## Snapshot (2026-04-07)
- Node.js 20 (see `package.json`) drives an Express app (`src/server.js`) that wires middleware, controllers, routes, and the static UI served from `public/`.
- The Docker Compose stack pairs that backend with the `owasp/modsecurity-crs:4.25-nginx-lts` `waf-gateway`, giving the demo both ingress inspection and in-browser visualization of CRS decisions.
- `repomix` generated `repomix-output.xml` in the repo root; the flattened compaction is the source for this summary and aids downstream analysis.
- The Docker Compose stack now includes Elasticsearch (`8.17.3`), Kibana (`8.17.3`), and Filebeat (`8.17.3`) so ELK ingestion operates alongside the gateway/app services.

## Key directories & files
| Surface | Description |
| --- | --- |
| `src/server.js` | Creates the Express app, configures JSON parsing, request ID middleware, static assets, routes, and error handling hooks. |
| `src/controllers/demo-controller.js` | Validates payloads, simulates CRS rule matching, builds `timeline`, `logs`, and `matchedRuleIds`, and returns structured JSON with `decision` plus `requestId`. |
| `src/routes/demo-routes.js` | Exposes `GET /health` and `POST /api/search` endpoints. |
| `src/routes/api-routes.js` | Aggregates the demo API surface (`/api/login`, `/api/search`, `/api/comment`, `/api/files`, `/api/admin`) and maps each route to security-aware controllers. |
| `src/controllers/search-controller.js` | `GET /api/search` query validation plus backward-compatible `POST /api/search` payload handling, both of which build decision payloads for the UI. |
| `src/controllers/login-controller.js` | Validates `username`/`password`, redacts the password in the payload view, and returns the decision metadata for `POST /api/login`. |
| `src/controllers/comment-controller.js` | Ensures comment content is non-empty (<=4,096 chars), records optional `productId`, and uses the decision builder for `POST /api/comment`. |
| `src/controllers/files-controller.js` | Validates the `file` query (<=1,024 chars) and responds with the normalized payload metadata for `GET /api/files`. |
| `src/controllers/admin-controller.js` | Enforces the `ADMIN_TOKEN`: responds `503` if unset, `403` for invalid values, and `200` with a redacted token when valid, while still returning decision metadata. |
| `src/middleware/request-id-middleware.js` | Injects or reuses `x-request-id`, publishes it in headers, ensures the header matches `[A-Za-z0-9._:-]{1,128}`, and binds it to the Express request for downstream logging. |
| `public/index.html`, `public/app.js` | Single-page UI with the live request tester, decision pill, matched rule IDs, timeline, logs, and quick-attack buttons. |
| `tests/e2e/demo-flow.spec.js`, `tests/security/waf-blocking.spec.js` | `node:test` suites hitting handlers in isolation (no Docker) to assert health, allow/block flows, payload validation, and CRS-like rule IDs. |
| `scripts/smoke-test.sh` & `scripts/rollback-local.sh` | Local ops helpers: smoke brings up Docker Compose and validates allow/block behavior; rollback resets the stack or restarts it in detection-only mode. |
| `docker-compose.yml` | Orchestrates `demo-app` (Node, mounted source) and `waf-gateway` (CRS gateway), passing environment overrides including `MANUAL_MODE`, `MODSEC_RULE_ENGINE`, and the `BACKEND` URL. |
| `nginx/conf.d/default.conf.template` + `modsecurity/custom/*.conf` | Gateway templates that proxy to `demo-app` and hold CRS exclusion stubs. |

## Automation & developer experience
- `npm run start` launches the Express server locally (`APP_PORT` defaults to `3000`).
- `npm run lint` performs `node --check` on the server, controller, routes, middleware, and the UI script before runtime.
- `npm test` runs the `tests/e2e` and `tests/security` suites via `node --test`.
- `docker compose up -d --build` (or `bash scripts/smoke-test.sh`) exercises the stack end to end, while `scripts/rollback-local.sh detection-only` toggles the gateway into detection-only mode (`MODSEC_RULE_ENGINE=DetectionOnly`) for tuning.
- Manual edits to `.env` (copied from `.env.example`) override defaults such as `DEMO_PORT`, `MANUAL_MODE`, and the CRS tuning knobs.

## Notes
- All API responses embed `requestId`, `endpoint`, `payload`, `decision`, and `timeline/log` arrays so the UI can replay the detection flow without inspecting raw gateway logs.
- `MANUAL_MODE` defaults to `0` in `docker-compose.yml`, ensuring CRS blocks traffic by default; toggling to `1` or using detection-only mode should be done deliberately via the rollback script.
- The plan folder `plans/260407-1602-nginx-node-modsecurity-crs-demo/` contains the implementation phases referenced by this demo.
