import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { realtimeTools } from "../src/domain";
import { createFunctionCallOutput, extractRealtimeToolCalls, formatRealtimeError, RaimondRealtimeClient } from "../src/realtime";
import { buildRealtimeSessionConfig } from "../server/index";

test("Realtime tools cover optional hands-free navigation and execution", () => {
  const names = realtimeTools().map((tool) => tool.name);

  assert.deepEqual(names, [
    "navigate_workspace",
    "get_soilprove_state",
    "answer_soilprove_question",
    "advance_demo_step",
    "dismiss_onboarding",
    "load_sample_field",
    "import_sample_soil_report",
    "update_field_profile",
    "edit_field_value",
    "confirm_intake_review",
    "generate_prescription",
    "sign_prescription",
    "create_review_packet",
    "download_vrt",
    "send_to_oem",
    "upload_yield_results",
    "run_full_demo_setup",
    "reset_demo_flow"
  ]);
});

test("Raimond Realtime session pins model, identity, and cedar voice", () => {
  const config = buildRealtimeSessionConfig("Daniel") as any;

  assert.equal(config.model, "gpt-realtime-2");
  assert.equal(config.audio.output.voice, "cedar");
  assert.match(config.instructions, /Your name is Raimond/);
  assert.match(config.instructions, /Always identify yourself as Raimond/);
  assert.match(config.instructions, /must always use the cedar voice/);
  assert.match(config.instructions, /full SoilProve experience hands-free/);
});

test("Raimond has cursor-equivalent tool coverage for the visible workflow", () => {
  const tools = realtimeTools();
  const names = tools.map((tool) => tool.name);
  const appSource = fs.readFileSync("src/App.tsx", "utf8");
  const serverSource = fs.readFileSync("server/index.ts", "utf8");
  const requiredTabs = ["intake", "plan", "proof", "packet", "exports", "results"];
  const requiredActions = [
    "navigate_workspace",
    "get_soilprove_state",
    "answer_soilprove_question",
    "advance_demo_step",
    "dismiss_onboarding",
    "load_sample_field",
    "import_sample_soil_report",
    "update_field_profile",
    "edit_field_value",
    "confirm_intake_review",
    "generate_prescription",
    "sign_prescription",
    "create_review_packet",
    "download_vrt",
    "send_to_oem",
    "upload_yield_results",
    "run_full_demo_setup",
    "reset_demo_flow"
  ];

  assert.deepEqual(names, requiredActions);
  for (const action of requiredActions) assert.equal(appSource.includes(`action.name === "${action}"`), true, `${action} has an App handler`);
  const navigate = tools.find((tool) => tool.name === "navigate_workspace") as any;
  assert.deepEqual(navigate?.parameters.properties.tab.enum, requiredTabs);
  const updateProfile = tools.find((tool) => tool.name === "update_field_profile") as any;
  for (const field of ["farmName", "farmerName", "agronomistName", "fieldName", "county", "state", "soilType", "acres", "baselineNitrogenLbsPerAcre", "cornPricePerBushel", "nitrogenPricePerLb", "threeYearBaselineYield", "zones"]) {
    assert.equal(Boolean(updateProfile?.parameters.properties[field]), true, `${field} can be edited by Raimond`);
  }
  assert.match(updateProfile.description, /Convert spoken numbers to JSON numbers/);
  assert.match(updateProfile.parameters.properties.nitrogenPricePerLb.description, /72 cents is 0.72/);
  const editField = tools.find((tool) => tool.name === "edit_field_value") as any;
  assert.deepEqual(editField.parameters.required, ["field", "value"]);
  assert.equal(editField.parameters.properties.field.enum.includes("nitrogenPricePerLb"), true);
  const yieldUpload = tools.find((tool) => tool.name === "upload_yield_results") as any;
  assert.equal(Boolean(yieldUpload?.parameters.properties.csv), true, "yield CSV can be supplied by Raimond");
  assert.equal(serverSource.includes("full cursor-equivalent operation"), true);
  assert.equal(serverSource.includes("Do not call value-edit tools with empty arguments when the operator gave numbers"), true);
  assert.equal(serverSource.includes("dismiss onboarding, authenticate or demo login, load or import a soil report"), true);
  assert.equal(serverSource.includes("intake, plan, proof, packet, exports, results"), true);
  for (const line of [
    "Raimond, start the full hands-free SoilProve experience.",
    "Open comparable proof and explain what the privacy threshold allows us to show.",
    "Open exports, download the VRT shapefile ZIP, and send it to John Deere simulation.",
    "Upload sample yield results, open results, and summarize verified savings and remaining audit evidence."
  ]) {
    assert.equal(appSource.includes(line), true, `golden voice script includes: ${line}`);
  }
});

test("Realtime extracts function calls from response.done output", () => {
  const calls = extractRealtimeToolCalls({
    type: "response.done",
    response: { output: [{ type: "function_call", name: "navigate_workspace", call_id: "call-1", arguments: "{\"tab\":\"exports\"}" }] }
  });

  assert.deepEqual(calls, [{ name: "navigate_workspace", callId: "call-1", args: { tab: "exports" } }]);
});

test("Realtime function output serializes tool result only after action completion", () => {
  const event = JSON.parse(createFunctionCallOutput("call-2", { ok: true, status: "signed" })) as {
    item: { type: string; call_id: string; output: string };
  };

  assert.deepEqual({ type: event.item.type, callId: event.item.call_id, output: JSON.parse(event.item.output) }, { type: "function_call_output", callId: "call-2", output: { ok: true, status: "signed" } });
});

test("Realtime maps microphone denial into user-facing copy", () => {
  const message = formatRealtimeError(new DOMException("Denied", "NotAllowedError"));

  assert.equal(message, "Microphone permission was denied. Allow microphone access to use Raimond.");
});

test("Realtime connect can be cancelled while microphone access is pending", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;
  const originalPeerConnection = globalThis.RTCPeerConnection;
  const originalFetch = globalThis.fetch;
  let resolveStream!: (stream: MediaStream) => void;
  let stopped = false;
  let addTrackCalls = 0;
  const statuses: string[] = [];
  const errors: string[] = [];

  class FakePeerConnection {
    ontrack?: (event: { streams: MediaStream[] }) => void;
    createDataChannel() {
      return { addEventListener() {}, close() {}, readyState: "connecting", send() {} };
    }
    addTrack() {
      addTrackCalls += 1;
    }
    async createOffer() {
      return { type: "offer", sdp: "offer-sdp" };
    }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    close() {}
  }

  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true, location: { hostname: "localhost" } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ autoplay: false, srcObject: undefined }) } });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((resolve) => {
            resolveStream = resolve;
          })
      }
    }
  });
  Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: FakePeerConnection });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => new Response("answer-sdp") });

  try {
    const client = new RaimondRealtimeClient({
      onStatus: (status) => statuses.push(status),
      onTranscript: () => {},
      onToolAction: () => ({ ok: true }),
      onError: (message) => errors.push(message)
    });
    const connecting = client.connect();

    client.disconnect();
    resolveStream(({
      getTracks: () => [{ stop: () => (stopped = true) }],
      getAudioTracks: () => [{ kind: "audio" }]
    } as unknown) as MediaStream);
    await connecting;

    assert.equal(addTrackCalls, 0);
    assert.equal(stopped, true);
    assert.deepEqual(errors, []);
    assert.deepEqual(statuses, ["connecting", "idle"]);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
    Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: originalPeerConnection });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
  }
});
