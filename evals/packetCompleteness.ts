import fs from "node:fs";
import path from "node:path";

const packetPath = path.resolve("docs/judge-submission-packet.md");

const requiredSections = [
  "One-Page Narrative",
  "Three-Minute Demo Script",
  "Architecture Diagram",
  "Requirements Matrix Summary",
  "OEM Dependency Note",
  "Security Note",
  "Farmer Stakes",
  "Browser Evidence"
];

const requiredEvidenceLabels = [
  "onboarding",
  "intake/import",
  "action plan",
  "context",
  "packet",
  "exports/OEM",
  "dashboard/voice"
];

type PacketEvalResult = {
  ok: boolean;
  packetPath: string;
  missingSections: string[];
  evidenceReferences: number;
  missingEvidenceLabels: string[];
};

export function evaluateJudgePacket(): PacketEvalResult {
  const markdown = fs.existsSync(packetPath) ? fs.readFileSync(packetPath, "utf8") : "";
  const missingSections = requiredSections.filter((section) => !markdown.includes(`## ${section}`));
  const missingEvidenceLabels = requiredEvidenceLabels.filter((label) => !markdown.toLowerCase().includes(label.toLowerCase()));
  const evidenceReferences = (markdown.match(/Evidence ref:/g) || []).length;

  return {
    ok: missingSections.length === 0 && missingEvidenceLabels.length === 0 && evidenceReferences >= 6,
    packetPath: path.relative(process.cwd(), packetPath),
    missingSections,
    evidenceReferences,
    missingEvidenceLabels
  };
}

if (process.argv[1]?.endsWith("packetCompleteness.ts")) {
  const result = evaluateJudgePacket();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
