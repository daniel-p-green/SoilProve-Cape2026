# Soil Report Reference Library

Generated: 2026-05-21

Purpose: maintain a single source of truth for public soil-report PDFs and report-format references that can harden SoilProve OCR, intake review, and agronomist packet language for Midwestern corn-acre workflows.

## Library rules

- Prefer real PDF report artifacts over copied text extracts.
- Treat public sample reports as layout and parser evidence, not as proof of real peer outcomes.
- Keep all imported values editable and `reviewRequired` until an agronomist-reviewed mapping says otherwise.
- Do not commit additional third-party PDF bytes without explicit user approval.
- Redact any public PDF that includes named people, farms, addresses, or customer IDs before using it in screenshots, demos, or UI fixtures.

## Committed PDF Fixtures

These files are already committed under `tests/fixtures/imports/missouri-pdfs/` with checksums in `SHA256SUMS.txt`.
They are also served in the live app from `public/sample-reports/missouri-pdfs/` so the intake sample-report library can demonstrate the real PDF OCR path.

| Source | Direct PDF | Crop/report fit | Current use |
| --- | --- | --- | --- |
| MU Extension, Interpreting Missouri Soil Test Reports | https://extension.missouri.edu/sites/default/files/legacy_media/wysiwyg/Extensiondata/Pub/pdf/agguides/soils/g09112.pdf | Missouri soil-test report guide with sample report sections, crop options, yield goals, nutrient requirements, lime notes, and recommendations. | Baseline Missouri layout fixture and parser expectation. |
| Ri-Mor Topsoil public MU lab report, 2025 70/30 mix | https://rimortopsoil.com/wp-content/uploads/2025/11/70-30-for-2025.pdf | Public MU-formatted lab report; not row-crop-specific. | OCR layout stress test; review-required only. |
| Ri-Mor Topsoil public MU lab report, 2025 topsoil | https://rimortopsoil.com/wp-content/uploads/2025/11/TS-for-2025.pdf | Current MU-formatted lab report variant; not row-crop-specific. | OCR field-position drift test; review-required only. |
| Ri-Mor Topsoil public MU lab report, 2014 soil test | https://rimortopsoil.com/wp-content/uploads/2020/09/Soil_Test2014.pdf | Older MU lab report format. | Backward-compatible OCR/parsing test. |
| Ri-Mor Topsoil public MU lab report, 2014 garden grow | https://rimortopsoil.com/wp-content/uploads/2020/09/Garden_Grow2014.pdf | Lawn/garden context. | Negative/ambiguous report test; must not seed corn defaults. |

## Strong Corn And Agronomic PDF Candidates

These should be the next approval candidates if we want actual PDF bytes beyond the existing Missouri fixture set.

| Priority | Source | Direct PDF | Why it matters | Fixture posture |
| --- | --- | --- | --- | --- |
| 1 | University of Minnesota Soil Testing Laboratory, Example Soil Test Report for Agronomic Crops | https://soiltest.cfans.umn.edu/sites/soiltest.cfans.umn.edu/files/files/media/example_soil_test_repot_agronomic.pdf | Public two-page lab-style soil test report for agronomic crops. The source page says it contains recommendations for corn; the PDF includes `FARMER DOE`, `Crop Before Last: Corn, Grain`, `Last Crop: Soybeans`, `Corn, Grain`, `120 bu./acre`, soil-test results, recommendations, and comments. | High-value corn-report fixture candidate. Commit only after approval. |
| 2 | Waypoint Analytical Illinois, routine soil analysis | https://www.waypointanalytical.com/Docs/ExampleReports/M3LBS-RoutineS1M.pdf | Public three-page lab report prepared by Waypoint Analytical Illinois. Includes multiple samples, `Crop: Corn`, `Yield Goal: 200 bu/acre`, pH, P, K, calcium, magnesium, organic matter, nitrate nitrogen, lime, fertility guidelines, and corn-specific comments. | Strong Corn Belt OCR/layout candidate. Commit only after approval. |
| 3 | Penn State Agricultural Analytical Services Laboratory, Sample Soil Test Report for Agronomic Crops | https://agsci.psu.edu/aasl/soil-testing/fertility/handbooks/agronomic/forms/sample-soil-test-report-for-agronomic-crops/%40%40download/file/Agro%20report%20sample.pdf | Public report-style PDF with `Corn for Silage` and `Corn for Grain` recommendations, expected yield, N/P/K rates, soil nutrient levels, organic matter, CEC, nitrate-N, and recommendation messages. Not Midwest, but useful for broad agronomic report variation. | Secondary report-format candidate. Commit only after approval. |
| 4 | Ag PhD / Kinsey public soil test packet using Midwest Laboratories | https://agphd.com/wp-content/uploads/2023/02/Kinsey-Soil-Test-Packet-2023.pdf | Public PDF packet with Midwest Laboratories soil-analysis output for a Nebraska corn crop, including intended crop, yield goal, pH, OM, nitrate, P, K, micronutrients, lime, and recommendation rates. It includes visible grower/location details. | Use only as a public reference; redact before any fixture/demo use. |
| 5 | MU Extension / MOspace, Understanding Your Soil Test Report | https://mospace.umsystem.edu/bitstreams/3797028a-ec6b-425b-b4f2-e054af9c3e3c/download | 2026 MU guide PDF with field-crop and horticultural sample reports, built around MU Soil & Plant Testing Laboratory results and recommendations. | Missouri guide/reference candidate; verify current Extension version before committing. |

## Soil Health Report References

These are useful for the soil-health report style in the screenshot, but they should not be treated as corn fertilizer prescription inputs by themselves.

| Source | URL | Why it matters | Fixture posture |
| --- | --- | --- | --- |
| MU Extension, Interpreting Soil Health Test Report: A Guide for Missouri Farmers | https://extension.missouri.edu/publications/g9072 | Public MU guide for the Soil Health Assessment Center report format shown in the screenshot: sample information, participant, soil-health test interpretation, region medians, and management recommendations. | Report-shape reference. No direct PDF found in the browser pass. |
| MU Soil Health, Getting Started With Soil Health Testing in Missouri | https://soilhealth.missouri.edu/wp-content/uploads/2023/06/g06953.pdf | Missouri soil-health testing context for farmers, conservation practices, and sampling posture. | Background reference, not a lab-report fixture. |

## Interpretation And Calibration References

These are not report fixtures, but they help keep parser labels and UI copy aligned with agronomic conventions.

| Source | URL | Use |
| --- | --- | --- |
| Ohio State CFAES, Interpreting a Soil Test Report | https://cfaes.osu.edu/fact-sheet/interpreting-soil-test-report | Explains common soil-test report terms and uses a corn-field photo/report-format framing. Use for user-facing interpretation language, not as a fixture. |
| University of Minnesota, Example Soil Test Report source page | https://soiltest.cfans.umn.edu/example-soil-test-report-agronomic-crops | Source page confirming the example report PDF is the same format as a UMN lab report and contains corn recommendations. |
| Penn State AASL source page | https://agsci.psu.edu/aasl/soil-testing/fertility/handbooks/agronomic/forms/sample-soil-test-report-for-agronomic-crops/view | Source page for the downloadable agronomic sample report PDF. |

## Recommended Next Step

For the next OCR hardening slice, add the University of Minnesota and Waypoint Illinois PDFs as explicitly approved fixtures, generate checksums, and add parser assertions for:

- report identity and lab/source,
- crop and yield goal,
- pH,
- phosphorus,
- potassium,
- organic matter,
- nitrate nitrogen when present,
- lime or buffer/lime index when present,
- recommendation rows,
- review-required reasons.
