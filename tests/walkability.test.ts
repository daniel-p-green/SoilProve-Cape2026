import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateWalkability } from "../evals/walkability";

test("walkability surfaces are visible before design polish", () => {
  const source = fs.readFileSync("src/App.tsx", "utf8");

  for (const expected of [
    "Soil report workflow",
    "Import or review soil report values.",
    "Which lab values need review?",
	    "Resolve flagged values",
    "Review flagged lab values before generating the action plan",
    "Explain the flagged lab values",
    "Find the nitrogen decision buried in your soil reports.",
    "Sign in with ChatGPT",
    "Context",
    "Comparable field context, not field evidence",
    "Results",
    "Yield upload",
    "Realtime readiness",
    "Review required before use",
    "Audit trail",
    "OEM status",
    "Created May 2026",
    "utility-menu",
    "Golden voice script",
    "Minimize Ask Raimond",
    "raimond-launcher",
    "new URLSearchParams(window.location.search).get(\"debug\") === \"1\"",
    "Run full demo setup"
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }
});

test("operator chrome keeps keyboard escape and touch targets accessible", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");

  assert.equal(app.includes("Skip to workspace"), true);
  assert.equal(app.includes("href=\"#workspace-panel\""), true);
  assert.match(css, /\.skip-link\s*\{/);
  assert.match(css, /\.utility-menu > summary\s*\{[\s\S]*?width: 44px;[\s\S]*?min-height: 44px;/);
  assert.match(css, /button\s*\{[\s\S]*?min-height: 44px;/);
  assert.match(css, /\.decision-gate > button\.resolve-action\s*\{/);
});

test("walkability eval is green", () => {
  const result = evaluateWalkability();

  assert.equal(result.ok, true);
});
