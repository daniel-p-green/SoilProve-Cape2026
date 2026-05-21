# SoilProve UI Element Inventory

Date: 2026-05-20

Purpose: document the UI elements SoilProve needs before visual concepting in Google Stitch or Claude Design. This inventory is grounded in the current technical implementation and active walkability targets. It is a product/design contract, not a redesign proposal.

Primary sources:

- `src/App.tsx`
- `src/domain.ts`
- `src/realtime.ts`
- `src/oem.ts`
- `server/index.ts`
- `public/brand/`
- `docs/requirements-traceability.md`
- `docs/goals/soilprove-walkability/goal.md`
- `docs/judge-submission-packet.md`

## Status Key

- `must keep`: safety-critical, judge-critical, or implementation-backed behavior that design work must preserve.
- `can redesign`: visual hierarchy, layout, or wording can improve as long as behavior and safety semantics remain.
- `active target`: present in API/tests/goals but not fully surfaced in the current React UI.
- `concept only`: useful design exploration candidate; do not implement unless separately approved.

## Inventory

| ID | Screen / workflow | User role | Purpose | Source data / API | User action | Required states | Safety / claims copy | Implementation status | Test / eval coverage |
|---|---|---|---|---|---|---|---|---|---|
| SHELL-001 | App shell | All | Identify SoilProve and expose primary work areas. | `public/brand/SOILPROVE-MARK-TRANSP.svg`, `public/brand/SoilProve_text-only.svg`; `activeTab` in `src/App.tsx`. | Use nav tabs: Soil Report, Action Plan, Context, Packet, Export, Results. | Active tab, inactive tab, responsive wrap. | Keep the product positioned as a soil report second opinion, not a fertilizer optimizer. Preserve existing brand assets; do not invent a replacement mark. | `must keep`; can redesign layout. | Browser smoke in `docs/evidence/ui-polish-browser-smoke.md`. |
| SHELL-002 | Global notices | All | Confirm generated, signed, packeted, exported, login, OCR, and OEM actions. | Local `message` and `realtimeError` state. | Read status after an action. | Notice, error, empty. | Never confirm export, OEM delivery, or voice action before the real action result returns. | `must keep`; can redesign presentation. | Realtime smoke and browser smoke receipts. |
| AUTH-001 | Codex app-server login | Operator / admin | Primary auth bridge for Codex app-server. | `GET /api/codex/status`, `POST /api/codex/login/start`, `GET /api/codex/login/:loginId`. | Start ChatGPT login, finish in browser, check login. | Checking, ready, unavailable, login started, completed, failed. | If unavailable, say demo mode is a local fallback, not the primary auth path. | `must keep`. | Auth tests, docs gate, browser smoke. |
| AUTH-002 | Demo login and personas | Farmer, agronomist, admin, judge operator | Deterministic local demo while preserving signed session behavior. | `GET /api/demo-users`, `POST /api/demo-login`; personas include `test-admin-operator`, `test-farmer-miller`, `test-agronomist-chen`. | Use generic demo login or persona happy path. | Not signed in, signed in, role shown. | Label demo data as synthetic and local-demo. | `must keep`; can redesign to reduce clutter. | Auth/API tests and browser smoke. |
| ONBOARD-001 | First-run onboarding | All | Explain the bounded four-checkpoint trial workflow. | `localStorage` dismissal; sample field fixtures. | Load a sample field or start from current intake. | Visible first run, dismissed, sample loaded. | "Reviewable nitrogen trial"; do not imply final prescription. | `must keep`; can redesign. | Onboarding tests and browser smoke. |
| ONBOARD-002 | Soil report workflow meter | Judge operator | Make the full judge path walkable and show progress across Soil Report, Action Plan, Context, Packet, Export, and Results. | `buildStepAccess` and `DemoPath` in `src/App.tsx`; current action state. | Follow workflow steps. | Ready, active, complete, locked. | The meter should reinforce lab-value review, better agronomist meetings, comparable-context privacy, review-packet, export, and harvest-results gates. | `must keep`; primary navigation. | `evals/walkability.ts`, `tests/walkability.test.ts`. |
| ONBOARD-003 | One-click full demo setup | Judge operator | Prepare the full deterministic demo path quickly. | `runFullDemoSetup`; demo persona `test-admin-operator`. | Run full setup. | Ready, running, completed, failed. | Must not bypass real signoff/export/OEM result rules; it executes the same actions in order. | `must keep`; can redesign progress feedback. | Walkability eval and tests. |
| INTAKE-001 | Field profile form | Farmer, agronomist, admin | Capture editable field identity and economics before plan generation. | `FieldProfile`; `POST /api/prescriptions`. | Edit farm, farmer, agronomist, field, county, state, soil type, acres, corn price, nitrogen price, baseline N, baseline yield. | Valid, invalid server response, edited, generated. | Inputs are farmer-entered assumptions; they remain reviewable. | `must keep`; can redesign grouping. | Domain validation tests and API tests. |
| INTAKE-002 | Controlled selectors | Farmer, agronomist, admin | Enforce supported v1 states and soil types. | `StateCode` and controlled soil vocabulary in `src/domain.ts`. | Choose IA, IL, IN, MO demo state, and one supported soil type. | Valid option only. | Avoid implying full national/multi-crop support. | `must keep`. | Domain validation and docs evals. |
| INTAKE-003 | Soil zone editor | Farmer, agronomist, admin | Review staged zone data and editable agronomic values. | `SoilZone[]`; current UI exposes acres, OM, pH; domain also stores P, K, polygon WKT, sample date. | Edit zone values before generating a plan. | Empty, edited, review required, generated. | OCR/imported data must be reviewed before use. | `must keep`; expand visible P/K/sample-date in walkability work. | Domain tests and OCR/import fixture tests. |
| OCR-001 | Soil report import | Farmer, agronomist, admin | Stage PDF or text soil report values into editable intake. | Browser text parser; `POST /api/v1/soil-tests/ocr-pdf` for PDFs. | Select PDF or text report. | No file, importing, confidence shown, warnings shown, fallback used, failed. | "Review values before generating a plan"; never silently turn OCR into an applied plan. | `must keep`; can redesign. | OCR tests, import fixture tests, docs gate. |
| OCR-002 | OCR review detail | Farmer, agronomist, admin | Show confidence and candidate field/zone values for review. | `SoilReportImportResult`; `labFields` for county, texture, pH, P, K, OM. | Inspect extracted values and edit staged zones. | Low, medium, high confidence; review required. | Review-required state must stay explicit. | `must keep`; can redesign detail layout. | Walkability eval and OCR tests. |
| PLAN-001 | Plan KPIs | Farmer, agronomist, judge | Summarize modeled economics and peer confidence. | `Prescription.savings`, `Prescription.peerSummary`. | Review modeled savings, field savings, breakeven yield drag, peer score. | No plan, draft, signed, exported. | Use modeled input savings and breakeven yield drag; do not claim guaranteed yield. | `must keep`; can redesign charting/readouts. | Domain tests, packet/eval coverage. |
| PLAN-002 | Zone recommendation table | Farmer, agronomist | Show per-zone N rate and core agronomic drivers. | `Prescription.recommendations`. | Review zone, acres, N rate, confidence, OM credit. | Draft, signed, exported. | Label rates as trial-plan recommendations pending review, not final prescriptions. | `must keep`; can redesign table layout. | Domain and packet trust tests. |
| PLAN-003 | Zone rationale cards | Agronomist, farmer | Explain why each zone received its rate. | `rationale`, `confidenceReason`, `riskCaveat`, `preClamp`, `postClamp`. | Read rationale and risk caveats. | High, medium, low confidence. | Low/medium confidence must trigger review language. | `must keep`; can improve density and scanability. | `AGRONOMIST-TRUST` eval and tests. |
| PLAN-004 | Sign action | Agronomist, admin, linked agronomist | Capture explicit agronomist review before export. | `POST /api/prescriptions/:id/signoff`; RBAC in `server/index.ts`. | Click Sign. | Draft, signed, forbidden, invalid, exported immutable. | Signoff means reviewed for the action plan; it does not guarantee yield. | `must keep`. | RBAC signoff tests and docs gates. |
| PLAN-005 | Packet action | Farmer, agronomist, admin | Create agronomist review packet from active plan. | `POST /api/prescriptions/:id/packet`; `buildPacket`. | Click Packet/Create packet. | No plan, generated, packet created. | Packet must include review questions and economics. | `must keep`; can redesign preview. | Packet completeness eval and tests. |
| PLAN-006 | VRT action from plan | Farmer, agronomist, admin | Export signed plan as real shapefile ZIP. | `GET /api/prescriptions/:id/vrt`; `createVrtBundle`. | Download VRT. | Disabled while draft, enabled signed/exported, repeat download. | Export requires signoff; ZIP must be real VRT with `N_RATE_LBS`. | `must keep`. | VRT tests, browser smoke, docs gate. |
| PROOF-001 | Comparable field context | Farmer, agronomist, judge | Show aggregate comparable-field context while preserving privacy. | `PeerSummary`. | Review comparable count and medians. | Hidden medians below threshold, visible medians when count >= 5. | Do not expose individual peer identities or imply proven neighbor result. | `must keep`; can redesign visualization. | Peer/domain tests and claims scan. |
| PACKET-001 | Packet generator | Farmer, agronomist, judge | Create and show the review packet. | `buildPacket`; packet API route. | Click Create packet. | No packet, packet preview, API error. | Review packet, not autonomous prescription. | `must keep`; can redesign to include tabs/sections. | Packet completeness eval. |
| PACKET-002 | Packet markdown preview | Agronomist, judge | Show the generated audit artifact. | `TrialPacket.markdown`. | Read/copy packet. | Empty, created, long content overflow. | Must preserve field, savings assurance, nitrogen action plan, rationale, economics, comparable context, Raimond-prepared discussion notes, and review questions. | `must keep`; can redesign into structured panels. | Packet eval and browser overflow smoke. |
| EXPORT-001 | VRT ZIP download | Farmer, agronomist, admin | Download signed/exported plan as equipment-ready shapefile bundle. | `GET /api/prescriptions/:id/vrt`. | Click Download shapefile ZIP. | Signoff required, download enabled, exported/repeat download, error. | Never enable before signoff. | `must keep`. | VRT tests and browser smoke. |
| EXPORT-002 | OEM send controls | Farmer, agronomist, admin | Send or simulate VRT delivery to John Deere, Case IH/CNH, or AGCO. | `POST /api/prescriptions/:id/oem/:target`; `src/oem.ts`. | Click target OEM. | Disabled draft, simulated, credential_required, live, failed. | Production OEM delivery is credential-gated; simulation must be labeled. | `must keep`; can redesign as status cards. | OEM tests and appendix eval. |
| EXPORT-003 | OEM result list | Farmer, agronomist, judge | Display delivery mode, message, endpoint/result details. | `OemResult[]`. | Review latest target result. | Not run, simulated, credential_required, live, failed. | John Deere simulation is not live equipment write-back. | `must keep`; current UI is minimal. | OEM tests and browser smoke. |
| DASH-001 | Execution dashboard | Judge operator, admin | Summarize auth, DB, realtime, and prescription status. | Local app state; `/api/bootstrap` dashboard exists server-side. | Read readiness. | Not started, draft, signed, exported; realtime states. | Keep status factual. | `can redesign`; current UI is basic. | Browser smoke. |
| DASH-002 | Yield upload and verified savings | Farmer, agronomist, judge | Upload post-harvest yield CSV and show verified savings. | `POST /api/v1/fields/:fieldId/yield-records`, `GET /api/v1/fields/:fieldId/savings`; `sampleYieldCsv`. | Choose/fill sample yield CSV, upload, review savings. | No yield, upload ready, uploaded, verified savings, guarantee triggered. | Verified outcome savings must be tied to yield record; guarantee trigger is review logic, not yield guarantee. | `must keep`; can redesign within dashboard/proof flow. | Yield API tests and walkability eval. |
| ADMIN-001 | Admin audit viewer | Admin, judge operator | Show latest audit events for reviewability. | `GET /api/v1/admin/audit-events`; audit actions include prescription, packet, VRT, OEM, yield. | Open/refresh audit panel. | No events, events loaded, non-admin forbidden. | Audit trail supports accountability; do not expose private peer/user data beyond role/action/target/time. | `must keep`; can redesign placement. | Admin/API tests and walkability eval. |
| VOICE-001 | Raimond voice button | All | Start/stop Realtime voice workflow. | `RaimondRealtimeClient`; `POST /api/realtime/session`. | Click Raimond. | Idle, connecting, connected, error. | Voice must wait for actual tool results before confirming state changes. Raimond prepares farmers for agronomists; it does not replace them. | `must keep`; can redesign as readiness drawer. | Realtime tests and smoke script. |
| VOICE-002 | Raimond transcript | All | Show recent voice/system transcript lines. | Realtime data channel transcript events. | Read transcript after using voice. | Empty, user, assistant, system. | Spoken responses should stay short and tied to reviewable inputs. | `must keep`; can redesign. | Realtime parser/smoke tests. |
| VOICE-003 | Realtime readiness panel | Judge operator, admin | Make Realtime model, voice, API, mic permission, connection status, and last tool action visible. | `/api/health`, Realtime client status, browser mic permission, `lastToolAction`. | Inspect readiness before live demo. | API key absent, mic denied, idle, connecting, connected, last action success/failure. | Do not imply live voice is ready if key or mic is missing. | `must keep`; can redesign as drawer or dashboard card. | Realtime smoke and walkability eval. |
| COPILOT-001 | Typed copilot action | Operator | Optional text/model copilot route for structured assistant action. | `POST /api/copilot/action`; OpenRouter key gated. | Submit action request if UI is added. | Not configured, JSON action returned, failed. | Must use the same safety language as Raimond. | `concept only`; API exists, no current visible UI. | Copilot/API tests where present; default evals. |

