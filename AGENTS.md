# SoilProve Agent Instructions

Act like a high-performing senior engineer building economically important farm decision-support software. Be concise, direct, and execution-focused.

This repo is the **SoilProve** Vibeathon Cape 2026 project. Midwestern farmers and their agronomists are the audience. The software must make the decision path safer, clearer, and more auditable.

## Product Boundary

The original documents are the floor, not the ceiling:

- `docs/files/SPEC.md`
- `docs/files/PROGRESS.md`
- `docs/SoilProve Source Pack Combined Markdown - JUDGING RUBRIC.md`
- `docs/files/SPEC_ADDENDUM_TONIGHT.md`

Treat those as minimum requirements and maintain a traceability path from implementation to spec tasks, source-pack claims, and judge criteria.

Keep product language honest:

- Use: agronomist-reviewed trial plan, review packet, modeled input savings, breakeven yield drag, illustrative peer examples, savings assurance offer, first controlled field test.
- Avoid: final prescription, replaces the agronomist, proven neighbor result, peer identity, guaranteed yield, autonomous fertilizer recommendation.

Savings language may describe the business offer, but every UI, voice, packet, and eval must keep it tied to reviewable inputs and harvest verification.

## Non-Negotiables

- Auth: Codex app-server login is the primary path, with local demo fallback only for development and judging.
- Database: use real SQLite persistence locally; keep schema explicit for users, farms, fields, soil tests, prescriptions, packets, exports, and yield records.
- OEM: support John Deere, Case IH/CNH, and AGCO as credential-gated integrations. Never make live OEM calls in tests.
- VRT: export a real shapefile ZIP containing `.shp`, `.shx`, `.dbf`, and `.prj`; DBF must include `N_RATE_LBS`.
- Voice: Raimond uses OpenAI Realtime with `gpt-realtime-2` and voice `cedar`. Voice tool calls must await real action results before confirming success.
- OCR: PDF soil report import is in scope. Extract candidate field/zone values into editable intake data; never silently turn OCR output into an applied plan.
- Privacy: peer medians are shown only when at least 5 comparable fields exist. No individual peer data leaks.

## Verification

Run the smallest check set that proves the change, and run the full set before checkpoint commits:

```bash
npm test
npm run evals
npm run lint
npm run build
```

Run `OPENROUTER_API_KEY= npm run evals` to verify CI-safe behavior without live model secrets.

LLM-as-judge grading is part of acceptance. Evals must judge completeness against the original documentation and the source-pack rubric. Prefer deterministic gates first, then optional live model judging only when keys are present.

## Git

- Preserve user work. Inspect `git status --short` before broad edits.
- Commit green checkpoints regularly.
- Keep generated build output, local DBs, uploads, screenshots, zips, and secrets out of git.
- Do not revert unrelated changes.

## Directory Routing

- `src/`: React app, domain model, fixtures, Realtime browser client.
- `server/`: Express API, Codex app-server bridge, Realtime bridge, OpenRouter copilot, SQLite persistence.
- `tests/`: Node test runner coverage for domain, API, DB, Realtime, VRT, OEM, OCR.
- `evals/`: deterministic and optional live LLM-as-judge checks.
- `docs/`: source docs, judge rubric, progress, scope addenda.
- `scripts/`: local app-server, packaging, verification, capture utilities.
