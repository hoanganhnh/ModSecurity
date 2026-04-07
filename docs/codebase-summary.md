# Codebase Summary

## Snapshot (2026-04-07)
- Node.js 20 (see `package.json`) drives an Express app (`src/server.js`) that wires middleware, controllers, routes, and the static UI served from `public/`.
- The Docker Compose stack pairs that backend with the `owasp/modsecurity-crs:4.25-nginx-lts` `waf-gateway`, giving the demo both ingress inspection and in-browser visualization of CRS decisions.
- `repomix` generated `repomix-output.xml` in the repo root; the flattened compaction is the source for this summary and aids downstream analysis.

## Key directories & files
| Surface | Description |
| --- | --- |
| `src/server.js` | Creates the Express app, configures JSON parsing, request ID middleware, static assets, routes, and error handling hooks. |
| `src/controllers/demo-controller.js` | Validates payloads, simulates CRS rule matching, builds `timeline`, `logs`, and `matchedRuleIds`, and returns structured JSON with `decision` plus `requestId`. |
| `src/routes/demo-routes.js` | Exposes `GET /health` and `POST /api/search` endpoints. |
| `src/middleware/request-id-middleware.js` | Injects or reuses `x-request-id`, publishes it in headers, and attaches it to the Express request for downstream logging. |
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
