# Missouri Soil Report Source Inventory

Generated: 2026-05-20

Purpose: identify real Missouri soil report formats for OCR/parser hardening.

Canonical report library: `docs/evidence/soil-report-reference-library.md`.

Update: after explicit user approval on 2026-05-20, the five public PDFs below were committed as test fixtures under `tests/fixtures/imports/missouri-pdfs/` with `SHA256SUMS.txt` receipts. These fixtures are used only for OCR/import workflow testing and must remain review-required when values are ambiguous, lawn/garden-oriented, or not row-crop trial-ready.

## High-confidence sources

1. MU Extension guide: Interpreting Missouri Soil Test Reports
   - HTML: https://extension.missouri.edu/publications/g9112
   - PDF: https://extension.missouri.edu/sites/default/files/legacy_media/wysiwyg/Extensiondata/Pub/pdf/agguides/soils/g09112.pdf
   - Why it matters: official University of Missouri guide includes a sample Missouri soil test report and names the canonical report sections, field information, soil test information, ratings, nutrient requirements, cropping options, yield goals, pounds-per-acre recommendations, limestone suggestions, and special notes.
   - Fixture posture: committed after explicit approval; use as reference schema and parser expectation baseline.

2. Ri-Mor Topsoil public MU lab report, 2025 70/30 mix
   - PDF: https://rimortopsoil.com/wp-content/uploads/2025/11/70-30-for-2025.pdf
   - Why it matters: public one-page University of Missouri Soil Test Report PDF with real lab formatting, suitable for OCR layout stress testing.
   - Fixture posture: committed after explicit approval; parse only as review-required lab/OCR evidence.

3. Ri-Mor Topsoil public MU lab report, 2025 topsoil
   - PDF: https://rimortopsoil.com/wp-content/uploads/2025/11/TS-for-2025.pdf
   - Why it matters: second current public University of Missouri Soil Test Report variant from the same source, useful for checking field/value position drift.
   - Fixture posture: committed after explicit approval; parse only as review-required lab/OCR evidence.

4. Ri-Mor Topsoil public MU lab report, 2014 soil test
   - PDF: https://rimortopsoil.com/wp-content/uploads/2020/09/Soil_Test2014.pdf
   - Why it matters: older University of Missouri Soil Test Report format; useful for backward-compatible OCR/parsing.
   - Fixture posture: committed after explicit approval; parse only as review-required lab/OCR evidence.

5. Ri-Mor Topsoil public MU lab report, 2014 garden grow
   - PDF: https://rimortopsoil.com/wp-content/uploads/2020/09/Garden_Grow2014.pdf
   - Why it matters: another older MU report variant with lawn/garden context; useful for rejecting or labeling non-row-crop reports.
   - Fixture posture: committed after explicit approval; do not let lawn/garden recommendations pollute corn field-trial defaults.

## Committed fixture checksums

```text
6389bd2a2918b6b6f9639cd18959fb2fbfbbcde419a499f268b8053d6b41f546  mu-g09112-interpreting-soil-test-reports.pdf
43ce0f8a0c0abd92ff1a7f03ccd6a6e0a2a2c78e067ee3e0cd71c195539dc037  rimor-2025-70-30.pdf
81dbebb822150e19b18eb25e44912d0aa78e228bcd9712c3d6694084cad69381  rimor-2025-topsoil.pdf
0dfca8da8e40eedbb42910c05e7816915b2c606c8aef6a158488161c30f2a69d  rimor-2014-soil-test.pdf
25a3a3a4fa162049a51a669787b1608c34f2be80d45254e0902a05ed6bcebc2e  rimor-2014-garden-grow.pdf
```

## Next OCR/parser goals

- Keep `reviewRequired` true for Missouri PDF/OCR imports unless a future agronomist-reviewed row-crop fixture explicitly maps to SoilProve's corn nitrogen trial schema.
- Expand parser tests for pH, phosphorus, potassium, organic matter, lime/ENM, sample/report identity, crop/use context, and recommendation rows as more representative reports are approved.
- Preserve the approval rule: no additional third-party PDF bytes are committed without explicit user approval.
