import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkpointDatabase, closeDatabase, dataDir, dbPath } from "./db";

type BackupManifest = {
  version: 1;
  createdAt: string;
  dbPath: string;
  sha256: string;
  tables: string[];
};

export function createBackupArchive(outRoot = path.resolve(process.cwd(), "soilprove-backups")) {
  checkpointDatabase();
  const createdAt = new Date().toISOString();
  const backupDir = path.join(path.resolve(outRoot), `soilprove-${createdAt.replace(/[:.]/g, "-")}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupDbPath = path.join(backupDir, "soilprove.sqlite");
  fs.copyFileSync(dbPath, backupDbPath);
  const manifest: BackupManifest = {
    version: 1,
    createdAt,
    dbPath,
    sha256: sha256File(backupDbPath),
    tables: sqliteTables(backupDbPath)
  };
  fs.writeFileSync(path.join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ok: true, backupDir, manifest };
}

export function restoreBackupArchive(backupDir: string) {
  const resolved = path.resolve(backupDir);
  const manifestPath = path.join(resolved, "manifest.json");
  const backupDbPath = path.join(resolved, "soilprove.sqlite");
  if (!fs.existsSync(manifestPath)) throw new Error("Backup manifest.json is missing.");
  if (!fs.existsSync(backupDbPath)) throw new Error("Backup soilprove.sqlite is missing.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BackupManifest;
  const actualHash = sha256File(backupDbPath);
  if (manifest.sha256 !== actualHash) throw new Error("Backup checksum mismatch.");
  const tables = sqliteTables(backupDbPath);
  for (const required of ["users", "farms", "fields", "prescriptions", "audit_events"]) {
    if (!tables.includes(required)) throw new Error(`Backup schema is missing ${required}.`);
  }

  closeDatabase();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(backupDbPath, dbPath);
  return { ok: true, restoredTo: dbPath, manifest: { ...manifest, tables } };
}

function sha256File(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sqliteTables(filePath: string) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String((row as { name: string }).name));
  } finally {
    db.close();
  }
}
