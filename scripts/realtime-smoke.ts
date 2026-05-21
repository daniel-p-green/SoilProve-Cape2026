import assert from "node:assert/strict";
import fs from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/index";
import { resetDatabaseForTests } from "../server/db";
import type { FieldProfile, OemTarget, Prescription, SoilZone } from "../src/domain";
import { canonicalFieldFixtures } from "../src/fixtures";
import { parseSoilReportText } from "../src/ocr";
import { formatRealtimeError } from "../src/realtime";

const actionPlan = [
  "dismiss_onboarding",
  "navigate_workspace",
  "get_soilprove_state",
  "advance_demo_step",
  "load_sample_field",
  "import_sample_soil_report",
  "update_field_profile",
  "confirm_intake_review",
  "generate_prescription",
  "sign_prescription",
  "create_review_packet",
  "download_vrt",
  "send_to_oem",
  "upload_yield_results",
  "run_full_demo_setup",
  "reset_demo_flow"
] as const;

type ActionName = (typeof actionPlan)[number];

type SmokeAction = {
  name: ActionName;
  ok: boolean;
  detail: string;
};

export type RaimondSmokeResult = {
  ok: boolean;
  persona: "Raimond";
  model: string;
  voice: string;
  actions: SmokeAction[];
  fallback: {
    noKeyCode: string;
    microphoneDenied: string;
  };
  guardrails: {
    liveOemCallsBlocked: number;
    actionCount: number;
  };
};

type SmokeState = {
  activeTab: string;
  profile: FieldProfile;
  zones: SoilZone[];
  prescription: Prescription | null;
  cookie: string;
};

export async function runRaimondToolSmoke(): Promise<RaimondSmokeResult> {
  const previousOemEnv = isolateOemCredentials();
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  let liveOemCallsBlocked = 0;
  let server: Server | null = null;

  try {
    resetDatabaseForTests();
    server = createApp().listen(0);
    await onceListening(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    globalThis.fetch = async (input, init) => {
      const url = toUrl(input);
      if (!url.startsWith(baseUrl) && isOemUrl(url)) {
        liveOemCallsBlocked += 1;
        throw new Error(`Live OEM call blocked during Raimond smoke: ${url}`);
      }
      return originalFetch(input, init);
    };

    const health = await getJson<{ realtimePersona: "Raimond"; realtimeModel: string; realtimeVoice: string }>(
      `${baseUrl}/api/health`
    );
    assert.deepEqual(
      { persona: health.realtimePersona, model: health.realtimeModel, voice: health.realtimeVoice },
      { persona: "Raimond", model: "gpt-realtime-2", voice: "cedar" }
    );

    const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
    const cookie = await login(baseUrl);
    const state: SmokeState = {
      activeTab: "intake",
      profile: bootstrap.profile,
      zones: bootstrap.zones,
      prescription: null,
      cookie
    };

    const actions: SmokeAction[] = [];
    actions.push(await runToolAction(baseUrl, state, "dismiss_onboarding", {}));
    actions.push(await runToolAction(baseUrl, state, "navigate_workspace", { tab: "plan" }));
    actions.push(await runToolAction(baseUrl, state, "get_soilprove_state", {}));
    actions.push(await runToolAction(baseUrl, state, "advance_demo_step", { step: "auto" }));
    actions.push(await runToolAction(baseUrl, state, "load_sample_field", { fieldId: "keller_polk_county_ridge_92" }));
    actions.push(await runToolAction(baseUrl, state, "import_sample_soil_report", { reportId: "keller-polk" }));
    actions.push(await runToolAction(baseUrl, state, "update_field_profile", { nitrogenPricePerLb: 0.72, farmName: "Keller Creek", fieldName: "Ridge 92" }));
    actions.push(await runToolAction(baseUrl, state, "confirm_intake_review", {}));
    actions.push(await runToolAction(baseUrl, state, "generate_prescription", {}));
    actions.push(await runToolAction(baseUrl, state, "sign_prescription", { note: "Raimond deterministic smoke signoff." }));
    actions.push(await runToolAction(baseUrl, state, "create_review_packet", {}));
    actions.push(await runToolAction(baseUrl, state, "download_vrt", {}));
    actions.push(await runToolAction(baseUrl, state, "send_to_oem", { target: "john_deere" }));
    actions.push(await runToolAction(baseUrl, state, "upload_yield_results", {}));
    actions.push(await runToolAction(baseUrl, state, "run_full_demo_setup", {}));
    actions.push(await runToolAction(baseUrl, state, "reset_demo_flow", {}));

    delete process.env.OPENAI_API_KEY;
    const noKeyResponse = await fetch(`${baseUrl}/api/realtime/session`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp", Cookie: cookie },
      body: "v=0\r\n"
    });
    const noKeyBody = (await noKeyResponse.json()) as { error: { code: string } };
    assert.equal(noKeyResponse.status, 500);
    assert.equal(noKeyBody.error.code, "OPENAI_NOT_CONFIGURED");

    const microphoneDenied = formatRealtimeError(new DOMException("Denied", "NotAllowedError"));
    assert.equal(microphoneDenied, "Microphone permission was denied. Allow microphone access to use Raimond.");

    assert.deepEqual(
      actions.map((action) => action.name),
      [...actionPlan]
    );
    assert.equal(actions.every((action) => action.ok), true);
    assert.equal(liveOemCallsBlocked, 0);

    return {
      ok: true,
      persona: "Raimond",
      model: health.realtimeModel,
      voice: health.realtimeVoice,
      actions,
      fallback: { noKeyCode: noKeyBody.error.code, microphoneDenied },
      guardrails: { liveOemCallsBlocked, actionCount: actions.length }
    };
  } finally {
    globalThis.fetch = originalFetch;
    restoreOemCredentials(previousOemEnv);
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (server) await closeServer(server);
  }
}

