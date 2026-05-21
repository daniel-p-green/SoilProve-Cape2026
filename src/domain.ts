import { defaultFieldFixture, peerCases } from "./fixtures";
import { deterministicRegionalSoilInsight, regionalInsightPacketMarkdown, type RegionalSoilInsight } from "./regionalSoil";

export type StateCode = "IA" | "IL" | "IN" | "MO";
export type PreviousCrop = "corn" | "soybean";
export type Confidence = "high" | "medium" | "low";
export type PrescriptionStatus = "draft" | "signed" | "exported";
export type OemTarget = "john_deere" | "case_ih" | "agco";

export type SoilZone = {
  zoneId: string;
  acres: number;
  organicMatterPct: number;
  ph: number;
  phosphorusPpm: number;
  potassiumPpm: number;
  polygonWkt: string;
  sampledAt?: string;
};

export type FieldProfile = {
  farmName: string;
  farmerName: string;
  agronomistName: string;
  fieldName: string;
  state: StateCode;
  county: string;
  soilType: string;
  crop: "corn";
  seasonYear: number;
  acres: number;
  previousCrop: PreviousCrop;
  cornPricePerBushel: number;
  nitrogenPricePerLb: number;
  baselineNitrogenLbsPerAcre: number;
  threeYearBaselineYield: number;
};

export type ZoneRecommendation = {
  zoneId: string;
  acres: number;
  nitrogenLbsPerAcre: number;
  confidence: Confidence;
  confidenceReason: string;
  rationale: string;
  riskCaveat: string;
  omCredit: number;
  preClamp: number;
  postClamp: number;
};

export type MrtnAudit = {
  zoneId: string;
  coefficients: MrtnCoefficients;
  cornPricePerBushel: number;
  nitrogenPricePerLb: number;
  previousCrop: PreviousCrop;
  organicMatterCredit: number;
  preClamp: number;
  postClamp: number;
};

export type PeerSummary = {
  comparableCount: number;
  medianAppliedNitrogenRate: number | null;
  medianYield: number | null;
  medianSavingsPerAcre: number | null;
  comparabilityScore: number;
  message: string;
};

export type SavingsResult = {
  appliedNitrogenLbsPerAcre: number;
  nitrogenSavedLbsPerAcre: number;
  dollarsSavedPerAcre: number;
  grossFieldSavings: number;
  breakevenYieldDragBuPerAcre: number;
  yieldDeltaPct: number;
  guaranteeTriggered: boolean;
  guaranteeCopy: string;
};

export type YieldZone = {
  zoneId: string;
  bushelsPerAcre: number;
};

export type YieldRecord = {
  fieldId: string;
  seasonYear: number;
  harvestedOn: string;
  zones: YieldZone[];
};

export type Prescription = {
  id: string;
  fieldId: string;
  status: PrescriptionStatus;
  createdAt: string;
  signedAt: string | null;
  exportedAt: string | null;
  signoffNote: string | null;
  profile: FieldProfile;
  zones: SoilZone[];
  recommendations: ZoneRecommendation[];
  mrtnInputs: MrtnAudit[];
  peerSummary: PeerSummary;
  savings: SavingsResult;
};

export type TrialPacket = {
  prescriptionId: string;
  title: string;
  markdown: string;
  createdAt: string;
};

export type ToolAction = {
  name: string;
  args: Record<string, unknown>;
};

type MrtnCoefficients = {
  intercept: number;
  linearCoef: number;
  quadraticCoef: number;
};

const soilTypes = new Set(["silty_clay_loam", "silt_loam", "clay_loam", "loam", "sandy_loam", "sandy_clay_loam"]);

const coefficientTable: Record<StateCode, Record<PreviousCrop, MrtnCoefficients>> = {
  IA: {
    corn: { intercept: 112, linearCoef: 1.34, quadraticCoef: -0.0031 },
    soybean: { intercept: 118, linearCoef: 1.16, quadraticCoef: -0.0034 }
  },
  IL: {
    corn: { intercept: 108, linearCoef: 1.28, quadraticCoef: -0.003 },
    soybean: { intercept: 116, linearCoef: 1.09, quadraticCoef: -0.0032 }
  },
  IN: {
    corn: { intercept: 106, linearCoef: 1.22, quadraticCoef: -0.0029 },
    soybean: { intercept: 114, linearCoef: 1.04, quadraticCoef: -0.0031 }
  },
  MO: {
    corn: { intercept: 112, linearCoef: 1.34, quadraticCoef: -0.0031 },
    soybean: { intercept: 118, linearCoef: 1.16, quadraticCoef: -0.0034 }
  }
};