## Lower-Maturity Or API-Only Capabilities

These capabilities are newer, less polished, or API-only. They should not be hidden in final design:

| Capability | Current owner | Design action |
|---|---|---|
| Yield CSV upload and verified savings | Dashboard UI, API routes, tests | Improve information hierarchy around sample-fill, upload, verified result, and guarantee-trigger state. |
| Admin audit events | Dashboard audit trail and API route | Make role, action, target, outcome, and timestamp easier to scan. |
| Realtime readiness | Dashboard readiness panel, server health, Realtime smoke | Improve readiness grouping for model, voice, API key, mic, connection, and last tool action. |
| Detailed OCR candidate values | Import review UI and parser result | Make county/texture/OM/pH/P/K review feel editable and deliberate. |
| Full demo setup | Demo path checklist and `runFullDemoSetup` | Add clearer progress, failure, and completion affordances. |
| Typed OpenRouter copilot | Authenticated API route | Keep concept-only unless a text copilot surface is explicitly approved. |

## Design Review Gate

Before implementing any Stitch or Claude Design output, verify that the concept preserves:

- Codex app-server login as primary auth, with demo fallback clearly labeled.
- OCR/import review before plan generation.
- Draft plan state before signoff.
- Signoff-gated VRT and OEM actions.
- Peer medians hidden until at least 5 comparable fields exist.
- OEM modes: not run, simulated, credential required, live ready/live, failed.
- Realtime/Raimond status with truthful key/mic/connection messaging.
- Claims-safe language: modeled input savings, breakeven yield drag, review packet, soil report second opinion, agronomist-reviewed action plan, better agronomist meetings.
