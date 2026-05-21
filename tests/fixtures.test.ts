import test from "node:test";
import assert from "node:assert/strict";
import { canonicalFieldFixtures, canonicalFarms, peerCases } from "../src/fixtures";
import { buildPacket, generatePrescription, signPrescription } from "../src/domain";
import { createVrtBundle } from "../src/vrt";

test("canonical fixtures cover Missouri demo plus IA, IL, and IN corn states", () => {
  const fields = canonicalFieldFixtures();
  const states = new Set(canonicalFarms.map((farm) => farm.state));

  assert.equal(canonicalFarms.length, 11);
  assert.equal(fields.length, 22);
  assert.deepEqual([...states].sort(), ["IA", "IL", "IN", "MO"]);
  assert.equal(fields.every((field) => field.synthetic), true);
  assert.equal(fields.every((field) => field.zones.length >= 3 && field.yieldRecords.length >= 3), true);
  assert.equal(new Set(fields.map((field) => field.oemTarget)).size, 3);
});

test("canonical fixture economics stay inside declared acceptance bands", () => {
  for (const field of canonicalFieldFixtures()) {
    const prescription = generatePrescription(field.profile, field.zones, field.id);
    const weightedRate =
      prescription.recommendations.reduce((sum, rec) => sum + rec.nitrogenLbsPerAcre * rec.acres, 0) / field.profile.acres;
    const [rateMin, rateMax] = field.expected.weightedNitrogenLbsPerAcreBand;
    const [savingsMin, savingsMax] = field.expected.dollarsSavedPerAcreBand;

    assert.equal(weightedRate >= rateMin && weightedRate <= rateMax, true, `${field.id} weighted rate ${weightedRate}`);
    assert.equal(
      prescription.savings.dollarsSavedPerAcre >= savingsMin && prescription.savings.dollarsSavedPerAcre <= savingsMax,
      true,
      `${field.id} savings ${prescription.savings.dollarsSavedPerAcre}`
    );
    assert.equal(prescription.peerSummary.comparableCount, field.expected.peerComparableCount, field.id);
    assert.equal(prescription.peerSummary.medianYield !== null, field.expected.peerMediansVisible, field.id);
  }
});

test("IA, IL, and IN fixtures have aggregate peer cohorts above the privacy threshold", () => {
  for (const state of ["IA", "IL", "IN"] as const) {
    const statePeerCases = peerCases.filter((peer) => peer.state === state);
    const stateFields = canonicalFieldFixtures().filter((field) => field.profile.state === state);

    assert.equal(statePeerCases.length >= 6, true, state);
    assert.equal(statePeerCases.every((peer) => peer.ph !== undefined && peer.organicMatterPct !== undefined), true, state);
    assert.equal(stateFields.length >= 2, true, state);

    for (const field of stateFields) {
      const prescription = generatePrescription(field.profile, field.zones, field.id);
      assert.equal(prescription.peerSummary.comparableCount >= 5, true, field.id);
      assert.equal(prescription.peerSummary.message.includes("no individual"), true, field.id);
      assert.notEqual(prescription.peerSummary.medianYield, null, field.id);
    }
  }
});

test("fixture packets and VRT bundles retain review and export fields", () => {
  const field = canonicalFieldFixtures()[0];
  const prescription = signPrescription(generatePrescription(field.profile, field.zones, field.id), "Fixture review complete.");
  const packet = buildPacket(prescription);
  const vrt = createVrtBundle(prescription);

  assert.equal(packet.markdown.includes("Agronomist review questions"), true);
  assert.equal(packet.markdown.includes("Savings assurance"), true);
  assert.equal(vrt.files.some((file) => file.endsWith(".dbf")), true);
  assert.equal(Buffer.from(vrt.bytes).includes("N_RATE_LBS"), true);
});