export function defaultProfile(): FieldProfile {
  return clone(defaultFieldFixture().profile);
}

export function defaultZones(): SoilZone[] {
  return clone(defaultFieldFixture().zones);
}

export function validateProfile(profile: FieldProfile, zones: SoilZone[]): string[] {
  const errors: string[] = [];
  if (!["IA", "IL", "IN", "MO"].includes(profile.state)) errors.push("State must be IA, IL, IN, or MO.");
  if (!soilTypes.has(profile.soilType)) errors.push("Soil type is outside the v1.0 controlled vocabulary.");
  if (profile.crop !== "corn") errors.push("v1.0 supports corn only.");
  if (profile.acres <= 0 || profile.acres > 5000) errors.push("Field acres must be between 0 and 5000.");
  if (profile.cornPricePerBushel <= 0) errors.push("Corn price must be positive.");
  if (profile.nitrogenPricePerLb <= 0) errors.push("Nitrogen price must be positive.");
  if (zones.length === 0) errors.push("At least one soil zone is required.");

  const zoneAcreTotal = zones.reduce((sum, zone) => sum + zone.acres, 0);
  if (Math.abs(zoneAcreTotal - profile.acres) > 0.5) {
    errors.push(`Soil-zone acres total ${round(zoneAcreTotal)} but field acres are ${profile.acres}.`);
  }

  for (const zone of zones) {
    if (!zone.zoneId.trim()) errors.push("Every zone needs a zone id.");
    if (zone.acres <= 0) errors.push(`${zone.zoneId} acres must be positive.`);
    if (zone.organicMatterPct < 0 || zone.organicMatterPct > 10) errors.push(`${zone.zoneId} organic matter must be 0-10%.`);
    if (zone.ph < 4.5 || zone.ph > 8.5) errors.push(`${zone.zoneId} pH must be 4.5-8.5.`);
    if (zone.phosphorusPpm < 0 || zone.phosphorusPpm > 200) errors.push(`${zone.zoneId} phosphorus must be 0-200 ppm.`);
    if (zone.potassiumPpm < 0 || zone.potassiumPpm > 800) errors.push(`${zone.zoneId} potassium must be 0-800 ppm.`);
  }

  return errors;
}

export function generatePrescription(inputProfile: FieldProfile, inputZones: SoilZone[], id = cryptoRandomId()): Prescription {
  const profile = normalizeProfile(inputProfile);
  const zones = inputZones.map(normalizeZone);
  const errors = validateProfile(profile, zones);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const recommendations: ZoneRecommendation[] = [];
  const audits: MrtnAudit[] = [];
  const coefficients = coefficientTable[profile.state][profile.previousCrop];

  for (const zone of zones) {
    const { recommendation, audit } = recommendNitrogen(zone, profile, coefficients);
    recommendations.push(recommendation);
    audits.push(audit);
  }

  const peerSummary = summarizePeers(profile);
  const savings = computeSavings(profile, recommendations, profile.threeYearBaselineYield);

  return {
    id,
    fieldId: `${slugify(profile.farmName)}-${slugify(profile.fieldName)}`,
    status: "draft",
    createdAt: new Date().toISOString(),
    signedAt: null,
    exportedAt: null,
    signoffNote: null,
    profile,
    zones,
    recommendations,
    mrtnInputs: audits,
    peerSummary,
    savings
  };
}

export function signPrescription(prescription: Prescription, note: string): Prescription {
  if (!prescription.mrtnInputs.length) throw new Error("Agronomist signoff requires MRTN audit inputs.");
  if (prescription.status === "exported") throw new Error("Exported prescriptions are immutable.");
  return {
    ...prescription,
    status: "signed",
    signedAt: new Date().toISOString(),
    signoffNote: note.slice(0, 1000)
  };
}

