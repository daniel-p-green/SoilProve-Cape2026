import "./env";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPacket,
  computeSavings,
  computeSavingsFromYieldRecord,
  defaultProfile,
  defaultZones,
  generatePrescription,
  harvestedYieldAverage,
  markExported,
  realtimeTools,
  signPrescription
} from "../src/domain";
import type { OemTarget } from "../src/domain";
import { createVrtBundle } from "../src/vrt";
import { sendOemExport } from "../src/oem";
import { canonicalFarms } from "../src/fixtures";
import { parseSoilCsvText, parseYieldCsvText } from "../src/ocr";
import {
  buildRegionalInsightPrompt,
  buildRegionalSoilContext,
  deterministicRegionalSoilInsight,
  parseRegionalInsightCompletion,
  type RegionalSoilInsight
} from "../src/regionalSoil";
import { hasLocalOcrTools, ocrSoilPdf } from "./ocr";
import {
  cancelCodexLoginSession,
  getCodexAppServerConfig,
  getCodexAppServerStatus,
  getCodexLoginSession,
  startCodexChatGptLogin
} from "./codexAppServer";
import { envPresence, validateServerConfig } from "./env";
import {
  dashboard,
  deleteSession,
  getPrescription,
  getPrescriptionFarmId,
  getPrescriptionOwner,
  getSession,
  getUser,
  isLinkedAgronomist,
  listFarms,
  listFields,
  listPrescriptions,
  listYieldRecords,
  latestPrescription,
  listAuditEvents,
  saveCanonicalFarm,
  saveAgronomistLink,
  saveAuditEvent,
  saveFarm,
  saveExport,
  savePacket,
  savePrescription,
  saveSession,
  saveSoilTest,
  saveUser,
  saveYieldRecord,
  type StoredUser,
  type UserRole
} from "./db";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST || "127.0.0.1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../dist");
const realtimeModel = "gpt-realtime-2";
const realtimeVoice = "cedar";
const sessionCookieName = "soilprove_session";
const sessionSecret = process.env.SOILPROVE_SESSION_SECRET || "soilprove-local-dev-session-secret";
const sessionTtlMs = 1000 * 60 * 60 * 12;

type AuthenticatedRequest = express.Request & { user?: StoredUser; sessionId?: string; requestId?: string };
type DemoPersona = {
  id: string;
  name: string;
  role: UserRole;
  happyPath: string;
};

const demoPersonas: DemoPersona[] = [
  {
    id: "test-admin-operator",
    name: "Daniel",
    role: "admin",
    happyPath: "full happy path: generate, sign, packet, VRT, and OEM simulation"
  },
  {
    id: "test-farmer-miller",
    name: "Mark Miller",
    role: "farmer",
    happyPath: "farmer happy path: load Miller Farm North 80 and generate a draft plan"
  },
  {
    id: "test-agronomist-chen",
    name: "Dr. Lena Chen",
    role: "agronomist",
    happyPath: "agronomist happy path: review and sign linked Miller Farm prescriptions"
  }
];

