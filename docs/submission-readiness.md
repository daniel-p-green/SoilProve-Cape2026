# SoilProve Submission Readiness

Date: 2026-05-20

## Current State

SoilProve is submission-ready for the controllable software scope.

- Repo: `https://github.com/daniel-p-green/SoilProve`
- Visibility: private
- Branch: `main`
- Primary packet: `docs/judge-submission-packet.md`
- Audit log: `docs/files/PROGRESS.md`
- Traceability matrix: `docs/requirements-traceability.md`
- Remaining true dependency: production OEM credentials and account approvals

## Submit These Materials

Use this order if the submission form allows multiple links or text fields:

1. Repository link: `https://github.com/daniel-p-green/SoilProve`
2. Short project description:

   SoilProve is a voice-first soil report second opinion for Midwestern corn acres. It helps a farmer and agronomist convert technical soil reports into a reviewable MRTN-style action plan, modeled input savings, comparable-context privacy guardrails, agronomist signoff, a review packet, and a real VRT shapefile ZIP.

   Raimond answers basic soil-report questions anytime so farmers arrive prepared and agronomists can focus meetings on strategy, signoff, and field-specific judgment. Farmers use the ChatGPT login path without separate API-key setup; live Raimond voice remains `gpt-realtime-2` with Cedar when configured.

3. Judge packet: `docs/judge-submission-packet.md`
4. Verification proof: `docs/files/PROGRESS.md`
5. Requirements proof: `docs/requirements-traceability.md`
6. OEM proof: `docs/oem-integration-feasibility.md`

## Demo Path

Use the deterministic path unless the room setup clearly supports live voice.

1. Start the app:

   ```bash
   npm run dev
   ```

2. Open:

   ```text
   http://127.0.0.1:5173
   ```

3. Use demo login if Codex app-server login is not already active.
4. Walk through onboarding and activate a synthetic sample field.
5. Import a sample soil report and show editable, review-required lab values.
6. Ask Raimond what the report means and what to ask the agronomist.
7. Generate the draft action plan.
8. Point out comparable-context privacy, modeled savings, breakeven yield drag, confidence, and disabled export controls.
9. Add agronomist signoff.
10. Generate the review packet with Raimond-prepared discussion notes.
11. Download the VRT ZIP.
12. Send to John Deere and show deterministic Operations Center simulation.
13. Show Raimond readiness using `npm run smoke:realtime` or live voice if microphone and key are available.

## Demo Talk Track

Open with:

> SoilProve is not trying to replace the agronomist. It turns a technical soil report into a clear second opinion and an agronomist-reviewed action plan.

Optional scenario line:

> Mark gets his soil report at 9pm and meets his agronomist on Thursday. Raimond explains the basics now so Thursday's meeting can focus on strategy.

Emphasize:

- Soil report second opinion and agronomist-reviewed action plan, not a final autonomous prescription.
- Better agronomist meetings, not fewer meetings.
- Modeled input savings, not guaranteed yield.
- Breakeven yield drag shown before export.
- Comparable-field medians hidden until at least 5 comparable fields exist.
- Real VRT shapefile ZIP generated locally.
- OEM production delivery is credential-gated and honestly labeled.
- Raimond voice can navigate and execute the workflow, but action confirmation waits for real app results.

Avoid saying:

- Final prescription.
- Guaranteed yield.
- Replaces the agronomist.
- Reduces the need for agronomists.
- Live OEM delivery is complete.
- Neighbor results are proven or individually identifiable.

## Verification Before Final Submit

Run this set immediately before submitting or presenting:

```bash
npm test
npm run smoke:realtime
npm run evals
OPENROUTER_API_KEY= npm run evals
npm run evals:docs
npm run evals:packet
npm run lint
npm run build
git status --short --branch
```

Expected state:

- `npm test`: 83 passing tests.
- `npm run evals`: 19 blocking gates, 0 blocking failures, packet completeness included.
- `npm run evals:docs`: 30 implemented, 4 approved-equivalent, 1 external dependency, 0 partial, 0 not implemented.
- `npm run evals:packet`: all required packet sections and evidence labels present.
- `git status --short --branch`: clean and aligned with `origin/main`.

## Fallbacks

If Codex app-server login is unavailable:

- Use demo login.
- Say: "The public path is ChatGPT login with no separate farmer API keys; demo login keeps the judge path deterministic and still writes a real signed local session."

If microphone or OpenAI Realtime is unavailable:

- Run `npm run smoke:realtime`.
- Say: "The deterministic smoke exercises the seven Raimond tool actions and fallback paths; full spoken mode requires browser mic permission and `OPENAI_API_KEY`."

If OEM credentials are unavailable:

- Use John Deere simulation.
- Say: "The app generates the real VRT package locally. Production write-back requires OEM credentials, customer authorization, and account routing."

## Remaining Nice-To-Haves

These are not blockers for software submission:

- Record a short walkthrough video.
- Capture small screenshots if the platform explicitly asks for images.
- Run browser smoke at 390x844, 768x1024, and 1440x900 for final UI confidence.
- Add richer dashboard visuals if post-harvest ROI becomes the judge's main focus.
- Add representative scanned soil-report fixtures if real samples become available.