export function markExported(prescription: Prescription): Prescription {
  if (prescription.status !== "signed") throw new Error("Only a signed prescription can be exported.");
  return { ...prescription, status: "exported", exportedAt: new Date().toISOString() };
}

export function computeSavings(
  profile: FieldProfile,
  recommendations: Pick<ZoneRecommendation, "acres" | "nitrogenLbsPerAcre">[],
  harvestedYieldAvg: number
): SavingsResult {
  const appliedNitrogenLbsPerAcre = weightedAverage(recommendations.map((rec) => ({ weight: rec.acres, value: rec.nitrogenLbsPerAcre })));
  const nitrogenSavedLbsPerAcre = profile.baselineNitrogenLbsPerAcre - appliedNitrogenLbsPerAcre;
  const dollarsSavedPerAcre = nitrogenSavedLbsPerAcre * profile.nitrogenPricePerLb;
  const grossFieldSavings = dollarsSavedPerAcre * profile.acres;
  const breakevenYieldDragBuPerAcre = dollarsSavedPerAcre / profile.cornPricePerBushel;
  const yieldDeltaPct = ((harvestedYieldAvg - profile.threeYearBaselineYield) / profile.threeYearBaselineYield) * 100;
  const guaranteeTriggered = yieldDeltaPct < -2;

  return {
    appliedNitrogenLbsPerAcre: round(appliedNitrogenLbsPerAcre),
    nitrogenSavedLbsPerAcre: round(nitrogenSavedLbsPerAcre),
    dollarsSavedPerAcre: round(dollarsSavedPerAcre),
    grossFieldSavings: round(grossFieldSavings),
    breakevenYieldDragBuPerAcre: round(breakevenYieldDragBuPerAcre),
    yieldDeltaPct: round(yieldDeltaPct),
    guaranteeTriggered,
    guaranteeCopy:
      "Achieve at least $10/acre verified cost savings by Month 6, or SoilProve provides a review and adjustment credit if yields drop more than 2% from baseline."
  };
}

export function harvestedYieldAverage(recommendations: Pick<ZoneRecommendation, "zoneId" | "acres">[], yieldRecord: YieldRecord) {
  const recommendationIds = new Set(recommendations.map((rec) => rec.zoneId));
  const yieldByZone = new Map(yieldRecord.zones.map((zone) => [zone.zoneId, zone.bushelsPerAcre]));
  const missing = recommendations.filter((rec) => !yieldByZone.has(rec.zoneId)).map((rec) => rec.zoneId);
  const extra = yieldRecord.zones.filter((zone) => !recommendationIds.has(zone.zoneId)).map((zone) => zone.zoneId);
  if (missing.length || extra.length) {
    throw new Error(`Yield zones must match prescription zones. Missing: ${missing.join(",") || "none"}; extra: ${extra.join(",") || "none"}.`);
  }
  return weightedAverage(recommendations.map((rec) => ({ weight: rec.acres, value: Number(yieldByZone.get(rec.zoneId)) })));
}

export function computeSavingsFromYieldRecord(
  profile: FieldProfile,
  recommendations: Pick<ZoneRecommendation, "zoneId" | "acres" | "nitrogenLbsPerAcre">[],
  yieldRecord: YieldRecord
): SavingsResult {
  return computeSavings(profile, recommendations, harvestedYieldAverage(recommendations, yieldRecord));
}

