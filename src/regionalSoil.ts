import type { Prescription, SoilZone, StateCode } from "./domain";

export type RegionalSource = {
  id: string;
  label: string;
  url: string;
  scope: "national" | "state" | "regional";
  note: string;
};

export type RegionalZoneFlag = {
  zoneId: string;
  severity: "watch" | "review";
  label: string;
  detail: string;
};

export type RegionalSoilContext = {
  sources: RegionalSource[];
  fieldMatch: {
    state: StateCode;
    county: string;
    soilType: string;
    baseline: string;
  };
  zoneFlags: RegionalZoneFlag[];
  benchmarkNotes: string[];
  limitations: string[];
};

export type RegionalSoilInsight = {
  mode: "deterministic_only" | "live";
  model: string;
  summary: string;
  reviewFlags: string[];
  agronomistQuestions: string[];
  limitations: string[];
  context: RegionalSoilContext;
};

type StateContext = {
  baseline: string;
  aggregateSource: RegionalSource;
  notes: string[];
};

const nationalSources: RegionalSource[] = [
  {
    id: "usda-nrcs-web-soil-survey",
    label: "USDA NRCS Web Soil Survey / SSURGO",
    url: "https://websoilsurvey.sc.egov.usda.gov/",
    scope: "national",
    note: "Mapped soil-survey context for soil type, landscape, drainage, and broad property ranges; not a current lab report."
  }
];

const stateContext: Record<StateCode, StateContext> = {
  IA: {
    baseline: "Iowa context uses public soil-test summary fields for pH, phosphorus, potassium, and organic matter alongside SSURGO soil survey context.",
    aggregateSource: {
      id: "iowa-state-soil-test-summaries",
      label: "Iowa State University soil-test summaries",
      url: "https://shop.iastate.edu/extension/farm-environment/crops-and-soils/soil-fertility-and-management/crop3071.html",
      scope: "state",
      note: "County-level submitted-sample summaries; useful for context, not field-specific prescriptions."
    },
    notes: ["Iowa peer context is strongest when the field has reviewed pH, OM, P, and K values and at least 5 comparable fields."]
  },
  IL: {
    baseline: "Illinois context uses public soil-fertility status references plus SSURGO soil survey context for mapped soil properties.",
    aggregateSource: {
      id: "illinois-soil-fertility-status",
      label: "University of Illinois soil fertility status references",
      url: "https://experts.illinois.edu/en/publications/soil-fertility-status-of-soils-in-illinois",
      scope: "state",
      note: "Statewide fertility status material; useful for review context, not field-specific recommendations."
    },
    notes: ["Illinois context should be framed as a sanity check around reviewed lab values and peer aggregate availability."]
  },
  IN: {
    baseline: "Indiana context uses regional North America soil-test summaries and SSURGO soil survey context until a stronger public state lab summary is added.",
    aggregateSource: {
      id: "tfi-soil-test-levels",
      label: "The Fertilizer Institute Soil Test Levels in North America",
      url: "https://store.tfi.org/products/soil-test-levels-in-north-america-2020-summary-update",
      scope: "regional",
      note: "State/province aggregate soil-test levels from participating labs; useful for broad context only."
    },
    notes: ["Indiana v1 context is intentionally coarse and should trigger questions, not stronger claims."]
  },
  MO: {
    baseline: "Missouri context uses public soil-test interpretation material and SSURGO soil survey context around reviewed lab values.",
    aggregateSource: {
      id: "missouri-soil-test-interpretation",
      label: "University of Missouri soil-test interpretation guidance",
      url: "https://extension.missouri.edu/publications/g9112",
      scope: "state",
      note: "Interpretation guidance for submitted soil-test reports; useful for explaining review fields and caveats."
    },
    notes: ["Missouri context should emphasize the farmer's uploaded lab report as the field-specific source of truth."]
  }
};

export function buildRegionalSoilContext(prescription: Prescription): RegionalSoilContext {
  const context = stateContext[prescription.profile.state];
  const zoneFlags = prescription.zones.flatMap((zone) => zoneContextFlags(zone));
  const peer = prescription.peerSummary;
  const benchmarkNotes = [
    context.baseline,
    ...context.notes,
    peer.comparableCount >= 5
      ? `Aggregate peer gate is open with ${peer.comparableCount} comparable fields; show medians only, not individual farms.`
      : `Aggregate peer gate is closed with ${peer.comparableCount} comparable fields; keep peer medians hidden until at least 5 comparable fields exist.`
  ];

  return {
    sources: [...nationalSources, context.aggregateSource],
    fieldMatch: {
      state: prescription.profile.state,
      county: prescription.profile.county,
      soilType: prescription.profile.soilType,
      baseline: `${prescription.profile.county} County ${prescription.profile.state} ${humanizeSoilType(prescription.profile.soilType)} corn trial context.`
    },
    zoneFlags,
    benchmarkNotes,
    limitations: [
      "Regional context is not a field-specific lab result.",
      "SoilProve does not turn public aggregate data into an applied fertilizer decision.",
      "The farmer's reviewed soil report and agronomist signoff remain the source of truth."
    ]
  };
}

