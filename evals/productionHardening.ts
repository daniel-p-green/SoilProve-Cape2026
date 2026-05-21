import fs from "node:fs";

const pdfDir = "tests/fixtures/imports/missouri-pdfs";

export function evaluateProductionHardening() {
  const server = read("server/index.ts");
  const db = read("server/db.ts");
  const app = read("src/App.tsx");
  const packageJson = read("package.json");
  const backup = read("server/backup.ts") + read("scripts/db-backup.ts");
  const prod = read("scripts/prod-check.ts") + read("server/env.ts");
  const ocr = read("src/ocr.ts") + read("tests/ocr.test.ts");
  const pdfs = fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir).filter((name) => name.endsWith(".pdf")).sort() : [];

  const gates = [
    gate("RATE-LIMIT", server, ["RATE_LIMITED", "rateLimitPolicy", "SOILPROVE_RATE_LIMIT"]),
    gate("CSRF-ORIGIN", server, ["CSRF_FORBIDDEN", "requireTrustedMutationOrigin", "SOILPROVE_ALLOWED_ORIGINS"]),
    gate("AUDIT-TRAIL", db + server, ["CREATE TABLE IF NOT EXISTS audit_events", "saveAuditEvent", "/api/v1/admin/audit-events"]),
    gate("BACKUP-RESTORE", backup + packageJson, ["createBackupArchive", "restoreBackupArchive", "db:backup", "db:restore"]),
    gate("PROD-CONFIG", prod + packageJson, ["ci:prod-check", "SOILPROVE_SESSION_SECRET", "SOILPROVE_ALLOWED_ORIGINS"]),
    gate("MISSOURI-PDFS", ocr, ["missouri-pdfs", "reviewRequired", "labFields"]),
    gate("DEMO-USERS", server + app, ["/api/demo-users", "demoPersonas", "Start happy path"])
  ];

  return {
    ok: gates.every((item) => item.ok) && pdfs.length >= 5,
    pdfs,
    gates
  };
}

function gate(id: string, text: string, snippets: string[]) {
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  return { id, ok: missing.length === 0, missing };
}

function read(file: string) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

if (process.argv[1]?.endsWith("productionHardening.ts")) {
  const result = evaluateProductionHardening();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
