import test from "node:test";
import assert from "node:assert/strict";
import { buildPacket, clampNitrogenRate, computeSavings, defaultProfile, defaultZones, generatePrescription, signPrescription } from "../src/domain";

test("generates auditable MRTN-style nitrogen recommendations", () => {
  const prescription = generatePrescription(defaultProfile(), defaultZones(), "test-prescription");

  assert.equal(prescription.mrtnInputs.length, 3);
});

test("applies organic matter credit and clamp per zone", () => {
  const prescription = generatePrescription(defaultProfile(), defaultZones(), "test-prescription");

  assert.deepEqual(
    prescription.recommendations.map((rec) => ({ zone: rec.zoneId, rate: rec.nitrogenLbsPerAcre, confidence: rec.confidence })),
    [
      { zone: "Z1", rate: 147, confidence: "high" },
      { zone: "Z2", rate: 130, confidence: "high" },
      { zone: "Z3", rate: 148, confidence: "medium" }
    ]
  );
});

test("zone recommendations expose agronomist rationale and risk caveats", () => {
  const prescription = generatePrescription(defaultProfile(), defaultZones(), "test-prescription");

  assert.equal(
    prescription.recommendations.every(
      (rec) => rec.rationale.includes("MRTN") && rec.rationale.includes("OM credit") && rec.rationale.includes("clamped") && rec.confidenceReason.length > 20 && rec.riskCaveat.length > 20
    ),
    true
  );
});

test("stale soil sample dates downgrade confidence", () => {
  const current = generatePrescription(defaultProfile(), defaultZones().map((zone) => ({ ...zone, sampledAt: new Date().toISOString().slice(0, 10) })), "current-sample");
  const stale = generatePrescription(defaultProfile(), defaultZones().map((zone) => ({ ...zone, sampledAt: "2020-01-01" })), "stale-sample");

  assert.deepEqual(
    { current: current.recommendations[0].confidence, stale: stale.recommendations[0].confidence },
    { current: "high", stale: "medium" }
  );
});

test("rejects soil-zone acres that do not match field acres", () => {
  const zones = defaultZones().map((zone) => ({ ...zone, acres: zone.acres + 10 }));

  assert.throws(() => generatePrescription(defaultProfile(), zones), /Soil-zone acres/);
});

test("rejects controlled vocabulary violations", () => {
  const profile = { ...defaultProfile(), soilType: "prairie_magic" };

  assert.throws(() => generatePrescription(profile, defaultZones()), /controlled vocabulary/);
});

test("clamps corn-after-soybean rates at 200 lb per acre", () => {
  assert.equal(clampNitrogenRate(260, "soybean"), 200);
});

test("clamps corn-on-corn rates at 240 lb per acre", () => {
  assert.equal(clampNitrogenRate(260, "corn"), 240);
});

test("clamps uneconomic rates at zero", () => {
  const profile = { ...defaultProfile(), cornPricePerBushel: 1, nitrogenPricePerLb: 100 };
  const prescription = generatePrescription(profile, defaultZones(), "test-prescription");

  assert.equal(Math.max(...prescription.recommendations.map((rec) => rec.nitrogenLbsPerAcre)), 0);
});

test("comparable field context exposes aggregate medians only", () => {
  const prescription = generatePrescription(defaultProfile(), defaultZones(), "test-prescription");

  assert.equal(prescription.peerSummary.message.includes("no individual"), true);
});

test("insufficient peers hides peer medians", () => {
  const profile = { ...defaultProfile(), county: "Nope" };
  const prescription = generatePrescription(profile, defaultZones(), "test-prescription");

  assert.equal(prescription.peerSummary.comparabilityScore, 0);
});

test("computes guaranteed savings and yield protection trigger", () => {
  const profile = defaultProfile();
  const result = computeSavings(profile, [{ acres: 80, nitrogenLbsPerAcre: 160 }], 204);

  assert.equal(result.guaranteeTriggered, true);
});

test("packet includes guarantee language and agronomist review questions", () => {
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const packet = buildPacket(prescription);

  assert.equal(packet.markdown.includes("$10/acre verified cost savings by Month 6"), true);
});

test("packet includes zone rationale, confidence drivers, and risk caveats", () => {
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const packet = buildPacket(prescription);

  assert.equal(packet.markdown.includes("Confidence driver") && packet.markdown.includes("Risk caveat") && packet.markdown.includes("pre-clamp") && packet.markdown.includes("post-clamp"), true);
});