function cleanRealtimeOperatorName(name?: string) {
  return (name ?? "Daniel").replace(/[^A-Za-z0-9 .'-]/g, "").trim().slice(0, 64) || "Daniel";
}

export function buildRealtimeSessionConfig(operatorName = "Daniel") {
  const safeOperatorName = cleanRealtimeOperatorName(operatorName);
  return {
    type: "realtime",
    model: realtimeModel,
    output_modalities: ["audio"],
    audio: { output: { voice: realtimeVoice } },
    reasoning: { effort: "low" },
    instructions: [
      "Your name is Raimond. Always identify yourself as Raimond, never as ChatGPT or a generic assistant. You are SoilProve's Cedar-voiced soil report second opinion and must always use the cedar voice configured for this session.",
      `The current operator is ${safeOperatorName}. Greet the operator by name at the start of a live session, then keep the demo moving.`,
      "The user should be able to complete the full SoilProve experience hands-free when desired.",
      "Help farmers understand soil reports, flag review questions, and move reviewed values into agronomist-reviewed action plans.",
      "Answer foundational lab-value questions anytime so farmers arrive prepared and agronomists can focus on higher-value strategy.",
      "Never call the plan final. Keep every recommendation tied to farmer-entered inputs, MRTN audit values, comparable-field privacy, and agronomist review.",
      "Public product story: sign in with ChatGPT, use ChatGPT; no separate farmer API keys. Live voice still uses gpt-realtime-2 with Cedar when OPENAI_API_KEY is configured.",
      "Use savings assurance language only as a business offer: at least $10/acre verified cost savings by Month 6, with review if harvested yields drop more than 2% from baseline.",
      "Use advance_demo_step when the operator says continue, next, run the demo, or wants a hands-free path. Use granular tools when the operator asks for a specific action.",
      "When the operator asks for the full experience, drive this voice path: dismiss onboarding, authenticate or demo login, load or import a soil report, confirm editable report review, generate the draft action plan, open comparable proof, capture agronomist signoff, create the packet, export VRT, send OEM simulation, upload yield results, and open the results/audit state.",
      "For a narrated walkthrough, call navigate_workspace for each visible section in order: intake, plan, proof, packet, exports, results. Explain each screen only after the tool result confirms what changed.",
      "When the operator edits a single field value by voice, prefer edit_field_value because it requires both field and value. For multiple values, call update_field_profile with each spoken value as a typed argument. Do not call value-edit tools with empty arguments when the operator gave numbers. Convert cents to dollars for nitrogenPricePerLb, so 72 cents per pound becomes 0.72.",
      "Use get_soilprove_state before explaining the current screen, report status, locked steps, next action, or why a plan/export is blocked.",
      "Use answer_soilprove_question before answering farmer questions about lab values, blocked workflow steps, modeled savings, peer context, VRT/OEM readiness, yield results, or agronomist review.",
      "Use tools for full cursor-equivalent operation: navigation, data entry, field and zone editing, review gates, sample imports, plan generation, signoff, packet creation, VRT export, OEM send, yield upload, demo setup, reset, and state changes. For navigation, call navigate_workspace before describing what changed.",
      "After any tool call, wait for the function_call_output before confirming success. Keep spoken responses short and confident."
    ].join("\n"),
    tools: realtimeTools(),
    tool_choice: "auto"
  };
}

export function createApp() {
const app = express();

app.use(assignRequestId);
app.use(createRateLimiter());
app.use(express.raw({ type: "application/pdf", limit: "10mb" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.text({ type: ["application/sdp", "text/plain", "text/csv"], limit: "1mb" }));
app.use(handleParserError);
app.use("/api/codex", requireLocalCodexAccess);
app.use(requireTrustedMutationOrigin);
seedCanonicalData();

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    realtimePersona: "Raimond",
    realtimeModel,
    realtimeVoice,
    env: envPresence([
      "OPENROUTER_API_KEY",
      "OPENAI_API_KEY",
      "JOHN_DEERE_ACCESS_TOKEN",
      "CNH_ACCESS_TOKEN",
      "AGCO_ACCESS_TOKEN"
    ]),
    ocr: { scannedPdfAvailable: hasLocalOcrTools() },
    codexAppServer: getCodexAppServerConfig(),
    dashboard: dashboard()
  });
});

app.get("/api/bootstrap", (_req, res) => {
  res.json({
    profile: defaultProfile(),
    zones: defaultZones(),
    latestPrescription: latestPrescription(),
    dashboard: dashboard()
  });
});

app.get("/api/demo-users", (_req, res) => {
  res.json({ users: demoPersonas });
});

app.post("/api/demo-login", (req, res) => {
  const body = req.body as { role?: unknown; personaId?: unknown } | undefined;
  const persona = typeof body?.personaId === "string" ? demoPersonas.find((item) => item.id === body.personaId) : undefined;
  const role = persona?.role || parseRole(body?.role) || "admin";
  const user = saveUser({
    id: persona?.id || `demo-${role}-operator`,
    name: persona?.name || (role === "agronomist" ? "Demo Agronomist" : role === "farmer" ? "Demo Farmer" : "SoilProve Demo Operator"),
    authMode: "demo",
    role,
    planType: "local-demo",
    createdAt: new Date().toISOString()
  });
  createUserSession(res, user);
  res.json({ user });
});

app.get("/api/codex/status", async (_req, res) => {
  res.json(await getCodexAppServerStatus());
});

app.post("/api/codex/login/start", async (_req, res) => {
  try {
    res.json(await startCodexChatGptLogin());
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Unable to start ChatGPT login." });
  }
});

app.get("/api/codex/login/:loginId", (req, res) => {
  const session = getCodexLoginSession(req.params.loginId);
  if (!session) {
    res.status(404).json({ error: "Unknown Codex login session." });
    return;
  }
  if (session.status === "completed") {
    const user = saveUser({
      id: `codex-${session.loginId}`,
      name: "ChatGPT operator",
      authMode: "codex",
      role: "admin",
      planType: typeof session.account?.planType === "string" ? session.account.planType : null,
      createdAt: new Date().toISOString()
    });
    createUserSession(res, user);
  }
  res.json(session);
});

app.post("/api/codex/login/:loginId/cancel", async (req, res) => {
  const session = await cancelCodexLoginSession(req.params.loginId);
  if (!session) {
    res.status(404).json({ error: "Unknown Codex login session." });
    return;
  }
  res.json(session);
});

app.get("/api/v1/auth/me", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

app.post("/api/v1/auth/logout", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  clearUserSession(req, res);
  res.json({ ok: true });
});

app.get("/api/v1/farms", requireAuthenticatedUser, (_req: AuthenticatedRequest, res) => {
  res.json({ farms: listFarms() });
});

app.get("/api/v1/fields", requireAuthenticatedUser, (_req: AuthenticatedRequest, res) => {
  res.json({ fields: listFields() });
});

app.post("/api/v1/admin/link-agronomist", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") {
    respondError(req, res, 403, "ADMIN_REQUIRED", "Only an admin can link agronomists to farmers.");
    return;
  }
  const body = req.body as { farmerUserId?: string; agronomistUserId?: string; farmId?: string };
  if (!body.farmerUserId || !body.agronomistUserId || !body.farmId) {
    respondError(req, res, 422, "LINK_INVALID", "farmerUserId, agronomistUserId, and farmId are required.");
    return;
  }
  ensureDemoLinkTargets(body.farmerUserId, body.agronomistUserId, body.farmId);
  const link = saveAgronomistLink(body.farmerUserId, body.agronomistUserId, body.farmId);
  audit(req, "agronomist.link", "farm", body.farmId, "success", { farmerUserId: body.farmerUserId, agronomistUserId: body.agronomistUserId });
  res.json({ link });
});

