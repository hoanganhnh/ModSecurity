# Code Standards

## Principles
- Applied principles: YAGNI, KISS, DRY.
- Keep files focused and readable; prefer clear intent even if it slightly increases verbosity.

## JavaScript & Node.js practices
| Expectation | Details |
| --- | --- |
| Module style | CommonJS modules to stay compatible with the current Node 20 runtime and `node --check`. |
| Validation | All API inputs should be validated at the controller boundary; the demo enforces payload length (1-4096 chars) and rejects missing JSON bodies. |
| Error schema | Stable error payloads include `error.code`, `error.message`, and `requestId` so downstream code/UI can correlate failures with `x-request-id`. |
| Middleware | Shared concerns (e.g., `request-id`) live in `src/middleware` for reuse. |
| Logging | Responses expose synthetic `timeline` + `logs.access`/`logs.audit` arrays, keeping the gateway narrative consistent with OWASP CRS patterns. |

## Security configuration guidelines
- Always keep OWASP CRS enabled and run with `MANUAL_MODE=0` unless explicitly testing detection-only behavior.
- Narrow exclusion files (`modsecurity/custom/request-900-exclusion-rules-before-crs.conf`, `modsecurity/custom/response-999-exclusion-rules-after-crs.conf`) remain empty until a documented false positive arises. The new Supabase-specific exclusion prevents cookies named `sb-*-auth-token` (plus optional `.N` suffix) from targeting rule `932260`, stopping false-positive `403` responses on `/` without weakening SQLi blocking on `/api/search`.
- Use `scripts/rollback-local.sh detection-only` to temporarily move to `MODSEC_RULE_ENGINE=DetectionOnly` for tuning before committing exclusions.

## Testing mandate
- Add real tests (see `tests/e2e` and `tests/security`) covering both happy paths and blocker scenarios without mocking gateway logic.
- Run `npm test`, `npm run lint`, and smoke scripts regularly to keep the stack stable for live demos.
- Document any new tests or configs so the docset mirrors the current behavior.
