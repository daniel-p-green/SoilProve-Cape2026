import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const explicitEnvKeys = new Set(Object.keys(process.env));

dotenv.config({ path: path.resolve(process.cwd(), "../.env"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
loadLocalOverrides(path.resolve(process.cwd(), ".env.local"), explicitEnvKeys);

export function envPresence(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])]));
}

export function validateServerConfig() {
  const errors: string[] = [];
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) errors.push("PORT must be an integer between 1 and 65535.");
  const host = process.env.HOST || "127.0.0.1";
  if (!host.trim()) errors.push("HOST must not be blank.");
  if ((process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2") !== "gpt-realtime-2") errors.push("OPENAI_REALTIME_MODEL must remain gpt-realtime-2 for this build.");
  if ((process.env.OPENAI_REALTIME_VOICE || "cedar") !== "cedar") errors.push("OPENAI_REALTIME_VOICE must remain cedar for Raimond.");
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.SOILPROVE_SESSION_SECRET || "";
    if (secret.length < 32 || secret === "soilprove-local-dev-session-secret") {
      errors.push("SOILPROVE_SESSION_SECRET must be set to at least 32 non-default characters in production.");
    }
    if (process.env.SOILPROVE_SECURE_COOKIES !== "1") errors.push("SOILPROVE_SECURE_COOKIES=1 is required in production.");
    if (!process.env.SOILPROVE_ALLOWED_ORIGINS?.trim()) errors.push("SOILPROVE_ALLOWED_ORIGINS must list trusted production origins.");
    if (!process.env.SOILPROVE_DATA_DIR?.trim()) errors.push("SOILPROVE_DATA_DIR must point at the production SQLite data directory.");
    if (!process.env.OPENAI_API_KEY?.trim()) errors.push("OPENAI_API_KEY is required for production Realtime voice.");
    if (!process.env.OPENROUTER_API_KEY?.trim()) errors.push("OPENROUTER_API_KEY is required for production typed copilot fallback.");
  }
  if (errors.length) throw new Error(`Invalid SoilProve server config: ${errors.join(" ")}`);
  return { port, host };
}

export function ensureTokenFile() {
  const tokenFile = process.env.CODEX_APP_SERVER_TOKEN_FILE || ".codex-app-server-token";
  const tokenPath = path.resolve(process.cwd(), tokenFile);
  if (!fs.existsSync(tokenPath)) {
    fs.writeFileSync(tokenPath, cryptoRandom(), { mode: 0o600 });
  }
  return tokenPath;
}

function cryptoRandom() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function loadLocalOverrides(filePath: string, explicitKeys: Set<string>) {
  if (!fs.existsSync(filePath)) return;
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (!explicitKeys.has(key)) process.env[key] = value;
  }
}
