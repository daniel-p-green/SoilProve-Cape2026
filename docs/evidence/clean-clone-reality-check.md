# Clean-Clone Reality Check

Date: 2026-05-20

Goal task: `docs/goals/soilprove-next-phase/state.yaml` T002.

## Red Check

T002 started from the assumption that local state might be hiding problems: existing `node_modules`, local SQLite files, parent `.env`, generated `dist`, token files, or screenshots could make the main checkout look healthier than a fresh checkout.

## Method

Created an isolated checkout:

```bash
rm -rf /tmp/soilprove-clean-check
git clone --depth 1 /Users/danielgreen/Documents/GitHub/Vibeathon-Cape-2026/SoilProve-v2 /tmp/soilprove-clean-check
cd /tmp/soilprove-clean-check
npm ci
```

Note: Git reported that `--depth` is ignored for a direct local clone. That is acceptable for this check because the proof target is a clean working tree and lockfile install, not shallow-clone behavior.

## Green Verification

All verification ran from `/tmp/soilprove-clean-check`.

| Check | Result | Evidence |
|---|---|---|
| `npm ci` | pass | 175 packages installed from lockfile, 0 vulnerabilities. |
| `npm test` | pass | 56 tests passed. |
| `npm run evals` | pass | 17 scoped blocking gates passed; strict docs matrix passed. |
| `OPENROUTER_API_KEY= npm run evals` | pass | CI-safe no-secret eval path passed with live judge skipped. |
| `npm run evals:docs` | pass | `allRequirementsImplemented: true`; counts: 30 implemented, 4 approved-equivalent, 1 external dependency, 0 partial, 0 not implemented. |
| `npm run lint` | pass | TypeScript clean. |
| `npm run build` | pass | Vite production build clean. |
| Preview health | pass | `/api/health` returned `ok: true`, `realtimeModel: "gpt-realtime-2"`, `realtimeVoice: "cedar"`. |
| `git status --short` | pass | No tracked or untracked non-ignored changes after verification. |

Ignored runtime artifacts observed after verification:

```text
!! .soilprove-data/
!! dist/
!! node_modules/
```

These are intentionally ignored by `.gitignore`.

## Result

T002 is green. The app can be installed, tested, evaluated, built, and health-checked from a clean checkout without relying on the main working directory's local state.
