import test from "node:test";
import assert from "node:assert/strict";
import { runDocsRequirementsEval } from "../evals/docsRequirements";

test("strict initial-doc eval covers all source documents and reaches controllable-scope closure", () => {
  const report = runDocsRequirementsEval();

  assert.equal(report.sourceDocs.includes("docs/files/SPEC.md"), true);
  assert.equal(report.sourceDocs.includes("docs/files/PROGRESS.md"), true);
  assert.equal(report.sourceDocs.includes("docs/SoilProve Source Pack Combined Markdown - JUDGING RUBRIC.md"), true);
  assert.equal(report.requirements.length >= 25, true);
  assert.equal(report.taskLedger.total, 43);
  assert.equal(report.allRequirementsImplemented, true);
  assert.equal(report.requirements.find((requirement) => requirement.id === "SPEC-001")?.status, "approved_equivalent");
  assert.equal(report.unresolved.some((requirement) => requirement.id === "SPEC-001"), false);
  assert.equal(report.requirements.find((requirement) => requirement.id === "AUTH-ENFORCED")?.status, "implemented");
  assert.equal(report.requirements.find((requirement) => requirement.id === "NO-AUTO-SIGNOFF")?.status, "implemented");
  assert.equal(report.unresolved.some((requirement) => requirement.id === "AUTH-ENFORCED"), false);
  assert.equal(report.unresolved.some((requirement) => requirement.id === "NO-AUTO-SIGNOFF"), false);
  assert.equal(report.requirements.find((requirement) => requirement.id === "SPEC-003")?.status, "implemented");
  assert.equal(report.requirements.find((requirement) => requirement.id === "USER-002")?.status, "implemented");
  assert.equal(report.unresolved.length, 0);
});

test("strict initial-doc eval still credits implemented core domain requirements", () => {
  const report = runDocsRequirementsEval();
  const implementedIds = new Set(report.requirements.filter((requirement) => requirement.status === "implemented").map((requirement) => requirement.id));

  assert.equal(implementedIds.has("DOMAIN-001"), true);
  assert.equal(implementedIds.has("DOMAIN-002"), true);
  assert.equal(implementedIds.has("DOMAIN-006"), true);
  assert.equal(implementedIds.has("USER-004"), true);
  assert.equal(report.counts.approved_equivalent >= 4, true);
});
