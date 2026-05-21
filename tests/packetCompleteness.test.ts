import test from "node:test";
import assert from "node:assert/strict";
import { evaluateJudgePacket } from "../evals/packetCompleteness";

test("judge submission packet includes required sections and evidence references", () => {
  const result = evaluateJudgePacket();

  assert.equal(result.ok, true);
  assert.deepEqual(result.missingSections, []);
  assert.deepEqual(result.missingEvidenceLabels, []);
  assert.equal(result.evidenceReferences >= 6, true);
});
