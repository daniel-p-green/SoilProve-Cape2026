import fs from "node:fs";

const docPath = "docs/oem-integration-feasibility.md";

const brandRequirements = {
  "John Deere": ["OAuth", "files", "sandboxapi.deere.com", "JOHN_DEERE_ACCESS_TOKEN", "simulated", "test guardrail", "no accidental live"],
  "Case IH / CNH": ["OAuth", "subscription", "CNH_ACCESS_TOKEN", "CNH_COMPANY_ID", "credential_required", "test guardrail", "no accidental live"],
  "AGCO / agrirouter": ["endpoint", "tenant", "recipient", "AGCO_ACCESS_TOKEN", "credential_required", "test guardrail", "no accidental live"]
};

export function evaluateOemAppendix() {
  const text = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : "";
  const missing = Object.entries(brandRequirements).flatMap(([brand, snippets]) =>
    snippets.filter((snippet) => !text.toLowerCase().includes(snippet.toLowerCase())).map((snippet) => `${brand}: ${snippet}`)
  );
  const johnDeereDetailScore = (text.match(/John Deere|Deere|Operations Center|JOHN_DEERE|files scope|ag3|sandboxapi/g) || []).length;
  return {
    ok: missing.length === 0 && johnDeereDetailScore >= 10,
    docPath,
    missing,
    johnDeereDetailScore
  };
}

if (process.argv[1]?.endsWith("oemAppendix.ts")) {
  const result = evaluateOemAppendix();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
