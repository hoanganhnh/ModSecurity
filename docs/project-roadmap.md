# Project Roadmap

## Phase Status
- Phase 01: Setup baseline stack — Complete
- Phase 02: Implement demo API — Complete
- Phase 03: Configure Nginx reverse proxy — Complete
- Phase 04: Enable ModSecurity and OWASP CRS — Complete
- Phase 05: Connect demo UI to live stack — Complete
- Phase 06: Validate, test, and harden demo — In progress (focus: lint/test/smoke cycle plus doc accuracy and PDR updates)

## Current Sprint
- Completed request tester UI improvement plan `plans/260410-1628-improve-demo-request-tester-ui/`: endpoint/method selector, dynamic request fields, `/api/search` GET default with POST compat, updated e2e/docs, validation passed.
- Run `npm run lint`, `npm test`, and `bash scripts/smoke-test.sh` to keep the stack healthy and the gateway blocking SQLi-like traffic with `403`.
- Reconcile the docs (`docs/*.md`) with the running demo (default `MANUAL_MODE=0`, detection-only path via `scripts/rollback-local.sh detection-only`).
- Capture product development requirements in `docs/project-overview-pdr.md`, system architecture, code standards, and summarize the codebase via `repomix` output.

## Next Steps
1. Regenerate tests/docs if the code changes (e.g., new payload patterns or timeline entries).
2. Lock the smoke-test workflow and note any regression in the project changelog.
3. Transition to the next plan or demo phase once validation tasks wrap up.
