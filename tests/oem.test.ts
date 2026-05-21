import test from "node:test";
import assert from "node:assert/strict";
import { defaultProfile, defaultZones, generatePrescription, signPrescription } from "../src/domain";
import { sendOemExport } from "../src/oem";
import { createVrtBundle } from "../src/vrt";

const oldEnv = { ...process.env };
const oldFetch = globalThis.fetch;

test.afterEach(() => {
  process.env = { ...oldEnv };
  globalThis.fetch = oldFetch;
});

test("John Deere adapter simulates Operations Center delivery when credentials are missing", async () => {
  delete process.env.JOHN_DEERE_ACCESS_TOKEN;
  delete process.env.JOHN_DEERE_ORG_ID;
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const result = await sendOemExport("john_deere", prescription, createVrtBundle(prescription));

  assert.equal(result.ok && result.mode === "simulated" && result.message.includes("N_RATE_LBS") && result.responseId?.startsWith("jd-sim-"), true);
});

test("Case IH adapter reports required credentials when missing", async () => {
  delete process.env.CNH_ACCESS_TOKEN;
  delete process.env.CNH_COMPANY_ID;
  delete process.env.CNH_VEHICLE_ID;
  delete process.env.CNH_SUBSCRIPTION_KEY;
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const result = await sendOemExport("case_ih", prescription, createVrtBundle(prescription));

  assert.equal(result.mode, "credential_required");
});

test("AGCO adapter reports required credentials when missing", async () => {
  delete process.env.AGCO_ACCESS_TOKEN;
  delete process.env.AGCO_ENDPOINT_ID;
  delete process.env.AGCO_TENANT_ID;
  delete process.env.AGCO_RECIPIENT_ID;
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const result = await sendOemExport("agco", prescription, createVrtBundle(prescription));

  assert.equal(result.mode, "credential_required");
});

test("John Deere adapter makes live HTTP call when credentials exist", async () => {
  process.env.JOHN_DEERE_ACCESS_TOKEN = "token";
  process.env.JOHN_DEERE_ORG_ID = "org-1";
  let calledUrl = "";
  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return new Response("{}", { status: 201, headers: { "x-request-id": "jd-1" } });
  };
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const result = await sendOemExport("john_deere", prescription, createVrtBundle(prescription));

  assert.equal(result.ok && calledUrl.includes("/organizations/org-1/files"), true);
});

test("Case IH adapter makes live HTTP call when credentials exist", async () => {
  process.env.CNH_ACCESS_TOKEN = "token";
  process.env.CNH_COMPANY_ID = "company-1";
  process.env.CNH_VEHICLE_ID = "vehicle-1";
  process.env.CNH_SUBSCRIPTION_KEY = "sub-key";
  let calledUrl = "";
  let subscriptionKey = "";
  globalThis.fetch = async (url, init) => {
    calledUrl = String(url);
    subscriptionKey = String((init?.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]);
    return new Response("{}", { status: 200 });
  };
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const result = await sendOemExport("case_ih", prescription, createVrtBundle(prescription));

  assert.equal(result.ok && calledUrl.includes("/companies/company-1/vehicles/vehicle-1/prescriptions") && subscriptionKey === "sub-key", true);
});

test("AGCO adapter sends agrirouter binary message headers when credentials exist", async () => {
  process.env.AGCO_ACCESS_TOKEN = "token";
  process.env.AGCO_ENDPOINT_ID = "endpoint-1";
  process.env.AGCO_TENANT_ID = "tenant-1";
  process.env.AGCO_RECIPIENT_ID = "receiver-1";
  let calledUrl = "";
  let headers: Record<string, string> = {};
  globalThis.fetch = async (url, init) => {
    calledUrl = String(url);
    headers = init?.headers as Record<string, string>;
    return new Response("{}", { status: 202 });
  };
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const result = await sendOemExport("agco", prescription, createVrtBundle(prescription));

  assert.equal(
    result.ok &&
      calledUrl.endsWith("/messages") &&
      headers["x-agrirouter-endpoint-id"] === "endpoint-1" &&
      headers["x-agrirouter-tenant-id"] === "tenant-1" &&
      headers["x-agrirouter-direct-recipients"] === "receiver-1" &&
      headers["x-agrirouter-message-type"] === "iso:11783:-10:taskdata:zip",
    true
  );
});
