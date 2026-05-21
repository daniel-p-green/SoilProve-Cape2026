import test from "node:test";
import assert from "node:assert/strict";
import { buildPacket, defaultProfile, defaultZones, generatePrescription, markExported, signPrescription } from "../src/domain";
import { createVrtBundle } from "../src/vrt";
import { canonicalFarms } from "../src/fixtures";
import { dashboard, latestPacket, latestPrescription, resetDatabaseForTests, saveCanonicalFarm, saveExport, savePacket, savePrescription, saveUser, saveYieldRecord } from "../server/db";

test.beforeEach(() => {
  resetDatabaseForTests();
});

test("SQLite persists users, prescriptions, packets, exports, and dashboard totals", () => {
  const signed = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "db-prescription"), "Reviewed.");
  const bundle = createVrtBundle(signed);
  saveUser({ id: "user-1", name: "Test User", authMode: "demo", planType: "local-demo", createdAt: new Date().toISOString() });
  savePrescription(signed);
  savePacket(buildPacket(signed));
  saveExport({
    id: "export-1",
    prescriptionId: signed.id,
    target: "john_deere",
    filename: bundle.filename,
    files: bundle.files,
    result: { mode: "credential_required" },
    createdAt: new Date().toISOString()
  });

  assert.deepEqual(
    {
      latestId: latestPrescription()?.id,
      packetExists: Boolean(latestPacket(signed.id)),
      users: dashboard().users,
      prescriptions: dashboard().prescriptions
    },
    { latestId: "db-prescription", packetExists: true, users: 1, prescriptions: 1 }
  );
});

test("exported prescriptions and yield records are immutable", () => {
  const signed = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "immutable-prescription"), "Reviewed.");
  saveCanonicalFarm(canonicalFarms[0]);
  savePrescription(markExported(signed));
  saveYieldRecord("mark_story_county_north_80", { seasonYear: 2026, yieldBuPerAcre: 210, source: "operator_entry" });

  assert.throws(() => savePrescription({ ...signed, status: "signed" }), /immutable/);
  assert.throws(() => saveYieldRecord("mark_story_county_north_80", { seasonYear: 2026, yieldBuPerAcre: 212, source: "operator_entry" }), /immutable/);
});
