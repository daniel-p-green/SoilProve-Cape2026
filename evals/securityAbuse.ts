import { execFileSync } from "node:child_process";
import fs from "node:fs";

const forbiddenValuePatterns = [/\bsk-[A-Za-z0-9_-]{20,}/, /\bsk-proj-[A-Za-z0-9_-]{20,}/];
const forbiddenEnvAssignmentPattern = /\b(openai|openrouter|john_deere|cnh|agco)_[a-z0-9_]*?(api_)?(key|token|secret)[ \t]*[:=][ \t]*["']?([A-Za-z0-9_\-]{12,})/i;

const ignoredExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".pdf", ".sqlite", ".db"]);

export function evaluateSecurityAbuse() {
  const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => !ignoredExtensions.has(file.slice(file.lastIndexOf(".")).toLowerCase()));

  const secretHits = trackedFiles.flatMap((file) => {
    const text = fs.readFileSync(file, "utf8");
    const tokenHits = forbiddenValuePatterns.flatMap((pattern) => {
      const matches = text.match(pattern) || [];
      return matches.map((match) => ({ file, pattern: String(pattern), preview: match.slice(0, 12) }));
    });
    const assignmentHits = text
      .split("\n")
      .map((line) => ({ line, match: forbiddenEnvAssignmentPattern.exec(line) }))
      .filter(({ line, match }) => {
        if (!match) return false;
        const quotedLiteral = /[:=][ \t]*["']/.test(line);
        const envLikeFile = file.includes(".env");
        return quotedLiteral || envLikeFile;
      })
      .map(({ match }) => ({ file, pattern: String(forbiddenEnvAssignmentPattern), preview: `${match?.[1]}_${match?.[3]}` }));
    return [...tokenHits, ...assignmentHits];
  });

  const server = fs.readFileSync("server/index.ts", "utf8");
  const ocr = fs.readFileSync("server/ocr.ts", "utf8");
  const packageJson = fs.readFileSync("package.json", "utf8");
  const requiredServerSnippets = [
    "productionCookieSecure",
    "PAYLOAD_TOO_LARGE",
    "entity.too.large",
    "AUTH_REQUIRED"
  ];
  const missingServerSnippets = requiredServerSnippets.filter((snippet) => !server.includes(snippet));
  if (!ocr.includes("fs.rmSync(dir, { recursive: true, force: true })")) missingServerSnippets.push("fs.rmSync(dir, { recursive: true, force: true })");
  const missingPackageScripts = ["evals:security"].filter((snippet) => !packageJson.includes(snippet));

  return {
    ok: secretHits.length === 0 && missingServerSnippets.length === 0 && missingPackageScripts.length === 0,
    trackedFiles: trackedFiles.length,
    secretHits,
    missingServerSnippets,
    missingPackageScripts
  };
}

if (process.argv[1]?.endsWith("securityAbuse.ts")) {
  const result = evaluateSecurityAbuse();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
