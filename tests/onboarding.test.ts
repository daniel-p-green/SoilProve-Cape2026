import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("onboarding wizard explains first-run flow and sample-field activation", () => {
  const source = fs.readFileSync("src/App.tsx", "utf8");

  assert.equal(source.includes("soilprove-onboarding-dismissed"), true);
  assert.equal(source.includes("onboarding-welcome"), true);
  assert.equal(source.includes("Find the nitrogen decision buried in your soil reports."), true);
  assert.equal(source.includes("Sign in with ChatGPT"), true);
  assert.equal(source.includes("Opening ChatGPT sign-in..."), true);
  assert.equal(source.includes("Popup blocked. Allow popups for this local app"), true);
  assert.equal(source.includes("Demo login"), true);
  assert.equal(source.includes("Ask Raimond"), true);
  assert.equal(source.includes("/brand/SoilProve_text-only.svg"), true);
});

test("intake exposes preloaded soil report samples before file upload", () => {
  const source = fs.readFileSync("src/App.tsx", "utf8");

  assert.equal(source.includes("sampleSoilReports"), true);
  assert.equal(source.includes("Demo sample reports"), true);
  assert.equal(source.includes("aria-expanded={showSampleReports}"), true);
  assert.equal(source.includes("/sample-reports/miller-text-layer-report.txt"), true);
  assert.equal(source.includes("/sample-reports/waverly-ocr-report.txt"), true);
  assert.equal(source.includes("/sample-reports/harlan-story-report.txt"), true);
  assert.equal(source.includes("/sample-reports/richter-mclean-report.txt"), true);
  assert.equal(source.includes("/sample-reports/porter-benton-report.txt"), true);
  assert.equal(source.includes("/sample-reports/keller-polk-report.txt"), true);
  assert.equal(source.includes("/sample-reports/nolan-champaign-report.txt"), true);
  assert.equal(source.includes("/sample-reports/rusk-tippecanoe-report.txt"), true);
  assert.equal(source.includes("/sample-reports/missouri-pdfs/rimor-2025-topsoil.pdf"), true);
  assert.equal(source.includes("/sample-reports/missouri-pdfs/rimor-2025-70-30.pdf"), true);
  assert.equal(source.includes("/sample-reports/missouri-pdfs/rimor-2014-soil-test.pdf"), true);
  assert.equal(source.includes("/sample-reports/missouri-pdfs/rimor-2014-garden-grow.pdf"), true);
  assert.equal(source.includes("/sample-reports/missouri-pdfs/mu-g09112-interpreting-soil-test-reports.pdf"), true);
  assert.equal(source.includes("/api/v1/soil-tests/ocr-pdf"), true);
  assert.equal(fs.existsSync("public/sample-reports/miller-text-layer-report.txt"), true);
  assert.equal(fs.existsSync("public/sample-reports/waverly-ocr-report.txt"), true);
  assert.equal(fs.readdirSync("public/sample-reports").filter((name) => name.endsWith(".txt")).length >= 8, true);
  assert.equal(fs.readdirSync("public/sample-reports/missouri-pdfs").filter((name) => name.endsWith(".pdf")).length >= 5, true);
});

test("Raimond mic-denied state falls back to chat without inheriting page error styles", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");

  assert.equal(app.includes("Voice is unavailable in this browser state. Raimond chat can still explain reports and run the workflow."), true);
  assert.equal(app.includes("setRaimondMode(\"chat\")"), true);
  assert.equal(app.includes("className=\"app-error\""), true);
  assert.equal(css.includes(".app-error"), true);
  assert.equal(/^\.error\b/m.test(css), false);
});

test("Raimond navigation tools cannot set an invalid workspace tab", () => {
  const source = fs.readFileSync("src/App.tsx", "utf8");

  assert.equal(source.includes("function normalizeNavigationTab"), true);
  assert.equal(source.includes("availableTabs: tabOrder"), true);
  assert.equal(source.includes("selectTab(nextTab)"), true);
});

test("Raimond panel shows action receipts and next hands-free command", () => {
  const source = fs.readFileSync("src/App.tsx", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");

  assert.equal(source.includes("lastToolReceipt"), true);
  assert.equal(source.includes("toolReceipts"), true);
  assert.equal(source.includes("nextRaimondCommand"), true);
  assert.equal(source.includes("voice-receipt"), true);
  assert.equal(source.includes("Advance the demo step"), true);
  assert.equal(source.includes("Live voice checklist"), true);
  assert.equal(source.includes("Golden voice script"), true);
  assert.equal(source.includes("Download live receipt"), true);
  assert.equal(css.includes(".voice-receipt"), true);
  assert.equal(css.includes(".live-checklist"), true);
  assert.equal(css.includes(".golden-script"), true);
});

test("debug mode exposes a local flow reset without clearing authentication setup", () => {
  const source = fs.readFileSync("src/App.tsx", "utf8");

  assert.equal(source.includes("function resetFlow()"), true);
  assert.equal(source.includes("Debug reset complete. Empty Raimond field is ready."), true);
  assert.equal(source.includes("Reset flow"), true);
  const resetFlowSource = source.slice(source.indexOf("function resetFlow()"), source.indexOf("function dismissOnboarding()"));
  assert.equal(resetFlowSource.includes("setUser(null)"), false);
});