app.get("/api/v1/admin/audit-events", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") {
    respondError(req, res, 403, "ADMIN_REQUIRED", "Only an admin can inspect audit events.");
    return;
  }
  res.json({ events: listAuditEvents() });
});

app.post("/api/v1/soil-tests/import-csv", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  try {
    const body = csvBody(req);
    const expectedFieldAcres = req.query.field_acres ? Number(req.query.field_acres) : undefined;
    const result = parseSoilCsvText(body, expectedFieldAcres);
    const fieldId = typeof req.query.field_id === "string" ? req.query.field_id : "";
    if (fieldId) saveSoilTest(fieldId, new Date().toISOString().slice(0, 10), "CSV import", result.zones);
    res.json(result);
  } catch (error) {
    respondError(req, res, 422, "SOIL_CSV_INVALID", error instanceof Error ? error.message : "Unable to parse soil CSV.");
  }
});

app.post("/api/v1/soil-tests/ocr-pdf", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  try {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (bytes.length === 0) {
      respondError(req, res, 422, "PDF_OCR_INVALID", "PDF body is required.");
      return;
    }
    res.json(ocrSoilPdf(bytes));
  } catch (error) {
    respondError(req, res, 422, "PDF_OCR_FAILED", error instanceof Error ? error.message : "Unable to OCR soil report PDF.");
  }
});

