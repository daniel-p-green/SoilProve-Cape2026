import type { FieldProfile, SoilZone, YieldRecord } from "./domain";

export const missouriPdfFixtureFolder = "missouri-pdfs";

export type SoilReportImportResult = {
  sourceType: "pdf" | "text";
  confidence: "high" | "medium" | "low";
  profilePatch: Partial<FieldProfile>;
  zones: SoilZone[];
  warnings: string[];
  extractedTextPreview: string;
  reviewRequired?: boolean;
  labFields?: MissouriLabFields;
};

type ParsedZone = Omit<SoilZone, "polygonWkt"> & { polygonWkt?: string };
export type MissouriLabFields = {
  county?: string;
  sampleId?: string;
  texture?: string;
  organicMatterPct?: number;
  ph?: number;
  phosphorusPpm?: number;
  potassiumPpm?: number;
  cec?: number;
  crop?: string;
};

export async function parseSoilReportFile(file: File): Promise<SoilReportImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sourceType = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf" ? "pdf" : "text";
  const text = sourceType === "pdf" ? extractTextFromPdfBytes(bytes) : new TextDecoder().decode(bytes);
  return parseSoilReportText(text, sourceType);
}

export function parseSoilReportText(text: string, sourceType: "pdf" | "text" = "text"): SoilReportImportResult {
  const normalized = text.replace(/\r/g, "\n");
  const labFields = parseMissouriLabFields(normalized);
  const profilePatch = { ...parseProfilePatch(normalized), ...profilePatchFromLabFields(labFields) };
  const parsedZones = parseZoneRows(normalized);
  const sourceZones = parsedZones.length > 0 ? parsedZones : labZoneFromFields(labFields, profilePatch.acres);
  const zones = sourceZones.map((zone, index) => ({
    ...zone,
    polygonWkt: zone.polygonWkt || fallbackPolygon(index)
  }));
  const warnings: string[] = [];
  if (sourceType === "pdf" && !normalized.includes("BT") && zones.length === 0) warnings.push("This PDF may be image-only. Upload a text-layer PDF or enter zones manually.");
  if (Object.keys(labFields).length > 0) {
    warnings.push("Missouri soil lab fields were detected from a PDF/OCR fixture; agronomist review is required before using them in a plan.");
  }
  if (zones.length === 0) warnings.push("No soil-zone rows were detected.");
  if (zones.length > 0 && zones.length < 3) warnings.push("Fewer than three zones detected; review before generating a plan.");
  const confidence = zones.length >= 3 && Object.keys(profilePatch).length >= 3 ? "high" : zones.length > 0 ? "medium" : "low";
  return {
    sourceType,
    confidence,
    profilePatch,
    zones,
    warnings,
    extractedTextPreview: normalized.replace(/\s+/g, " ").trim().slice(0, 500),
    reviewRequired: Object.keys(labFields).length > 0 || confidence !== "high",
    ...(Object.keys(labFields).length > 0 ? { labFields } : {})
  };
}

export function parseSoilCsvText(text: string, expectedFieldAcres?: number): SoilReportImportResult {
  const rows = cleanCsvRows(text);
  const required = ["zone_id", "acres", "organic_matter_pct", "ph", "phosphorus_ppm", "potassium_ppm", "polygon_wkt"];
  assertExactHeader(rows[0], required);
  const zones: SoilZone[] = [];
  const errors: string[] = [];

  rows.slice(1).forEach((row, index) => {
    const values = splitSoilCsvRow(row);
    if (values.length !== required.length) {
      errors.push(`row ${index + 2}: expected ${required.length} columns`);
      return;
    }
    const zone: SoilZone = {
      zoneId: values[0].trim(),
      acres: Number(values[1]),
      organicMatterPct: Number(values[2]),
      ph: Number(values[3]),
      phosphorusPpm: Number(values[4]),
      potassiumPpm: Number(values[5]),
      polygonWkt: values[6].trim()
    };
    errors.push(...validateCsvZone(zone, index + 2));
    zones.push(zone);
  });

  if (expectedFieldAcres !== undefined) {
    const acres = zones.reduce((sum, zone) => sum + zone.acres, 0);
    if (Math.abs(acres - expectedFieldAcres) > 0.5) errors.push(`zone acres total ${acres} does not match field acres ${expectedFieldAcres}`);
  }
  if (errors.length) throw new Error(`Soil CSV rejected: ${errors.join("; ")}`);

  return {
    sourceType: "text",
    confidence: "high",
    profilePatch: expectedFieldAcres === undefined ? {} : { acres: expectedFieldAcres },
    zones,
    warnings: [],
    extractedTextPreview: rows.slice(0, 3).join(" ").slice(0, 500)
  };
}

