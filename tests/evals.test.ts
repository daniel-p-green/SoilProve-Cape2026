import test from "node:test";
import assert from "node:assert/strict";
import { runOptionalLlmJudge, buildJudgePrompt } from "../evals/llmJudge";
import type { SpecGate } from "../evals/specCoverage";

const gates: SpecGate[] = [
  {
    id: "USER-REALTIME",
    severity: "blocking",
    description: "Realtime voice navigation is configured.",
    ok: true,
    evidence: "gpt-realtime-2 + cedar"
  },
  {
    id: "SOURCE-PACK-ALIGNMENT",
    severity: "advisory",
    description: "Source-pack alignment is explicit.",
    ok: true,
    evidence: "source pack"
  }
];

test("LLM judge prompt names the high-stakes acceptance surface", () => {
  const prompt = buildJudgePrompt({
    gates,
    openItems: [{ id: "LIVE-OEM-PRODUCTION", note: "OEM approval remains external." }]
  });

  assert.equal(prompt.includes("original docs"), true);
  assert.equal(prompt.includes("source-pack judging rubric"), true);
  assert.equal(prompt.includes("gpt-realtime-2"), true);
  assert.equal(prompt.includes("John Deere/CNH/AGCO"), true);
  assert.equal(prompt.includes("unsafe final-prescription claims"), true);
});

test("LLM judge is skipped unless explicitly requested", async () => {
  const oldLive = process.env.SOILPROVE_LIVE_LLM_JUDGE;
  delete process.env.SOILPROVE_LIVE_LLM_JUDGE;
  try {
    const result = await runOptionalLlmJudge({ gates, openItems: [] });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "skipped");
  } finally {
    if (oldLive) process.env.SOILPROVE_LIVE_LLM_JUDGE = oldLive;
  }
});
