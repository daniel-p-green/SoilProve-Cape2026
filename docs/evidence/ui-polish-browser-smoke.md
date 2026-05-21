# UI Polish Browser Smoke Receipt

Date: 2026-05-20

GoalBuddy task: `soilprove-next-phase` T005

## Red Proof

Before this task, the app had passing domain/API tests, but the next-phase board did not have a three-viewport browser receipt for judge-facing layout quality. The browser smoke also exposed an export-state polish issue: after downloading a VRT, the exported plan no longer presented repeat VRT/OEM actions clearly even though those operations remain safe after signoff.

## Green Proof

Polish changes:

- Replaced viewport-scaled hero type with fixed responsive sizes.
- Added panel horizontal overflow protection for tables/preformatted packet content.
- Made disabled buttons visually clearer.
- Changed VRT action labels from ambiguous `VRT` to `Signoff required`, `Download VRT`, or `Download VRT again`.
- Kept VRT/OEM actions available after a signed plan has been exported.
- Allowed repeated VRT downloads for already exported prescriptions without mutating the exported record again.

Browser workflow exercised:

1. Opened production server at `http://127.0.0.1:8787`.
2. Used demo login.
3. Loaded `Miller Farm / North 80`.
4. Generated a prescription.
5. Confirmed draft plan shows disabled `Signoff required`.
6. Signed the plan.
7. Confirmed signed plan shows enabled `Download VRT`.
8. Downloaded VRT.
9. Confirmed exports tab shows enabled `Download shapefile ZIP`, `John Deere`, `Case IH`, and `AGCO`.

## Viewport Results

| Viewport | Console errors | Horizontal overflow | Incoherent overlaps | Brand visible |
|---|---:|---:|---:|---|
| 390x844 | 0 | 0 | 0 | yes |
| 768x1024 | 0 | 0 | 0 | yes |
| 1440x900 | 0 | 0 | 0 | yes |

Screenshots were captured by Playwright MCP as local ignored artifacts:

- `.playwright-mcp/soilprove-t005-mobile-390x844.png`
- `.playwright-mcp/soilprove-t005-tablet-768x1024.png`
- `.playwright-mcp/soilprove-t005-desktop-1440x900.png`

These are evidence artifacts for the local run and are intentionally not committed because screenshots are ignored/generated output.

## Verification

```bash
npm test
npm run lint
npm run build
```

All commands passed after the UI/export polish changes.
