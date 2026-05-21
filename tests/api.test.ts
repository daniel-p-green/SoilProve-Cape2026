import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp, buildRealtimeSessionConfig } from "../server/index";
import { resetDatabaseForTests } from "../server/db";
import type { FieldProfile, Prescription, SoilZone } from "../src/domain";

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

test("health endpoint advertises active spec integrations", async () => {
  const health = await getJson<{ realtimePersona: string; realtimeModel: string; realtimeVoice: string }>(`${baseUrl}/api/health`);

  assert.deepEqual(
    { persona: health.realtimePersona, model: health.realtimeModel, voice: health.realtimeVoice },
    { persona: "Raimond", model: "gpt-realtime-2", voice: "cedar" }
  );
});

test("demo auth persists an operator", async () => {
  await postJson(`${baseUrl}/api/demo-login`, {});
  const health = await getJson<{ dashboard: { users: number } }>(`${baseUrl}/api/health`);

  assert.equal(health.dashboard.users, 1);
});

test("auth me hydrates active sessions and clears stale cookies", async () => {
  const cookie = await login("admin");
  const me = await getJson<{ user: { authMode: string; role: string } }>(`${baseUrl}/api/v1/auth/me`, cookie);

  resetDatabaseForTests();
  const stale = await fetch(`${baseUrl}/api/v1/farms`, { headers: { Cookie: cookie } });
  const setCookie = stale.headers.get("set-cookie") || "";
  const payload = (await stale.json()) as { error: { code: string } };

  assert.equal(me.user.authMode, "demo");
  assert.equal(me.user.role, "admin");
  assert.equal(stale.status, 401);
  assert.equal(payload.error.code, "AUTH_REQUIRED");
  assert.match(setCookie, /soilprove_session=;/);
  assert.match(setCookie, /Expires=Thu, 01 Jan 1970/i);
});

test("business APIs require an authenticated session", async () => {
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const response = await fetch(`${baseUrl}/api/prescriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bootstrap)
  });
  const ocrResponse = await fetch(`${baseUrl}/api/v1/soil-tests/ocr-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from("%PDF-1.4")
  });
  const protectedResponses = [
    response,
    ocrResponse,
    await fetch(`${baseUrl}/api/prescriptions/missing/vrt`),
    await fetch(`${baseUrl}/api/prescriptions/missing/oem/john_deere`, { method: "POST" }),
    await fetch(`${baseUrl}/api/prescriptions/missing/regional-soil-context`),
    await fetch(`${baseUrl}/api/prescriptions/missing/regional-soil-insights`, { method: "POST" }),
    await fetch(`${baseUrl}/api/copilot/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    await fetch(`${baseUrl}/api/realtime/session`, { method: "POST", headers: { "Content-Type": "application/sdp" }, body: "v=0\r\n" })
  ];
  const body = (await response.json()) as { error: { code: string } };
  const ocrBody = (await ocrResponse.json()) as { error: { code: string } };

  assert.equal(protectedResponses.every((item) => item.status === 401), true);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(ocrBody.error.code, "AUTH_REQUIRED");
});

test("typed Raimond copilot uses configured OpenRouter model server-side", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousModel = process.env.OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = ["test", "key"].join("-");
  process.env.OPENROUTER_MODEL = "openai/gpt-5.5";
  let openRouterCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(baseUrl)) return originalFetch(input, init);
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init?.body || "{}")) as { model?: string; messages?: Array<{ role: string; content: string }> };
    assert.equal(body.model, "openai/gpt-5.5");
    assert.equal(body.messages?.some((message) => message.role === "system" && message.content.includes("Raimond")), true);
    openRouterCalls += 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ assistant: "Use the reviewed field values before generating an action plan." }) } }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await postJson<{ choices: Array<{ message: { content: string } }> }>(
      `${baseUrl}/api/copilot/action`,
      { question: "What should I do next?" },
      await login("admin")
    );
    const content = JSON.parse(result.choices[0].message.content) as { assistant: string };

    assert.equal(content.assistant.includes("reviewed field values"), true);
    assert.equal(openRouterCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = previousModel;
  }
});

test("farmer sessions cannot sign prescriptions", async () => {
  const farmerCookie = await login("farmer");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, farmerCookie);
  const response = await fetch(`${baseUrl}/api/prescriptions/${prescription.id}/signoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: farmerCookie },
    body: JSON.stringify({ note: "Farmer should not sign." })
  });
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "SIGNOFF_FORBIDDEN");
});