app.post("/api/v1/prescriptions", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  createPrescription(req, res);
});

app.post("/api/v1/prescriptions/:id/signoff", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  signPrescriptionRoute(req, res);
});

app.post("/api/v1/prescriptions/:id/packet", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  packetRoute(req, res);
});

app.get("/api/v1/prescriptions/:id/regional-soil-context", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  regionalSoilContextRoute(req, res);
});

app.post("/api/v1/prescriptions/:id/regional-soil-insights", requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
  await regionalSoilInsightRoute(req, res);
});

app.get("/api/v1/prescriptions/:id/export", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  vrtRoute(req, res);
});

app.post("/api/v1/fields/:fieldId/yield-records", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  try {
    const fieldId = String(req.params.fieldId);
    const seasonYear = Number(req.query.season_year || new Date().getFullYear());
    const prescription = latestPrescriptionForField(fieldId);
    if (!prescription) {
      respondError(req, res, 404, "PRESCRIPTION_NOT_FOUND", "No prescription exists for this field.");
      return;
    }
    const yieldRecord = parseYieldCsvText(csvBody(req), fieldId, seasonYear);
    const savings = computeSavingsFromYieldRecord(prescription.profile, prescription.recommendations, yieldRecord);
    const yieldBuPerAcre = harvestedYieldAverage(prescription.recommendations, yieldRecord);
    saveYieldRecord(fieldId, { seasonYear, yieldBuPerAcre, source: "operator_entry" });
    audit(req, "yield.upload", "field", fieldId, "success", { seasonYear, yieldBuPerAcre });
    res.json({ yieldRecord, savings });
  } catch (error) {
    respondError(req, res, 422, "YIELD_CSV_INVALID", error instanceof Error ? error.message : "Unable to parse yield CSV.");
  }
});

app.get("/api/v1/fields/:fieldId/savings", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  const fieldId = String(req.params.fieldId);
  const seasonYear = Number(req.query.season_year || new Date().getFullYear());
  const prescription = latestPrescriptionForField(fieldId);
  const yieldRecord = listYieldRecords(fieldId).find((record) => record.seasonYear === seasonYear);
  if (!prescription || !yieldRecord) {
    respondError(req, res, 404, "SAVINGS_NOT_FOUND", "No prescription and yield record exist for this field and season.");
    return;
  }
  res.json({
    fieldId,
    seasonYear,
    savings: computeSavings(prescription.profile, prescription.recommendations, yieldRecord.yieldBuPerAcre)
  });
});

app.get("/api/v1/farms/:farmId/dashboard", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  const farmId = String(req.params.farmId);
  const fields = listFields().filter((field) => field.farmId === farmId);
  res.json({ farmId, fields, dashboard: dashboard() });
});

app.post("/api/prescriptions", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  createPrescription(req, res);
});

app.post("/api/prescriptions/:id/signoff", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  signPrescriptionRoute(req, res);
});

app.post("/api/prescriptions/:id/packet", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  packetRoute(req, res);
});

app.get("/api/prescriptions/:id/regional-soil-context", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  regionalSoilContextRoute(req, res);
});

app.post("/api/prescriptions/:id/regional-soil-insights", requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
  await regionalSoilInsightRoute(req, res);
});

app.get("/api/prescriptions/:id/vrt", requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
  vrtRoute(req, res);
});

