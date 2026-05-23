# Codebase Summary

## Scope
- Demo stack combining Nginx, ModSecurity, OWASP CRS, a Node.js app, and ELK-based observability.
- Primary goal: show allow/block behavior for realistic traffic while preserving traceability with shared request IDs.

## Runtime components
| Component | Role |
| --- | --- |
| `waf-gateway` | Public ingress using `owasp/modsecurity-crs:4.25-nginx-lts` with custom exclusions layered before CRS. |
| `demo-app` | Node.js 20 + Express service that serves the UI and JSON endpoints. |
| `postgres` | Backing data store used by the demo application. |
| `filebeat` / `elasticsearch` / `kibana` | Collect, store, and inspect app plus gateway logs. |

## Verified entrypoints
| File | Verified behavior |
| --- | --- |
| `src/routes/demo-routes.js` | Exposes `GET /health` and `POST /api/search` endpoints. |
| `src/routes/api-routes.js` | Aggregates the demo API surface (`/api/login`, `/api/search`, `/api/comment`, `/api/files`, `/api/admin`) and maps each route to security-aware controllers. |
| `src/controllers/search-controller.js` | Handles search requests and produces the structured decision payload used by the demo UI. |
| `modsecurity/custom/request-900-exclusion-rules-before-crs.conf` | Scopes rule `932260` cookie exclusions for `sb-*-auth-token` names on `/`, `/favicon.ico`, and `/api/*`. |

## Current WAF tuning notes
- CRS remains active by default; docs and scripts assume blocking mode unless `scripts/rollback-local.sh detection-only` is used.
- The current narrow exclusion exists because Supabase auth cookies can false-positive against rule `932260` on browser entry requests.
- Smoke validation is the quickest regression signal after WAF rule changes.

## Repository shape
- Infra and runtime config: `docker-compose.yml`, `nginx/`, `modsecurity/`, `filebeat/`, `scripts/`
- Application code: `src/`, `public/`, `tests/`
- Project documentation: `docs/`

## Maintenance note
- `repomix-output.xml` was regenerated on 2026-04-10 to refresh this summary after the false-positive fix.
