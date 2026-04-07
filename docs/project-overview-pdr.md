# Project Overview PDR

## Goal
Deliver a self-contained Nginx + Node.js + ModSecurity + OWASP CRS demo that highlights ingress protection, transparent decision data, and observability-friendly metadata.

## Scope
- Single-page UI (`public/index.html`, `public/app.js`) that lets users submit payloads, surface CRS decisions, and highlight matched rule IDs via a live timeline/log panel.
- A protected API surface (`GET /health`, `POST /api/search`) backed by Node.js/Express with request ID middleware, structured decision payloads, and synthetic audit/access log arrays.
- OWASP CRS-driven blocking demonstrated by quick-attack payloads covering SQLi, XSS, and path traversal, with decision metadata returned to the UI for replay.
- Validation guarantee so lint (`npm run lint`), unit/security suites (`npm test`), and the smoke script (`bash scripts/smoke-test.sh`) run successfully in the local environment.

## Non-Scope
- Production-grade deployment, authentication, or data persistence beyond the demo scope.
- SIEM integration beyond the synthetic logs provided in the UI response body.

## Product Development Requirements

### Functional requirements
- Boot the Docker Compose stack (`demo-app` + `waf-gateway`) so the gateway proxies requests to the Node/Express backend and enforces OWASP CRS decisions.
- Serve the static UI from `public/` and keep all traffic behind the gateway to show decisions, matched rule IDs, timelines, and log snippets per request.
- Return structured JSON from `/api/search` that always includes `requestId`, `timestamp`, `endpoint`, `payload`, `decision`, `matchedRuleIds`, `reason`, `timeline`, and `logs` arrays.
- Provide operational helpers (`scripts/smoke-test.sh`, `scripts/rollback-local.sh`) to validate allow/block flows and toggle between blocking and detection-only modes.

### Non-functional requirements
- Every response (success or error) carries the same `x-request-id` value that is minted or forwarded by `src/middleware/request-id-middleware.js` for traceability.
- OWASP CRS runs with `MANUAL_MODE=0` by default so suspicious requests return `403` and provide decision metadata to the UI.
- Stack startup should succeed without persistent storage and be repeatable from a clean repo copy using the `node:20-alpine` and `owasp/modsecurity-crs:4.25-nginx-lts` images.

### Constraints & dependencies
- Node.js 20 + Express 4.21.2 power the demo backend (`src/server.js`, `src/controllers/demo-controller.js`, `src/routes/demo-routes.js`).
- Docker Compose connects `demo-app` (exposing port 3000 internally) to the `waf-gateway`, which relies on `nginx/conf.d/default.conf.template` plus `modsecurity/custom` exclusion stubs.
- Environment overrides come from `.env` (copy `.env.example`) and control knobs such as `DEMO_PORT`, `MANUAL_MODE`, `MODSEC_RULE_ENGINE`, `PARANOIA`, and `BACKEND`.

### Implementation guidance
- Copy `.env.example` to `.env`, then run `docker compose up -d --build` to start the stack.
- Validate the demo with `npm run lint`, `npm test`, and `bash scripts/smoke-test.sh`, which exercises the allow scenario (HTTP 200) and the block scenario (HTTP 403).
- Use `scripts/rollback-local.sh detection-only` to restart the stack in `MODSEC_RULE_ENGINE=DetectionOnly` mode when tuning CRS exclusions before committing changes.

### Acceptance criteria
- Stack boots via `docker compose up -d --build` and routes HTTP traffic through the `waf-gateway` service only.
- `MANUAL_MODE` defaults to `0` so ModSecurity blocks detected threats automatically; the safety helper `scripts/rollback-local.sh detection-only` can temporarily switch to detection-only mode.
- Backend health (`GET /health`), allow, and block scenarios succeed, and lint/tests/smoke checks pass locally.
- UI clients receive the same decision metadata (timeline/log entries, matched rule IDs, and request ID) shown in `public/app.js` for every request.

### Success metrics
- `npm run lint`, `npm test`, and `bash scripts/smoke-test.sh` all pass on the current codebase.
- A `403` block response includes at least one CRS-style rule ID (e.g., `942100`, `941100`, `930120`) and the UI renders the matching ID along with audit/access logs.
- Documentation validation (`node .claude/scripts/validate-docs.cjs docs/`) completes without unresolved warnings.

### Security considerations
- Only the `waf-gateway` service publishes a host port; `demo-app` is only accessible through the shared Docker network.
- CRS decision metadata (timeline, logs, matched rules) stays synthetic but mirrors an OWASP CRS blocking narrative and is safe for demo consumption.
- Detection-only mode (`scripts/rollback-local.sh detection-only`) exists solely for tuning and must not be the default path when the demo is shown.