test("linked agronomist sessions can sign farmer prescriptions", async () => {
  const farmerCookie = await login("farmer");
  await login("agronomist");
  const adminCookie = await login("admin");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, farmerCookie);

  await postJson(`${baseUrl}/api/v1/admin/link-agronomist`, { farmerUserId: "demo-farmer-operator", agronomistUserId: "demo-agronomist-operator", farmId: "miller-farm" }, adminCookie);
  const signed = await postJson<Prescription>(`${baseUrl}/api/prescriptions/${prescription.id}/signoff`, { note: "Linked agronomist reviewed." }, await login("agronomist"));

  assert.equal(signed.status, "signed");
});

test("agronomist signoff links are scoped to the prescription farm", async () => {
  const farmerCookie = await login("farmer");
  await login("agronomist");
  const adminCookie = await login("admin");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, farmerCookie);

  await postJson(`${baseUrl}/api/v1/admin/link-agronomist`, { farmerUserId: "demo-farmer-operator", agronomistUserId: "demo-agronomist-operator", farmId: "waverly_butler_county" }, adminCookie);
  const response = await fetch(`${baseUrl}/api/prescriptions/${prescription.id}/signoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await login("agronomist") },
    body: JSON.stringify({ note: "Wrong farm link should not sign." })
  });
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "SIGNOFF_FORBIDDEN");
});

test("v1 API covers farms, fields, prescription, packet, yield upload, savings, export, and logout", async () => {
  const cookie = await login("admin");
  const farms = await getJson<{ farms: unknown[] }>(`${baseUrl}/api/v1/farms`, cookie);
  const fields = await getJson<{ fields: unknown[] }>(`${baseUrl}/api/v1/fields`, cookie);
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/v1/prescriptions`, bootstrap, cookie);
  const signed = await postJson<Prescription>(`${baseUrl}/api/v1/prescriptions/${prescription.id}/signoff`, { note: "Reviewed." }, cookie);
  const packet = await postJson<{ markdown: string }>(`${baseUrl}/api/v1/prescriptions/${signed.id}/packet`, {}, cookie);
  const yieldCsv = "zone_id,bushels_per_acre\nZ1,209\nZ2,211\nZ3,204";
  const yieldResult = await postCsv<{ savings: { guaranteeTriggered: boolean } }>(`${baseUrl}/api/v1/fields/${signed.fieldId}/yield-records?season_year=2026`, yieldCsv, cookie);
  const savings = await getJson<{ savings: { dollarsSavedPerAcre: number } }>(`${baseUrl}/api/v1/fields/${signed.fieldId}/savings?season_year=2026`, cookie);
  const exported = await fetch(`${baseUrl}/api/v1/prescriptions/${signed.id}/export?format=john_deere`, { headers: { Cookie: cookie } });
  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  const afterLogout = await fetch(`${baseUrl}/api/v1/farms`, { headers: { Cookie: cookie } });

  assert.equal(farms.farms.length >= 5 && fields.fields.length >= 10, true);
  assert.equal(packet.markdown.includes("Agronomist Review"), true);
  assert.equal(yieldResult.savings.guaranteeTriggered, false);
  assert.equal(savings.savings.dollarsSavedPerAcre > 0, true);
  assert.equal(exported.ok, true);
  assert.equal(logout.ok, true);
  assert.equal(afterLogout.status, 401);
});

test("v1 soil and yield CSV endpoints reject malformed or mismatched uploads", async () => {
  const cookie = await login("admin");
  const soilResponse = await fetch(`${baseUrl}/api/v1/soil-tests/import-csv?field_id=mark_story_county_north_80&field_acres=80`, {
    method: "POST",
    headers: { "Content-Type": "text/csv", Cookie: cookie },
    body: "zone,acres\nZ1,80"
  });
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/v1/prescriptions`, bootstrap, cookie);
  const yieldResponse = await fetch(`${baseUrl}/api/v1/fields/${prescription.fieldId}/yield-records?season_year=2026`, {
    method: "POST",
    headers: { "Content-Type": "text/csv", Cookie: cookie },
    body: "zone_id,bushels_per_acre\nZ9,200"
  });

  assert.equal(soilResponse.status, 422);
  assert.equal(yieldResponse.status, 422);
});

test("scanned-PDF OCR endpoint is authenticated and fails invalid PDFs gracefully", async () => {
  const cookie = await login("admin");
  const response = await fetch(`${baseUrl}/api/v1/soil-tests/ocr-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", Cookie: cookie },
    body: Buffer.from("%PDF-1.4\nnot a valid report")
  });
  const body = (await response.json()) as { error: { code: string; requestId: string } };

  assert.equal(response.status, 422);
  assert.match(body.error.code, /^PDF_OCR_/);
  assert.equal(Boolean(body.error.requestId), true);
});

