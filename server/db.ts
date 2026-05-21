import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Prescription, TrialPacket } from "../src/domain";
import type { CanonicalFarmFixture, YieldRecordFixture } from "../src/fixtures";

export type UserRole = "farmer" | "agronomist" | "admin";

export type StoredUser = {
  id: string;
  name: string;
  authMode: "codex" | "demo";
  role?: UserRole;
  planType: string | null;
  createdAt: string;
};

export type StoredExport = {
  id: string;
  prescriptionId: string;
  target: string;
  filename: string;
  files: string[];
  result: unknown;
  createdAt: string;
};

export type StoredFarm = {
  id: string;
  name: string;
  ownerName: string;
  state: string;
  county: string;
  totalAcres: number;
  synthetic: number;
  createdAt: string;
};

export type StoredField = {
  id: string;
  farmId: string;
  name: string;
  acres: number;
  soilType: string;
  oemTarget: string;
  createdAt: string;
};

export type StoredYieldRecord = {
  id: string;
  fieldId: string;
  seasonYear: number;
  yieldBuPerAcre: number;
  source: string;
  createdAt: string;
};

export type StoredSoilTest = {
  id: string;
  fieldId: string;
  sampledAt: string;
  labName: string;
  zones: unknown[];
  createdAt: string;
};

export type StoredSession = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type StoredAuditEvent = {
  id: string;
  actorUserId: string | null;
  actorRole: UserRole | null;
  action: string;
  targetType: string;
  targetId: string;
  outcome: "success" | "failure";
  requestId: string;
  metadata: unknown;
  createdAt: string;
};

