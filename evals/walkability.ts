import fs from "node:fs";

export function evaluateWalkability() {
  const app = read("src/App.tsx");
  const tests = read("tests/walkability.test.ts");
  const docs = read("docs/goals/soilprove-walkability/goal.md") + read("docs/goals/soilprove-walkability/state.yaml");

  const gates = [
    gate("DEMO-CHECKLIST", app, ["Soil report workflow", "Import or review soil report values.", "Verify yield and savings after export and harvest", "workflow-step"]),
    gate("DECISION-GATE", app, ["Which lab values need review?", "Resolve flagged values", "Review flagged lab values before generating the action plan", "Explain the flagged lab values"]),
    gate("AGRONOMIST-SUPPORT", app, ["Find the nitrogen decision buried in your soil reports.", "Sign in with ChatGPT", "Demo login"]),
    gate("YIELD-UI", app, ["Yield upload", "uploadYieldCsv", "/api/v1/fields/${", "Verified savings"]),
    gate("REALTIME-READINESS", app, ["Realtime readiness", "gpt-realtime-2", "cedar", "lastToolAction", "micPermission", "answerSoilProveQuestion", "update_field_profile"]),
    gate("OCR-REVIEW", app, ["Review required before use", "labFields", "Organic matter", "Phosphorus", "Potassium"]),
    gate("AUDIT-VIEWER", app, ["/api/v1/admin/audit-events", "Audit trail", "auditEvents", "prescription.signoff"]),
    gate("OEM-STATUS", app, ["OEM status", "Live ready", "Credential required", "Simulated"]),
    gate("FULL-DEMO-SETUP", app, ["Run full demo setup", "runFullDemoSetup", "test-admin-operator", "sampleYieldCsv"]),
    gate("WALKABILITY-TESTS", tests + docs, ["walkability surfaces are visible", "7 completed", "Quantified Targets"])
  ];

  return {
    ok: gates.every((item) => item.ok),
    gates
  };
}

function gate(id: string, text: string, snippets: string[]) {
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  return { id, ok: missing.length === 0, missing };
}

function read(file: string) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

if (process.argv[1]?.endsWith("walkability.ts")) {
  const result = evaluateWalkability();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