export function buildPacket(prescription: Prescription, regionalInsight?: RegionalSoilInsight): TrialPacket {
  const rows = prescription.recommendations
    .map(
      (rec) =>
        `| ${rec.zoneId} | ${rec.acres} | ${rec.nitrogenLbsPerAcre} lb/ac | ${rec.confidence} | ${rec.omCredit} lb/ac | ${rec.preClamp} | ${rec.postClamp} |`
    )
    .join("\n");
  const rationale = prescription.recommendations
    .map(
      (rec) =>
        `- ${rec.zoneId}: ${rec.rationale} Confidence driver: ${rec.confidenceReason} Risk caveat: ${rec.riskCaveat}`
    )
    .join("\n");
  const peer = prescription.peerSummary;
  const regional = regionalInsight || deterministicRegionalSoilInsight(prescription);
  const markdown = [
    `# SoilProve Agronomist Review Packet`,
    "",
    `## Field`,
    `- Farm: ${prescription.profile.farmName}`,
    `- Farmer: ${prescription.profile.farmerName}`,
    `- Field: ${prescription.profile.fieldName}, ${prescription.profile.county} County, ${prescription.profile.state}`,
    `- Crop year: ${prescription.profile.seasonYear} corn`,
    "",
    `## Savings assurance offer`,
    prescription.savings.guaranteeCopy,
    "",
    `## Nitrogen plan`,
    `| Zone | Acres | Rate | Confidence | OM credit | pre-clamp | post-clamp |`,
    `|---|---:|---:|---|---:|---:|---:|`,
    rows,
    "",
    `## Zone rationale`,
    rationale,
    "",
    `## Economics`,
    `- Baseline practice: ${prescription.profile.baselineNitrogenLbsPerAcre} lb/ac`,
    `- Planned weighted average: ${prescription.savings.appliedNitrogenLbsPerAcre} lb/ac`,
    `- Modeled savings: $${prescription.savings.dollarsSavedPerAcre}/ac and $${prescription.savings.grossFieldSavings} on this field`,
    `- Breakeven yield drag: ${prescription.savings.breakevenYieldDragBuPerAcre} bu/ac at $${prescription.profile.cornPricePerBushel}/bu`,
    "",
    `## Comparable field context`,
    peer.comparabilityScore === 0
      ? `Insufficient aggregate peer data for this exact county and soil type. Do not show individual farms.`
      : `${peer.comparableCount} comparable fields. Median N rate ${peer.medianAppliedNitrogenRate} lb/ac, median yield ${peer.medianYield} bu/ac, median savings $${peer.medianSavingsPerAcre}/ac. Only aggregate medians are shown.`,
    "",
    `## Raimond-prepared discussion notes`,
    `- Raimond can answer foundational soil-report questions before the meeting, but the agronomist remains the reviewer for strategy and signoff.`,
    `- Farmer meeting prep: confirm any flagged lab values, sample recency, and zone assumptions with ${prescription.profile.agronomistName}.`,
    `- Goal: better agronomist meetings, not fewer agronomist meetings.`,
    "",
    regionalInsightPacketMarkdown(regional),
    "",
    `## Agronomist review questions`,
    `1. Do the MRTN coefficients and crop rotation match the farm's actual plan?`,
    `2. Are any low-confidence zones too risky for the savings assurance offer?`,
    `3. Does the farmer's equipment path support the selected OEM delivery target?`
  ].join("\n");

  return {
    prescriptionId: prescription.id,
    title: `${prescription.profile.farmName} ${prescription.profile.fieldName} review packet`,
    markdown,
    createdAt: new Date().toISOString()
  };
}

