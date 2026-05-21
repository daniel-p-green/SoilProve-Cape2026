import "../server/env";
import { runOptionalLlmJudge } from "./llmJudge";
import { runSpecCoverage } from "./specCoverage";

const coverage = await runSpecCoverage();
const failedBlocking = coverage.gates.filter((gate) => gate.severity === "blocking" && !gate.ok);
const failedAdvisory = coverage.gates.filter((gate) => gate.severity === "advisory" && !gate.ok);
const judge = await runOptionalLlmJudge({
  gates: coverage.gates,
  openItems: coverage.openItems
});
const report = {
  ok: failedBlocking.length === 0 && judge.ok,
  passedBlocking: coverage.gates.filter((gate) => gate.severity === "blocking" && gate.ok).length,
  failedBlocking: failedBlocking.length,
  failedAdvisory: failedAdvisory.length,
  liveOpenRouterAvailable: Boolean(process.env.OPENROUTER_API_KEY),
  liveJudge: judge,
  gates: coverage.gates,
  openItems: coverage.openItems
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
