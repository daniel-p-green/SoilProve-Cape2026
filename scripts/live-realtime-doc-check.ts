import WebSocket from "ws";
import { buildRealtimeSessionConfig } from "../server/index";
import { type RealtimeToolCall, createFunctionCallOutput, extractRealtimeToolCalls } from "../src/realtime";

type ToolCheck = {
  name: string;
  called: boolean;
  outputReturned: boolean;
  args: Record<string, unknown>;
  numericArgsOk?: boolean;
};

type CheckResult = {
  ok: boolean;
  model: string;
  voice: string;
  connected: boolean;
  sessionUpdated: boolean;
  toolsChecked: ToolCheck[];
};

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live Realtime doc check.");

const config = buildRealtimeSessionConfig("Codex");
const requestedTools = new Set(
  (process.argv[2] ?? process.env.SOILPROVE_REALTIME_TOOLS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
);
const toolNames = config.tools.map((tool) => tool.name).filter((name) => requestedTools.size === 0 || requestedTools.has(name));
const result: CheckResult = {
  ok: false,
  model: config.model,
  voice: config.audio.output.voice,
  connected: false,
  sessionUpdated: false,
  toolsChecked: []
};

const sampleArgs: Record<string, Record<string, unknown>> = {
  navigate_workspace: { tab: "exports" },
  get_soilprove_state: {},
  answer_soilprove_question: { question: "What is locked before export?" },
  advance_demo_step: { step: "auto" },
  dismiss_onboarding: {},
  load_sample_field: { fieldId: "keller_polk_county_ridge_92" },
  import_sample_soil_report: { reportId: "keller-polk" },
  update_field_profile: {
    farmName: "Keller Creek",
    fieldName: "Ridge 92",
    acres: 92,
    baselineNitrogenLbsPerAcre: 184,
    cornPricePerBushel: 4.85,
    nitrogenPricePerLb: 0.72,
    threeYearBaselineYield: 212
  },
  confirm_intake_review: {},
  generate_prescription: {},
  sign_prescription: { note: "Live Realtime contract check signoff." },
  create_review_packet: {},
  download_vrt: {},
  send_to_oem: { target: "john_deere" },
  upload_yield_results: {},
  run_full_demo_setup: {},
  reset_demo_flow: {}
};

const handledCallIds = new Set<string>();
let currentIndex = -1;
let currentCheck: ToolCheck | null = null;
let awaitingCallDone = false;

const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "OpenAI-Safety-Identifier": "soilprove-live-realtime-all-tools"
  }
});

const timeout = setTimeout(() => fail(new Error("Timed out waiting for live Realtime all-tools check.")), 90_000);

ws.on("open", () => {
  result.connected = true;
  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        ...config,
        output_modalities: ["text"]
      }
    })
  );
});

ws.on("message", (message) => {
  const event = JSON.parse(message.toString()) as Record<string, unknown>;

  if (event.type === "session.updated") {
    result.sessionUpdated = true;
    startNextTool();
    return;
  }

  for (const call of extractRealtimeToolCalls(event)) handleToolCall(call);

  if (event.type === "response.done" && awaitingCallDone && currentCheck?.outputReturned) {
    awaitingCallDone = false;
    result.toolsChecked.push(currentCheck);
    currentCheck = null;
    startNextTool();
    return;
  }

  if (event.type === "error") fail(new Error(JSON.stringify(event)));
});

ws.on("error", fail);

function startNextTool() {
  currentIndex += 1;
  if (currentIndex >= toolNames.length) {
    result.ok =
      result.connected &&
      result.sessionUpdated &&
      result.toolsChecked.length === toolNames.length &&
      result.toolsChecked.every((item) => item.called && item.outputReturned);
    clearTimeout(timeout);
    ws.close();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const name = toolNames[currentIndex];
  currentCheck = { name, called: false, outputReturned: false, args: {} };
  awaitingCallDone = true;

  ws.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              name === "update_field_profile"
                ? "Live numeric edit check. Call update_field_profile exactly once. Set farmName to Keller Creek, fieldName to Ridge 92, acres to 92, baselineNitrogenLbsPerAcre to 184, cornPricePerBushel to 4.85, nitrogenPricePerLb to 0.72, and threeYearBaselineYield to 212."
                : `Live contract check. Call ${name} exactly once with these JSON arguments: ${JSON.stringify(sampleArgs[name] ?? {})}.`
          }
        ]
      }
    })
  );
  ws.send(
    JSON.stringify({
      type: "response.create",
      response: {
        output_modalities: ["text"],
        tools: config.tools.filter((tool) => tool.name === name),
        tool_choice: "required"
      }
    })
  );
}

function handleToolCall(call: RealtimeToolCall) {
  if (!currentCheck || handledCallIds.has(call.callId)) return;
  handledCallIds.add(call.callId);
  if (call.name !== currentCheck.name) {
    fail(new Error(`Expected ${currentCheck.name}, got ${call.name}`));
    return;
  }
  currentCheck.called = true;
  currentCheck.args = call.args;
  if (call.name === "update_field_profile") {
    currentCheck.numericArgsOk =
      typeof call.args.acres === "number" &&
      typeof call.args.baselineNitrogenLbsPerAcre === "number" &&
      typeof call.args.cornPricePerBushel === "number" &&
      typeof call.args.nitrogenPricePerLb === "number" &&
      typeof call.args.threeYearBaselineYield === "number" &&
      call.args.acres === 92 &&
      call.args.baselineNitrogenLbsPerAcre === 184 &&
      call.args.cornPricePerBushel === 4.85 &&
      call.args.nitrogenPricePerLb === 0.72 &&
      call.args.threeYearBaselineYield === 212;
    if (!currentCheck.numericArgsOk) {
      fail(new Error(`update_field_profile did not preserve numeric edit args: ${JSON.stringify(call.args)}`));
      return;
    }
  }
  ws.send(
    createFunctionCallOutput(call.callId, {
      ok: true,
      tool: call.name,
      receivedArgs: call.args,
      message: `${call.name} accepted by live gpt-realtime-2 check.`
    })
  );
  currentCheck.outputReturned = true;
}

function fail(error: Error): never {
  clearTimeout(timeout);
  ws.close();
  console.error(error.message);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
