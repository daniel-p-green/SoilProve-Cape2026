import { createBackupArchive, restoreBackupArchive } from "../server/backup";

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "backup") {
    console.log(JSON.stringify(createBackupArchive(optionValue(args, "--out") || "soilprove-backups")));
  } else if (command === "restore") {
    const from = optionValue(args, "--from");
    if (!from) throw new Error("Usage: npm run db:restore -- --from <backup-dir>");
    console.log(JSON.stringify(restoreBackupArchive(from)));
  } else {
    throw new Error("Usage: npm run db:backup -- --out <dir> OR npm run db:restore -- --from <backup-dir>");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function optionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
