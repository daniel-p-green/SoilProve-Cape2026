import type { FieldProfile, SoilZone } from "./domain";

export function normalizeRaimondFieldProfilePatch(args: Record<string, unknown>): Partial<FieldProfile> & { zones?: SoilZone[] } {
  const patch: Partial<FieldProfile> & { zones?: SoilZone[] } = {};
  const stringFields: Array<keyof Pick<FieldProfile, "farmName" | "farmerName" | "agronomistName" | "fieldName" | "county" | "soilType" | "previousCrop">> = [
    "farmName",
    "farmerName",
    "agronomistName",
    "fieldName",
    "county",
    "soilType",
    "previousCrop"
  ];
  for (const field of stringFields) {
    const value = args[field];
    if (typeof value === "string" && value.trim()) patch[field] = value.trim() as never;
  }
  if (typeof args.state === "string" && args.state.trim()) patch.state = normalizeState(args.state);
  const numberFields: Array<keyof Pick<FieldProfile, "seasonYear" | "acres" | "cornPricePerBushel" | "baselineNitrogenLbsPerAcre" | "threeYearBaselineYield">> = [
    "seasonYear",
    "acres",
    "cornPricePerBushel",
    "baselineNitrogenLbsPerAcre",
    "threeYearBaselineYield"
  ];
  for (const field of numberFields) {
    const value = numericArg(args[field]);
    if (value !== null) patch[field] = value as never;
  }

  const nitrogenPrice = firstNumericArg(args, ["nitrogenPricePerLb", "nitrogenPrice", "nitrogenCost", "nitrogenCostPerLb", "nitrogenPricePerPound", "nitrogenCostPerPound", "nPrice", "nCost", "priceOfNitrogen"]);
  if (nitrogenPrice !== null) patch.nitrogenPricePerLb = normalizeNitrogenPrice(nitrogenPrice);
  if (Array.isArray(args.zones)) patch.zones = args.zones as SoilZone[];
  return patch;
}

function normalizeState(value: string): FieldProfile["state"] {
  const normalized = value.toLowerCase();
  if (normalized === "iowa" || normalized === "ia") return "IA";
  if (normalized === "illinois" || normalized === "il") return "IL";
  if (normalized === "indiana" || normalized === "in") return "IN";
  return "MO";
}

function firstNumericArg(args: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numericArg(args[key]);
    if (value !== null) return value;
  }
  return null;
}

function numericArg(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[$,]/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNitrogenPrice(value: number) {
  return value > 10 && value <= 300 ? value / 100 : value;
}
