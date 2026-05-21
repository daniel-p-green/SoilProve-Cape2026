import WebSocket from "ws";
import { buildRealtimeSessionConfig } from "../server/index";
import { createFunctionCallOutput, extractRealtimeToolCalls } from "../src/realtime";
import { normalizeRaimondFieldProfilePatch } from "../src/raimondTools";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live Realtime numeric edit check.");

const config = buildRealtimeSessionConfig("Codex");
const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "OpenAI-Safety-Identifier": "soilprove-live-numeric-edit-check"
  }
});

const result = {
  ok: false,
  model: config.model,
  voice: config.audio.output.voice,
  toolCalled: false,
  rawArgs: {} as Record<string, unknown>,
  normalizedPatch: {} as Record<string, unknown>
};

const timeout = setTimeout(() => fail(new Error("Timed out waiting for live Realtime numeric edit check.")), 30_000);
const handledCallIds = new Set<string>();

ws.on("open", () => {
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
  if (process.env.SOILPROVE_DEBUG_REALTIME_EVENTS === "1") {
    console.error("EVENT", JSON.stringify(event));
  }
  if (event.type === "session.updated") {
    ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          input: [
            {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Set nitrogen price to 72 cents per pound."
                }
              ]
            }
          ],
          output_modalities: ["text"],
          tools: config.tools.filter((tool) => tool.name === "edit_field_value"),
          tool_choice: "required"
        }
      })
    );
    return;
  }

  for (const call of extractRealtimeToolCalls(event)) {
    if (handledCallIds.has(call.callId)) continue;
    handledCallIds.add(call.callId);
    if (call.name !== "edit_field_value") fail(new Error(`Expected edit_field_value, got ${call.name}`));
    result.toolCalled = true;
    result.rawArgs = call.args;
    result.normalizedPatch = normalizeRaimondFieldProfilePatch({ [String(call.args.field || "")]: call.args.value });
    const ok =
      call.args.field === "nitrogenPricePerLb" &&
      typeof call.args.value === "number" &&
      call.args.value === 0.72 &&
      result.normalizedPatch.nitrogenPricePerLb === 0.72;
    if (!ok) fail(new Error(`Numeric edit mismatch: ${JSON.stringify(result, null, 2)}`));
    ws.send(createFunctionCallOutput(call.callId, { ok: true, updated: result.normalizedPatch }));
  }

  if (event.type === "response.done" && result.toolCalled) {
    result.ok = true;
    clearTimeout(timeout);
    ws.close();
    console.log(JSON.stringify(result, null, 2));
  }
  if (event.type === "error") fail(new Error(JSON.stringify(event)));
});

ws.on("error", fail);

function fail(error: Error): never {
  clearTimeout(timeout);
  ws.close();
  console.error(error.message);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