async function runToolAction(baseUrl: string, state: SmokeState, name: ActionName, args: Record<string, unknown>): Promise<SmokeAction> {
  if (name === "dismiss_onboarding") {
    return { name, ok: true, detail: "onboardingVisible=false" };
  }

  if (name === "navigate_workspace") {
    state.activeTab = String(args.tab || "intake");
    assert.equal(state.activeTab, "plan");
    return { name, ok: true, detail: `activeTab=${state.activeTab}` };
  }

  if (name === "get_soilprove_state") {
    assert.equal(Boolean(state.profile.farmName), true);
    return { name, ok: true, detail: `field=${state.profile.farmName}/${state.profile.fieldName}; activeTab=${state.activeTab}` };
  }

  if (name === "advance_demo_step") {
    state.activeTab = "intake";
    return { name, ok: true, detail: "nextStep=intake" };
  }

  if (name === "load_sample_field") {
    const fieldId = String(args.fieldId || "mark_story_county_north_80");
    const fixtures = canonicalFieldFixtures();
    const fixture = fixtures.find((item) => item.id === fieldId) || fixtures[0];
    state.profile = { ...fixture.profile };
    state.zones = fixture.zones.map((zone) => ({ ...zone }));
    state.activeTab = "intake";
    return { name, ok: true, detail: fixture.displayName };
  }

  if (name === "import_sample_soil_report") {
    const reportId = String(args.reportId || "keller-polk");
    const reportPath = path.resolve(process.cwd(), `public/sample-reports/${reportId}-report.txt`);
    const parsed = parseSoilReportText(fs.readFileSync(reportPath, "utf8"), "text");
    state.profile = {
      ...state.profile,
      ...parsed.profilePatch,
      acres: parsed.zones.reduce((sum, zone) => sum + zone.acres, 0) || parsed.profilePatch.acres || state.profile.acres
    };
    if (parsed.zones.length > 0) state.zones = parsed.zones;
    state.activeTab = "intake";
    assert.equal(parsed.zones.length > 0, true);
    return { name, ok: true, detail: `${reportId}:${parsed.confidence}` };
  }

  if (name === "update_field_profile") {
    state.profile = { ...state.profile, ...args };
    assert.equal(state.profile.nitrogenPricePerLb, 0.72);
    assert.equal(state.profile.fieldName, "Ridge 92");
    return { name, ok: true, detail: "field=Ridge 92; nitrogenPricePerLb=0.72" };
  }

  if (name === "confirm_intake_review") {
    state.activeTab = "intake";
    assert.equal(Boolean(state.profile.farmName && state.profile.fieldName), true);
    return { name, ok: true, detail: "reviewed=true" };
  }

  if (name === "generate_prescription") {
    state.prescription = await postJson<Prescription>(
      `${baseUrl}/api/prescriptions`,
      { profile: state.profile, zones: state.zones },
      state.cookie
    );
    assert.equal(state.prescription.status, "draft");
    return { name, ok: true, detail: `prescriptionId=${state.prescription.id}` };
  }

  assert.ok(state.prescription, `${name} requires an active prescription`);

  if (name === "sign_prescription") {
    state.prescription = await postJson<Prescription>(
      `${baseUrl}/api/prescriptions/${state.prescription.id}/signoff`,
      { note: String(args.note || "Reviewed.") },
      state.cookie
    );
    assert.equal(state.prescription.status, "signed");
    return { name, ok: true, detail: `status=${state.prescription.status}` };
  }

  if (name === "create_review_packet") {
    const packet = await postJson<{ title: string; markdown: string }>(
      `${baseUrl}/api/prescriptions/${state.prescription.id}/packet`,
      {},
      state.cookie
    );
    assert.match(packet.markdown, /Agronomist Review Packet/);
    return { name, ok: true, detail: packet.title };
  }

  if (name === "download_vrt") {
    const response = await fetch(`${baseUrl}/api/prescriptions/${state.prescription.id}/vrt`, {
      headers: { Cookie: state.cookie }
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.ok, true);
    assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    return { name, ok: true, detail: `zipBytes=${bytes.length}` };
  }

  if (name === "upload_yield_results") {
    const response = await fetch(
      `${baseUrl}/api/v1/fields/${state.prescription.fieldId}/yield-records?season_year=${state.prescription.profile.seasonYear}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/csv", Cookie: state.cookie },
        body: sampleYieldCsv(state.prescription)
      }
    );
    const body = (await response.json()) as { savings: { dollarsSavedPerAcre: number } };
    assert.equal(response.status, 200);
    assert.equal(body.savings.dollarsSavedPerAcre > 0, true);
    state.activeTab = "dashboard";
    return { name, ok: true, detail: `savings=${body.savings.dollarsSavedPerAcre}` };
  }

  if (name === "run_full_demo_setup") {
    assert.equal(state.profile.farmName, "Keller Creek");
    assert.equal(state.profile.fieldName, "Ridge 92");
    state.activeTab = "dashboard";
    return { name, ok: true, detail: "Keller Creek / Ridge 92 hands-free demo available" };
  }

  if (name === "reset_demo_flow") {
    state.activeTab = "intake";
    state.prescription = null;
    return { name, ok: true, detail: "activeTab=intake" };
  }

  const target = String(args.target || "john_deere") as OemTarget;
  const response = await fetch(`${baseUrl}/api/prescriptions/${state.prescription.id}/oem/${target}`, {
    method: "POST",
    headers: { Cookie: state.cookie }
  });
  const body = (await response.json()) as { result: { mode: string; message: string }; bundle: { files: string[] } };
  assert.equal(response.status, 200);
  assert.equal(body.result.mode, "simulated");
  assert.equal(body.bundle.files.some((file) => file.endsWith(".dbf")), true);
  return { name, ok: true, detail: `${target}:${body.result.mode}` };
}

async function login(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin" })
  });
  assert.equal(response.ok, true);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.equal(Boolean(cookie), true);
  return String(cookie);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  assert.equal(response.ok, true);
  return (await response.json()) as T;
}

async function postJson<T>(url: string, body: unknown, cookie: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true);
  return (await response.json()) as T;
}

function isolateOemCredentials() {
  const names = [
    "JOHN_DEERE_ACCESS_TOKEN",
    "JOHN_DEERE_ORG_ID",
    "JOHN_DEERE_API_BASE",
    "CNH_ACCESS_TOKEN",
    "CNH_COMPANY_ID",
    "CNH_VEHICLE_ID",
    "CNH_SUBSCRIPTION_KEY",
    "CNH_API_BASE",
    "AGCO_ACCESS_TOKEN",
    "AGCO_ENDPOINT_ID",
    "AGCO_TENANT_ID",
    "AGCO_RECIPIENT_ID",
    "AGCO_API_BASE",
    "AGCO_MESSAGE_TYPE"
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  return previous;
}

function restoreOemCredentials(previous: Map<string, string | undefined>) {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function sampleYieldCsv(prescription: Prescription) {
  const rows = prescription.recommendations.map((rec, index) => `${rec.zoneId},${Math.max(1, prescription.profile.threeYearBaselineYield + (index === 0 ? -2 : index === 1 ? 1 : -4))}`);
  return ["zone_id,bushels_per_acre", ...rows].join("\n");
}

function isOemUrl(url: string) {
  return /deere\.com|cnh\.com|agrirouter\.com/.test(url);
}

function toUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function onceListening(server: Server) {
  return new Promise<void>((resolve) => server.once("listening", resolve));
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runRaimondToolSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : error);
      process.exitCode = 1;
    });
}
