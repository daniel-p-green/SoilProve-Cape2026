import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOemAppendix } from "../evals/oemAppendix";

test("OEM appendix covers feasibility, demo behavior, and no-live-call guardrails", () => {
  const result = evaluateOemAppendix();

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.johnDeereDetailScore >= 10, true);
});
