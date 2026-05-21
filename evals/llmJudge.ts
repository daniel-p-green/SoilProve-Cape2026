import type { SpecGate, TraceabilityReport } from "./specCoverage";

type JudgeInput = Pick<TraceabilityReport, "openItems"> & {
  gates: SpecGate[];
};

type LlmJudgeResult =
  | { ok: true; mode: "skipped"; reason: string }
  | {
      ok: boolean;
      mode: "live";
      model: string;
      score: number;
      verdict: string;
      dimensionScores: Record<string, number>;
      blockingGaps: string[];
      evidenceNotes: string[];
    }
  | { ok: false; mode: "not_configured"; reason: string };

export function buildJudgePrompt(input: JudgeInput) {
  const blocking = input.gates.filter((gate) => gate.severity === "blocking");
  const advisory = input.gates.filter((gate) => gate.severity === "advisory");

  return [
    "You are grading SoilProve, a voice-first soil report second opinion and agronomist-reviewed action-plan workflow for Vibeathon Cape 2026.",
    "Grade completeness against the original docs, SPEC.md, the source-pack judging rubric, and the user addendum as the minimum bar.",
    "The app must include Codex app-server ChatGPT login with no farmer API-key setup, a real database, John Deere/CNH/AGCO OEM posture, real VRT export, PDF soil report import, gpt-realtime-2 voice navigation with Cedar as Raimond, optional OpenRouter demo insight, onboarding, conservative claims safety, and serious evals.",
    "Do not reward unsafe final-prescription claims. Savings assurance language can exist only as a review-gated offer tied to measured results.",
    "",
    "Blocking gates:",
    JSON.stringify(blocking, null, 2),
    "",
    "Advisory gates:",
    JSON.stringify(advisory, null, 2),
    "",
    "Declared open items:",
    JSON.stringify(input.openItems, null, 2),
    "",
    "Return JSON only with this exact shape:",
    JSON.stringify(
      {
        score: 0,
        verdict: "pass|revise",
        dimension_scores: {
          product_completeness: 0,
          technical_working_state: 0,
          safety_and_claims: 0,
          oem_feasibility_honesty: 0,
          voice_and_auth_readiness: 0
        },
        blocking_gaps: ["string"],
        evidence_notes: ["string"]
      },
      null,
      2
    )
  ].join("\n");
}

export async function runOptionalLlmJudge(input: JudgeInput): Promise<LlmJudgeResult> {
  if (process.env.SOILPROVE_LIVE_LLM_JUDGE !== "1") {
    return {
      ok: true,
      mode: "skipped",
      reason: "Set SOILPROVE_LIVE_LLM_JUDGE=1 and OPENROUTER_API_KEY to run the live LLM-as-judge completeness check."
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      mode: "not_configured",
      reason: "SOILPROVE_LIVE_LLM_JUDGE=1 was set, but OPENROUTER_API_KEY is not configured."
    };
  }

  const model = process.env.OPENROUTER_JUDGE_MODEL || process.env.OPENROUTER_MODEL || "openai/gpt-5.5";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/daniel-p-green/SoilProve",
      "X-Title": "SoilProve Eval Judge"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are a strict senior engineering evaluator. Return compact, valid JSON only."
        },
        {
          role: "user",
          content: buildJudgePrompt(input)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    }),
    signal: AbortSignal.timeout(45_000)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter judge failed with ${response.status}: ${text.slice(0, 240)}`);
  }

  const completion = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter judge returned an empty response.");

  const parsed = JSON.parse(extractJsonObject(content)) as {
    score?: number;
    verdict?: string;
    dimension_scores?: Record<string, number>;
    blocking_gaps?: string[];
    evidence_notes?: string[];
  };
  const score = typeof parsed.score === "number" ? parsed.score : 0;
  const verdict = typeof parsed.verdict === "string" ? parsed.verdict : "revise";
  const blockingGaps = Array.isArray(parsed.blocking_gaps) ? parsed.blocking_gaps.map(String) : ["Judge response omitted blocking_gaps."];

  return {
    ok: score >= 80 && verdict === "pass" && blockingGaps.length === 0,
    mode: "live",
    model,
    score,
    verdict,
    dimensionScores: parsed.dimension_scores || {},
    blockingGaps,
    evidenceNotes: Array.isArray(parsed.evidence_notes) ? parsed.evidence_notes.map(String) : []
  };
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Judge response did not contain a JSON object.");
  return trimmed.slice(start, end + 1);
}