app.post("/api/prescriptions/:id/oem/:target", requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const prescription = getPrescription(id);
  const target = String(req.params.target) as OemTarget;
  if (!prescription) {
    respondError(req, res, 404, "PRESCRIPTION_NOT_FOUND", "Prescription not found.");
    return;
  }
  if (!["john_deere", "case_ih", "agco"].includes(target)) {
    respondError(req, res, 400, "OEM_TARGET_INVALID", "Unknown OEM target.");
    return;
  }
  try {
    const bundle = createVrtBundle(prescription);
    const result = await sendOemExport(target, prescription, bundle);
    saveExport({
      id: `${prescription.id}-${target}-${Date.now()}`,
      prescriptionId: prescription.id,
      target,
      filename: bundle.filename,
      files: bundle.files,
      result,
      createdAt: new Date().toISOString()
    });
    audit(req, "oem.send", "prescription", prescription.id, "success", { target, mode: result.mode, ok: result.ok });
    res.status(result.ok ? 200 : result.mode === "credential_required" ? 202 : 502).json({ bundle: { filename: bundle.filename, files: bundle.files }, result });
  } catch (error) {
    respondError(req, res, 422, "OEM_EXPORT_INVALID", error instanceof Error ? error.message : "Unable to send OEM export.");
  }
});

app.post("/api/copilot/action", requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    respondError(req, res, 503, "OPENROUTER_NOT_CONFIGURED", "OPENROUTER_API_KEY is not configured.");
    return;
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "SoilProve v2"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-5.5",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are Raimond, SoilProve's concise soil report second opinion. Return JSON with assistant and optional action {name,args}. Support navigation, soil-report explanation, farmer meeting prep, generating action plans, signoff, packets, VRT, and OEM export. Raimond handles Q&A groundwork so agronomists can focus on strategy; never imply replacement. Treat OpenRouter as optional demo review insight, not the farmer billing path."
          },
          { role: "user", content: JSON.stringify(req.body) }
        ]
      })
    });
    const json = await response.json();
    res.status(response.ok ? 200 : response.status).json(json);
  } catch (error) {
    respondError(req, res, 502, "OPENROUTER_FAILED", error instanceof Error ? error.message : "OpenRouter request failed.");
  }
});

app.post("/api/realtime/session", requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
  if (!process.env.OPENAI_API_KEY) {
    respondError(req, res, 500, "OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is not configured.");
    return;
  }
  if (!req.body || typeof req.body !== "string") {
    respondError(req, res, 400, "REALTIME_SDP_REQUIRED", "Expected raw SDP body.");
    return;
  }
  try {
    const form = new FormData();
    form.set("sdp", req.body);
    form.set("session", JSON.stringify(buildRealtimeSessionConfig(req.user?.name)));
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Safety-Identifier": safetyIdentifier(req.headers["x-soilprove-user"])
      },
      body: form
    });
    const answer = await response.text();
    res.status(response.status).type(response.ok ? "application/sdp" : "text/plain").send(answer);
  } catch (error) {
    respondError(req, res, 502, "REALTIME_FAILED", error instanceof Error ? error.message : "OpenAI Realtime request failed.");
  }
});

app.use(express.static(distPath));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

return app;
}

export function startServer() {
validateServerConfig();
const app = createApp();
app.listen(port, host, () => {
  console.log(`SoilProve v2 server listening on http://${host}:${port}`);
});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}

function seedCanonicalData() {
  for (const farm of canonicalFarms) saveCanonicalFarm(farm);
}

function createPrescription(req: AuthenticatedRequest, res: express.Response) {
  try {
    const prescription = generatePrescription(req.body.profile, req.body.zones);
    savePrescription(prescription, req.user?.id);
    audit(req, "prescription.create", "prescription", prescription.id, "success", { fieldId: prescription.fieldId, status: prescription.status });
    res.json(prescription);
  } catch (error) {
    respondError(req, res, 422, "PRESCRIPTION_INVALID", error instanceof Error ? error.message : "Unable to generate prescription.");
  }
}

function signPrescriptionRoute(req: AuthenticatedRequest, res: express.Response) {
  const id = String(req.params.id);
  const prescription = getPrescription(id);
  if (!prescription) {
    respondError(req, res, 404, "PRESCRIPTION_NOT_FOUND", "Prescription not found.");
    return;
  }
  if (!canSignPrescription(req.user, prescription.id)) {
    respondError(req, res, 403, "SIGNOFF_FORBIDDEN", "Agronomist signoff requires an admin or linked agronomist session.");
    return;
  }
  try {
    const signed = signPrescription(prescription, String(req.body.note || "Reviewed with agronomist. Approved for savings-assurance pilot."));
    savePrescription(signed);
    audit(req, "prescription.signoff", "prescription", signed.id, "success", { status: signed.status });
    res.json(signed);
  } catch (error) {
    respondError(req, res, 422, "SIGNOFF_INVALID", error instanceof Error ? error.message : "Unable to sign prescription.");
  }
}

