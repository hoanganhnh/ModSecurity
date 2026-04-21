# Project Changelog

## 2026-04-10
### Added
- Improved the demo request tester so users choose a valid endpoint/method pair and fill endpoint-specific request fields instead of always sending the same POST payload.

### Fixed
- Extended the existing Supabase cookie exclusion for CRS rule `932260` so browser requests to `/` and `/favicon.ico` no longer false-positive to `403` while `/api/search` remains protected.

## 2026-04-07
### Added
- Local demo stack using Docker Compose with `waf-gateway` + `demo-app`
- Node API endpoints for health and payload evaluation
- Interactive demo UI (`public/index.html`, `public/app.js`)
- ModSecurity/CRS baseline config and exclusion rule files
- E2E/security tests and smoke/rollback scripts

### Changed
- Active plan created and linked to phased execution under `plans/260407-1602-nginx-node-modsecurity-crs-demo/`

## 2026-04-07
### Updated
- Synced `/docs` to match the CLI-driven demo (default `MANUAL_MODE=0`, detection-only mode via `scripts/rollback-local.sh detection-only`).
- Documented deployment defaults (gateway image, scripts, tests) in `deployment-guide.md` and summarized the current stack behavior in `system-architecture.md`, `codebase-summary.md`, `code-standards.md`, and `project-roadmap.md`.
