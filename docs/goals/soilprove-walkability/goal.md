# SoilProve Pre-Design Walkability Goals

Status: complete
Created: 2026-05-20
Completed: 2026-05-20

Objective: make the existing technical build provable and walkable before visual design polish. This goal does not expand agronomy scope; it surfaces implemented proof, status, and demo flow.

## Quantified Targets

1. Guided demo checklist
   - Target: 8 visible steps, each with deterministic complete/pending status: login, import/review soil, generate plan, sign, packet, VRT, OEM, outcome savings.

2. Yield upload UI
   - Target: one visible yield CSV input, one sample-fill path, one upload action, and one verified savings result.

3. Realtime readiness panel
   - Target: show `gpt-realtime-2`, `cedar`, API availability, browser mic permission, connection status, and last tool action.

4. Explicit OCR review
   - Target: after import, show confidence, review-required state, county, texture, pH, P, K, and OM when available.

5. Admin audit viewer
   - Target: dashboard shows at least the latest 8 audit events with action, actor role, target, and timestamp.

6. OEM status UI
   - Target: John Deere, Case IH/CNH, and AGCO each show unambiguous `Simulated`, `Credential required`, `Live ready`, or `Not run` status.

7. One-click full demo setup
   - Target: one button logs in as `test-admin-operator`, loads the seeded Miller field, generates, signs, packets, exports VRT, sends John Deere simulation, and uploads sample yield data.

## Verification

```bash
npm run evals:walkability
node --import tsx --test --test-concurrency=1 tests/walkability.test.ts
npm test
npm run evals
npm run lint
npm run build
```

## Completion Receipt

- Guided demo checklist: `Demo path` rail shows 8 deterministic steps and reached `8/8 complete` in browser smoke.
- Yield upload UI: dashboard has sample CSV, upload action, and `Verified savings` result.
- Realtime readiness: dashboard shows model, voice, OpenAI API availability, mic permission, connection, and last tool action.
- OCR review: import result card shows `Review required before use` plus county, texture, pH, phosphorus, potassium, and organic matter when parsed.
- Admin audit viewer: dashboard renders latest admin audit events including signoff, packet, VRT, OEM, and yield upload.
- OEM status: exports panel shows John Deere `Simulated`, Case IH `Credential required`, and AGCO `Credential required`; John Deere result labels correctly.
- Full demo setup: one click logs in as `test-admin-operator`, loads the Miller field, generates, signs, packets, exports VRT, sends John Deere simulation, and uploads yield data.

Latest verification:

```bash
npm run evals:walkability
node --import tsx --test --test-concurrency=1 tests/walkability.test.ts
npm run lint
npm test
npm run evals
OPENROUTER_API_KEY= npm run evals
npm run build
```

Browser smoke:

- Production preview at `http://127.0.0.1:8787/`.
- `Run full demo setup` completed.
- Demo path reached `8/8 complete`.
- Dashboard showed `Verified savings`.
- Audit trail showed persisted action events.
- Exports tab showed OEM status cards and a labeled `john_deere` result.
- Browser console errors: 0.
