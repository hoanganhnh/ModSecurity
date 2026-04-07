# System Architecture

## Stack components
- `waf-gateway`: `owasp/modsecurity-crs:4.25-nginx-lts` image running Nginx + ModSecurity + OWASP CRS.
- `demo-app`: Node.js 20 + Express backend that also serves the static UI under `public/`.
- Shared Docker network keeps the backend reachable only through the gateway; the static UI communicates through the same ingress to show live WAF decisions.

## Request flow (demo view)
1. Browser traffic targets the host port (`DEMO_PORT`, default `8080`).
2. Nginx forwards requests to `demo-app:3000` while injecting `X-Request-ID` for tracing.
3. ModSecurity (CRS) inspects the request body; `MANUAL_MODE` defaults to `0` so the gateway blocks suspicious traffic immediately.
4. When CRS finds a signature, Nginx emits `403` along with synthetic timeline/log details in the UI.
5. Clean traffic is proxied to the Node.js API, which returns decision metadata, matched CRS-style rule IDs, timelines, and log previews to the UI.
6. The UI renders the decision pill, matched rule IDs, timelines, and audit/access log snippets using the JSON response fields (`timeline`, `logs.audit`, `logs.access`).

## WAF configuration notes
- The gateway mounts `nginx/conf.d/default.conf.template` so the upstream host, proxy timeout, and `X-Request-ID` header stay in sync with the demo backend.
- CRS exclusions remain empty by default in `modsecurity/custom/request-900-exclusion-rules-before-crs.conf` and `modsecurity/custom/response-999-exclusion-rules-after-crs.conf`; add scoped exclusions only after documenting a false positive. When a false positive occurs (e.g., `GET /` blocked by rule `932260` because of a `sb-*-auth-token` or `sb-*-auth-token.<n>` cookie), the request exclusion file now removes that cookie target from rule `932260`, preventing the Supabase auth cookie from generating a `403` while SQLi blocking stays active for `/api/search`.
- `scripts/rollback-local.sh detection-only` restarts the stack with `MODSEC_RULE_ENGINE=DetectionOnly` for tuning before an exclusion is committed.

## Security boundaries
- Only `waf-gateway` publishes a host port; `demo-app` is reachable via the internal Docker network only.
- The Node.js app never exposes backend ports directly and always returns a structured JSON schema with `requestId` so requests can be audited.
- All error responses (invalid payload, malformed JSON, not found, or unexpected errors) embed the propagated `x-request-id` header and an error code from the controller.
