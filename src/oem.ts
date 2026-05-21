import type { OemTarget, Prescription } from "./domain";
import type { VrtBundle } from "./vrt";

export type OemDeliveryResult = {
  target: OemTarget;
  ok: boolean;
  mode: "live" | "simulated" | "credential_required" | "failed";
  message: string;
  status?: number;
  responseId?: string;
  endpoint?: string;
};

export async function sendOemExport(target: OemTarget, prescription: Prescription, bundle: VrtBundle): Promise<OemDeliveryResult> {
  if (target === "john_deere") return sendJohnDeere(prescription, bundle);
  if (target === "case_ih") return sendCaseIh(prescription, bundle);
  return sendAgco(prescription, bundle);
}

function credentials(names: string[]) {
  const missing = names.filter((name) => !process.env[name]);
  return { ok: missing.length === 0, missing };
}

async function sendJohnDeere(prescription: Prescription, bundle: VrtBundle): Promise<OemDeliveryResult> {
  const required = credentials(["JOHN_DEERE_ACCESS_TOKEN", "JOHN_DEERE_ORG_ID"]);
  const endpoint = `${process.env.JOHN_DEERE_API_BASE || "https://sandboxapi.deere.com/platform"}/organizations/${process.env.JOHN_DEERE_ORG_ID || "{orgId}"}/files`;
  if (!required.ok) return simulateJohnDeere(prescription, bundle, required.missing, endpoint);

  return postBundle({
    target: "john_deere",
    endpoint,
    headers: { Authorization: `Bearer ${process.env.JOHN_DEERE_ACCESS_TOKEN}` },
    prescription,
    bundle
  });
}

async function sendCaseIh(prescription: Prescription, bundle: VrtBundle): Promise<OemDeliveryResult> {
  const required = credentials(["CNH_ACCESS_TOKEN", "CNH_COMPANY_ID", "CNH_VEHICLE_ID", "CNH_SUBSCRIPTION_KEY"]);
  const endpoint = `${process.env.CNH_API_BASE || "https://api-data.cnh.com/v1"}/fieldops/companies/${process.env.CNH_COMPANY_ID || "{companyId}"}/vehicles/${process.env.CNH_VEHICLE_ID || "{vehicleId}"}/prescriptions`;
  if (!required.ok) return credentialRequired("case_ih", required.missing, endpoint);

  return postBundle({
    target: "case_ih",
    endpoint,
    headers: { Authorization: `Bearer ${process.env.CNH_ACCESS_TOKEN}`, "Ocp-Apim-Subscription-Key": String(process.env.CNH_SUBSCRIPTION_KEY) },
    prescription,
    bundle
  });
}

async function sendAgco(prescription: Prescription, bundle: VrtBundle): Promise<OemDeliveryResult> {
  const required = credentials(["AGCO_ACCESS_TOKEN", "AGCO_ENDPOINT_ID", "AGCO_TENANT_ID", "AGCO_RECIPIENT_ID"]);
  const endpoint = `${process.env.AGCO_API_BASE || "https://api.agrirouter.com"}/messages`;
  if (!required.ok) return credentialRequired("agco", required.missing, endpoint);

  return postAgrirouterMessage(endpoint, prescription, bundle);
}

function credentialRequired(target: OemTarget, missing: string[], endpoint: string): OemDeliveryResult {
  return {
    target,
    ok: false,
    mode: "credential_required",
    message: `Live ${targetLabel(target)} delivery is wired, but missing ${missing.join(", ")}.`,
    endpoint
  };
}

function simulateJohnDeere(prescription: Prescription, bundle: VrtBundle, missing: string[], endpoint: string): OemDeliveryResult {
  const dbfFile = bundle.files.find((file) => file.endsWith(".dbf"));
  const responseId = `jd-sim-${deterministicHash(`${prescription.id}:${bundle.filename}:${bundle.bytes.length}`)}`;
  return {
    target: "john_deere",
    ok: true,
    mode: "simulated",
    endpoint,
    responseId,
    message: `John Deere Operations Center simulation accepted ${bundle.filename} (${dbfFile || "DBF"} with N_RATE_LBS). Missing live auth: ${missing.join(", ")}.`
  };
}

async function postBundle(input: {
  target: OemTarget;
  endpoint: string;
  headers: Record<string, string>;
  prescription: Prescription;
  bundle: VrtBundle;
}): Promise<OemDeliveryResult> {
  const body = new FormData();
  body.set("fieldName", input.prescription.profile.fieldName);
  body.set("crop", input.prescription.profile.crop);
  body.set("seasonYear", String(input.prescription.profile.seasonYear));
  const fileBytes = input.bundle.bytes.slice();
  body.set("file", new Blob([fileBytes.buffer], { type: "application/zip" }), input.bundle.filename);

  try {
    const response = await fetch(input.endpoint, { method: "POST", headers: input.headers, body });
    const text = await response.text();
    return {
      target: input.target,
      ok: response.ok,
      mode: response.ok ? "live" : "failed",
      status: response.status,
      endpoint: input.endpoint,
      responseId: response.headers.get("x-request-id") ?? undefined,
      message: response.ok
        ? `${targetLabel(input.target)} accepted ${input.bundle.filename}.`
        : `${targetLabel(input.target)} rejected upload: ${text.slice(0, 240) || response.statusText}`
    };
  } catch (error) {
    return {
      target: input.target,
      ok: false,
      mode: "failed",
      endpoint: input.endpoint,
      message: error instanceof Error ? error.message : `Unable to reach ${targetLabel(input.target)}.`
    };
  }
}

async function postAgrirouterMessage(endpoint: string, prescription: Prescription, bundle: VrtBundle): Promise<OemDeliveryResult> {
  const contextId = `soilprove-${deterministicHash(`${prescription.id}:${bundle.filename}:${Date.now()}`)}`;
  const bodyBytes = bundle.bytes.slice();
  const headers = {
    Authorization: `Bearer ${process.env.AGCO_ACCESS_TOKEN}`,
    "Content-Type": "application/octet-stream",
    "x-agrirouter-endpoint-id": String(process.env.AGCO_ENDPOINT_ID),
    "x-agrirouter-tenant-id": String(process.env.AGCO_TENANT_ID),
    "x-agrirouter-message-type": process.env.AGCO_MESSAGE_TYPE || "iso:11783:-10:taskdata:zip",
    "x-agrirouter-is-publish": "false",
    "x-agrirouter-direct-recipients": String(process.env.AGCO_RECIPIENT_ID),
    "x-agrirouter-context-id": contextId,
    "x-agrirouter-sent-timestamp": new Date().toISOString()
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: new Blob([bodyBytes.buffer], { type: "application/octet-stream" })
    });
    const text = await response.text();
    return {
      target: "agco",
      ok: response.ok,
      mode: response.ok ? "live" : "failed",
      status: response.status,
      endpoint,
      responseId: contextId,
      message: response.ok
        ? `AGCO / agrirouter accepted ${bundle.filename}; delivery still depends on recipient route configuration.`
        : `AGCO / agrirouter rejected upload: ${text.slice(0, 240) || response.statusText}`
    };
  } catch (error) {
    return {
      target: "agco",
      ok: false,
      mode: "failed",
      endpoint,
      responseId: contextId,
      message: error instanceof Error ? error.message : "Unable to reach AGCO / agrirouter."
    };
  }
}

function targetLabel(target: OemTarget) {
  if (target === "john_deere") return "John Deere Operations Center";
  if (target === "case_ih") return "Case IH / CNH FieldOps";
  return "AGCO / agrirouter";
}

function deterministicHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