export function deterministicRegionalSoilInsight(prescription: Prescription, model = "deterministic"): RegionalSoilInsight {
  const context = buildRegionalSoilContext(prescription);
  return {
    mode: "deterministic_only",
    model,
    summary: `${context.fieldMatch.baseline} Regional context is ready for agronomist review without a live model call.`,
    reviewFlags: context.zoneFlags.length
      ? context.zoneFlags.map((flag) => `${flag.zoneId}: ${flag.label} - ${flag.detail}`)
      : ["No regional review flags were triggered by pH, organic matter, P, K, or sample recency."],
    agronomistQuestions: [
      "Do the reviewed lab values match the field zones before signing the first controlled trial?",
      "Are any flagged soil values important enough to narrow the trial area or refresh sampling?"
    ],
    limitations: context.limitations,
    context
  };
}

export function buildRegionalInsightPrompt(prescription: Prescription, context = buildRegionalSoilContext(prescription)) {
  return [
    "You are helping SoilProve explain regional soil context for a Midwestern corn nitrogen trial.",
    "Return compact JSON only with summary, reviewFlags, agronomistQuestions, and limitations arrays.",
    "Do not recommend fertilizer rates, do not call the plan final, do not claim guaranteed yield, do not identify individual peers, and do not imply the model replaces the agronomist.",
    "Use the regional context only to explain review flags and questions.",
    "",
    JSON.stringify(
      {
        field: prescription.profile,
        zones: prescription.zones,
        recommendations: prescription.recommendations.map((rec) => ({
          zoneId: rec.zoneId,
          confidence: rec.confidence,
          confidenceReason: rec.confidenceReason,
          riskCaveat: rec.riskCaveat
        })),
        peerSummary: prescription.peerSummary,
        regionalContext: context
      },
      null,
      2
    )
  ].join("\n");
}

export function parseRegionalInsightCompletion(content: string, prescription: Prescription, model: string): RegionalSoilInsight {
  const context = buildRegionalSoilContext(prescription);
  const parsed = JSON.parse(extractJsonObject(content)) as {
    summary?: unknown;
    reviewFlags?: unknown;
    agronomistQuestions?: unknown;
    limitations?: unknown;
  };
  return {
    mode: "live",
    model,
    summary: safeString(parsed.summary, deterministicRegionalSoilInsight(prescription).summary),
    reviewFlags: safeStringArray(parsed.reviewFlags, deterministicRegionalSoilInsight(prescription).reviewFlags),
    agronomistQuestions: safeStringArray(parsed.agronomistQuestions, deterministicRegionalSoilInsight(prescription).agronomistQuestions),
    limitations: safeStringArray(parsed.limitations, context.limitations),
    context
  };
}

export function regionalInsightPacketMarkdown(insight: RegionalSoilInsight) {
  return [
    `## Regional soil context`,
    `- Field match: ${insight.context.fieldMatch.baseline}`,
    `- Sources: ${insight.context.sources.map((source) => source.label).join("; ")}`,
    `- GPT insight: ${insight.mode === "live" ? `generated with ${insight.model}` : "not generated; deterministic context included"}`,
    `- Summary: ${insight.summary}`,
    `- Review flags: ${insight.reviewFlags.join(" | ")}`,
    `- Agronomist questions: ${insight.agronomistQuestions.join(" | ")}`,
    `- Limitations: ${insight.limitations.join(" | ")}`
  ].join("\n");
}

function zoneContextFlags(zone: SoilZone): RegionalZoneFlag[] {
  const flags: RegionalZoneFlag[] = [];
  if (zone.ph < 5.8) flags.push({ zoneId: zone.zoneId, severity: "review", label: "low pH review flag", detail: `pH ${zone.ph} is below the 5.8 high-confidence band.` });
  if (zone.ph > 7.2) flags.push({ zoneId: zone.zoneId, severity: "watch", label: "high pH watch flag", detail: `pH ${zone.ph} is above the 7.2 high-confidence band.` });
  if (zone.organicMatterPct < 2) flags.push({ zoneId: zone.zoneId, severity: "review", label: "low organic matter review flag", detail: `OM ${zone.organicMatterPct}% is below the 2.0% confidence band.` });
  if (zone.organicMatterPct > 5) flags.push({ zoneId: zone.zoneId, severity: "watch", label: "high organic matter watch flag", detail: `OM ${zone.organicMatterPct}% is above the 5.0% confidence band.` });
  if (zone.phosphorusPpm < 15) flags.push({ zoneId: zone.zoneId, severity: "watch", label: "low phosphorus context flag", detail: `P ${zone.phosphorusPpm} ppm should be reviewed with the lab method and crop plan.` });
  if (zone.potassiumPpm < 120) flags.push({ zoneId: zone.zoneId, severity: "watch", label: "low potassium context flag", detail: `K ${zone.potassiumPpm} ppm should be reviewed with the lab method and crop plan.` });
  if (isStale(zone.sampledAt)) flags.push({ zoneId: zone.zoneId, severity: "review", label: "stale sample review flag", detail: `Sample date ${zone.sampledAt || "missing"} is older than 36 months or unavailable.` });
  return flags;
}

function isStale(sampledAt?: string) {
  if (!sampledAt) return true;
  const time = Date.parse(sampledAt);
  if (!Number.isFinite(time)) return true;
  return Date.now() - time > 36 * 31 * 24 * 60 * 60 * 1000;
}

function humanizeSoilType(value: string) {
  return value.replaceAll("_", " ");
}

function safeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 800) : fallback;
}

function safeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const strings = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 6);
  return strings.length ? strings : fallback;
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Regional insight response did not contain JSON.");
  return trimmed.slice(start, end + 1);
}
