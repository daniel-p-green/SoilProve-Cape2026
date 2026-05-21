# SoilProve Tonight Addendum

This addendum keeps `SPEC.md` as the long-form product target while adding tonight's quantified web-app acceptance bar.

## Ambitious Goal

Build a working browser app that lets a farmer, agronomist, and SoilProve operator complete the core SoilProve experience end to end:

1. Authenticate with Codex app-server login.
2. Persist real farm, field, soil-zone, prescription, signoff, yield, packet, and OEM-delivery records in SQLite.
3. Generate corn nitrogen recommendations for IA, IL, IN, plus Missouri challenge/demo fixtures with MRTN-style economics, organic-matter credit, clamp rules, confidence labels, and audit inputs.
4. Show guaranteed savings language from the source pack: `$10/acre verified cost savings by Month 6` and `yield protection if yields drop more than 2% from baseline`.
5. Produce aggregate-only peer proof with no individual peer identities.
6. Export a real John Deere-compatible shapefile ZIP containing `.shp`, `.shx`, `.dbf`, and `.prj`.
7. Include OEM delivery adapters for `john_deere`, `case_ih`, and `agco`; each adapter must make a live HTTP call when its credentials are present and return a credential-required status when absent.
8. Add OpenAI Realtime voice navigation using `gpt-realtime-2`, voice `cedar`, persona name `Raimond`.
9. Let the same app state be controlled by clicks, typed copilot, or Raimond voice tool calls.
10. Use the brand assets in `public/brand/`.
11. Include a first-run onboarding wizard that teaches the farmer workflow without blocking experienced users.
12. Import PDF or text soil reports into editable intake fields with warnings and human review before any prescription is generated.
13. Use GoalBuddy state, deterministic tests, traceability evals, and an optional OpenRouter LLM-as-judge pass to keep the original documents and source pack as the floor.

## Quantified Acceptance Targets

- `npm test`: at least 35 tests pass, covering domain math, peer privacy, canonical fixtures, OCR import, VRT ZIP contents, OEM credential behavior, Realtime tool contracts, Codex login guards, and packet text.
- `npm run evals`: passes with no secret and reports blocking/advisory traceability gates against the original docs, source pack, and user addendum.
- `npm run evals:live`: runs an OpenRouter LLM-as-a-judge completeness grade when `OPENROUTER_API_KEY` is present.
- `npm run lint`: TypeScript passes with no errors.
- `npm run build`: Vite production build succeeds.
- Browser smoke: login surface renders, demo login works when app-server is unavailable, a prescription can be generated, signed, packeted, and VRT exported.
- Voice smoke: `/api/realtime/session` advertises `gpt-realtime-2`, `cedar`, and `Raimond`; live WebRTC requires `OPENAI_API_KEY`.

## Spec Override

`SPEC.md` says email/password auth and John Deere-only OEM export. Tonight's user direction overrides that:

- Auth: Codex app-server login first, local demo login fallback.
- OEM: all three listed brands get adapters.
- Voice: full experience must be navigable by Raimond via Realtime tools.
- OCR: PDF/text soil report import is review-gated; image-only PDF OCR remains a lower-confidence path that must warn before use.
- OEM feasibility: John Deere can be simulated without credentials; production write-back for John Deere, CNH, and AGCO/agrirouter requires customer authorization plus OEM developer/app access.
