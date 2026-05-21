import test from "node:test";
import assert from "node:assert/strict";
import { buildPacket, defaultProfile, defaultZones, generatePrescription } from "../src/domain";
import { canonicalFieldFixtures } from "../src/fixtures";
import { buildRegionalSoilContext, parseRegionalInsightCompletion } from "../src/regionalSoil";

test("regional context returns source-labeled context for IA, IL, IN, and MO fixtures", () => {
  const states = new Set<string>();
  for (const fixture of canonicalFieldFixtures()) {
    const prescription = generatePrescription(fixture.profile, fixture.zones, fixture.id);
    const context = buildRegionalSoilContext(prescription);
    states.add(fixture.profile.state);

    assert.equal(context.sources.length >= 2, true, fixture.id);
    assert.equal(context.sources.every((source) => source.label && source.url && source.note), true, fixture.id);
    assert.equal(context.fieldMatch.state, fixture.profile.state, fixture.id);
  }

  assert.deepEqual([...states].sort(), ["IA", "IL", "IN", "MO"]);
});

test("regional context flags low pH, stale samples, and out-of-band organic matter without changing nitrogen rates", () => {
  const profile = defaultProfile();
  const zones = defaultZones().map((zone) => ({
    ...zone,
    ph: zone.zoneId === "Z1" ? 5.2 : zone.ph,
    organicMatterPct: zone.zoneId === "Z2" ? 5.8 : zone.organicMatterPct,
    sampledAt: "2020-01-01"
  }));
  const before = generatePrescription(profile, zones, "before");
  const rates = before.recommendations.map((rec) => rec.nitrogenLbsPerAcre);
  const context = buildRegionalSoilContext(before);
  const after = generatePrescription(profile, zones, "after");

  assert.equal(context.zoneFlags.some((flag) => flag.label.includes("low pH")), true);
  assert.equal(context.zoneFlags.some((flag) => flag.label.includes("organic matter")), true);
  assert.equal(context.zoneFlags.some((flag) => flag.label.includes("stale sample")), true);
  assert.deepEqual(after.recommendations.map((rec) => rec.nitrogenLbsPerAcre), rates);
});

test("regional insight parser keeps GPT output in review-support shape", () => {
  const prescription = generatePrescription(defaultProfile(), defaultZones(), "regional-parser");
  const insight = parseRegionalInsightCompletion(
    JSON.stringify({
      summary: "Reviewed soil context highlights pH and sample recency questions.",
      reviewFlags: ["Z3 pH needs review"],
      agronomistQuestions: ["Should Z3 be refreshed before application?"],
      limitations: ["Public context is not a field-specific lab report."]
    }),
    prescription,
    "openai/gpt-5.5"
  );

  assert.equal(insight.mode, "live");
  assert.equal(insight.model, "openai/gpt-5.5");
  assert.equal(insight.reviewFlags[0].includes("Z3"), true);
});

test("packet includes regional context without unsafe claim language", () => {
  const packet = buildPacket(generatePrescription(defaultProfile(), defaultZones(), "regional-packet"));

  assert.equal(packet.markdown.includes("Regional soil context"), true);
  assert.equal(packet.markdown.includes("GPT insight: not generated; deterministic context included"), true);
  assert.equal(packet.markdown.includes("final prescription"), false);
  assert.equal(packet.markdown.includes("guaranteed yield"), false);
  assert.equal(packet.markdown.includes("replaces agronomist"), false);
});