test("full API lifecycle creates, signs, packets, exports VRT, and updates dashboard", async () => {
  const cookie = await login("admin");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, cookie);
  const signed = await postJson<Prescription>(`${baseUrl}/api/prescriptions/${prescription.id}/signoff`, { note: "Reviewed." }, cookie);
  const packet = await postJson<{ markdown: string }>(`${baseUrl}/api/prescriptions/${signed.id}/packet`, {}, cookie);
  const vrt = await fetch(`${baseUrl}/api/prescriptions/${signed.id}/vrt`, { headers: { Cookie: cookie } });
  const repeatedVrt = await fetch(`${baseUrl}/api/prescriptions/${signed.id}/vrt`, { headers: { Cookie: cookie } });
  const health = await getJson<{ dashboard: { exported: number; prescriptions: number } }>(`${baseUrl}/api/health`);

  assert.equal(signed.status === "signed" && packet.markdown.includes("Agronomist Review") && vrt.ok && repeatedVrt.ok && health.dashboard.exported === 1, true);
});

test("regional soil context endpoint is authenticated and deterministic", async () => {
  const cookie = await login("admin");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, cookie);
  const context = await getJson<{ sources: unknown[]; zoneFlags: unknown[]; limitations: string[] }>(`${baseUrl}/api/prescriptions/${prescription.id}/regional-soil-context`, cookie);

  assert.equal(context.sources.length >= 2, true);
  assert.equal(context.zoneFlags.length >= 1, true);
  assert.equal(context.limitations.some((item) => item.includes("not a field-specific lab result")), true);
});

test("regional soil insight endpoint degrades to deterministic context without OpenRouter key", async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const cookie = await login("admin");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, cookie);

  try {
    const insight = await postJson<{ mode: string; model: string; context: { sources: unknown[] } }>(`${baseUrl}/api/prescriptions/${prescription.id}/regional-soil-insights`, {}, cookie);

    assert.equal(insight.mode, "deterministic_only");
    assert.equal(insight.model, process.env.OPENROUTER_MODEL || "openai/gpt-5.5");
    assert.equal(insight.context.sources.length >= 2, true);
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});

test("regional soil insight endpoint parses mocked OpenRouter demo insight output", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousModel = process.env.OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = ["test", "key"].join("-");
  process.env.OPENROUTER_MODEL = "openai/gpt-5.5";
  let openRouterCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(baseUrl)) return originalFetch(input, init);
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    openRouterCalls += 1;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "Regional context highlights pH and sample recency as review items.",
                reviewFlags: ["Z3 pH should be reviewed before signoff."],
                agronomistQuestions: ["Should Z3 be refreshed before this first controlled trial?"],
                limitations: ["This is public context and reviewed field data, not an autonomous recommendation."]
              })
            }
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  const cookie = await login("admin");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, cookie);

  try {
    const insight = await postJson<{ mode: string; model: string; reviewFlags: string[] }>(`${baseUrl}/api/prescriptions/${prescription.id}/regional-soil-insights`, {}, cookie);

    assert.equal(insight.mode, "live");
    assert.equal(insight.model, "openai/gpt-5.5");
    assert.equal(insight.reviewFlags[0].includes("Z3"), true);
    assert.equal(openRouterCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = previousModel;
  }
});

test("review packets require agronomist signoff", async () => {
  const cookie = await login("admin");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, cookie);
  const response = await fetch(`${baseUrl}/api/prescriptions/${prescription.id}/packet`, {
    method: "POST",
    headers: { Cookie: cookie }
  });
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 422);
  assert.equal(body.error.code, "PACKET_REQUIRES_SIGNOFF");
});