const dataDir = process.env.SOILPROVE_DATA_DIR ? path.resolve(process.env.SOILPROVE_DATA_DIR) : path.resolve(process.cwd(), ".soilprove-data");
const dbPath = path.join(dataDir, "soilprove.sqlite");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    auth_mode TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'farmer',
    plan_type TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS farms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    state TEXT NOT NULL,
    county TEXT NOT NULL,
    total_acres REAL NOT NULL,
    synthetic INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fields (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL,
    name TEXT NOT NULL,
    acres REAL NOT NULL,
    soil_type TEXT NOT NULL,
    oem_target TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (farm_id) REFERENCES farms(id)
  );

  CREATE TABLE IF NOT EXISTS soil_tests (
    id TEXT PRIMARY KEY,
    field_id TEXT NOT NULL,
    sampled_at TEXT NOT NULL,
    lab_name TEXT NOT NULL,
    zones_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (field_id) REFERENCES fields(id)
  );

  CREATE TABLE IF NOT EXISTS yield_records (
    id TEXT PRIMARY KEY,
    field_id TEXT NOT NULL,
    season_year INTEGER NOT NULL,
    yield_bu_per_acre REAL NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (field_id, season_year),
    FOREIGN KEY (field_id) REFERENCES fields(id)
  );

  CREATE TABLE IF NOT EXISTS prescriptions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS packets (
    id TEXT PRIMARY KEY,
    prescription_id TEXT NOT NULL,
    title TEXT NOT NULL,
    markdown TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
  );

  CREATE TABLE IF NOT EXISTS exports (
    id TEXT PRIMARY KEY,
    prescription_id TEXT NOT NULL,
    target TEXT NOT NULL,
    filename TEXT NOT NULL,
    files_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
  );

  CREATE TABLE IF NOT EXISTS farmer_agronomist_links (
    farmer_user_id TEXT NOT NULL,
    agronomist_user_id TEXT NOT NULL,
    farm_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (farmer_user_id, agronomist_user_id, farm_id),
    FOREIGN KEY (farmer_user_id) REFERENCES users(id),
    FOREIGN KEY (agronomist_user_id) REFERENCES users(id),
    FOREIGN KEY (farm_id) REFERENCES farms(id)
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    request_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'farmer'");
ensureColumn("prescriptions", "owner_user_id", "TEXT");

export function resetDatabaseForTests() {
  db.exec("DELETE FROM audit_events; DELETE FROM exports; DELETE FROM packets; DELETE FROM prescriptions; DELETE FROM yield_records; DELETE FROM soil_tests; DELETE FROM farmer_agronomist_links; DELETE FROM fields; DELETE FROM farms; DELETE FROM sessions; DELETE FROM users;");
}

export function saveUser(user: StoredUser) {
  const role = user.role || "farmer";
  db.prepare(
    `INSERT INTO users (id, name, auth_mode, role, plan_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, auth_mode = excluded.auth_mode, role = excluded.role, plan_type = excluded.plan_type`
  ).run(user.id, user.name, user.authMode, role, user.planType, user.createdAt);
  return { ...user, role };
}

export function getUser(id: string): StoredUser | null {
  const row = db
    .prepare("SELECT id, name, auth_mode as authMode, role, plan_type as planType, created_at as createdAt FROM users WHERE id = ?")
    .get(id) as StoredUser | undefined;
  return row || null;
}

export function saveAgronomistLink(farmerUserId: string, agronomistUserId: string, farmId: string, createdAt = new Date().toISOString()) {
  db.prepare(
    `INSERT INTO farmer_agronomist_links (farmer_user_id, agronomist_user_id, farm_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(farmer_user_id, agronomist_user_id, farm_id) DO NOTHING`
  ).run(farmerUserId, agronomistUserId, farmId, createdAt);
  return { farmerUserId, agronomistUserId, farmId, createdAt };
}

export function saveFarm(farm: Omit<StoredFarm, "createdAt" | "synthetic"> & { synthetic?: number; createdAt?: string }) {
  const createdAt = farm.createdAt || new Date().toISOString();
  db.prepare(
    `INSERT INTO farms (id, name, owner_name, state, county, total_acres, synthetic, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, owner_name = excluded.owner_name, state = excluded.state, county = excluded.county, total_acres = excluded.total_acres`
  ).run(farm.id, farm.name, farm.ownerName, farm.state, farm.county, farm.totalAcres, farm.synthetic || 0, createdAt);
  return { ...farm, synthetic: farm.synthetic || 0, createdAt };
}

export function isLinkedAgronomist(farmerUserId: string, agronomistUserId: string, farmId?: string) {
  const row = farmId
    ? db
        .prepare("SELECT 1 FROM farmer_agronomist_links WHERE farmer_user_id = ? AND agronomist_user_id = ? AND farm_id = ? LIMIT 1")
        .get(farmerUserId, agronomistUserId, farmId)
    : db
        .prepare("SELECT 1 FROM farmer_agronomist_links WHERE farmer_user_id = ? AND agronomist_user_id = ? LIMIT 1")
        .get(farmerUserId, agronomistUserId);
  return Boolean(row);
}

export function saveSession(session: StoredSession) {
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at`
  ).run(session.id, session.userId, session.createdAt, session.expiresAt);
  return session;
}

export function getSession(id: string): StoredSession | null {
  const row = db
    .prepare("SELECT id, user_id as userId, created_at as createdAt, expires_at as expiresAt FROM sessions WHERE id = ?")
    .get(id) as StoredSession | undefined;
  if (!row) return null;
  if (Date.parse(row.expiresAt) <= Date.now()) {
    deleteSession(id);
    return null;
  }
  return row;
}

export function deleteSession(id: string) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function saveCanonicalFarm(farm: CanonicalFarmFixture) {
  const createdAt = new Date().toISOString();
  const totalAcres = farm.fields.reduce((sum, field) => sum + field.profile.acres, 0);
  db.prepare(
    `INSERT INTO farms (id, name, owner_name, state, county, total_acres, synthetic, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, owner_name = excluded.owner_name, state = excluded.state, county = excluded.county, total_acres = excluded.total_acres`
  ).run(farm.id, farm.displayName, farm.ownerName, farm.state, farm.county, totalAcres, farm.synthetic ? 1 : 0, createdAt);

  for (const field of farm.fields) {
    db.prepare(
      `INSERT INTO fields (id, farm_id, name, acres, soil_type, oem_target, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET farm_id = excluded.farm_id, name = excluded.name, acres = excluded.acres, soil_type = excluded.soil_type, oem_target = excluded.oem_target`
    ).run(field.id, farm.id, field.profile.fieldName, field.profile.acres, field.profile.soilType, field.oemTarget, createdAt);
    db.prepare(
      `INSERT INTO soil_tests (id, field_id, sampled_at, lab_name, zones_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET sampled_at = excluded.sampled_at, lab_name = excluded.lab_name, zones_json = excluded.zones_json`
    ).run(`${field.id}-soil-test-2026`, field.id, field.soilTest.sampledAt, field.soilTest.labName, JSON.stringify(field.zones), createdAt);
    for (const yieldRecord of field.yieldRecords) saveYieldRecord(field.id, yieldRecord, createdAt, { allowUpdate: true });
  }

  return farm;
}

export function saveSoilTest(fieldId: string, sampledAt: string, labName: string, zones: unknown[], createdAt = new Date().toISOString()) {
  const id = `${fieldId}-soil-test-${sampledAt}`;
  db.prepare(
    `INSERT INTO soil_tests (id, field_id, sampled_at, lab_name, zones_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET sampled_at = excluded.sampled_at, lab_name = excluded.lab_name, zones_json = excluded.zones_json`
  ).run(id, fieldId, sampledAt, labName, JSON.stringify(zones), createdAt);
  return { id, fieldId, sampledAt, labName, zones, createdAt };
}

export function saveYieldRecord(
  fieldId: string,
  yieldRecord: YieldRecordFixture,
  createdAt = new Date().toISOString(),
  options: { allowUpdate?: boolean } = {}
) {
  const existing = db.prepare("SELECT id FROM yield_records WHERE field_id = ? AND season_year = ?").get(fieldId, yieldRecord.seasonYear);
  if (existing && !options.allowUpdate) throw new Error("Yield records are immutable; upload a correction through an admin workflow.");
  if (existing && options.allowUpdate) {
    db.prepare("UPDATE yield_records SET yield_bu_per_acre = ?, source = ? WHERE field_id = ? AND season_year = ?").run(
      yieldRecord.yieldBuPerAcre,
      yieldRecord.source,
      fieldId,
      yieldRecord.seasonYear
    );
    return { fieldId, ...yieldRecord };
  }
  db.prepare(
    `INSERT INTO yield_records (id, field_id, season_year, yield_bu_per_acre, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(`${fieldId}-${yieldRecord.seasonYear}`, fieldId, yieldRecord.seasonYear, yieldRecord.yieldBuPerAcre, yieldRecord.source, createdAt);
  return { fieldId, ...yieldRecord };
}

export function listFarms(): StoredFarm[] {
  return db
    .prepare("SELECT id, name, owner_name as ownerName, state, county, total_acres as totalAcres, synthetic, created_at as createdAt FROM farms ORDER BY name")
    .all() as StoredFarm[];
}

export function listFields(): StoredField[] {
  return db
    .prepare("SELECT id, farm_id as farmId, name, acres, soil_type as soilType, oem_target as oemTarget, created_at as createdAt FROM fields ORDER BY farm_id, name")
    .all() as StoredField[];
}

export function listYieldRecords(fieldId?: string): StoredYieldRecord[] {
  const statement = fieldId
    ? db.prepare("SELECT id, field_id as fieldId, season_year as seasonYear, yield_bu_per_acre as yieldBuPerAcre, source, created_at as createdAt FROM yield_records WHERE field_id = ? ORDER BY season_year")
    : db.prepare("SELECT id, field_id as fieldId, season_year as seasonYear, yield_bu_per_acre as yieldBuPerAcre, source, created_at as createdAt FROM yield_records ORDER BY field_id, season_year");
  return (fieldId ? statement.all(fieldId) : statement.all()) as StoredYieldRecord[];
}

export function listUsers(): StoredUser[] {
  return db
    .prepare("SELECT id, name, auth_mode as authMode, role, plan_type as planType, created_at as createdAt FROM users ORDER BY created_at DESC")
    .all() as StoredUser[];
}

export function savePrescription(prescription: Prescription, ownerUserId?: string | null) {
  const current = getPrescription(prescription.id);
  if (current?.status === "exported") throw new Error("Exported prescriptions are immutable.");
  const owner = ownerUserId ?? getPrescriptionOwner(prescription.id);
  ensureFieldForPrescription(prescription);
  db.prepare(
    `INSERT INTO prescriptions (id, owner_user_id, status, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET owner_user_id = COALESCE(prescriptions.owner_user_id, excluded.owner_user_id), status = excluded.status, payload_json = excluded.payload_json, updated_at = excluded.updated_at`
  ).run(prescription.id, owner, prescription.status, JSON.stringify(prescription), prescription.createdAt, new Date().toISOString());
  return prescription;
}

export function getPrescriptionOwner(id: string): string | null {
  const row = db.prepare("SELECT owner_user_id as ownerUserId FROM prescriptions WHERE id = ?").get(id) as { ownerUserId: string | null } | undefined;
  return row?.ownerUserId || null;
}

export function getPrescriptionFarmId(id: string): string | null {
  const prescription = getPrescription(id);
  if (!prescription) return null;
  const row = db.prepare("SELECT farm_id as farmId FROM fields WHERE id = ?").get(prescription.fieldId) as { farmId: string } | undefined;
  return row?.farmId || null;
}

export function getPrescription(id: string): Prescription | null {
  const row = db.prepare("SELECT payload_json FROM prescriptions WHERE id = ?").get(id) as { payload_json: string } | undefined;
  return row ? (JSON.parse(row.payload_json) as Prescription) : null;
}

export function latestPrescription(): Prescription | null {
  const row = db
    .prepare("SELECT payload_json FROM prescriptions ORDER BY updated_at DESC, created_at DESC LIMIT 1")
    .get() as { payload_json: string } | undefined;
  return row ? (JSON.parse(row.payload_json) as Prescription) : null;
}

export function listPrescriptions(): Prescription[] {
  return db
    .prepare("SELECT payload_json FROM prescriptions ORDER BY updated_at DESC")
    .all()
    .map((row) => JSON.parse((row as { payload_json: string }).payload_json) as Prescription);
}

export function savePacket(packet: TrialPacket) {
  const id = `${packet.prescriptionId}-${packet.createdAt}`;
  db.prepare(
    `INSERT INTO packets (id, prescription_id, title, markdown, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, packet.prescriptionId, packet.title, packet.markdown, packet.createdAt);
  return { id, ...packet };
}

export function latestPacket(prescriptionId: string) {
  return db
    .prepare("SELECT id, prescription_id as prescriptionId, title, markdown, created_at as createdAt FROM packets WHERE prescription_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(prescriptionId);
}

export function saveExport(exportRecord: StoredExport) {
  db.prepare(
    `INSERT INTO exports (id, prescription_id, target, filename, files_json, result_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    exportRecord.id,
    exportRecord.prescriptionId,
    exportRecord.target,
    exportRecord.filename,
    JSON.stringify(exportRecord.files),
    JSON.stringify(exportRecord.result),
    exportRecord.createdAt
  );
  return exportRecord;
}

export function saveAuditEvent(event: StoredAuditEvent) {
  db.prepare(
    `INSERT INTO audit_events (id, actor_user_id, actor_role, action, target_type, target_id, outcome, request_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.id,
    event.actorUserId,
    event.actorRole,
    event.action,
    event.targetType,
    event.targetId,
    event.outcome,
    event.requestId,
    JSON.stringify(event.metadata ?? {}),
    event.createdAt
  );
  return event;
}

export function listAuditEvents(limit = 200): StoredAuditEvent[] {
  return db
    .prepare(
      `SELECT id, actor_user_id as actorUserId, actor_role as actorRole, action, target_type as targetType, target_id as targetId,
              outcome, request_id as requestId, metadata_json as metadataJson, created_at as createdAt
       FROM audit_events
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit)
    .map((row) => {
      const item = row as Omit<StoredAuditEvent, "metadata"> & { metadataJson: string };
      return { ...item, metadata: JSON.parse(item.metadataJson) };
    });
}

export function dashboard() {
  const prescriptions = listPrescriptions();
  const totalAcres = prescriptions.reduce((sum, item) => sum + item.profile.acres, 0);
  const modeledSavings = prescriptions.reduce((sum, item) => sum + item.savings.grossFieldSavings, 0);
  const signed = prescriptions.filter((item) => item.status === "signed" || item.status === "exported").length;
  const exported = prescriptions.filter((item) => item.status === "exported").length;
  return {
    prescriptions: prescriptions.length,
    signed,
    exported,
    totalAcres: Math.round(totalAcres * 100) / 100,
    modeledSavings: Math.round(modeledSavings * 100) / 100,
    users: listUsers().length,
    farms: listFarms().length,
    fields: listFields().length,
    yieldRecords: listYieldRecords().length
  };
}

export function checkpointDatabase() {
  db.exec("PRAGMA wal_checkpoint(FULL);");
}

export function closeDatabase() {
  db.close();
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

function ensureFieldForPrescription(prescription: Prescription) {
  const farmId = slug(prescription.profile.farmName);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO farms (id, name, owner_name, state, county, total_acres, synthetic, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(
    farmId,
    prescription.profile.farmName,
    prescription.profile.farmerName,
    prescription.profile.state,
    prescription.profile.county,
    prescription.profile.acres,
    0,
    createdAt
  );
  db.prepare(
    `INSERT INTO fields (id, farm_id, name, acres, soil_type, oem_target, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(prescription.fieldId, farmId, prescription.profile.fieldName, prescription.profile.acres, prescription.profile.soilType, "john_deere", createdAt);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export { dataDir, dbPath };