function packetRoute(req: AuthenticatedRequest, res: express.Response) {
  const prescription = getPrescription(String(req.params.id));
  if (!prescription) {
    respondError(req, res, 404, "PRESCRIPTION_NOT_FOUND", "Prescription not found.");
    return;
  }
  if (prescription.status === "draft") {
    respondError(req, res, 422, "PACKET_REQUIRES_SIGNOFF", "Agronomist signoff is required before creating a review packet.");
    return;
  }
  const packet = buildPacket(prescription, parseRequestRegionalInsight(req.body));
  const saved = savePacket(packet);
  audit(req, "packet.create", "prescription", prescription.id, "success", { packetId: saved.id });
  res.json(saved);
}

function regionalSoilContextRoute(req: AuthenticatedRequest, res: express.Response) {
  const prescription = getPrescription(String(req.params.id));
  if (!prescription) {
    respondError(req, res, 404, "PRESCRIPTION_NOT_FOUND", "Prescription not found.");
    return;
  }
  res.json(buildRegionalSoilContext(prescription));
}

async function regionalSoilInsightRoute(req: AuthenticatedRequest, res: express.Response) {
  const prescription = getPrescription(String(req.params.id));
  if (!prescription) {
    respondError(req, res, 404, "PRESCRIPTION_NOT_FOUND", "Prescription not found.");
    return;
  }
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-5.5";
  if (!process.env.OPENROUTER_API_KEY) {
    res.json(deterministicRegionalSoilInsight(prescription, model));
    return;
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "SoilProve Regional Soil Context"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "You are a concise agronomy review assistant. Return valid JSON only and never recommend fertilizer rates."
          },
          { role: "user", content: buildRegionalInsightPrompt(prescription) }
        ]
      }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter regional insight failed with ${response.status}: ${text.slice(0, 240)}`);
    }
    const completion = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter regional insight returned an empty response.");
    const insight = parseRegionalInsightCompletion(content, prescription, model);
    audit(req, "regional_soil.insight", "prescription", prescription.id, "success", { mode: insight.mode, model });
    res.json(insight);
  } catch (error) {
    respondError(req, res, 502, "REGIONAL_SOIL_INSIGHT_FAILED", error instanceof Error ? error.message : "Unable to generate regional soil insight.");
  }
}

function parseRequestRegionalInsight(body: unknown): RegionalSoilInsight | undefined {
  if (!body || typeof body !== "object") return undefined;
  const candidate = (body as { regionalInsight?: unknown }).regionalInsight;
  if (!candidate || typeof candidate !== "object") return undefined;
  const insight = candidate as Partial<RegionalSoilInsight>;
  if (insight.mode !== "live" && insight.mode !== "deterministic_only") return undefined;
  if (typeof insight.summary !== "string" || !Array.isArray(insight.reviewFlags) || !Array.isArray(insight.agronomistQuestions) || !Array.isArray(insight.limitations) || !insight.context) return undefined;
  return insight as RegionalSoilInsight;
}

function vrtRoute(req: AuthenticatedRequest, res: express.Response) {
  const prescription = getPrescription(String(req.params.id));
  if (!prescription) {
    respondError(req, res, 404, "PRESCRIPTION_NOT_FOUND", "Prescription not found.");
    return;
  }
  try {
    const bundle = createVrtBundle(prescription);
    if (prescription.status === "signed") {
      const exported = markExported(prescription);
      savePrescription(exported);
    }
    audit(req, "vrt.export", "prescription", prescription.id, "success", { filename: bundle.filename, files: bundle.files });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${bundle.filename}"`);
    res.send(Buffer.from(bundle.bytes));
  } catch (error) {
    respondError(req, res, 422, "VRT_EXPORT_INVALID", error instanceof Error ? error.message : "Unable to export VRT.");
  }
}

