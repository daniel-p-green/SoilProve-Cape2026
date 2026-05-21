import WebSocket from "ws";
import { buildRealtimeSessionConfig } from "../server/index";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live Realtime identity check.");

const config = buildRealtimeSessionConfig("Codex");
const result = {
  ok: false,
  model: config.model,
  voice: config.audio.output.voice,
  connected: false,
  sessionUpdated: false,
  text: ""
};

const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "OpenAI-Safety-Identifier": "soilprove-live-realtime-identity-check"
  }
});

const timeout = setTimeout(() => fail(new Error("Timed out waiting for live Realtime identity check.")), 30_000);

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
  const event = JSON.parse(message.toString()) as Record<string, any>;

  if (event.type === "session.updated") {
    result.sessionUpdated = true;
    ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          input: [
            {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "What is your name, and what voice should you always use?" }]
            }
          ],
          output_modalities: ["text"],
          tools: [],
          tool_choice: "none"
        }
      })
    );
    return;
  }

  if (event.type === "response.text.delta" || event.type === "response.output_text.delta") {
    result.text += String(event.delta ?? "");
  }

  if (event.type === "response.done") {
    result.text += extractDoneText(event);
    result.text = result.text.trim();
    result.ok =
      result.connected &&
      result.sessionUpdated &&
      result.model === "gpt-realtime-2" &&
      result.voice === "cedar" &&
      /\bRaimond\b/i.test(result.text) &&
      /\bcedar\b/i.test(result.text);
    clearTimeout(timeout);
    ws.close();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  }

  if (event.type === "error") fail(new Error(JSON.stringify(event)));
});

ws.on("error", fail);

function extractDoneText(event: Record<string, any>) {
  const chunks: string[] = [];
  for (const item of event.response?.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.transcript === "string") chunks.push(content.transcript);
    }
  }
  return chunks.join(" ");
}

function fail(error: Error): never {
  clearTimeout(timeout);
  ws.close();
  console.error(error.message);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