export function realtimeTools() {
  return [
    {
      type: "function",
      name: "navigate_workspace",
      description: "Navigate the SoilProve app to a named workspace section. Use intake/soil report, plan/action plan, proof/context, packet/review, exports, or results.",
      parameters: {
        type: "object",
        properties: {
          tab: { type: "string", enum: ["intake", "plan", "proof", "packet", "exports", "results"] }
        },
        required: ["tab"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "get_soilprove_state",
      description: "Read the current SoilProve field, review gate, workflow locks, and next action before explaining what the user is seeing or what should happen next.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      type: "function",
      name: "answer_soilprove_question",
      description: "Answer a farmer or agronomist question from the current SoilProve state. Use this before explaining lab values, locked steps, savings, peer context, export readiness, or agronomist review questions.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" }
        },
        required: ["question"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "advance_demo_step",
      description: "Advance the hands-free judge demo by one safe product step. Use step auto unless the operator asks for a specific step.",
      parameters: {
        type: "object",
        properties: {
          step: {
            type: "string",
            enum: ["auto", "login", "intake", "review", "plan", "signoff", "packet", "vrt", "oem", "yield", "audit", "reset"]
          }
        },
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "dismiss_onboarding",
      description: "Dismiss the first-run onboarding overlay so the operator can use the working console.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      type: "function",
      name: "load_sample_field",
      description: "Load a known demo field fixture into editable intake when the operator asks for a named sample field.",
      parameters: {
        type: "object",
        properties: {
          fieldId: { type: "string", description: "Fixture id, such as mark_story_county_north_80 or keller_polk_county_ridge_92." }
        },
        required: ["fieldId"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "import_sample_soil_report",
      description: "Import a preloaded sample soil report into editable intake data. OCR or parsed values must still be reviewed before plan generation.",
      parameters: {
        type: "object",
        properties: {
          reportId: {
            type: "string",
            enum: ["miller-text-layer", "waverly-ocr", "harlan-story", "richter-mclean", "porter-benton", "keller-polk", "nolan-champaign", "rusk-tippecanoe"]
          }
        },
        required: ["reportId"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "update_field_profile",
      description: "Update known field profile values from voice. Include every field value the operator says, especially numbers. Convert spoken numbers to JSON numbers. For the operator's price or cost of nitrogen, always set nitrogenPricePerLb as dollars per pound, for example 72 cents becomes 0.72.",
      parameters: {
        type: "object",
        properties: {
          acres: { type: "number", description: "Field acres as a JSON number, for example 92." },
          farmName: { type: "string" },
          farmerName: { type: "string" },
          agronomistName: { type: "string" },
          fieldName: { type: "string" },
          county: { type: "string" },
          state: { type: "string", enum: ["IA", "IL", "IN", "MO"] },
          soilType: { type: "string", enum: ["silty_clay_loam", "silt_loam", "clay_loam", "loam", "sandy_loam", "sandy_clay_loam"] },
          previousCrop: { type: "string", enum: ["corn", "soybean"] },
          baselineNitrogenLbsPerAcre: { type: "number", description: "Baseline nitrogen rate in pounds per acre as a JSON number, for example 184." },
          cornPricePerBushel: { type: "number", description: "Corn price in dollars per bushel as a JSON number, for example 4.85." },
          nitrogenPricePerLb: { type: "number", description: "Nitrogen price or nitrogen cost in dollars per pound. If the operator says cents, convert to decimal dollars, e.g. 72 cents is 0.72." },
          threeYearBaselineYield: { type: "number", description: "Three-year baseline yield in bushels per acre as a JSON number, for example 212." },
          zones: {
            type: "array",
            items: {
              type: "object",
              properties: {
                zoneId: { type: "string" },
                acres: { type: "number" },
                organicMatterPct: { type: "number" },
                ph: { type: "number" },
                phosphorusPpm: { type: "number" },
                potassiumPpm: { type: "number" }
              },
              required: ["zoneId", "acres", "organicMatterPct", "ph", "phosphorusPpm", "potassiumPpm"],
              additionalProperties: false
            }
          }
        },
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "edit_field_value",
      description: "Edit one specific field profile value from voice. Use this for precise UI-equivalent value edits, especially numbers like acres, baseline nitrogen, corn price, nitrogenPricePerLb, or baseline yield.",
      parameters: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: [
              "acres",
              "farmName",
              "farmerName",
              "agronomistName",
              "fieldName",
              "county",
              "state",
              "soilType",
              "previousCrop",
              "baselineNitrogenLbsPerAcre",
              "cornPricePerBushel",
              "nitrogenPricePerLb",
              "threeYearBaselineYield"
            ]
          },
          value: {
            type: ["number", "string"],
            description: "The new field value. Use JSON numbers for numeric fields. Convert cents to dollars for nitrogenPricePerLb, so 72 cents becomes 0.72."
          }
        },
        required: ["field", "value"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "confirm_intake_review",
      description: "Mark the editable soil-report values as operator-reviewed before generating a draft action plan.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      type: "function",
      name: "generate_prescription",
      description: "Generate the SoilProve action plan from the reviewed soil report and current field profile.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      type: "function",
      name: "sign_prescription",
      description: "Add agronomist signoff to the active action plan.",
      parameters: {
        type: "object",
        properties: { note: { type: "string" } },
        required: ["note"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "create_review_packet",
      description: "Create the agronomist review packet.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      type: "function",
      name: "download_vrt",
      description: "Export the signed action plan as a VRT shapefile ZIP.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      type: "function",
      name: "send_to_oem",
      description: "Send the signed VRT bundle to an OEM integration.",
      parameters: {
        type: "object",
        properties: { target: { type: "string", enum: ["john_deere", "case_ih", "agco"] } },
        required: ["target"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "upload_yield_results",
      description: "Upload yield results for the active prescription. If csv is omitted, use the app's deterministic sample yield record for the current signed plan.",
      parameters: {
        type: "object",
        properties: { csv: { type: "string" } },
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "run_full_demo_setup",
      description: "Run the complete authenticated demo setup: login fallback, soil-report intake, action plan, signoff, packet, VRT, OEM simulation, yield upload, and audit state.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      type: "function",
      name: "reset_demo_flow",
      description: "Reset the local demo flow back to an empty Raimond-led soil report intake while preserving authentication setup.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  ];
}

function recommendNitrogen(zone: SoilZone, profile: FieldProfile, coefficients: MrtnCoefficients) {
  const raw =
    (profile.cornPricePerBushel * coefficients.linearCoef - profile.nitrogenPricePerLb) /
    (2 * profile.cornPricePerBushel * Math.abs(coefficients.quadraticCoef));
  const omCredit = Math.min(30, Math.max(0, (zone.organicMatterPct - 3) * 10));
  const preClamp = raw - omCredit;
  const postClamp = clampNitrogenRate(preClamp, profile.previousCrop);
  const confidence = confidenceAssessment(zone);
  const recommendation = {
    zoneId: zone.zoneId,
    acres: zone.acres,
    nitrogenLbsPerAcre: Math.round(postClamp),
    confidence: confidence.confidence,
    confidenceReason: confidence.reason,
    rationale: `MRTN pre-clamp ${round(preClamp)} lb/ac after ${round(omCredit)} lb/ac OM credit, clamped to ${round(postClamp)} lb/ac for ${profile.previousCrop === "corn" ? "corn-on-corn" : "corn-after-soybean"} rotation.`,
    riskCaveat: confidence.riskCaveat,
    omCredit: round(omCredit),
    preClamp: round(preClamp),
    postClamp: round(postClamp)
  };
  const audit = {
    zoneId: zone.zoneId,
    coefficients,
    cornPricePerBushel: profile.cornPricePerBushel,
    nitrogenPricePerLb: profile.nitrogenPricePerLb,
    previousCrop: profile.previousCrop,
    organicMatterCredit: round(omCredit),
    preClamp: round(preClamp),
    postClamp: round(postClamp)
  };

  return { recommendation, audit };
}

function labelConfidence(zone: SoilZone): Confidence {
  return confidenceAssessment(zone).confidence;
}

function confidenceAssessment(zone: SoilZone): { confidence: Confidence; reason: string; riskCaveat: string } {
  const omOk = zone.organicMatterPct >= 2 && zone.organicMatterPct <= 5;
  const phOk = zone.ph >= 5.8 && zone.ph <= 7.2;
  const base: Confidence = omOk && phOk ? "high" : !omOk && !phOk ? "low" : "medium";
  const drivers = [
    `OM ${zone.organicMatterPct}% is ${omOk ? "inside" : "outside"} the 2.0-5.0% confidence band`,
    `pH ${zone.ph} is ${phOk ? "inside" : "outside"} the 5.8-7.2 confidence band`
  ];
  const riskCaveat =
    base === "high"
      ? "Use as a first-field trial rate with normal harvest follow-up; confirm operational fit with the agronomist."
      : base === "medium"
        ? "Review this zone with the agronomist before application because at least one soil driver is outside the high-confidence band."
        : "Treat this as a high-review zone; do not expand beyond the controlled trial without fresh agronomist review.";

  if (!zone.sampledAt) {
    return {
      confidence: base,
      reason: `${drivers.join("; ")}; no sample date was supplied, so the agronomist should confirm recency.`,
      riskCaveat
    };
  }
  const sampledAt = Date.parse(zone.sampledAt);
  if (!Number.isFinite(sampledAt)) {
    return {
      confidence: "low",
      reason: `${drivers.join("; ")}; sample date is invalid.`,
      riskCaveat: "Treat this as a high-review zone until the soil report date is corrected."
    };
  }
  const thirtySixMonthsMs = 36 * 31 * 24 * 60 * 60 * 1000;
  if (Date.now() - sampledAt <= thirtySixMonthsMs) {
    return {
      confidence: base,
      reason: `${drivers.join("; ")}; sample date is within 36 months.`,
      riskCaveat
    };
  }
  const staleConfidence: Confidence = base === "high" ? "medium" : "low";
  return {
    confidence: staleConfidence,
    reason: `${drivers.join("; ")}; sample date is older than 36 months and confidence is downgraded.`,
    riskCaveat:
      staleConfidence === "medium"
        ? "Confirm this stale soil test with the agronomist before application or refresh sampling before expanding the trial."
        : "Refresh the soil test before relying on this zone beyond a bounded agronomist-reviewed trial."
  };
}

function summarizePeers(profile: FieldProfile): PeerSummary {
  const matches = peerCases.filter(
    (peer) =>
      peer.state === profile.state &&
      peer.county.toLowerCase() === profile.county.toLowerCase() &&
      peer.soilType === profile.soilType &&
      peer.acres >= profile.acres * 0.5 &&
      peer.acres <= profile.acres * 1.5
  );

  if (matches.length < 5) {
    return {
      comparableCount: matches.length,
      medianAppliedNitrogenRate: null,
      medianYield: null,
      medianSavingsPerAcre: null,
      comparabilityScore: 0,
      message: "Insufficient aggregate comparable-field data; at least 5 comparable fields are required before medians are shown."
    };
  }

  const missing = Math.max(0, 5 - matches.length);
  return {
    comparableCount: matches.length,
    medianAppliedNitrogenRate: median(matches.map((peer) => peer.appliedNitrogenRate)),
    medianYield: median(matches.map((peer) => peer.yield)),
    medianSavingsPerAcre: median(matches.map((peer) => peer.savingsPerAcre)),
    comparabilityScore: Math.max(30, 100 - missing * 10),
    message: "Aggregate comparable-field medians only; no individual field identity is exposed."
  };
}

function normalizeProfile(profile: FieldProfile): FieldProfile {
  return {
    ...profile,
    farmName: profile.farmName.trim() || "Unnamed Farm",
    farmerName: profile.farmerName.trim() || "Farmer",
    agronomistName: profile.agronomistName.trim() || "Agronomist",
    fieldName: profile.fieldName.trim() || "Field",
    county: profile.county.trim(),
    soilType: profile.soilType,
    crop: "corn",
    seasonYear: Number(profile.seasonYear),
    acres: Number(profile.acres),
    cornPricePerBushel: Number(profile.cornPricePerBushel),
    nitrogenPricePerLb: Number(profile.nitrogenPricePerLb),
    baselineNitrogenLbsPerAcre: Number(profile.baselineNitrogenLbsPerAcre),
    threeYearBaselineYield: Number(profile.threeYearBaselineYield)
  };
}

function normalizeZone(zone: SoilZone): SoilZone {
  return {
    ...zone,
    zoneId: zone.zoneId.trim(),
    acres: Number(zone.acres),
    organicMatterPct: Number(zone.organicMatterPct),
    ph: Number(zone.ph),
    phosphorusPpm: Number(zone.phosphorusPpm),
    potassiumPpm: Number(zone.potassiumPpm),
    polygonWkt: zone.polygonWkt.trim()
  };
}

function weightedAverage(values: Array<{ weight: number; value: number }>) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  return values.reduce((sum, item) => sum + item.weight * item.value, 0) / totalWeight;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round((sorted[middle - 1] + sorted[middle]) / 2) : round(sorted[middle]);
}

export function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function clampNitrogenRate(rate: number, previousCrop: PreviousCrop) {
  const maxRate = previousCrop === "corn" ? 240 : 200;
  return Math.min(maxRate, Math.max(0, rate));
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
