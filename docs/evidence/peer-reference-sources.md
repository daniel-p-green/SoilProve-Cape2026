# Comparable Context Reference Sources

Generated: 2026-05-21

Purpose: record the real soil-report and Extension references used to calibrate the synthetic IA, IL, and IN aggregate comparable-field cohorts in `src/fixtures.ts`.

Canonical report library: `docs/evidence/soil-report-reference-library.md`.

## Product posture

The comparable-field rows are synthetic aggregate fixtures. They are not real farmer records, do not identify neighbors, and do not claim proven outcomes. They exist so the demo can exercise the product requirement: comparable-field medians appear only when at least 5 comparable fields exist for the same state, county, soil type, and comparable acreage.

## Reference inputs

1. Waypoint Analytical Iowa example soil report
   - URL: https://www.waypointanalytical.com/Docs/ExampleReports/M3PPM-S3MwithP1-P2-NO3N.pdf
   - Why it matters: public one-page agricultural lab report showing actual report fields for pH, phosphorus, potassium, organic matter, nitrate nitrogen, ratings, and recommendation rows. The IA/IL/IN comparable-field fixtures use this format as the reference shape for numeric soil-test attributes.

2. Iowa State University Extension, How to Interpret Soil Test Results
   - URL: https://yardandgarden.extension.iastate.edu/how-to/how-interpret-soil-test-results
   - Why it matters: public interpretation guidance for pH, phosphorus, potassium, organic matter, and the reason routine soil tests do not directly settle nitrogen recommendations. Used to keep the synthetic Iowa comparable-field values in plausible report ranges without implying field-specific prescription certainty.

3. University of Illinois Extension, Interpreting Test Results
   - URL: https://extension.illinois.edu/soil/interpreting-test-results
   - Why it matters: public Illinois guidance on organic matter, pH, phosphorus, potassium, CEC, and long-term soil-test trend interpretation. Used to calibrate Illinois comparable-field fixture values and copy around reviewable trend evidence.

4. Purdue Extension, NCH-43 sweet corn fertility guidance
   - URL: https://www.extension.purdue.edu/extmedia/NCH/NCH-43.html
   - Why it matters: public Indiana/Purdue guidance connecting soil-test ranges to phosphorus and potassium decisions, nitrogen caution, organic matter, and pH/zinc risk. Used as a conservative Indiana reference while keeping SoilProve focused on agronomist-reviewed first-field trials.

5. University of Missouri Extension, Interpreting Missouri Soil Test Reports
   - URL: https://extension.missouri.edu/publications/g9112
   - Why it matters: public MU report schema reference already backed by committed Missouri PDF fixtures. It remains the OCR/report-format baseline for the Missouri demo flow.

6. University of Minnesota Soil Testing Laboratory, Example Soil Test Report for Agronomic Crops
   - URL: https://soiltest.cfans.umn.edu/example-soil-test-report-agronomic-crops
   - Why it matters: public agronomic example report that explicitly includes corn recommendations and report sections for header, interpretation, soil-test results, recommendations, and comments. Used to broaden report-library expectations beyond Missouri-only fixtures.

7. University of Minnesota Soil Testing Laboratory, Soil Test Results for Agronomic Crops
   - URL: https://soiltest.cfans.umn.edu/soil-test-results-agronomic-crops
   - Why it matters: public explanation of organic matter, pH, Bray/Olsen phosphorus, potassium, texture, and interpretation categories. Used to sanity-check synthetic sample report values and parser targets.

8. Waypoint Analytical graphical report with texture
   - URL: https://waypointanalytical.com/Docs/ExampleReports/M3PPM-SW3GraphicalwithTexture.pdf
   - Why it matters: public agricultural report format with texture, pH, phosphorus, potassium, organic matter, nitrate nitrogen, soluble salts, and CEC-style fields. Used as a stress reference for reports that include texture and multiple sample pages.

9. Penn State Agricultural Analytical Services Lab, Sample Soil Test Report for Agronomic Crops
   - URL: https://agsci.psu.edu/aasl/soil-testing/fertility/handbooks/agronomic/forms/sample-soil-test-report-for-agronomic-crops/view
   - Why it matters: public agronomic sample-report entry with a downloadable PDF. Used as another land-grant report-format reference without committing the PDF bytes.

10. University of Maryland Extension, Understanding Your Soil Test Report
   - URL: https://extension.umd.edu/resource/understanding-your-soil-test-report
   - Why it matters: public sample-report explainer naming pH, P, K, Mg, Ca, organic matter, and lime/fertilizer recommendation fields. Used to broaden the report-library reference set and reinforce review-required interpretation language.

## Fixture behavior added

- IA Story County/silt loam: 6 synthetic comparable fields.
- IA Polk County/clay loam: 6 synthetic comparable fields.
- IL McLean County/silty clay loam: 6 synthetic comparable fields.
- IL Champaign County/silt loam: 6 synthetic comparable fields.
- IN Benton County/loam: 6 synthetic comparable fields.
- IN Tippecanoe County/silty clay loam: 6 synthetic comparable fields.
- Canonical IA/IL/IN sample fields now cross the privacy threshold and display aggregate medians.
- The selectable intake report library now includes eight preloaded report-style text samples across MO, IA, IL, and IN.
- Existing thin Missouri cohorts still hide medians below the threshold.

## Guardrails

- Do not commit additional third-party PDF bytes without explicit user approval.
- Do not describe these rows as real neighbor outcomes.
- Keep UI language on "illustrative comparable-field context", "aggregate comparable-field medians", and "no individual field identity".
- If real participating-farm records are added later, keep them private and only expose cohort medians when the privacy threshold is met.
