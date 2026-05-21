import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/index";
import { resetDatabaseForTests } from "../server/db";
import { hasLocalOcrTools, ocrSoilPdf } from "../server/ocr";
import { evaluateProductionHardening } from "../evals/productionHardening";
import type { FieldProfile, Prescription, SoilZone } from "../src/domain";

const pdfDir = new URL("./fixtures/imports/missouri-pdfs/", import.meta.url);

test("rate limits bursty public and business route families with structured errors", async () => {
  await withTestServer(async (baseUrl) => {
    const previousMax = process.env.SOILPROVE_RATE_LIMIT_AUTH_MAX;
    process.env.SOILPROVE_RATE_LIMIT_AUTH_MAX = "2";
    try {
      const attempts = await Promise.all([0, 1, 2].map(() => fetch(`${baseUrl}/api/demo-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })));
      const limited = attempts.find((response) => response.status === 429);
      assert.equal(Boolean(limited), true);
      const payload = (await limited?.json()) as { error: { code: string } };
      assert.equal(payload.error.code, "RATE_LIMITED");
    } finally {
      if (previousMax === undefined) delete process.env.SOILPROVE_RATE_LIMIT_AUTH_MAX;
      else process.env.SOILPROVE_RATE_LIMIT_AUTH_MAX = previousMax;
    }
  });
});

test("cookie-authenticated mutations reject hostile browser origins", async () => {
  await withTestServer(async (baseUrl) => {
    const cookie = await login(baseUrl, "admin");
    const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
    const response = await fetch(`${baseUrl}/api/prescriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://evil.example" },
      body: JSON.stringify(bootstrap)
    });
    const payload = (await response.json()) as { error: { code: string } };

    assert.equal(response.status, 403);
    assert.equal(payload.error.code, "CSRF_FORBIDDEN");
  });
});

test("critical actions create immutable admin-visible audit events", async () => {
  await withTestServer(async (baseUrl) => {
    const cookie = await login(baseUrl, "admin");
    await postJson(`${baseUrl}/api/v1/admin/link-agronomist`, { farmerUserId: "demo-farmer-operator", agronomistUserId: "demo-agronomist-operator", farmId: "miller-farm" }, cookie);
    const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
    const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, cookie);
    const signed = await postJson<Prescription>(`${baseUrl}/api/prescriptions/${prescription.id}/signoff`, { note: "Reviewed." }, cookie);
    await postJson(`${baseUrl}/api/prescriptions/${signed.id}/packet`, {}, cookie);
    await fetch(`${baseUrl}/api/prescriptions/${signed.id}/vrt`, { headers: { Cookie: cookie } });
    await fetch(`${baseUrl}/api/prescriptions/${signed.id}/oem/john_deere`, { method: "POST", headers: { Cookie: cookie } });
    await postCsv(`${baseUrl}/api/v1/fields/${signed.fieldId}/yield-records?season_year=2026`, "zone_id,bushels_per_acre\nZ1,209\nZ2,211\nZ3,204", cookie);

    const audit = await getJson<{ events: Array<{ action: string; actorRole: string; requestId: string }> }>(`${baseUrl}/api/v1/admin/audit-events`, cookie);
    const actions = audit.events.map((event) => event.action);

    for (const expected of ["agronomist.link", "prescription.create", "prescription.signoff", "packet.create", "vrt.export", "oem.send", "yield.upload"]) {
      assert.equal(actions.includes(expected), true, expected);
    }
    assert.equal(audit.events.every((event) => event.actorRole === "admin" && event.requestId), true);
  });
});

test("backup and restore CLI validates manifest and schema", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "soilprove-backup-test-"));
  const dataDir = path.join(root, "data");
  const backupRoot = path.join(root, "backups");
  const env = { ...process.env, SOILPROVE_DATA_DIR: dataDir };

  const backupOutput = JSON.parse(execFileSync("node", ["--import", "tsx", "scripts/db-backup.ts", "backup", "--out", backupRoot], { cwd: process.cwd(), env, encoding: "utf8" }));
  assert.equal(fs.existsSync(path.join(backupOutput.backupDir, "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(backupOutput.backupDir, "soilprove.sqlite")), true);

  fs.rmSync(dataDir, { recursive: true, force: true });
  const restoreOutput = JSON.parse(execFileSync("node", ["--import", "tsx", "scripts/db-backup.ts", "restore", "--from", backupOutput.backupDir], { cwd: process.cwd(), env, encoding: "utf8" }));

  assert.equal(restoreOutput.ok, true);
  assert.equal(fs.existsSync(path.join(dataDir, "soilprove.sqlite")), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("production config check fails closed and passes with explicit deployment env", () => {
  assert.throws(
    () => execFileSync("node", ["--import", "tsx", "scripts/prod-check.ts"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production" }, encoding: "utf8", stdio: "pipe" }),
    /SOILPROVE_SESSION_SECRET/
  );

  const output = JSON.parse(
    execFileSync("node", ["--import", "tsx", "scripts/prod-check.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        SOILPROVE_SESSION_SECRET: "x".repeat(40),
        SOILPROVE_SECURE_COOKIES: "1",
        SOILPROVE_ALLOWED_ORIGINS: "https://soilprove.example",
        SOILPROVE_DATA_DIR: path.join(os.tmpdir(), "soilprove-prod-check"),
        OPENAI_API_KEY: "test",
        OPENROUTER_API_KEY: "test"
      },
      encoding: "utf8"
    })
  );
  assert.equal(output.ok, true);
});

test("real Missouri PDFs are committed and exercise OCR review workflow", () => {
  const pdfs = fs.readdirSync(pdfDir).filter((name) => name.endsWith(".pdf"));
  assert.equal(pdfs.length >= 5, true);

  if (!hasLocalOcrTools()) return;
  const currentReport = ocrSoilPdf(fs.readFileSync(new URL("rimor-2025-topsoil.pdf", pdfDir)));

  assert.equal(currentReport.reviewRequired, true);
  assert.equal(currentReport.labFields?.county, "Boone");
  assert.equal(currentReport.labFields?.texture?.toLowerCase().includes("loam"), true);
  assert.equal(currentReport.zones.length >= 1, true);
});

test("demo users expose happy paths without credential login", async () => {
  await withTestServer(async (baseUrl) => {
    const personas = await getJson<{ users: Array<{ id: string; role: string; happyPath: string }> }>(`${baseUrl}/api/demo-users`);
    assert.equal(personas.users.length >= 3, true);
    assert.equal(personas.users.some((user) => user.role === "admin" && user.happyPath.includes("full")), true);

    const response = await postJson<{ user: { id: string; role: string } }>(`${baseUrl}/api/demo-login`, { personaId: "test-admin-operator" });
    assert.equal(response.user.id, "test-admin-operator");
    assert.equal(response.user.role, "admin");
  });
});

test("production hardening eval is green", () => {
  const result = evaluateProductionHardening();

  assert.equal(result.ok, true);
});

async function withTestServer<T>(run: (baseUrl: string) => Promise<T>) {
  resetDatabaseForTests();
  const server: Server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function login(baseUrl: string, role: "farmer" | "agronomist" | "admin" = "admin") {
  const response = await fetch(`${baseUrl}/api/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role })
  });
  assert.equal(response.ok, true);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.equal(Boolean(cookie), true);
  return String(cookie);
}

async function getJson<T>(url: string, cookie?: string): Promise<T> {
  const response = await fetch(url, cookie ? { headers: { Cookie: cookie } } : undefined);
  assert.equal(response.ok, true);
  return (await response.json()) as T;
}

async function postJson<T>(url: string, body: unknown, cookie?: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true);
  return (await response.json()) as T;
}

async function postCsv<T>(url: string, body: string, cookie?: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/csv", ...(cookie ? { Cookie: cookie } : {}) },
    body
  });
  assert.equal(response.ok, true);
  return (await response.json()) as T;
}
