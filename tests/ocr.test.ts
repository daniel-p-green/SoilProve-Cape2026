import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSoilCsvText, parseSoilReportFile, parseSoilReportText, parseYieldCsvText } from "../src/ocr";

const fixtureDir = new URL("./fixtures/imports/", import.meta.url);
const sampleReportDir = new URL("../public/sample-reports/", import.meta.url);

test("soil report import extracts profile fields and editable zone rows", () => {
  const result = parseSoilReportText(`
Farm: Miller Farm
Farmer: Mark Miller
Field: North 80
County: Boone
State: MO
Acres: 80
Soil Type: silt loam
Z1,24,3.1,6.4,42,235
Z2,31,4.8,6.7,36,210
Z3,25,2.2,5.7,28,188
`);

  assert.deepEqual(
    { confidence: result.confidence, farmName: result.profilePatch.farmName, fieldName: result.profilePatch.fieldName, soilType: result.profilePatch.soilType, zones: result.zones.length, acres: result.zones.reduce((sum, zone) => sum + zone.acres, 0) },
    { confidence: "high", farmName: "Miller Farm", fieldName: "North 80", soilType: "silt_loam", zones: 3, acres: 80 }
  );
});

test("soil report import flags image-only PDF style input for manual review", () => {
  const result = parseSoilReportText("%PDF-1.7\n/Filter /DCTDecode\nstream\nbinary-image-data", "pdf");

  assert.equal(result.confidence === "low" && result.warnings.some((warning) => warning.includes("image-only")), true);
});

test("binary PDF fallback does not expose Ghostscript internals as extracted text", async () => {
  const file = new File(
    [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n%%Invocation: gs -sDEVICE=pdfwrite\n5 0 obj\n<</Length 12>>\nstream\nbinary-data\nendstream")],
    "ghostscript-output.pdf",
    { type: "application/pdf" }
  );
  const result = await parseSoilReportFile(file);

  assert.equal(result.extractedTextPreview.includes("%PDF-1.4"), false);
  assert.equal(result.extractedTextPreview.includes("%%Invocation: gs"), false);
  assert.equal(result.warnings.some((warning) => warning.includes("image-only")), true);
});

test("soil CSV import requires exact headers and valid zone ranges", () => {
  const result = parseSoilCsvText(
    [
      "zone_id,acres,organic_matter_pct,ph,phosphorus_ppm,potassium_ppm,polygon_wkt",
      "Z1,24,3.1,6.4,42,235,POLYGON((0 0,24 0,24 12,0 12,0 0))",
      "Z2,31,4.8,6.7,36,210,POLYGON((24 0,52 0,52 14,24 14,24 0))",
      "Z3,25,2.2,5.7,28,188,POLYGON((0 12,52 12,52 28,0 28,0 12))"
    ].join("\n"),
    80
  );

  assert.equal(result.zones.length, 3);
  assert.equal(result.zones.reduce((sum, zone) => sum + zone.acres, 0), 80);
  assert.throws(() => parseSoilCsvText("zone,acres\nZ1,10"), /expected header/);
  assert.throws(
    () =>
      parseSoilCsvText(
        [
          "zone_id,acres,organic_matter_pct,ph,phosphorus_ppm,potassium_ppm,polygon_wkt",
          "Z1,24,30,6.4,42,235,POLYGON((0 0,1 0,1 1,0 1,0 0))"
        ].join("\n")
      ),
    /organic_matter_pct/
  );
});

test("yield CSV import requires exact headers and valid zone yields", () => {
  const record = parseYieldCsvText("zone_id,bushels_per_acre\nZ1,211\nZ2,207", "field-1", 2026);

  assert.deepEqual(record.zones.map((zone) => zone.zoneId), ["Z1", "Z2"]);
  assert.throws(() => parseYieldCsvText("zone,bushels\nZ1,211", "field-1", 2026), /expected header/);
  assert.throws(() => parseYieldCsvText("zone_id,bushels_per_acre\nZ1,500", "field-1", 2026), /0-400/);
});

test("realistic import fixtures cover soil CSV, yield CSV, text-layer PDF, and OCR-style report", () => {
  const soilFixtures = [
    { file: "miller-north-80-soil.csv", acres: 80 },
    { file: "waverly-east-64-soil.csv", acres: 64 }
  ];
  const yieldFixtures = [
    { file: "miller-north-80-yield.csv", fieldId: "miller-farm-north-80" },
    { file: "waverly-east-64-yield.csv", fieldId: "waverly-ridge-east-64" }
  ];

  for (const fixture of soilFixtures) {
    const result = parseSoilCsvText(readFixture(fixture.file), fixture.acres);
    assert.equal(result.zones.length, 3);
    assert.equal(result.zones.reduce((sum, zone) => sum + zone.acres, 0), fixture.acres);
  }

  for (const fixture of yieldFixtures) {
    const record = parseYieldCsvText(readFixture(fixture.file), fixture.fieldId, 2026);
    assert.equal(record.zones.length, 3);
  }

  const textLayer = parseSoilReportText(readFixture("miller-text-layer-report.pdf.txt"), "pdf");
  const ocrStyle = parseSoilReportText(readFixture("waverly-ocr-report.txt"), "text");

  assert.equal(importAccuracy(textLayer, { farmName: "Miller Farm", farmerName: "Mark Miller", fieldName: "North 80", county: "Boone", state: "MO", acres: 80, soilType: "silt_loam", zones: 3 }), 1);
  assert.equal(textLayer.labFields, undefined);
  assert.equal(importAccuracy(ocrStyle, { farmName: "Waverly Ridge", farmerName: "Erin Waverly", fieldName: "East 64", county: "Callaway", state: "MO", acres: 64, soilType: "clay_loam", zones: 3 }) >= 0.9, true);
});

test("preloaded sample report library parses into editable intake rows", () => {
  const reports = fs.readdirSync(sampleReportDir).filter((name) => name.endsWith(".txt"));

  assert.equal(reports.length >= 8, true);
  for (const report of reports) {
    const result = parseSoilReportText(fs.readFileSync(new URL(report, sampleReportDir), "utf8"), report.includes("pdf") ? "pdf" : "text");
    assert.equal(result.zones.length >= 3, true, report);
    assert.equal(result.profilePatch.farmName !== undefined, true, report);
    assert.equal(result.profilePatch.state !== undefined, true, report);
    assert.equal(result.confidence !== "low", true, report);
  }
});

function readFixture(name: string) {
  return fs.readFileSync(new URL(name, fixtureDir), "utf8");
}

function importAccuracy(
  result: ReturnType<typeof parseSoilReportText>,
  expected: { farmName: string; farmerName: string; fieldName: string; county: string; state: string; acres: number; soilType: string; zones: number }
) {
  const checks = [
    result.profilePatch.farmName === expected.farmName,
    result.profilePatch.farmerName === expected.farmerName,
    result.profilePatch.fieldName === expected.fieldName,
    result.profilePatch.county === expected.county,
    result.profilePatch.state === expected.state,
    result.profilePatch.acres === expected.acres,
    result.profilePatch.soilType === expected.soilType,
    result.zones.length === expected.zones,
    result.zones.every((zone) => zone.zoneId && zone.acres > 0 && zone.organicMatterPct > 0),
    result.confidence !== "low"
  ];
  return checks.filter(Boolean).length / checks.length;
}