test("OEM endpoints cover all three brands with credential-required status", async () => {
  const originalFetch = globalThis.fetch;
  const isolatedEnv = isolateOemCredentials();
  let blockedNetworkCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith(baseUrl)) {
      blockedNetworkCalls += 1;
      throw new Error(`Live network call blocked in OEM API test: ${url}`);
    }
    return originalFetch(input, init);
  };

  const cookie = await login("admin");
  const bootstrap = await getJson<{ profile: FieldProfile; zones: SoilZone[] }>(`${baseUrl}/api/bootstrap`);
  const prescription = await postJson<Prescription>(`${baseUrl}/api/prescriptions`, bootstrap, cookie);
  const signed = await postJson<Prescription>(`${baseUrl}/api/prescriptions/${prescription.id}/signoff`, { note: "Reviewed." }, cookie);

  try {
    const statuses = await Promise.all(
      ["john_deere", "case_ih", "agco"].map(async (target) => {
        const response = await fetch(`${baseUrl}/api/prescriptions/${signed.id}/oem/${target}`, { method: "POST", headers: { Cookie: cookie } });
        const body = (await response.json()) as { result: { mode: string } };
        return `${response.status}:${body.result.mode}`;
      })
    );

    assert.deepEqual(statuses, ["200:simulated", "202:credential_required", "202:credential_required"]);
    assert.equal(blockedNetworkCalls, 0);
  } finally {
    restoreOemCredentials(isolatedEnv);
    globalThis.fetch = originalFetch;
  }
});

test("Realtime session config is voice-first Raimond with execution tools", () => {
  const config = buildRealtimeSessionConfig();

  assert.equal(
      config.instructions.includes("Raimond") &&
      config.instructions.includes("Daniel") &&
      config.instructions.includes("Never call the plan final") &&
      config.instructions.includes("hands-free") &&
      config.instructions.includes("full experience") &&
      config.instructions.includes("intake, plan, proof, packet, exports, results") &&
      config.instructions.includes("get_soilprove_state") &&
      config.instructions.includes("wait for the function_call_output") &&
      config.model === "gpt-realtime-2" &&
      config.output_modalities.includes("audio") &&
      config.audio.output.voice === "cedar" &&
      config.tools.some((tool) => tool.name === "get_soilprove_state") &&
      config.tools.length >= 16,
    true
  );
});

test("Realtime session endpoint fails gracefully when live OpenAI key is unavailable", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const cookie = await login("admin");
  try {
    const response = await fetch(`${baseUrl}/api/realtime/session`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp", Cookie: cookie },
      body: "v=0\r\n"
    });
    const body = (await response.json()) as { error: { code: string; message: string } };

    assert.equal(response.status, 500);
    assert.equal(body.error.code, "OPENAI_NOT_CONFIGURED");
    assert.match(body.error.message, /OPENAI_API_KEY/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("Codex login endpoints reject non-local origins", async () => {
  const response = await fetch(`${baseUrl}/api/codex/status`, { headers: { Origin: "https://evil.example" } });

  assert.equal(response.status, 403);
});

test("Codex status reports structured diagnostics", async () => {
  const response = await fetch(`${baseUrl}/api/codex/status`);
  const body = (await response.json()) as {
    available: boolean;
    tokenConfigured: boolean;
    authState: string;
    account: unknown;
    rateLimits: unknown;
    requiresOpenaiAuth: boolean | null;
    error: string | null;
  };

  assert.equal(response.ok, true);
  assert.equal(typeof body.available, "boolean");
  assert.equal(typeof body.tokenConfigured, "boolean");
  assert.match(body.authState, /^(not_running|token_missing|login_required|ready|limited|error)$/);
  assert.equal("rateLimits" in body, true);
  assert.equal("requiresOpenaiAuth" in body, true);
});

async function login(role: "farmer" | "agronomist" | "admin" = "admin") {
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

function isolateOemCredentials() {
  const names = [
    "JOHN_DEERE_ACCESS_TOKEN",
    "JOHN_DEERE_ORG_ID",
    "JOHN_DEERE_API_BASE",
    "CNH_ACCESS_TOKEN",
    "CNH_COMPANY_ID",
    "CNH_VEHICLE_ID",
    "CNH_SUBSCRIPTION_KEY",
    "CNH_API_BASE",
    "AGCO_ACCESS_TOKEN",
    "AGCO_ENDPOINT_ID",
    "AGCO_TENANT_ID",
    "AGCO_RECIPIENT_ID",
    "AGCO_API_BASE",
    "AGCO_MESSAGE_TYPE"
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  return previous;
}

function restoreOemCredentials(previous: Map<string, string | undefined>) {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
