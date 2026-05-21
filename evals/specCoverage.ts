import fs from "node:fs";
import { buildRealtimeSessionConfig } from "../server/index";
import { buildPacket, computeSavingsFromYieldRecord, defaultProfile, defaultZones, generatePrescription, realtimeTools, signPrescription } from "../src/domain";
import { canonicalFieldFixtures, canonicalFarms, peerCases } from "../src/fixtures";
import { sendOemExport } from "../src/oem";
import { parseSoilReportText } from "../src/ocr";
import { createVrtBundle } from "../src/vrt";

export type GateSeverity = "blocking" | "advisory";

export type SpecGate = {
  id: string;
  severity: GateSeverity;
  description: string;
  ok: boolean;
  evidence: string;
};

export type TraceabilityReport = {
  gates: SpecGate[];
  openItems: Array<{ id: string; note: string }>;
};

export async function runSpecCoverage(): Promise<TraceabilityReport> {
  const sourcePack = read("docs/SoilProve Source Pack Combined Markdown - JUDGING RUBRIC.md");
  const spec = read("docs/files/SPEC.md");
  const progress = read("docs/files/PROGRESS.md");
  const addendum = read("docs/files/SPEC_ADDENDUM_TONIGHT.md");
  const agents = read("AGENTS.md");
  const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const appSource = read("src/App.tsx");
  const dbSource = read("server/db.ts");
  const serverSource = read("server/index.ts");
  const realtimeSource = read("src/realtime.ts");
  const oemSource = read("src/oem.ts");
  const oemDoc = read("docs/oem-integration-feasibility.md");
  const importFixtureNames = fs.existsSync("tests/fixtures/imports") ? fs.readdirSync("tests/fixtures/imports") : [];
  const profile = defaultProfile();
  const zones = defaultZones();
  const signed = signPrescription(generatePrescription(profile, zones, "eval-prescription"), "Reviewed.");
  const packet = buildPacket(signed);
  const bundle = createVrtBundle(signed);
  const realtime = buildRealtimeSessionConfig();
  const soilImport = parseSoilReportText(`Farm: Miller Farm
Field: North 80
County: Boone
State: MO
Acres: 80
Soil Type: silt loam
Z1,24,3.1,6.4,42,235
Z2,31,4.8,6.7,36,210
Z3,25,2.2,5.7,28,188`);
  const savingsFromHarvest = computeSavingsFromYieldRecord(profile, signed.recommendations, {
    fieldId: signed.fieldId,
    seasonYear: 2026,
    harvestedOn: "2026-10-18",
    zones: signed.recommendations.map((rec) => ({ zoneId: rec.zoneId, bushelsPerAcre: profile.threeYearBaselineYield - 7 }))
  });
  const oemResults = await withOemEnvCleared(async () =>
    Promise.all([sendOemExport("john_deere", signed, bundle), sendOemExport("case_ih", signed, bundle), sendOemExport("agco", signed, bundle)])
  );
  const cornBeltPeerFields = canonicalFieldFixtures().filter((field) => ["IA", "IL", "IN"].includes(field.profile.state));
  const cornBeltPeerSummaries = cornBeltPeerFields.map((field) => generatePrescription(field.profile, field.zones, field.id).peerSummary);

  const gates = [
    gate("DOC-SOURCE-FLOOR", "blocking", "Original docs and judge source pack are present and treated as minimum requirements.", spec.includes("Task ledger") && progress.toLowerCase().includes("loop log") && sourcePack.includes("Feasibility Validation Report") && agents.includes("original documents are the floor"), "docs/files/SPEC.md + docs/files/PROGRESS.md + source pack + AGENTS.md"),
    gate("SPEC-SCRIPTS", "blocking", "Executable verification scripts exist for test/evals/lint/build/ci plus optional live judge.", ["test", "evals", "evals:live", "lint", "build", "ci"].every((key) => Boolean(packageJson.scripts[key])), "package.json scripts"),
    gate("SPEC-FIXTURES", "blocking", "Canonical seed set covers Missouri demo fields plus expanded IA, IL, and IN corn fixtures with soil tests and yield records.", canonicalFarms.length >= 11 && canonicalFieldFixtures().length >= 22 && ["IA", "IL", "IN", "MO"].every((state) => canonicalFarms.some((farm) => farm.state === state)) && canonicalFieldFixtures().every((field) => field.zones.length >= 3 && field.yieldRecords.length >= 3 && field.synthetic), "src/fixtures.ts canonicalFarms"),
    gate("SPEC-MRTN", "blocking", "MRTN-style domain model produces zone recommendations, confidence, clamp, and audit inputs.", signed.recommendations.length === zones.length && signed.mrtnInputs.every((audit) => typeof audit.preClamp === "number" && typeof audit.postClamp === "number"), "generatePrescription"),
    gate("AGRONOMIST-TRUST", "blocking", "Every zone exposes agronomist-readable rationale, confidence driver, risk caveat, and review-meeting prep in the action plan and packet.", signed.recommendations.every((rec) => rec.rationale.includes("MRTN") && rec.confidenceReason.includes("confidence") && rec.riskCaveat.includes("agronomist")) && packet.markdown.includes("Zone rationale") && packet.markdown.includes("Confidence driver") && packet.markdown.includes("Risk caveat") && packet.markdown.includes("better agronomist meetings"), "ZoneRecommendation rationale + buildPacket"),
    gate("SPEC-VALIDATION", "blocking", "State, soil type, crop, price, and zone-acre validations are implemented, including Missouri challenge fixtures.", ["State must be IA", "controlled vocabulary", "Soil-zone acres"].every((snippet) => read("src/domain.ts").includes(snippet)), "validateProfile"),
    gate("SPEC-PEER-PRIVACY", "blocking", "Comparable-field medians require at least 5 comparable fields and expose aggregate values only.", signed.peerSummary.comparableCount >= 5 && signed.peerSummary.message.includes("no individual") && cornBeltPeerFields.length >= 6 && ["IA", "IL", "IN"].every((state) => peerCases.filter((peer) => peer.state === state).length >= 6) && cornBeltPeerSummaries.every((peer) => peer.comparableCount >= 5 && peer.medianYield !== null && peer.message.includes("no individual")) && generatePrescription({ ...profile, county: "Lafayette", state: "MO", soilType: "loam" }, zones, "thin").peerSummary.medianYield === null, "summarizePeers privacy threshold + src/fixtures.ts peerCases"),
    gate("SPEC-SAVINGS", "blocking", "Savings, breakeven drag, and guarantee-trigger harvest logic are computed from yield records.", signed.savings.dollarsSavedPerAcre > 0 && signed.savings.breakevenYieldDragBuPerAcre > 0 && savingsFromHarvest.guaranteeTriggered, "computeSavingsFromYieldRecord"),
    gate("SPEC-DB", "blocking", "SQLite schema explicitly persists users, farms, fields, soil tests, yield records, prescriptions, packets, and exports.", ["CREATE TABLE IF NOT EXISTS users", "farms", "fields", "soil_tests", "yield_records", "prescriptions", "packets", "exports"].every((snippet) => dbSource.includes(snippet)), "server/db.ts schema"),
    gate("SPEC-VRT", "blocking", "Real shapefile ZIP exports .shp, .shx, .dbf, .prj and DBF field N_RATE_LBS.", bundle.files.length === 4 && [".shp", ".shx", ".dbf", ".prj"].every((ext) => bundle.files.some((file) => file.endsWith(ext))) && Buffer.from(bundle.bytes).includes("N_RATE_LBS"), "createVrtBundle"),
    gate("USER-AUTH-CODEX", "blocking", "Codex app-server login endpoints support the public ChatGPT path with no farmer API-key setup.", serverSource.includes("/api/codex/login/start") && serverSource.includes("requireLocalCodexAccess") && serverSource.includes("127.0.0.1") && appSource.includes("Sign in") && appSource.includes("Demo login"), "server/index.ts Codex routes + app sign-in copy"),
    gate("USER-REALTIME", "blocking", "Raimond uses gpt-realtime-2, Cedar, execution tools, async tool outputs, and bounded soil-report second-opinion language.", realtime.model === "gpt-realtime-2" && realtime.audio.output.voice === "cedar" && realtime.instructions.includes("Never call the plan final") && realtime.instructions.includes("get_soilprove_state") && realtime.instructions.includes("answer_soilprove_question") && realtime.instructions.includes("full cursor-equivalent operation") && realtime.instructions.includes("foundational lab-value questions") && realtimeSource.includes("await this.callbacks.onToolAction") && realtimeSource.includes("handledCallIds"), "Realtime server/client contract"),
    gate("USER-OCR", "blocking", "Onboarding includes PDF/text soil-report import into editable intake with review warnings.", appSource.includes("First-run operator console") && appSource.includes("Soil report import") && soilImport.zones.length === 3 && soilImport.confidence === "high", "src/App.tsx + src/ocr.ts"),
    gate("IMPORT-FIXTURES", "blocking", "Realistic import fixture pack covers soil CSV, yield CSV, text-layer PDF substitute, and OCR-style report substitute.", importFixtureNames.filter((name) => name.endsWith("-soil.csv")).length >= 2 && importFixtureNames.filter((name) => name.endsWith("-yield.csv")).length >= 2 && importFixtureNames.some((name) => name.includes("text-layer") && name.includes("pdf")) && importFixtureNames.some((name) => name.includes("ocr")), "tests/fixtures/imports"),
    gate("USER-OEM", "blocking", "OEM posture is honest: John Deere simulation/live, CNH credential-gated, AGCO agrirouter headers/routing-gated.", oemResults[0].mode === "simulated" && oemResults[1].mode === "credential_required" && oemResults[2].mode === "credential_required" && oemSource.includes("x-agrirouter-message-type") && oemDoc.includes("without OEM developer/app access"), "src/oem.ts + docs/oem-integration-feasibility.md"),
    gate("USER-BRAND", "blocking", "Brand assets are wired into the app.", appSource.includes("/brand/SOILPROVE-MARK-TRANSP.svg") && appSource.includes("/brand/SoilProve_text-only.svg"), "src/App.tsx brand refs"),
    gate("USER-PACKET", "blocking", "Agronomist packet includes savings assurance, economics, aggregate comparable context, review questions, and auditable plan language.", packet.markdown.includes("Savings assurance") && packet.markdown.includes("Economics") && packet.markdown.includes("Comparable field context") && packet.markdown.includes("Only aggregate medians are shown") && packet.markdown.includes("Agronomist review questions"), "buildPacket"),
    gate("SOIL-REPORT-STORY", "blocking", "Public copy and app flow state the soil report second-opinion story and agronomist-preparation value.", appSource.includes("Soil report second opinion") && appSource.includes("Better agronomist meetings, not fewer meetings") && read("README.md").includes("Raimond answers farmers' basic soil-report questions anytime"), "README.md + src/App.tsx"),
    gate("OPENROUTER-DEMO-INSIGHT", "blocking", "OpenRouter remains optional demo/review insight rather than the farmer-facing billing path.", appSource.includes("Generate live review insight") && serverSource.includes("optional demo review insight") && read("README.md").includes("optional demo/review insight"), "src/App.tsx + server/index.ts + README.md"),
    gate("VOICE-TOOLS", "blocking", "Voice tools cover full cursor-equivalent operation: navigation, grounded Q&A, intake edits, review gates, generation, signoff, packet, VRT, OEM, yield, setup, and reset.", ["navigate_workspace", "get_soilprove_state", "answer_soilprove_question", "advance_demo_step", "dismiss_onboarding", "load_sample_field", "import_sample_soil_report", "update_field_profile", "confirm_intake_review", "generate_prescription", "sign_prescription", "create_review_packet", "download_vrt", "send_to_oem", "upload_yield_results", "run_full_demo_setup", "reset_demo_flow"].every((name) => realtimeTools().map((tool) => tool.name).includes(name)), "realtimeTools"),
    gate("CLAIMS-SAFETY", "blocking", "Public app copy avoids final/autonomous/replacement claims while retaining savings assurance as an offer.", !appSource.includes("Guaranteed savings, peer proof, and OEM-ready nitrogen prescriptions") && !appSource.includes("reduces agronomist need") && !appSource.includes("replace basic agronomist") && !realtime.instructions.includes("final prescription"), "src/App.tsx + Realtime instructions"),
    gate("SOURCE-PACK-ALIGNMENT", "advisory", "Source-pack high-risk themes are explicitly reflected: VRT complexity, outcome tracking, agronomist partnerships, and hands-on onboarding.", ["VRT API complexity", "outcome tracking", "agronomist", "hands-on onboarding"].every((snippet) => sourcePack.toLowerCase().includes(snippet.toLowerCase()) || addendum.toLowerCase().includes(snippet.toLowerCase()) || appSource.toLowerCase().includes(snippet.toLowerCase())), "source pack + app/addendum")
  ];

  return {
    gates,
    openItems: [
      { id: "LIVE-CODEX", note: "Codex app-server live login requires local app-server process and user browser authentication; deterministic tests cover local guard and unavailable fallback." },
      { id: "LIVE-OPENAI-REALTIME", note: "Realtime WebRTC requires OPENAI_API_KEY and browser microphone permission; deterministic tests cover model/session/tool contracts." },
      { id: "LIVE-OEM-PRODUCTION", note: "Production OEM write-back requires OEM app/customer authorization; John Deere simulation is used when credentials are absent." }
    ]
  };
}

function gate(id: string, severity: GateSeverity, description: string, ok: boolean, evidence: string): SpecGate {
  return { id, severity, description, ok, evidence };
}

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

async function withOemEnvCleared<T>(fn: () => Promise<T>) {
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("JOHN_DEERE_") || key.startsWith("CNH_") || key.startsWith("AGCO_")) delete process.env[key];
  }
  try {
    return await fn();
  } finally {
    process.env = saved;
  }
}