function latestPrescriptionForField(fieldId: string) {
  return listPrescriptions().find((prescription) => prescription.fieldId === fieldId) || null;
}

function csvBody(req: express.Request) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body.csv === "string") return req.body.csv;
  throw new Error("CSV body is required.");
}

function assignRequestId(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  req.requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
  res.setHeader("X-Request-Id", req.requestId);
  if (process.env.SOILPROVE_LOG_REQUESTS === "1") {
    res.on("finish", () => {
      console.log(
        JSON.stringify({
          level: "info",
          request_id: req.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode
        })
      );
    });
  }
  next();
}

function createRateLimiter() {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const policy = rateLimitPolicy(req);
    if (!policy) {
      next();
      return;
    }
    const now = Date.now();
    const key = `${policy.family}:${req.ip || req.socket.remoteAddress || "unknown"}`;
    const current = buckets.get(key);
    const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + policy.windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > policy.max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      respondError(req, res, 429, "RATE_LIMITED", "Too many requests. Slow down and retry shortly.", { family: policy.family });
      return;
    }
    next();
  };
}

function rateLimitPolicy(req: express.Request) {
  if (!req.path.startsWith("/api/")) return null;
  const family = req.path === "/api/demo-login" || req.path.startsWith("/api/codex/login") ? "AUTH" : req.path.startsWith("/api/realtime") ? "REALTIME" : "API";
  const max = rateLimitEnvNumber(`SOILPROVE_RATE_LIMIT_${family}_MAX`, family === "API" ? 600 : 60);
  const windowMs = rateLimitEnvNumber(`SOILPROVE_RATE_LIMIT_${family}_WINDOW_MS`, 60_000);
  return { family, max, windowMs };
}

