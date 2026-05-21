import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/index";
import { resetDatabaseForTests } from "../server/db";
import { ocrSoilPdf } from "../server/ocr";
import { evaluateSecurityAbuse } from "../evals/securityAbuse";

let server: Server;
let baseUrl = "";

test.beforeEach(async () => {
  resetDatabaseForTests();
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("business route families reject anonymous access with structured auth errors", async () => {
  const routes = [
    ["GET", "/api/v1/auth/me"],
    ["POST", "/api/v1/auth/logout"],
    ["GET", "/api/v1/farms"],
    ["GET", "/api/v1/fields"],
    ["POST", "/api/v1/admin/link-agronomist"],
    ["POST", "/api/v1/soil-tests/import-csv"],
    ["POST", "/api/v1/soil-tests/ocr-pdf", "application/pdf", Buffer.from("%PDF-1.4")],
    ["POST", "/api/v1/prescriptions"],
    ["POST", "/api/v1/prescriptions/missing/signoff"],
    ["POST", "/api/v1/prescriptions/missing/packet"],
    ["GET", "/api/v1/prescriptions/missing/export"],
    ["POST", "/api/v1/fields/missing/yield-records"],
    ["GET", "/api/v1/fields/missing/savings"],
    ["GET", "/api/v1/farms/missing/dashboard"],
    ["POST", "/api/prescriptions"],
    ["POST", "/api/prescriptions/missing/signoff"],
    ["POST", "/api/prescriptions/missing/packet"],
    ["GET", "/api/prescriptions/missing/vrt"],
    ["POST", "/api/prescriptions/missing/oem/john_deere"],
    ["POST", "/api/copilot/action"],
    ["POST", "/api/realtime/session", "application/sdp", "v=0\r\n"]
  ] as const;

  for (const [method, route, contentType, body] of routes) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: contentType ? { "Content-Type": contentType } : undefined,
      body: body as BodyInit | undefined
    });
    const payload = (await response.json()) as { error: { code: string; requestId: string } };

    assert.equal(response.status, 401, route);
    assert.equal(payload.error.code, "AUTH_REQUIRED", route);
    assert.equal(Boolean(payload.error.requestId), true, route);
  }
});

test("production sessions set secure cookies", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const response = await fetch(`${baseUrl}/api/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const cookie = response.headers.get("set-cookie") || "";

    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Secure/i);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("oversized uploads return structured payload errors", async () => {
  const cookie = await login();
  const tooLargeCsv = `zone_id,acres,pH,phosphorus_ppm,potassium_ppm,organic_matter_pct,soil_type,sampled_at\n${"Z1,1,6.5,25,140,3.2,loam,2026-01-01\n".repeat(32000)}`;
  const response = await fetch(`${baseUrl}/api/v1/soil-tests/import-csv?field_id=mark_story_county_north_80&field_acres=80`, {
    method: "POST",
    headers: { "Content-Type": "text/csv", Cookie: cookie },
    body: tooLargeCsv
  });
  const payload = (await response.json()) as { error: { code: string; requestId: string } };

  assert.equal(response.status, 413);
  assert.equal(payload.error.code, "PAYLOAD_TOO_LARGE");
  assert.equal(Boolean(payload.error.requestId), true);
});

test("OCR temp directories are cleaned up after success or failure", () => {
  const before = soilproveOcrTempDirs();

  assert.throws(() => ocrSoilPdf(Buffer.from("%PDF-1.4\nnot a valid scanned report")));

  const after = soilproveOcrTempDirs();
  assert.deepEqual(after, before);
});

test("tracked-file secret scan has zero findings", () => {
  const result = evaluateSecurityAbuse();

  assert.equal(result.secretHits.length, 0);
});

async function login() {
  const response = await fetch(`${baseUrl}/api/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(response.ok, true);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.equal(Boolean(cookie), true);
  return String(cookie);
}

function soilproveOcrTempDirs() {
  return fs
    .readdirSync(os.tmpdir())
    .filter((name) => name.startsWith("soilprove-ocr-"))
    .sort()
    .map((name) => path.join(os.tmpdir(), name));
}