export function parseYieldCsvText(text: string, fieldId: string, seasonYear: number, harvestedOn = new Date().toISOString()): YieldRecord {
  const rows = cleanCsvRows(text);
  assertExactHeader(rows[0], ["zone_id", "bushels_per_acre"]);
  const zones = rows.slice(1).map((row, index) => {
    const values = row.split(",").map((value) => value.trim());
    if (values.length !== 2) throw new Error(`Yield CSV rejected: row ${index + 2}: expected 2 columns`);
    const bushelsPerAcre = Number(values[1]);
    if (!values[0]) throw new Error(`Yield CSV rejected: row ${index + 2}: zone_id is required`);
    if (!Number.isFinite(bushelsPerAcre) || bushelsPerAcre <= 0 || bushelsPerAcre > 400) {
      throw new Error(`Yield CSV rejected: row ${index + 2}: bushels_per_acre must be 0-400`);
    }
    return { zoneId: values[0], bushelsPerAcre };
  });
  if (zones.length === 0) throw new Error("Yield CSV rejected: at least one zone is required");
  return { fieldId, seasonYear, harvestedOn, zones };
}

function extractTextFromPdfBytes(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes);
  const literalStrings = [...text.matchAll(/\(([^()]{2,200})\)\s*Tj/g)].map((match) => match[1]);
  const arrayStrings = [...text.matchAll(/\[((?:\([^()]{1,120}\)\s*)+)\]\s*TJ/g)].flatMap((match) => [...match[1].matchAll(/\(([^()]{1,120})\)/g)].map((item) => item[1]));
  const combined = [...literalStrings, ...arrayStrings].join("\n").replace(/\\([()\\])/g, "$1");
  return combined.trim();
}

function parseProfilePatch(text: string): Partial<FieldProfile> {
  const patch: Partial<FieldProfile> = {};
  const stringFields: Array<[keyof FieldProfile, RegExp]> = [
    ["farmName", /farm\s*[:|-]\s*([^\n]+)/i],
    ["farmerName", /farmer\s*[:|-]\s*([^\n]+)/i],
    ["fieldName", /field\s*[:|-]\s*([^\n]+)/i],
    ["county", /county\s*[:|-]\s*([A-Za-z\s]+?)(?:\s+county)?(?:\n|$)/i],
    ["soilType", /soil\s*(?:type|texture)\s*[:|-]\s*([a-z_ ]+)/i]
  ];
  for (const [field, regex] of stringFields) {
    const match = text.match(regex);
    if (match?.[1]) patch[field] = (field === "soilType" ? normalizeSoilType(match[1]) : match[1].trim()) as never;
  }
  const state = text.match(/\b(IA|IL|IN|MO)\b/i)?.[1]?.toUpperCase();
  if (state === "IA" || state === "IL" || state === "IN" || state === "MO") patch.state = state;
  const acres = numberAfter(text, /(?:field\s*)?acres\s*[:|-]\s*/i);
  if (acres) patch.acres = acres;
  return patch;
}

function parseMissouriLabFields(text: string): MissouriLabFields {
  const normalized = text.replace(/\s+/g, " ");
  const fields: MissouriLabFields = {};
  const county = firstMatch(text, /county\s*[:|-]?\s*([A-Za-z]+)(?:\s+County)?/i);
  if (county) fields.county = titleCase(county);
  const sampleId = firstMatch(text, /(?:sample\s*id|field\s*id)\s*[:|-]?\s*([A-Za-z0-9-]+)/i);
  if (sampleId) fields.sampleId = sampleId;
  const texture = firstMatch(text, /(?:soil\s*)?texture\s*[:|-]?\s*([A-Za-z ]*loam|clay|sand|silt)(?:\s|$)/i);
  if (texture) fields.texture = texture.trim();
  const crop = firstMatch(text, /crop\s*[:|-]?\s*([A-Za-z0-9, /-]+)/i);
  if (crop) fields.crop = crop.trim().slice(0, 80);
  fields.organicMatterPct = numberFromMatches(normalized, [
    /organic\s+matter\s*[:|-]?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i,
    /\bOM\b\s*[:|-]?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i
  ]);
  fields.ph = numberFromMatches(normalized, [/\bpHs?\b(?:\s*\([^)]*\))?\s*[:|-]?\s*([0-9]+(?:\.[0-9]+)?)/i]);
  fields.phosphorusPpm = numberFromMatches(normalized, [/phosphor(?:us)?\s*\(?P\)?\s*[:|-]?\s*([0-9]+(?:\.[0-9]+)?)/i, /\bP\b\s*[:|-]?\s*([0-9]+(?:\.[0-9]+)?)/i]);
  fields.potassiumPpm = numberFromMatches(normalized, [/potassium\s*\(?K\)?\s*[:|-]?\s*([0-9]+(?:\.[0-9]+)?)/i, /\bK\b\s*[:|-]?\s*([0-9]+(?:\.[0-9]+)?)/i]);
  fields.cec = numberFromMatches(normalized, [/\bCEC\b\s*[:|-]?\s*([0-9]+(?:\.[0-9]+)?)/i]);

  const hasSoilLabValue = [fields.organicMatterPct, fields.ph, fields.phosphorusPpm, fields.potassiumPpm, fields.cec].some((value) => value !== undefined);
  if (!hasSoilLabValue) return {};
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== "")) as MissouriLabFields;
}

