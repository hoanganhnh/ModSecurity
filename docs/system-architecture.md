# System Architecture

## Stack components
- `waf-gateway`: `owasp/modsecurity-crs:4.25-nginx-lts` image running Nginx + ModSecurity + OWASP CRS.
- `demo-app`: Node.js 20 + Express backend that also serves the static UI under `public/`.
- `filebeat`: Elastic Filebeat tails the gateway (`logs/nginx`, `logs/modsecurity`) and app (`logs/demo-app`) logs, enriches each event with `service` + `source_type`, and ships them to Elasticsearch.
- `elasticsearch`: `docker.elastic.co/elasticsearch/elasticsearch:8.17.3` stores the indexed logs and exposes the `9200` REST API for analytics.
- `kibana`: `docker.elastic.co/kibana/kibana:8.17.3` connects to Elasticsearch (security disabled) so operators can pivot from the demo dashboard into live log data.
- Shared Docker network keeps the backend reachable only through the gateway; the static UI communicates through the same ingress to show live WAF decisions.

## Observability & logging
- Filebeat runs inside its own container, mounts `./logs` as `/workspace/logs`, and keeps permutations of the demo-app, Nginx, and ModSecurity file streams in sync with the `modsecurity-demo-%{+yyyy.MM.dd}` index pattern.
- The Elastic stack runs with security disabled (`xpack.security.enabled: "false"`, `XPACK_SECURITY_ENABLED: "false"`) so the demo can point the Kibana dashboard at `http://localhost:5601/app/discover` without credentials.
- Kibana and the stats controller share the `KIBANA_DASHBOARD_URL`, `ELK_INDEX_PATTERN`, and `ELK_ENABLED` flags that let the UI surface a live link only when the pipeline is healthy.

## Request flow (demo view)
1. Browser traffic targets the host port (`DEMO_PORT`, default `8080`).
2. Nginx applies CRS rules, injects `X-Request-ID`, and forwards the request to `demo-app:3000` through the proxy.
3. ModSecurity inspects the payload; `MANUAL_MODE` defaults to `0`, so suspicious traffic returns `403` immediately along with synthetic decision metadata that the UI can render.
4. Clean traffic reaches the Node.js API, which simulates CRS decisions, attaches timeline/log arrays, and copies or re-mints `requestId` per the trusted proxy token handshake.
5. The Node.js response includes the structured payload (`decision`, `matchedRuleIds`, `timeline`, `logs.audit`, `logs.access`) plus `x-request-id` for tracing.
6. Filebeat reads the same log files that Node.js writes to (`logs/demo-app/application.log`) and the gateway rotates (`logs/nginx/*`, `logs/modsecurity/audit.log`) and streams them into Elasticsearch.
7. Kibana indexes become queryable via the demo UI link so defenders can jump from synthetic coverage to the real log corpus.

## Request ID & proxy trust
- `src/middleware/request-id-middleware.js` maintains the [`x-request-id`](#) token, trusting it only when the incoming `X-ELK-PROXY-TOKEN` header matches `ELK_PROXY_TOKEN` from the environment. When trusted, Node.js reuses the gateway-sourced ID, and when not, it generates a fresh UUID before responding.
- This handshake keeps the entire demo traceable inside Elasticsearch while preventing unauthorized callers from squatting on someone else's request IDs.

## UI observability surface
- `public/app.js` hits `/api/stats/security` (see `src/controllers/stats-controller.js`) to render totals, endpoint distributions, and the live ELK status/link.
- The dashboard renders ELK availability (`ELK_ENABLED=1` by default) and exposes the Kibana discover URL so operators can inspect the actual log stream in parallel with the synthetic timelines shown on the page.

## WAF configuration notes
- The gateway mounts `nginx/conf.d/default.conf.template` so the upstream host, proxy timeout, and `X-Request-ID` header stay in sync with the demo backend.
- CRS exclusions remain empty by default in `modsecurity/custom/request-900-exclusion-rules-before-crs.conf` and `modsecurity/custom/response-999-exclusion-rules-after-crs.conf`; add scoped exclusions only after documenting a false positive. When a false positive occurs (e.g., `GET /` blocked by rule `932260` because of a `sb-*-auth-token` or `sb-*-auth-token.<n>` cookie), the request exclusion file now removes that cookie target from rule `932260`, preventing the Supabase auth cookie from generating a `403` while SQLi blocking stays active for `/api/search`.
- `scripts/rollback-local.sh detection-only` restarts the stack with `MODSEC_RULE_ENGINE=DetectionOnly` for tuning before an exclusion is committed.

## Security boundaries
- Only `waf-gateway` publishes a host port; `demo-app` is reachable via the internal Docker network only.
- The Node.js app never exposes backend ports directly and always returns a structured JSON schema with `requestId` so requests can be audited.
- All error responses (invalid payload, malformed JSON, not found, or unexpected errors) embed the propagated `x-request-id` header and an error code from the controller.
