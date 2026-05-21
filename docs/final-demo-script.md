# SoilProve Final Demo Script

Target length: 4:45 to 4:55. The official limit is under 5 minutes; leave a few seconds of safety.

Core thesis: **SoilProve turns a soil report into an agronomist-reviewed nutrient action plan.**

Repeatable line: **Understand the report. Review the plan. Export only after signoff.**

## Script Table

| Time | Talking Point | Script | On-Screen Visual | Notes |
| --- | --- | --- | --- | --- |
| 0:00-0:15 | Field lab test | "A soil report is the lab test for a field." | Clean SoilProve title card over soil/map texture. | Do not open with app UI. Teach the category first. |
| 0:15-0:35 | Stakes | "It contains the numbers behind fertilizer decisions that affect margin, yield risk, and trust. But it usually arrives as a dense technical PDF." | Soil report close-up or margin-pressure visual from `demo-video-assembly/recommended/01-problem-hook/`. | Keep this visual plain and non-gimmicky. |
| 0:35-0:55 | Thesis | "SoilProve closes the gap between receiving the report and walking into an agronomist meeting with a clear plan. Understand the report. Review the plan. Export only after signoff." | App hero/onboarding screen. | This is the pyramid top. |
| 0:55-1:20 | Access and intake | "The farmer signs in with ChatGPT or uses the judge demo path. Then SoilProve imports a soil report into editable field and zone values." | ChatGPT readiness/demo login, then soil-report intake. | Say "no separate farmer API-key setup" only if the readiness panel is visible. |
| 1:20-1:55 | Raimond explains | "Now Raimond becomes the second opinion. Mark can ask: 'Explain this report in plain English. What should I ask my agronomist before Thursday?'" | Raimond chat or voice panel. | If live voice is smooth, use voice. If not, use chat and mention live voice uses `gpt-realtime-2` and Cedar when configured. |
| 1:55-2:20 | Raimond prepares the meeting | "Raimond handles the foundational Q&A: what the flagged values mean, where confidence is lower, and what deserves agronomist review. The point is better meetings, not fewer meetings." | Raimond answer plus review questions. | This is the highest-value AI moment. |
| 2:20-2:55 | Generate action plan | "SoilProve turns reviewed inputs into a draft MRTN-style nutrient action plan: zone rates, modeled input savings, breakeven yield drag, confidence drivers, and caveats." | Action plan tab. | Use "draft" and "reviewable"; avoid "final prescription." |
| 2:55-3:20 | Hard boundary | "Here is the safety design: packet, VRT export, and equipment delivery stay locked until agronomist signoff. The app is useful before it is allowed to be powerful." | Locked export/packet controls or signoff gate. | This is the feasibility win. Pause enough for judges to see it. |
| 3:20-3:50 | Signoff and packet | "After review, the agronomist signs off. SoilProve creates the packet: report values, assumptions, economics, caveats, and Raimond-prepared questions." | Signoff, then packet preview. | Human expertise remains central. |
| 3:50-4:20 | Equipment-ready output | "Now the reviewed plan becomes operational: SoilProve downloads a real VRT shapefile ZIP and shows equipment-integration status without pretending to have live production credentials." | VRT ZIP/export and OEM/equipment status. | Avoid third-party logos in the submitted video. |
| 4:20-4:40 | Accountability | "After harvest, the farmer uploads yield results. Savings are verified against outcomes, not promised at planning time." | Results/harvest verification view. | Tie back to trust and accountability. |
| 4:40-4:55 | Close | "SoilProve is built for the real decision path: reviewable inputs, Raimond explanation, human signoff, equipment-ready output, and harvest accountability." | Final SoilProve card. | End before 5:00. |

## Raimond Lines To Use

Use these as the exact `gpt-realtime-2` / Cedar spoken path when live voice is stable:

1. "Raimond, start the full hands-free SoilProve experience."
2. "Dismiss onboarding, use demo login if needed, and load the Keller Creek Ridge 92 soil report."
3. "Open the soil report intake, explain the flagged values, and tell me what needs agronomist review."
4. "Mark the editable report values reviewed and generate the draft action plan."
5. "Open the action plan and summarize the zone rates, modeled input savings, breakeven yield drag, and caveats."
6. "Open comparable proof and explain what the privacy threshold allows us to show."
7. "Capture agronomist signoff and create the review packet."
8. "Open exports, download the VRT shapefile ZIP, and send it to John Deere simulation."
9. "Upload sample yield results, open results, and summarize verified savings and remaining audit evidence."

Use shorter Q&A lines if you are only showing Raimond's explanation layer:

- "Raimond, explain this soil report in plain English."
- "What should Mark ask his agronomist before Thursday?"
- "Summarize the flagged values and what needs agronomist review."
- "What is still locked before this can be exported?"

## Recording Notes

- Use the live app as the spine of the video.
- Use old slide/video assets only for the opening context and light transitions.
- Do not discuss internal research shortcuts in the submitted video.
- Do not show old copy that says "peer-validated prescription," "field-specific precision optimizer," or "proven savings."
- Do not use third-party music.
- Avoid third-party logos in the submitted video; use generic equipment-integration status where possible.
- Keep the video under 100MB and safely under 5 minutes.
