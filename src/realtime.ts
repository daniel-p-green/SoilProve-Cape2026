import type { ToolAction } from "./domain";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "error";

export type RealtimeCallbacks = {
  onStatus: (status: RealtimeStatus) => void;
  onTranscript: (speaker: "user" | "assistant" | "system", text: string) => void;
  onToolAction: (action: ToolAction) => unknown | Promise<unknown>;
  onError: (message: string) => void;
};

export type RealtimeToolCall = {
  name: string;
  args: Record<string, unknown>;
  callId: string;
};

type RealtimeEvent = Record<string, unknown> & {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  item?: Record<string, unknown>;
  response?: { output?: Array<Record<string, unknown>> };
};

export class RaimondRealtimeClient {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private stream?: MediaStream;
  private handledCallIds = new Set<string>();
  private connectAttempt = 0;

  constructor(private callbacks: RealtimeCallbacks) {}

  async connect() {
    this.cleanup();
    const attempt = ++this.connectAttempt;
    this.callbacks.onStatus("connecting");
    try {
      assertRealtimeSupported();
      const pc = new RTCPeerConnection();
      const dc = pc.createDataChannel("oai-events");
      this.pc = pc;
      this.dc = dc;
      dc.addEventListener("open", () => {
        if (!this.isActiveConnection(attempt, pc)) return;
        this.callbacks.onStatus("connected");
        this.callbacks.onTranscript("system", "Raimond is listening on gpt-realtime-2 with Cedar.");
      });
      dc.addEventListener("message", (event) => {
        if (!this.isActiveConnection(attempt, pc)) return;
        void this.handleMessage(event.data);
      });

      const audio = document.createElement("audio");
      audio.autoplay = true;
      pc.ontrack = (event) => {
        if (!this.isActiveConnection(attempt, pc)) return;
        audio.srcObject = event.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.isActiveConnection(attempt, pc)) {
        stream.getTracks().forEach((track) => track.stop());
        throw new RealtimeConnectionCancelled();
      }
      this.stream = stream;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) throw new Error("No microphone track was available.");
      pc.addTrack(audioTrack);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch("/api/realtime/session", {
        method: "POST",
        body: offer.sdp,
        headers: { "Content-Type": "application/sdp" }
      });
      if (!response.ok) throw new Error(await response.text());
      const answerSdp = await response.text();
      if (!this.isActiveConnection(attempt, pc)) throw new RealtimeConnectionCancelled();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (error) {
      if (error instanceof RealtimeConnectionCancelled) return;
      this.cleanup(attempt);
      if (!this.isCurrentAttempt(attempt)) return;
      this.callbacks.onStatus("error");
      this.callbacks.onError(formatRealtimeError(error));
    }
  }

  disconnect(status: RealtimeStatus = "idle") {
    this.connectAttempt += 1;
    this.cleanup();
    this.callbacks.onStatus(status);
  }

  sendText(text: string) {
    if (!this.dc || this.dc.readyState !== "open") return false;
    this.dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] }
      })
    );
    this.dc.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["text"] } }));
    this.callbacks.onTranscript("user", text);
    return true;
  }

  private cleanup(attempt?: number) {
    if (attempt !== undefined && !this.isCurrentAttempt(attempt)) return;
    this.dc?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.dc = undefined;
    this.pc = undefined;
    this.stream = undefined;
  }

  private isCurrentAttempt(attempt: number) {
    return attempt === this.connectAttempt;
  }

  private isActiveConnection(attempt: number, pc: RTCPeerConnection) {
    return this.isCurrentAttempt(attempt) && this.pc === pc;
  }

  private async handleMessage(raw: string) {
    try {
      const event = JSON.parse(raw) as RealtimeEvent;
      this.captureTranscript(event);
      await this.captureToolCalls(event);
    } catch {
      this.callbacks.onTranscript("system", "Received an unreadable Realtime event.");
    }
  }

  private captureTranscript(event: RealtimeEvent) {
    const type = String(event.type ?? "");
    const transcript =
      event.transcript ??
      event.delta ??
      (event.item && typeof event.item === "object" ? event.item.transcript : undefined);
    if (typeof transcript !== "string" || !transcript.trim()) return;
    if (type.includes("input_audio")) this.callbacks.onTranscript("user", transcript);
    if (type.includes("response.audio_transcript") || type.includes("response.output_text") || type.includes("response.text")) this.callbacks.onTranscript("assistant", transcript);
  }

  private async captureToolCalls(event: RealtimeEvent) {
    for (const call of extractRealtimeToolCalls(event)) {
      if (this.handledCallIds.has(call.callId)) continue;
      this.handledCallIds.add(call.callId);
      let result: unknown;
      try {
        result = await this.callbacks.onToolAction({ name: call.name, args: call.args });
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : "Tool action failed." };
      }
      if (this.dc?.readyState === "open") {
        this.dc.send(createFunctionCallOutput(call.callId, result ?? { ok: true }));
        this.dc.send(JSON.stringify({ type: "response.create" }));
      }
    }
  }
}

class RealtimeConnectionCancelled extends Error {
  constructor() {
    super("Raimond connection was cancelled.");
  }
}

export function extractRealtimeToolCalls(event: RealtimeEvent): RealtimeToolCall[] {
  const calls: RealtimeToolCall[] = [];
  if (event.type === "response.function_call_arguments.done" && typeof event.name === "string" && typeof event.call_id === "string") {
    calls.push({ name: event.name, args: parseArgs(event.arguments), callId: event.call_id });
  }
  if (
    event.item?.type === "function_call" &&
    (event.item.status === "completed" || typeof event.item.arguments === "string" && event.item.arguments.trim().length > 0) &&
    typeof event.item.name === "string" &&
    typeof event.item.call_id === "string"
  ) {
    calls.push({ name: event.item.name, args: parseArgs(event.item.arguments), callId: event.item.call_id });
  }
  if (event.type === "response.done" && Array.isArray(event.response?.output)) {
    for (const output of event.response.output) {
      if (output.type === "function_call" && typeof output.name === "string" && typeof output.call_id === "string") {
        calls.push({ name: output.name, args: parseArgs(output.arguments), callId: output.call_id });
      }
    }
  }
  return calls;
}

export function createFunctionCallOutput(callId: string, output: unknown) {
  return JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(output)
    }
  });
}

export function formatRealtimeError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Microphone permission was denied. Allow microphone access to use Raimond.";
    if (error.name === "NotFoundError") return "No microphone was found. Connect a microphone to use Raimond.";
    if (error.name === "NotReadableError") return "The microphone is already in use by another app.";
  }
  const message = error instanceof Error ? error.message : "Unable to start Raimond.";
  if (message.includes("OPENAI_API_KEY")) return "OpenAI Realtime is not configured on this machine. Set OPENAI_API_KEY to use Raimond.";
  return message;
}

function assertRealtimeSupported() {
  if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    throw new Error("Raimond requires HTTPS or localhost for microphone access.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not expose microphone capture.");
  }
}

function parseArgs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
