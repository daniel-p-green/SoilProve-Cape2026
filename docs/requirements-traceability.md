# SoilProve Requirements Traceability

This file records how the overnight build is judged against the original source documents and the user-approved scope additions.

## Source Documents

- `docs/files/SPEC.md`
- `docs/files/PROGRESS.md`
- `docs/SoilProve Source Pack Combined Markdown - JUDGING RUBRIC.md`
- `docs/files/SPEC_ADDENDUM_TONIGHT.md`
- User-approved additions in the Codex thread: Codex app-server auth, real database, OEM adapters, real VRT export, savings-assurance language, Realtime voice with `gpt-realtime-2` and Cedar persona `Raimond`, onboarding, OCR import, serious evals, private repo, and regular commits.

## Requirement Statuses

- `implemented`: behavior is implemented and covered by current evidence.
- `approved_equivalent`: the original document named a literal implementation detail, but the user approved a functionally equivalent replacement for the overnight build.
- `external_dependency`: the repo can integrate or simulate the requirement, but production completion depends on third-party credentials, approvals, or browser/user permissions.
- `partial`: meaningful implementation exists, but the requirement is not fully proven yet.
- `not_implemented`: current code does not satisfy the requirement.

`approved_equivalent` and `external_dependency` do not block the local completion score. `partial` and `not_implemented` do.

## Current Approved Equivalents

- React, Express, and SQLite are accepted for this build in place of the literal Python/FastAPI/Postgres/Jinja stack.
- SQLite is the real local database for the overnight scope.
- Codex app-server login plus demo fallback replaces email/password auth; signed sessions now protect the business API surface.
- GoalBuddy, PROGRESS.md receipts, commits, and evals replace the literal Ralph-loop ledger mechanics.
- Missouri challenge/demo fixtures extend the original IA/IL/IN state target without removing the original Corn Belt validation path.
- Synthetic aggregate peer cohorts are calibrated from public soil-report/Extension references and remain illustrative until real participating-farm outcomes exist.

## SPEC Task Ledger Status

The original `SPEC.md` task ledger remains intentionally unchecked: 43 of 43 checkboxes are still open in that file. That is not treated as a hidden completion gap for this submission because the later approved build path changed the implementation stack and execution method.

The controlling evidence for the handoff is therefore:

- `evals/docsRequirements.ts` records `SPEC-000` as `approved_equivalent`, not `implemented`.
- `docs/files/PROGRESS.md` records the actual GoalBuddy/task/commit/verification trail.
- `npm run evals:docs` must continue to pass with 0 partial and 0 not-implemented controllable requirements.
- Any future agent that wants literal Ralph-loop completion must first update `SPEC.md` to match the accepted React/Express/SQLite/Codex-app-server build, then check ledger items as real work is completed.

## Strict Gates

Run the normal non-strict report:

```bash
npm run evals
```

Run the strict all-requirements gate:

```bash
npm run evals:docs
```

`npm run evals:docs` must pass only when every controllable requirement is implemented and tested. It names unresolved requirements directly instead of allowing the repo to imply completion.

## Current Strict-Gate Result

- `npm run evals:docs` passes.
- Counts: 30 implemented, 4 approved-equivalent, 1 external dependency, 0 partial, 0 not implemented.
- The remaining external dependency is production OEM write-back credentials/approvals. John Deere, CNH, and AGCO adapters are implemented with deterministic simulation/credential-required behavior.

## Closed High-Risk Gates

- `AUTH-ENFORCED`: business APIs require a demo/Codex session.
- `NO-AUTO-SIGNOFF`: VRT and OEM export do not silently sign a draft plan.
- `SPEC-003`: farmer, agronomist, and admin roles have permission tests and farmer-agronomist links.
- `SPEC-006` and `SPEC-007`: soil/yield CSV import routes validate exact schemas and reject mismatches.
- `USER-001`: Codex app-server status smoke passed locally; browser auth completion remains a human account action.
- `USER-002`: Realtime endpoint smoke reached OpenAI, and browser mic/no-key fallback is covered.
- `USER-003`: scanned-PDF OCR fallback is implemented with local pdftoppm/Tesseract and graceful fallback.
- `VRT-DBF-ROWS-MATCH-RATES`: VRT tests parse exported DBF rows and compare every rate.
- `NO-LIVE-OEM-IN-TESTS`: OEM tests isolate credential env vars and block accidental live calls.
- `CLAIMS-SAFETY-SCAN`: source copy is scanned for forbidden final-prescription and guaranteed-savings claims while allowing the explicit savings-assurance offer.
- `ONBOARDING-E2E`: first-run onboarding has deterministic coverage plus browser smoke.
- `PEER-COHORT-THRESHOLD`: IA, IL, and IN sample fields have at least 5 comparable synthetic aggregate peers; thin cohorts still hide medians.

The executable matrix lives in `evals/docsRequirements.ts`; this document is the human-readable map.