function rateLimitEnvNumber(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function requireTrustedMutationOrigin(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.path.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  if (req.path === "/api/demo-login" || req.path.startsWith("/api/codex/")) {
    next();
    return;
  }
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const referer = typeof req.headers.referer === "string" ? req.headers.referer : "";
  const candidate = origin || referer;
  if (!candidate || isTrustedOrigin(candidate)) {
    next();
    return;
  }
  respondError(req, res, 403, "CSRF_FORBIDDEN", "Browser mutation origin is not trusted.", {
    allowedOriginsEnv: "SOILPROVE_ALLOWED_ORIGINS"
  });
}

function requireAuthenticatedUser(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const parsed = parseSessionCookie(req.headers.cookie || "");
  if (!parsed) {
    respondError(req, res, 401, "AUTH_REQUIRED", "Sign in with ChatGPT or use demo login before using SoilProve business APIs.");
    return;
  }
  const session = getSession(parsed.sessionId);
  const user = session ? getUser(session.userId) : null;
  if (!user || parsed.signature !== signSessionId(parsed.sessionId)) {
    clearUserSessionCookie(res);
    respondError(req, res, 401, "AUTH_REQUIRED", "Your SoilProve session is missing or expired.");
    return;
  }
  req.user = user;
  req.sessionId = parsed.sessionId;
  next();
}

function createUserSession(res: express.Response, user: StoredUser) {
  const sessionId = crypto.randomUUID();
  const createdAt = new Date();
  saveSession({
    id: sessionId,
    userId: user.id,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + sessionTtlMs).toISOString()
  });
  res.cookie(sessionCookieName, `${sessionId}.${signSessionId(sessionId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: productionCookieSecure(),
    maxAge: sessionTtlMs,
    path: "/"
  });
}

function productionCookieSecure() {
  return process.env.NODE_ENV === "production" || process.env.SOILPROVE_SECURE_COOKIES === "1";
}

function clearUserSession(req: AuthenticatedRequest, res: express.Response) {
  if (req.sessionId) deleteSession(req.sessionId);
  clearUserSessionCookie(res);
}

function clearUserSessionCookie(res: express.Response) {
  res.clearCookie(sessionCookieName, { path: "/" });
}

function parseSessionCookie(cookieHeader: string) {
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
  const raw = cookies[sessionCookieName];
  const [sessionId, signature] = raw?.split(".") || [];
  if (!sessionId || !signature) return null;
  return { sessionId, signature };
}

function signSessionId(sessionId: string) {
  return crypto.createHmac("sha256", sessionSecret).update(sessionId).digest("base64url");
}

function parseRole(value: unknown): UserRole | null {
  return value === "farmer" || value === "agronomist" || value === "admin" ? value : null;
}

function canSignPrescription(user: StoredUser | undefined, prescriptionId: string) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "agronomist") return false;
  const ownerUserId = getPrescriptionOwner(prescriptionId);
  const farmId = getPrescriptionFarmId(prescriptionId);
  return Boolean(ownerUserId && farmId && isLinkedAgronomist(ownerUserId, user.id, farmId));
}

function ensureDemoLinkTargets(farmerUserId: string, agronomistUserId: string, farmId: string) {
  const now = new Date().toISOString();
  ensureDemoUser(farmerUserId, "farmer", now);
  ensureDemoUser(agronomistUserId, "agronomist", now);
  if (farmId === "miller-farm" && !listFarms().some((farm) => farm.id === "miller-farm")) {
    saveFarm({
      id: "miller-farm",
      name: "Miller Farm",
      ownerName: "Mark Miller",
      state: "IA",
      county: "Story",
      totalAcres: 200,
      synthetic: 1,
      createdAt: now
    });
  }
}

function ensureDemoUser(id: string, role: UserRole, createdAt: string) {
  if (getUser(id) || !/^(demo|test)-/.test(id)) return;
  const persona = demoPersonas.find((item) => item.id === id);
  saveUser({
    id,
    name: persona?.name || (role === "farmer" ? "Demo Farmer" : "Demo Agronomist"),
    authMode: "demo",
    role,
    planType: "local-demo",
    createdAt
  });
}

function respondError(req: AuthenticatedRequest, res: express.Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({
    error: {
      code,
      message,
      requestId: req.requestId || "unknown",
      ...(details === undefined ? {} : { details })
    }
  });
}

function audit(
  req: AuthenticatedRequest,
  action: string,
  targetType: string,
  targetId: string,
  outcome: "success" | "failure" = "success",
  metadata: Record<string, unknown> = {}
) {
  saveAuditEvent({
    id: crypto.randomUUID(),
    actorUserId: req.user?.id || null,
    actorRole: req.user?.role || null,
    action,
    targetType,
    targetId,
    outcome,
    requestId: req.requestId || "unknown",
    metadata,
    createdAt: new Date().toISOString()
  });
}

function handleParserError(error: unknown, req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const typedError = error as { type?: string; status?: number; limit?: number };
  if (typedError.type === "entity.too.large" || typedError.status === 413) {
    respondError(req, res, 413, "PAYLOAD_TOO_LARGE", "Upload is too large for this endpoint.", { limit: typedError.limit });
    return;
  }
  next(error);
}

function requireLocalCodexAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isLocalAddress(req.ip || "") && !isLocalAddress(req.socket.remoteAddress || "")) {
    res.status(403).json({ error: "Codex login endpoints are local-only." });
    return;
  }
  const origin = req.headers.origin;
  if (origin && !isAllowedLocalOrigin(origin)) {
    res.status(403).json({ error: "Codex login origin is not allowed." });
    return;
  }
  next();
}

function isLocalAddress(value: string) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"].some((local) => value.includes(local));
}

function isAllowedLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isTrustedOrigin(origin: string) {
  if (isAllowedLocalOrigin(origin)) return true;
  const allowed = (process.env.SOILPROVE_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin.replace(/\/$/, ""));
}

function safetyIdentifier(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const base = raw && raw.trim() ? raw.trim() : "local-soilprove-user";
  return `soilprove-${Buffer.from(base).toString("base64url").slice(0, 40)}`;
}
