# Raimond Realtime Smoke Receipt

Date: 2026-05-20

GoalBuddy task: `soilprove-next-phase` T003

## Red Proof

Before this task, Realtime coverage proved the Raimond tool schema, event extraction, session config, and no-key endpoint fallback. It did not prove the complete seven-action voice tool path through authenticated SoilProve business APIs.

The missing proof was a deterministic check that fails if Raimond cannot navigate, update the field profile, generate a prescription, sign it, create a packet, export a VRT ZIP, and send to the John Deere OEM path without accidentally making live OEM calls.

## Green Proof

Added `scripts/realtime-smoke.ts` and `npm run smoke:realtime`.

The smoke runner starts the real Express app on an ephemeral port, logs in through `/api/demo-login`, loads `/api/bootstrap`, and executes the same action names exposed to `gpt-realtime-2`:

| Action | Result |
|---|---|
| `navigate_workspace` | pass, set `activeTab=plan` |
| `update_field_profile` | pass, updated `nitrogenPricePerLb=0.72` |
| `generate_prescription` | pass, created a draft prescription |
| `sign_prescription` | pass, admin session produced signed prescription |
| `create_review_packet` | pass, packet markdown contained `Agronomist Review Packet` |
| `download_vrt` | pass, exported ZIP starts with `PK\x03\x04` |
| `send_to_oem` | pass, John Deere simulation returned `mode=simulated` |

Fallbacks verified:

- Missing `OPENAI_API_KEY` on `/api/realtime/session` returns `OPENAI_NOT_CONFIGURED`.
- Browser microphone denial maps to `Microphone permission was denied. Allow microphone access to use Raimond.`

Guardrails verified:

- OEM credential environment variables are isolated inside the smoke.
- Any outbound Deere/CNH/agrirouter URL would be counted and blocked.
- Actual blocked live OEM calls: `0`.

## Human/Browser Boundary

Full spoken WebRTC interaction requires browser microphone permission from the human operator. That permission prompt cannot be approved autonomously while the user is asleep, so this task records the exact boundary and keeps deterministic coverage green. The app still has a browser fallback path for microphone denial, and prior T011 evidence showed the authenticated Realtime endpoint reaches OpenAI Realtime with a synthetic SDP and returns the expected invalid-offer response for that intentionally incomplete media offer.

## Verification

```bash
npm run smoke:realtime
node --import tsx --test --test-concurrency=1 --test-name-pattern Realtime "tests/**/*.test.ts"
```

Both commands passed on 2026-05-20.

## Live gpt-realtime-2 Receipt

Date: 2026-05-21

Additional live OpenAI Realtime checks were run against `gpt-realtime-2` with session voice `cedar`:

- `npx tsx scripts/live-realtime-identity-check.ts`: passed. The live model answered that its name is Raimond and that it uses Cedar.
- `npx tsx scripts/live-realtime-numeric-edit-check.ts`: passed. The live model called `edit_field_value` with `field=nitrogenPricePerLb` and `value=0.72` for "72 cents per pound"; the app normalizer produced `{ nitrogenPricePerLb: 0.72 }`.
- `npx tsx scripts/live-realtime-doc-check.ts <tool-list>`: passed in three batches covering all 18 Realtime tools. Every tool call returned a `function_call_output` before success was recorded.

The current prompt now explicitly says Raimond must identify as Raimond, never as a generic assistant, and must use the configured cedar voice.

Full browser microphone/WebRTC speech still requires a human to grant microphone permission. The live checks above prove the OpenAI Realtime session, model identity, Cedar voice config, tool schemas, function-call extraction, async function outputs, and numeric edit behavior.
