import "../server/env";
import { parseSoilCsvText } from "../src/ocr";
import { saveAgronomistLink, saveFarm } from "../server/db";

type AdminResult = {
  ok: boolean;
  command: string;
  message: string;
  data?: unknown;
};

export function runAdminCommand(argv: string[]): AdminResult {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  if (command === "create-farm") {
    const required = ["id", "name", "owner", "state", "county", "acres"];
    requireFlags(flags, required);
    const farm = saveFarm({
      id: String(flags.id),
      name: String(flags.name),
      ownerName: String(flags.owner),
      state: String(flags.state),
      county: String(flags.county),
      totalAcres: Number(flags.acres),
      synthetic: 0
    });
    return { ok: true, command, message: `Created farm ${farm.id}.`, data: farm };
  }
  if (command === "link-agronomist") {
    requireFlags(flags, ["farmer", "agronomist", "farm"]);
    const link = saveAgronomistLink(String(flags.farmer), String(flags.agronomist), String(flags.farm));
    return { ok: true, command, message: `Linked ${link.agronomistUserId} to ${link.farmerUserId}.`, data: link };
  }
  if (command === "validate-soil-test") {
    requireFlags(flags, ["csv"]);
    const fieldAcres = flags["field-acres"] === undefined ? undefined : Number(flags["field-acres"]);
    const result = parseSoilCsvText(String(flags.csv), fieldAcres);
    return { ok: true, command, message: `Validated ${result.zones.length} soil zones.`, data: { zones: result.zones.length } };
  }
  throw new Error("Unknown admin command. Use create-farm, link-agronomist, or validate-soil-test.");
}

function parseFlags(argv: string[]) {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    flags[key] = value;
    index += 1;
  }
  return flags;
}

function requireFlags(flags: Record<string, string>, names: string[]) {
  const missing = names.filter((name) => !flags[name]);
  if (missing.length) throw new Error(`Missing required flags: ${missing.map((name) => `--${name}`).join(", ")}`);
}

if (process.argv[1]?.endsWith("scripts/admin.ts")) {
  try {
    console.log(JSON.stringify(runAdminCommand(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
