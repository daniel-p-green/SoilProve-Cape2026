#!/usr/bin/env node
import fs from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

const listenUrl = process.env.CODEX_APP_SERVER_URL || "ws://127.0.0.1:28787";
const tokenFile = process.env.CODEX_APP_SERVER_TOKEN_FILE || ".codex-app-server-token";
const tokenPath = path.resolve(process.cwd(), tokenFile);

if (!fs.existsSync(tokenPath)) {
  fs.writeFileSync(tokenPath, randomBytes(32).toString("hex"), { mode: 0o600 });
  console.log(`Created ${path.relative(process.cwd(), tokenPath)} for local Codex app-server auth.`);
}
fs.chmodSync(tokenPath, 0o600);

const child = spawn("codex", ["app-server", "--listen", listenUrl, "--ws-auth", "capability-token", "--ws-token-file", tokenPath], {
  stdio: "inherit",
  env: process.env
});

console.log(`Codex app-server listening at ${listenUrl}`);
child.on("error", (error) => {
  console.error(`Unable to start codex app-server: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
