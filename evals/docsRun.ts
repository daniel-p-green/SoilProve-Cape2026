import "../server/env";
import { runDocsRequirementsEval } from "./docsRequirements";

const strict = process.argv.includes("--strict") || process.env.SOILPROVE_STRICT_DOCS === "1";
const report = runDocsRequirementsEval();

console.log(JSON.stringify(report, null, 2));

if (strict && !report.allRequirementsImplemented) {
  process.exitCode = 1;
}
