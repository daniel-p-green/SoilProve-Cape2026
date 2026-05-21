import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import type {
  CodexCancelLoginAccountParams,
  CodexGetAccountRateLimitsResponse,
  CodexGetAccountResponse,
  CodexLoginAccountParams,
  CodexLoginAccountResponse,
  CodexRateLimitSnapshot
} from "./codexAppServerProtocol";

type JsonObject = Record<string, unknown>;
type JsonRpcMessage = { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } };
type PendingRequest = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export type CodexAuthState = "not_running" | "token_missing" | "login_required" | "ready" | "limited" | "error";
export type CodexLoginStatus = "pending" | "completed" | "failed" | "expired" | "cancelled";
export type CodexLoginSessionView = {
  loginId: string;
  authUrl: string;
  status: CodexLoginStatus;
  success: boolean | null;
  error: string | null;
  account: JsonObject | null;
  startedAt: string;
  completedAt: string | null;
};

type CodexLoginSession = CodexLoginSessionView & {
  client: CodexAppServerClient;
  timeout: NodeJS.Timeout;
};
type CodexRateLimitView = {
  limited: boolean;
  reachedType: string | null;
  planType: string | null;
  primaryUsedPercent: number | null;
  secondaryUsedPercent: number | null;
  resetsAt: number | null;
};

const codexAppServerUrl = process.env.CODEX_APP_SERVER_URL || "ws://127.0.0.1:28787";
const codexTokenFile = process.env.CODEX_APP_SERVER_TOKEN_FILE || ".codex-app-server-token";
const requestTimeoutMs = Number(process.env.CODEX_APP_SERVER_TIMEOUT_MS || 45_000);
const terminalSessionTtlMs = Number(process.env.CODEX_LOGIN_TERMINAL_TTL_MS || 60_000);
const loginSessions = new Map<string, CodexLoginSession>();

export function getCodexAppServerConfig() {
  const token = readToken();
  return {
    url: codexAppServerUrl,
    tokenConfigured: Boolean(token),
    authState: token ? "not_running" : "token_missing"
  };
}

export async function getCodexAppServerStatus() {
  const tokenConfigured = Boolean(readToken());
  if (!tokenConfigured) {
    return {
      available: false,
      url: codexAppServerUrl,
      tokenConfigured,
      authState: "token_missing" as CodexAuthState,
      account: null,
      rateLimits: null,
      requiresOpenaiAuth: true,
      error: `Codex app-server token is missing. Start it with npm run codex:server to create ${codexTokenFile}.`
    };
  }

  const ready = await isReady();
  if (!ready) {
    return {
      available: false,
      url: codexAppServerUrl,
      tokenConfigured,
      authState: "not_running" as CodexAuthState,
      account: null,
      rateLimits: null,
      requiresOpenaiAuth: null,
      error: "Codex app-server is not reachable. Start it with npm run codex:server."
    };
  }

  try {
    const accountResponse = (await request("account/read", { refreshToken: false }, 8_000)) as CodexGetAccountResponse;
    const account = summarizeAccount(accountResponse.account);
    const rateLimits = await readRateLimits();
    const requiresOpenaiAuth = Boolean(accountResponse.requiresOpenaiAuth || !account);
    const authState: CodexAuthState = rateLimits?.limited ? "limited" : requiresOpenaiAuth ? "login_required" : "ready";
    return {
      available: true,
      url: codexAppServerUrl,
      tokenConfigured,
      authState,
      account,
      rateLimits,
      requiresOpenaiAuth,
      error: null
    };
  } catch (error) {
    return {
      available: true,
      url: codexAppServerUrl,
      tokenConfigured,
      authState: "error" as CodexAuthState,
      account: null,
      rateLimits: null,
      requiresOpenaiAuth: null,
      error: error instanceof Error ? error.message : "Unable to read Codex account status."
    };
  }
}

export async function startCodexChatGptLogin(): Promise<CodexLoginSessionView> {
  let loginId = "";
  const earlyNotifications: JsonRpcMessage[] = [];
  const client = new CodexAppServerClient((message) => {
    if (loginId) handleLoginNotification(loginId, message);
    else earlyNotifications.push(message);
  });
  await client.connect();
  const params: CodexLoginAccountParams = {
    type: "chatgpt",
    codexStreamlinedLogin: true
  };
  const result = (await client.request("account/login/start", params)) as CodexLoginAccountResponse;

  if (result.type !== "chatgpt") {
    client.close();
    throw new Error("Codex did not return a ChatGPT browser login URL.");
  }

  loginId = result.loginId;
  const timeout = setTimeout(() => expireLogin(loginId), 180_000);
  const session: CodexLoginSession = {
    loginId,
    authUrl: result.authUrl,
    status: "pending",
    success: null,
    error: null,
    account: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    client,
    timeout
  };
  loginSessions.set(loginId, session);
  for (const message of earlyNotifications) handleLoginNotification(loginId, message);
  return view(session);
}

export function getCodexLoginSession(loginId: string) {
  const session = loginSessions.get(loginId);
  return session ? view(session) : null;
}

export async function cancelCodexLoginSession(loginId: string) {
  const session = loginSessions.get(loginId);
  if (!session) return null;
  try {
    const params: CodexCancelLoginAccountParams = { loginId };
    await session.client.request("account/login/cancel", params, 5_000);
  } catch {
    // The local browser flow may already be closed.
  }
  session.status = "cancelled";
  session.success = false;
  session.error = "Login cancelled.";
  session.completedAt = new Date().toISOString();
  closeTerminalSession(session);
  return view(session);
}

class CodexAppServerClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();

  constructor(private onNotification?: (message: JsonRpcMessage) => void) {}

  connect() {
    return new Promise<void>((resolve, reject) => {
      const token = readToken();
      const ws = new WebSocket(codexAppServerUrl, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      this.ws = ws;
      const failTimer = setTimeout(() => {
        reject(new Error(`Timed out connecting to Codex app-server at ${codexAppServerUrl}.`));
        ws.close();
      }, 8_000);

      ws.once("open", async () => {
        clearTimeout(failTimer);
        try {
          await this.request("initialize", { clientInfo: { name: "soilprove-v2", version: "0.1.0" }, capabilities: null });
          this.notify("initialized");
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      ws.on("message", (data) => this.handle(data.toString()));
      ws.on("error", () => {
        const error = new Error("Codex app-server WebSocket error.");
        this.rejectAll(error);
        reject(error);
      });
      ws.on("close", () => this.rejectAll(new Error("Codex app-server connection closed.")));
    });
  }

  request(method: string, params?: unknown, timeoutMs = requestTimeoutMs) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Codex app-server is not connected."));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      this.ws?.send(JSON.stringify(params === undefined ? { id, method } : { id, method, params }));
    });
  }

  notify(method: string, params?: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(params === undefined ? { method } : { method, params }));
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }

  private handle(raw: string) {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(raw) as JsonRpcMessage;
    } catch {
      return;
    }
    if (typeof message.id === "number" && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (!pending) return;
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.method) this.onNotification?.(message);
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function handleLoginNotification(loginId: string, message: JsonRpcMessage) {
  if (!loginId) return;
  const session = loginSessions.get(loginId);
  if (!session) return;
  if (message.method === "account/login/completed" && isObject(message.params)) {
    const params = message.params;
    if (typeof params.loginId === "string" && params.loginId !== loginId) return;
    session.success = Boolean(params.success);
    session.status = session.success ? "completed" : "failed";
    session.error = typeof params.error === "string" ? params.error : null;
    session.completedAt = new Date().toISOString();
    closeTerminalSession(session);
  }
  if (message.method === "account/updated" && isObject(message.params)) {
    session.account = summarizeAccount({
      type: message.params.authMode === "chatgpt" ? "chatgpt" : String(message.params.authMode ?? "unknown"),
      planType: message.params.planType
    });
  }
}

async function request(method: string, params: unknown, timeoutMs?: number) {
  const client = new CodexAppServerClient();
  await client.connect();
  try {
    return await client.request(method, params, timeoutMs);
  } finally {
    client.close();
  }
}

async function readRateLimits(): Promise<CodexRateLimitView | null> {
  try {
    const response = (await request("account/rateLimits/read", undefined, 8_000)) as CodexGetAccountRateLimitsResponse;
    return summarizeRateLimits(response.rateLimits);
  } catch {
    return null;
  }
}

async function isReady() {
  try {
    const url = new URL(codexAppServerUrl);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/readyz";
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function readToken() {
  if (process.env.CODEX_APP_SERVER_TOKEN) return process.env.CODEX_APP_SERVER_TOKEN.trim();
  try {
    return fs.readFileSync(path.resolve(process.cwd(), codexTokenFile), "utf8").trim();
  } catch {
    return "";
  }
}

function summarizeAccount(account: unknown): JsonObject | null {
  if (!isObject(account) || typeof account.type !== "string") return null;
  if (account.type === "chatgpt") {
    return { type: "chatgpt", planType: typeof account.planType === "string" ? account.planType : null };
  }
  return { type: account.type };
}

function summarizeRateLimits(snapshot: CodexRateLimitSnapshot | null | undefined): CodexRateLimitView | null {
  if (!snapshot) return null;
  return {
    limited: Boolean(snapshot.rateLimitReachedType),
    reachedType: snapshot.rateLimitReachedType,
    planType: snapshot.planType,
    primaryUsedPercent: typeof snapshot.primary?.usedPercent === "number" ? snapshot.primary.usedPercent : null,
    secondaryUsedPercent: typeof snapshot.secondary?.usedPercent === "number" ? snapshot.secondary.usedPercent : null,
    resetsAt: typeof snapshot.primary?.resetsAt === "number" ? snapshot.primary.resetsAt : typeof snapshot.secondary?.resetsAt === "number" ? snapshot.secondary.resetsAt : null
  };
}

function view(session: CodexLoginSession): CodexLoginSessionView {
  return {
    loginId: session.loginId,
    authUrl: session.authUrl,
    status: session.status,
    success: session.success,
    error: session.error,
    account: session.account,
    startedAt: session.startedAt,
    completedAt: session.completedAt
  };
}

function expireLogin(loginId: string) {
  const session = loginSessions.get(loginId);
  if (!session || session.status !== "pending") return;
  session.status = "expired";
  session.success = false;
  session.error = "ChatGPT login timed out.";
  session.completedAt = new Date().toISOString();
  closeTerminalSession(session);
}

function closeTerminalSession(session: CodexLoginSession) {
  clearTimeout(session.timeout);
  session.client.close();
  setTimeout(() => {
    const current = loginSessions.get(session.loginId);
    if (current?.status !== "pending") loginSessions.delete(session.loginId);
  }, terminalSessionTtlMs).unref();
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