function profilePatchFromLabFields(fields: MissouriLabFields): Partial<FieldProfile> {
  const patch: Partial<FieldProfile> = {};
  if (fields.county) patch.county = fields.county;
  if (fields.texture) patch.soilType = normalizeSoilType(fields.texture);
  return patch;
}

function labZoneFromFields(fields: MissouriLabFields, acres?: number): ParsedZone[] {
  if (![fields.organicMatterPct, fields.ph, fields.phosphorusPpm, fields.potassiumPpm].some((value) => value !== undefined)) return [];
  return [
    {
      zoneId: fields.sampleId ? fields.sampleId.toUpperCase() : "LAB-1",
      acres: acres && acres > 0 ? acres : 1,
      organicMatterPct: clampNumber(fields.organicMatterPct, 0, 10, 2),
      ph: clampNumber(fields.ph, 4.5, 8.5, 6.5),
      phosphorusPpm: clampNumber(fields.phosphorusPpm, 0, 200, 30),
      potassiumPpm: clampNumber(fields.potassiumPpm, 0, 800, 200)
    }
  ];
}

function firstMatch(text: string, regex: RegExp) {
  return text.match(regex)?.[1]?.trim();
}

function numberFromMatches(text: string, regexes: RegExp[]) {
  for (const regex of regexes) {
    const value = Number(text.match(regex)?.[1]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function parseZoneRows(text: string): ParsedZone[] {
  const rows: ParsedZone[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || /zone[_\s-]?id/i.test(line) || /organic/i.test(line)) continue;
    const csv = line.split(",").map((part) => part.trim());
    const parts = csv.length >= 6 ? csv : line.split(/\s+/);
    if (!/^z(?:one)?[\w-]*\d+$/i.test(parts[0] || "")) continue;
    const numbers = parts.slice(1, 6).map(Number);
    if (numbers.some((value) => !Number.isFinite(value))) continue;
    rows.push({
      zoneId: parts[0].toUpperCase(),
      acres: numbers[0],
      organicMatterPct: numbers[1],
      ph: numbers[2],
      phosphorusPpm: numbers[3],
      potassiumPpm: numbers[4],
      polygonWkt: parts.find((part) => part.toUpperCase().startsWith("POLYGON"))
    });
  }
  return rows;
}

function cleanCsvRows(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);
}

function assertExactHeader(header: string | undefined, required: string[]) {
  if (!header) throw new Error("CSV rejected: missing header row");
  const actual = header.split(",").map((value) => value.trim());
  if (actual.join(",") !== required.join(",")) throw new Error(`CSV rejected: expected header ${required.join(",")}`);
}

function splitSoilCsvRow(row: string) {
  const parts = row.split(",");
  if (parts.length <= 7) return parts.map((value) => value.trim());
  return [...parts.slice(0, 6).map((value) => value.trim()), parts.slice(6).join(",").trim()];
}

function validateCsvZone(zone: SoilZone, rowNumber: number) {
  const errors: string[] = [];
  if (!zone.zoneId) errors.push(`row ${rowNumber}: zone_id is required`);
  if (!Number.isFinite(zone.acres) || zone.acres <= 0) errors.push(`row ${rowNumber}: acres must be positive`);
  if (!Number.isFinite(zone.organicMatterPct) || zone.organicMatterPct < 0 || zone.organicMatterPct > 10) {
    errors.push(`row ${rowNumber}: organic_matter_pct must be 0-10`);
  }
  if (!Number.isFinite(zone.ph) || zone.ph < 4.5 || zone.ph > 8.5) errors.push(`row ${rowNumber}: ph must be 4.5-8.5`);
  if (!Number.isFinite(zone.phosphorusPpm) || zone.phosphorusPpm < 0 || zone.phosphorusPpm > 200) {
    errors.push(`row ${rowNumber}: phosphorus_ppm must be 0-200`);
  }
  if (!Number.isFinite(zone.potassiumPpm) || zone.potassiumPpm < 0 || zone.potassiumPpm > 800) {
    errors.push(`row ${rowNumber}: potassium_ppm must be 0-800`);
  }
  if (!zone.polygonWkt.toUpperCase().startsWith("POLYGON")) errors.push(`row ${rowNumber}: polygon_wkt must be a WKT POLYGON`);
  return errors;
}

function numberAfter(text: string, regex: RegExp) {
  const match = text.match(new RegExp(`${regex.source}([0-9]+(?:\\.[0-9]+)?)`, regex.flags));
  return match?.[1] ? Number(match[1]) : null;
}

function normalizeSoilType(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function fallbackPolygon(index: number) {
  const x1 = index * 24;
  const x2 = x1 + 22;
  return `POLYGON((${x1} 0, ${x2} 0, ${x2} 12, ${x1} 12, ${x1} 0))`;
}
