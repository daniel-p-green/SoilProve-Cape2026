import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Bot,
  Bug,
  Cloud,
  Download,
  FileCheck,
  Gauge,
  Leaf,
  LogOut,
  Lock,
  MapPinned,
  Menu,
  Mic,
  MicOff,
  Minus,
  Radio,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Tractor,
  X
} from "lucide-react";
import {
  type FieldProfile,
  type OemTarget,
  type Prescription,
  type SoilZone,
  type ToolAction,
  type TrialPacket
} from "./domain";
import { canonicalFieldFixtures } from "./fixtures";
import { parseSoilReportFile, parseSoilReportText, type SoilReportImportResult } from "./ocr";
import { normalizeRaimondFieldProfilePatch } from "./raimondTools";
import { RaimondRealtimeClient, type RealtimeStatus } from "./realtime";
import type { RegionalSoilContext, RegionalSoilInsight } from "./regionalSoil";

const tabOrder = ["intake", "plan", "proof", "packet", "exports", "results"] as const;
type Tab = (typeof tabOrder)[number];
type StepAccess = { locked: boolean; reason: string; state: "ready" | "active" | "complete" | "locked" };
type User = { id: string; name: string; authMode: "codex" | "demo"; role?: "farmer" | "agronomist" | "admin"; planType: string | null };
type DemoPersona = { id: string; name: string; role: "farmer" | "agronomist" | "admin"; happyPath: string };
type Transcript = { speaker: "user" | "assistant" | "system"; text: string };
type OemResult = { target: OemTarget; result: { ok: boolean; mode: string; message: string; endpoint?: string }; bundle?: { filename: string; files: string[] } };
type ToolReceipt = { name: string; ok: boolean; detail: string; createdAt: string };
type DemoStepId = "auto" | "login" | "intake" | "review" | "plan" | "signoff" | "packet" | "vrt" | "oem" | "yield" | "audit" | "reset";
type Health = {
  realtimeModel: string;
  realtimeVoice: string;
  env: Record<string, boolean>;
  codexAppServer?: CodexStatusResponse | null;
  ocr?: { scannedPdfAvailable?: boolean };
};
type CodexAuthState = "not_running" | "token_missing" | "login_required" | "ready" | "limited" | "error";
type RaimondVoiceBadge = {
  className: "connected" | "connecting" | "error";
  label: string;
};
type CodexStatusResponse = {
  available: boolean;
  authState: CodexAuthState;
  error: string | null;
  account: { type?: string; planType?: string | null } | null;
  rateLimits: {
    limited: boolean;
    reachedType: string | null;
    primaryUsedPercent: number | null;
    secondaryUsedPercent: number | null;
    resetsAt: number | null;
  } | null;
  requiresOpenaiAuth?: boolean | null;
};
type CodexLoginSession = {
  loginId?: string;
  authUrl?: string | null;
  verificationUrl?: string | null;
  userCode?: string | null;
  status: string;
  success?: boolean | null;
  error?: string | null;
  account: { planType?: string | null } | null;
};
type MicPermission = "unknown" | "granted" | "prompt" | "denied" | "unsupported";
type RaimondMode = "voice" | "chat";
type AuditEvent = {
  id: string;
  action: string;
  actorRole: string | null;
  targetType: string;
  targetId: string;
  outcome: string;
  createdAt: string;
};
type YieldOutcome = {
  seasonYear: number;
  savings: {
    dollarsSavedPerAcre: number;
    grossFieldSavings: number;
    guaranteeTriggered: boolean;
  };
  source: "uploaded" | "existing";
};

export function workflowProgress(stepAccess: Record<Tab, StepAccess>) {
  const completed = tabOrder.filter((tab) => stepAccess[tab].state === "complete").length;
  return {
    completed,
    total: tabOrder.length,
    percentComplete: Math.round((completed / tabOrder.length) * 100)
  };
}
type ReviewIssue = { label: string; detail: string };
type SampleSoilReport = {
  id: string;
  label: string;
  source: string;
  path: string;
  sourceType: "pdf" | "text";
  note: string;
};
type OpenRouterChatCompletion = {
  choices?: Array<{ message?: { content?: string } }>;
};
type RaimondCopilotResponse = {
  assistant?: unknown;
  action?: { name?: unknown; args?: unknown };
};

const oemTargets: Array<{ target: OemTarget; label: string }> = [
  { target: "john_deere", label: "John Deere" },
  { target: "case_ih", label: "Case IH" },
  { target: "agco", label: "AGCO" }
];

const tabLabels: Record<Tab, string> = {
  intake: "Soil Report",
  plan: "Action Plan",
  proof: "Context",
  packet: "Packet",
  exports: "Export",
  results: "Results"
};

function normalizeNavigationTab(value: unknown): Tab | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((tabOrder as readonly string[]).includes(normalized)) return normalized as Tab;
  const aliases: Record<string, Tab> = {
    audit: "results",
    context: "proof",
    dashboard: "results",
    export: "exports",
    evidence: "proof",
    field: "intake",
    fields: "intake",
    neighbor: "proof",
    neighbors: "proof",
    proof: "proof",
    results: "results",
    review: "packet",
    savings: "results",
    soil: "intake",
    "soil report": "intake",
    trial: "plan",
    "action plan": "plan",
    yield: "results"
  };
  return aliases[normalized] ?? null;
}

const defaultVoiceSuggestions = [
  "Advance the demo step",
  "Load Keller Creek / Ridge 92 soil report",
  "What does this soil report mean?",
  "Explain the flagged lab values",
  "What should I ask my agronomist?",
  "What does the comparable context show?",
  "Generate the action plan",
  "Create the review packet"
];

const goldenVoiceScript = [
  "Raimond, start the full hands-free SoilProve experience.",
  "Dismiss onboarding, use demo login if needed, and load the Keller Creek Ridge 92 soil report.",
  "Open the soil report intake, explain the flagged values, and tell me what needs agronomist review.",
  "Mark the editable report values reviewed and generate the draft action plan.",
  "Open the action plan and summarize the zone rates, modeled input savings, breakeven yield drag, and caveats.",
  "Open comparable proof and explain what the privacy threshold allows us to show.",
  "Capture agronomist signoff and create the review packet.",
  "Open exports, download the VRT shapefile ZIP, and send it to John Deere simulation.",
  "Upload sample yield results, open results, and summarize verified savings and remaining audit evidence."
];

const soilTypeOptions = [
  { value: "silt_loam", label: "Silt loam" },
  { value: "silty_clay_loam", label: "Silty clay loam" },
  { value: "clay_loam", label: "Clay loam" },
  { value: "loam", label: "Loam" },
  { value: "sandy_loam", label: "Sandy loam" },
  { value: "sandy_clay_loam", label: "Sandy clay loam" }
];

const emptyProfile: FieldProfile = {
  farmName: "",
  farmerName: "",
  agronomistName: "",
  fieldName: "",
  state: "IA",
  county: "",
  soilType: "silt_loam",
  crop: "corn",
  seasonYear: 2026,
  acres: 0,
  previousCrop: "soybean",
  cornPricePerBushel: 4.5,
  nitrogenPricePerLb: 0.74,
  baselineNitrogenLbsPerAcre: 0,
  threeYearBaselineYield: 0
};

const emptyZones: SoilZone[] = [
  { zoneId: "Z1", acres: 0, organicMatterPct: 0, ph: 6.5, phosphorusPpm: 0, potassiumPpm: 0, polygonWkt: "POLYGON((0 0,22 0,22 12,0 12,0 0))" },
  { zoneId: "Z2", acres: 0, organicMatterPct: 0, ph: 6.5, phosphorusPpm: 0, potassiumPpm: 0, polygonWkt: "POLYGON((22 0,44 0,44 12,22 12,22 0))" },
  { zoneId: "Z3", acres: 0, organicMatterPct: 0, ph: 6.5, phosphorusPpm: 0, potassiumPpm: 0, polygonWkt: "POLYGON((0 12,44 12,44 24,0 24,0 12))" }
];

const sampleSoilReports: SampleSoilReport[] = [
  {
    id: "rimor-2025-topsoil-pdf",
    label: "Real MU PDF: 2025 topsoil",
    source: "Live PDF OCR fixture",
    path: "/sample-reports/missouri-pdfs/rimor-2025-topsoil.pdf",
    sourceType: "pdf",
    note: "Best live OCR demo: public Missouri lab-style PDF with Boone/loam fields."
  },
  {
    id: "rimor-2025-70-30-pdf",
    label: "Real MU PDF: 2025 70/30",
    source: "Live PDF OCR fixture",
    path: "/sample-reports/missouri-pdfs/rimor-2025-70-30.pdf",
    sourceType: "pdf",
    note: "Current public MU-format report for OCR layout stress testing."
  },
  {
    id: "rimor-2014-soil-test-pdf",
    label: "Real MU PDF: 2014 soil test",
    source: "Live PDF OCR fixture",
    path: "/sample-reports/missouri-pdfs/rimor-2014-soil-test.pdf",
    sourceType: "pdf",
    note: "Older public MU report layout for backward-compatible OCR review."
  },
  {
    id: "rimor-2014-garden-grow-pdf",
    label: "Real MU PDF: 2014 garden grow",
    source: "Live PDF OCR fixture",
    path: "/sample-reports/missouri-pdfs/rimor-2014-garden-grow.pdf",
    sourceType: "pdf",
    note: "Non-row-crop public report that should remain review-required."
  },
  {
    id: "mu-g09112-guide-pdf",
    label: "MU guide PDF: sample report",
    source: "PDF schema reference",
    path: "/sample-reports/missouri-pdfs/mu-g09112-interpreting-soil-test-reports.pdf",
    sourceType: "pdf",
    note: "Official MU guide PDF with canonical sample report sections."
  },
  {
    id: "miller-text-layer",
    label: "Miller North 80",
    source: "Text-layer PDF sample",
    path: "/sample-reports/miller-text-layer-report.txt",
    sourceType: "pdf",
    note: "Three-zone Missouri corn field with complete editable values."
  },
  {
    id: "waverly-ocr",
    label: "Waverly East 64",
    source: "OCR-style lab sample",
    path: "/sample-reports/waverly-ocr-report.txt",
    sourceType: "text",
    note: "Noisier extracted report for review-required parser behavior."
  },
  {
    id: "harlan-story",
    label: "Harlan West 88",
    source: "Iowa report-style sample",
    path: "/sample-reports/harlan-story-report.txt",
    sourceType: "text",
    note: "Iowa silt-loam corn field based on public pH, OM, P, and K report fields."
  },
  {
    id: "richter-mclean",
    label: "Richter East 76",
    source: "Illinois report-style sample",
    path: "/sample-reports/richter-mclean-report.txt",
    sourceType: "text",
    note: "Illinois silty-clay-loam field with complete editable zone rows."
  },
  {
    id: "porter-benton",
    label: "Porter Grid 70",
    source: "Indiana report-style sample",
    path: "/sample-reports/porter-benton-report.txt",
    sourceType: "text",
    note: "Indiana loam field shaped from public fertility guidance fields."
  },
  {
    id: "keller-polk",
    label: "Keller Ridge 92",
    source: "Iowa report-style sample",
    path: "/sample-reports/keller-polk-report.txt",
    sourceType: "text",
    note: "Additional Iowa clay-loam scenario for peer-cohort comparison."
  },
  {
    id: "nolan-champaign",
    label: "Nolan West 84",
    source: "Illinois report-style sample",
    path: "/sample-reports/nolan-champaign-report.txt",
    sourceType: "text",
    note: "Additional Illinois silt-loam scenario for aggregate comparable context."
  },
  {
    id: "rusk-tippecanoe",
    label: "Rusk Home 82",
    source: "Indiana report-style sample",
    path: "/sample-reports/rusk-tippecanoe-report.txt",
    sourceType: "text",
    note: "Additional Indiana silty-clay-loam scenario for low-risk first trials."
  }
];

const demoSampleAgronomistName = "Daniel Green";
const demoOperatorName = "Daniel";

function hasFieldData(profile: FieldProfile, zones: SoilZone[]) {
  return Boolean(
    profile.farmName.trim() &&
      profile.fieldName.trim() &&
      profile.county.trim() &&
      profile.acres > 0 &&
      profile.baselineNitrogenLbsPerAcre > 0 &&
      profile.threeYearBaselineYield > 0 &&
      zones.reduce((sum, zone) => sum + zone.acres, 0) > 0
  );
}

function describeCodexStatus(status: CodexStatusResponse | null) {
  if (!status) return "Sign-in status is temporarily unavailable.";
  if (status.authState === "token_missing") return "Sign-in setup is incomplete. You can continue with a demo profile.";
  if (status.authState === "not_running") return "Sign-in service is unavailable right now. You can continue with a demo profile.";
  if (status.authState === "login_required") return "Sign-in is available when you're ready.";
  if (status.authState === "limited") return `Account usage is limited${status.rateLimits?.reachedType ? `: ${status.rateLimits.reachedType}` : ""}.`;
  if (status.authState === "ready") {
    const plan = status.account?.planType || status.rateLimits?.primaryUsedPercent;
    const usage = typeof status.rateLimits?.primaryUsedPercent === "number" ? `, ${Math.round(status.rateLimits.primaryUsedPercent)}% primary usage` : "";
    return `Account ready${typeof plan === "string" ? ` (${plan})` : ""}${usage}.`;
  }
  return status.error || "Sign-in status could not be read.";
}

function fieldReviewIssues(profile: FieldProfile, zones: SoilZone[], soilImport: SoilReportImportResult | null, fieldReviewed: boolean): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  if (!profile.farmName.trim()) issues.push({ label: "Farm name", detail: "Missing field fact." });
  if (!profile.fieldName.trim()) issues.push({ label: "Field name", detail: "Missing field fact." });
  if (!profile.county.trim()) issues.push({ label: "County", detail: "Missing field fact." });
  if (profile.acres <= 0) issues.push({ label: "Acres", detail: "Enter positive field acres." });
  if (profile.baselineNitrogenLbsPerAcre <= 0) issues.push({ label: "Flat N rate", detail: "Needed for modeled savings." });
  if (profile.threeYearBaselineYield <= 0) issues.push({ label: "Three-year yield", detail: "Needed for breakeven drag." });
  if (zones.reduce((sum, zone) => sum + zone.acres, 0) <= 0) issues.push({ label: "Soil zones", detail: "Add zone acres and soil values." });

  if (soilImport?.reviewRequired && !fieldReviewed) {
    const labFields = soilImport.labFields;
    const labIssues = [
      labFields?.organicMatterPct !== undefined ? { label: "OCR organic matter", detail: `${labFields.organicMatterPct}% needs operator review.` } : null,
      labFields?.ph !== undefined ? { label: "OCR pH", detail: `${labFields.ph} needs operator review.` } : null,
      labFields?.phosphorusPpm !== undefined ? { label: "OCR phosphorus", detail: `${labFields.phosphorusPpm} ppm needs operator review.` } : null,
      labFields?.potassiumPpm !== undefined ? { label: "OCR potassium", detail: `${labFields.potassiumPpm} ppm needs operator review.` } : null
    ].filter(Boolean) as ReviewIssue[];
    issues.push(...labIssues);
    if (labIssues.length === 0) {
      issues.push({
        label: "Soil report import",
        detail: soilImport.warnings[0] || `${soilImport.confidence} confidence import needs operator review.`
      });
    }
  }

  return issues.slice(0, 6);
}

function buildStepAccess(input: {
  profile: FieldProfile;
  zones: SoilZone[];
  fieldReviewed: boolean;
  soilImport: SoilReportImportResult | null;
  prescription: Prescription | null;
  packet: TrialPacket | null;
  oemResults: OemResult[];
  yieldOutcome: YieldOutcome | null;
}) {
  const fieldDataPresent = hasFieldData(input.profile, input.zones);
  const needsSoilReview = Boolean(input.soilImport?.reviewRequired && !input.fieldReviewed);
  const fieldReady = fieldDataPresent && !needsSoilReview;
  const planReady = Boolean(input.prescription);
  const neighborsEligible = Boolean(input.prescription && input.prescription.peerSummary.comparableCount >= 5);
  const signed = input.prescription?.status === "signed" || input.prescription?.status === "exported";
  const reviewReady = Boolean(input.packet);
  const exported = input.prescription?.status === "exported";
  return {
    intake: { locked: false, reason: "", state: fieldReady ? "complete" : "active" },
    plan: {
      locked: !fieldReady,
      reason: fieldDataPresent ? "Review flagged lab values before generating the action plan." : "Add field facts and soil-zone values first.",
      state: !fieldReady ? "locked" : planReady ? "complete" : "ready"
    },
    proof: {
      locked: !planReady || !neighborsEligible,
      reason: !planReady ? "Generate the action plan before comparing context." : "Comparable context stays hidden until 5 comparable fields are available.",
      state: !planReady || !neighborsEligible ? "locked" : "complete"
    },
    packet: {
      locked: !signed,
      reason: "Capture agronomist signoff before creating the review packet.",
      state: !signed ? "locked" : reviewReady ? "complete" : "ready"
    },
    exports: {
      locked: !reviewReady,
      reason: "Create the agronomist review packet before export.",
      state: !reviewReady ? "locked" : exported ? "complete" : "ready"
    },
    results: {
      locked: !exported,
      reason: "Results open after VRT export; harvest verification comes later.",
      state: !exported ? "locked" : input.yieldOutcome ? "complete" : "ready"
    }
  } satisfies Record<Tab, StepAccess>;
}

function buildRaimondSuggestions(input: {
  profile: FieldProfile;
  zones: SoilZone[];
  fieldReviewed: boolean;
  soilImport: SoilReportImportResult | null;
  prescription: Prescription | null;
  packet: TrialPacket | null;
  yieldOutcome: YieldOutcome | null;
}) {
  const issues = fieldReviewIssues(input.profile, input.zones, input.soilImport, input.fieldReviewed);
  if (!hasFieldData(input.profile, input.zones)) {
    return [
      "Load Keller Creek / Ridge 92 soil report",
      "Use Ridge 92 baseline: 184 lb N and 211 bu yield",
      "Import Keller Ridge 92 OCR report"
    ];
  }
  if (issues.length) {
    return [
      "Explain the flagged lab values",
      `Review ${issues[0].label}`,
      "Mark field values reviewed"
    ];
  }
  if (!input.prescription) return ["Generate the action plan", "What assumptions are used?", "What does the comparable context show?"];
  if (input.prescription.status === "draft") return ["Capture agronomist signoff", "Show the breakeven yield drag", "What does the comparable context show?"];
  if (!input.packet) return ["Create the review packet", "Open the Packet step", "Can I export yet?"];
  if (input.prescription.status !== "exported") return ["Open Export", "Export the VRT shapefile", "Send it to John Deere simulation"];
  if (!input.yieldOutcome) return ["Open Results", "Can I upload harvest results?", "What will harvest results verify?"];
  return defaultVoiceSuggestions;
}

export function App() {
  const [profile, setProfile] = useState<FieldProfile>(() => ({ ...emptyProfile }));
  const [zones, setZones] = useState<SoilZone[]>(() => emptyZones.map((zone) => ({ ...zone })));
  const [activeTab, setActiveTab] = useState<Tab>("intake");
  const [user, setUser] = useState<User | null>(null);
  const [demoPersonas, setDemoPersonas] = useState<DemoPersona[]>([]);
  const [health, setHealth] = useState<Health>({ realtimeModel: "gpt-realtime-2", realtimeVoice: "cedar", env: {} });
  const [fieldReviewed, setFieldReviewed] = useState(false);
  const [codexStatus, setCodexStatus] = useState<string>("Checking sign-in status...");
  const [loginId, setLoginId] = useState<string>("");
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [packet, setPacket] = useState<TrialPacket | null>(null);
  const [regionalContext, setRegionalContext] = useState<RegionalSoilContext | null>(null);
  const [regionalInsight, setRegionalInsight] = useState<RegionalSoilInsight | null>(null);
  const [isRegionalInsightLoading, setIsRegionalInsightLoading] = useState(false);
  const [oemResults, setOemResults] = useState<OemResult[]>([]);
  const [soilImport, setSoilImport] = useState<SoilReportImportResult | null>(null);
  const [isImportingSample, setIsImportingSample] = useState<string | null>(null);
  const [yieldCsv, setYieldCsv] = useState("");
  const [yieldOutcome, setYieldOutcome] = useState<YieldOutcome | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [message, setMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem("soilprove-onboarding-dismissed") !== "1");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
  const [realtimeError, setRealtimeError] = useState("");
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");
  const [lastToolAction, setLastToolAction] = useState("none");
  const [lastToolReceipt, setLastToolReceipt] = useState<ToolReceipt | null>(null);
  const [toolReceipts, setToolReceipts] = useState<ToolReceipt[]>([]);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [raimondMode, setRaimondMode] = useState<RaimondMode>("chat");
  const [raimondRailMinimized, setRaimondRailMinimized] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [debugMode, setDebugMode] = useState(() => new URLSearchParams(window.location.search).get("debug") === "1");
  const realtimeRef = useRef<RaimondRealtimeClient | null>(null);

  const kpis = useMemo(() => {
    if (!prescription) return null;
    return [
      { label: "Modeled savings", value: `$${prescription.savings.dollarsSavedPerAcre}/ac` },
      { label: "Field savings", value: `$${prescription.savings.grossFieldSavings}` },
      { label: "Breakeven drag", value: `${prescription.savings.breakevenYieldDragBuPerAcre} bu/ac` },
      { label: "Context gate", value: `${prescription.peerSummary.comparabilityScore}/100` }
    ];
  }, [prescription]);
  const sampleFields = useMemo(() => canonicalFieldFixtures(), []);
  const nextRaimondCommand = useMemo(
    () => nextDemoCommand({ user, fieldReviewed, soilImport, prescription, packet, oemResults, yieldOutcome }),
    [fieldReviewed, oemResults, packet, prescription, soilImport, user, yieldOutcome]
  );
  const liveReadiness = useMemo(
    () => [
      { label: "Operator path", done: true, detail: "sign-in or demo profile are both available" },
      { label: "Live voice", done: Boolean(health.env.OPENAI_API_KEY), detail: health.env.OPENAI_API_KEY ? "ready" : "optional" },
      { label: "Microphone", done: micPermission === "granted" || micPermission === "prompt" || micPermission === "unknown", detail: micPermission },
      { label: "Realtime", done: realtimeStatus === "connected", detail: realtimeStatus },
      { label: "Last tool", done: Boolean(lastToolReceipt), detail: lastToolReceipt ? (lastToolReceipt.ok ? "complete" : "blocked") : "waiting" },
      { label: "Next command", done: Boolean(nextRaimondCommand), detail: nextRaimondCommand }
    ],
    [health.env.OPENAI_API_KEY, lastToolReceipt, micPermission, nextRaimondCommand, realtimeStatus]
  );
  const stepAccess = useMemo(
    () => buildStepAccess({ profile, zones, fieldReviewed, soilImport, prescription, packet, oemResults, yieldOutcome }),
    [fieldReviewed, oemResults, packet, prescription, profile, soilImport, yieldOutcome, zones]
  );
  const reviewIssues = useMemo(
    () => fieldReviewIssues(profile, zones, soilImport, fieldReviewed),
    [fieldReviewed, profile, soilImport, zones]
  );
  const raimondSuggestions = useMemo(
    () => buildRaimondSuggestions({ profile, zones, fieldReviewed, soilImport, prescription, packet, yieldOutcome }),
    [fieldReviewed, packet, prescription, profile, soilImport, yieldOutcome, zones]
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!loginId || user?.authMode === "codex") return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 120;

    const checkLogin = async () => {
      attempts += 1;
      try {
        const session = await fetchJson<CodexLoginSession>(`/api/codex/login/${loginId}`);
        if (!cancelled && session.status !== "pending") applyCodexLoginSession(loginId, session);
      } catch (error) {
        if (!cancelled) {
          setCodexStatus(
            `Still waiting for ChatGPT sign-in. If Codex opened, approve there, then return to SoilProve. (${errorMessage(error)})`
          );
        }
      }
    };

    void checkLogin();
    const timer = window.setInterval(() => {
      if (attempts >= maxAttempts) {
        window.clearInterval(timer);
        setCodexStatus("ChatGPT sign-in is still pending. Return to SoilProve after approval, or click Check ChatGPT sign-in.");
        return;
      }
      void checkLogin();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loginId, user?.authMode]);

  useEffect(() => {
    if (!prescription) {
      setRegionalContext(null);
      setRegionalInsight(null);
      return;
    }
    void refreshRegionalContext(prescription);
  }, [prescription?.id]);

  useEffect(() => {
    void updateMicPermission();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setDebugMode((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (prescription) setYieldCsv(sampleYieldCsv(prescription));
  }, [prescription?.id]);

  useEffect(() => {
    if (activeTab === "results" && user?.role === "admin") void refreshAuditEvents();
  }, [activeTab, user?.role]);

  useEffect(() => {
    if ((micPermission === "denied" || micPermission === "unsupported") && raimondMode === "voice") {
      setRaimondMode("chat");
    }
  }, [micPermission, raimondMode]);

  async function updateMicPermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermission("unsupported");
      return;
    }
    try {
      const permissions = navigator.permissions as Permissions & { query: (descriptor: { name: "microphone" }) => Promise<PermissionStatus> };
      const status = await permissions.query({ name: "microphone" });
      setMicPermission(status.state as MicPermission);
      status.onchange = () => setMicPermission(status.state as MicPermission);
    } catch {
      setMicPermission("unknown");
    }
  }

  async function bootstrap() {
    const [status, nextHealth, auth] = await Promise.all([
      fetchJson<CodexStatusResponse>("/api/codex/status").catch(() => null),
      fetchJson<Health>("/api/health").catch(() => ({ realtimeModel: "gpt-realtime-2", realtimeVoice: "cedar", env: {} })),
      fetchJson<{ user: User }>("/api/v1/auth/me").catch(() => null)
    ]);
    const personas = await fetchJson<{ users: DemoPersona[] }>("/api/demo-users").catch(() => ({ users: [] }));
    setUser(auth?.user ?? null);
    setHealth(nextHealth);
    setDemoPersonas(personas.users);
    setCodexStatus(describeCodexStatus(status));
  }

  async function startCodexLogin() {
    const loginWindow = window.open("about:blank", "_blank");
    try {
      if (loginWindow) {
        loginWindow.document.title = "SoilProve ChatGPT sign-in";
        loginWindow.document.body.textContent = "Opening ChatGPT sign-in...";
        loginWindow.opener = null;
      }
      const session = await fetchJson<CodexLoginSession & { loginId: string }>("/api/codex/login/start", { method: "POST" });
      setLoginId(session.loginId);
      if (session.verificationUrl) {
        const userCodeCopy = session.userCode ? ` Use code ${session.userCode}.` : "";
        if (loginWindow) {
          loginWindow.location.href = session.verificationUrl;
          setCodexStatus(`Complete the ChatGPT device-code approval in the browser.${userCodeCopy} SoilProve will detect completion automatically.`);
        } else {
          setCodexStatus(
            `Popup blocked. Open ${session.verificationUrl} to approve ChatGPT access.${userCodeCopy} SoilProve will detect completion automatically.`
          );
        }
      } else if (session.authUrl && loginWindow) {
        loginWindow.location.href = session.authUrl;
        setCodexStatus("Complete ChatGPT approval. If Codex opens, return to SoilProve; this page will detect completion automatically.");
      } else if (session.authUrl) {
        setCodexStatus("Popup blocked. Allow popups for this local app, then click Sign in with ChatGPT again.");
      } else {
        loginWindow?.close();
        setCodexStatus("ChatGPT sign-in started, but Codex did not provide a browser URL. Click Check ChatGPT sign-in.");
      }
    } catch (error) {
      loginWindow?.close();
      setCodexStatus(`ChatGPT sign-in could not start: ${errorMessage(error)}`);
    }
  }

  function applyCodexLoginSession(nextLoginId: string, session: CodexLoginSession) {
    if (session.status === "completed") {
      setCodexStatus("ChatGPT sign-in complete.");
      setLoginId("");
      setUser({ id: `codex-${nextLoginId}`, name: demoOperatorName, authMode: "codex", role: "admin", planType: session.account?.planType ?? null });
      setMessage("ChatGPT sign-in is active.");
      dismissOnboarding();
      return;
    }
    if (session.status === "failed" || session.status === "expired" || session.status === "cancelled") {
      setLoginId("");
      setCodexStatus(session.error || `ChatGPT sign-in ${session.status}.`);
      return;
    }
    if (session.status === "pending") {
      setCodexStatus("Waiting for ChatGPT sign-in. Return to SoilProve after approval; this page will detect completion automatically.");
      return;
    }
    setCodexStatus(`Sign-in ${session.status}.`);
  }

  async function pollCodexLogin(nextLoginId = loginId) {
    if (!nextLoginId) return;
    const session = await fetchJson<CodexLoginSession>(`/api/codex/login/${nextLoginId}`);
    applyCodexLoginSession(nextLoginId, session);
  }

  async function demoLogin(personaId?: string) {
    const response = await fetchJson<{ user: User }>("/api/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personaId ? { personaId } : {})
    });
    setUser(response.user);
    setMessage("Demo profile is active.");
    return response.user;
  }

  async function signOut() {
    await fetchJson<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }).catch(() => ({ ok: true }));
    setUser(null);
    setLoginId("");
    setCodexStatus(describeCodexStatus(health?.codexAppServer ?? null));
    setMessage("Signed out.");
  }

  async function welcomeChatGptLogin() {
    if (loginId) {
      await pollCodexLogin();
      return;
    }
    await startCodexLogin();
  }

  async function welcomeDemoLogin() {
    await demoLogin("test-admin-operator");
    dismissOnboarding();
  }

  async function generate(inputProfile = profile, inputZones = zones) {
    setIsGenerating(true);
    try {
      if (!hasFieldData(inputProfile, inputZones)) {
        setActiveTab("intake");
        throw new Error("Add field facts and soil-zone values before generating the action plan.");
      }
      if (inputProfile === profile && inputZones === zones && soilImport?.reviewRequired && !fieldReviewed) {
        setActiveTab("intake");
        throw new Error("Review flagged lab values before generating the action plan.");
      }
      if (!user) {
        setMessage("Starting local demo session so the action plan can be generated.");
        await demoLogin();
      }
      const next = await fetchJson<Prescription>("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: inputProfile, zones: inputZones })
      });
      setPrescription(next);
      setPacket(null);
      setRegionalContext(null);
      setRegionalInsight(null);
      setActiveTab("plan");
      setFieldReviewed(true);
      setMessage("Reviewable action plan generated and persisted.");
      await refreshAuditEvents();
      return next;
    } catch (error) {
      setMessage(`Action plan was not generated: ${errorMessage(error)}`);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }

  async function sign(target = prescription) {
    if (!target) return null;
    const signed = await fetchJson<Prescription>(`/api/prescriptions/${target.id}/signoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: `Raimond prepared the soil-report discussion notes and action plan; ${target.profile.agronomistName} review requested before application.` })
    });
    setPrescription(signed);
    setMessage("Agronomist signoff captured in SQLite.");
    await refreshAuditEvents();
    return signed;
  }

  async function createPacket(target = prescription) {
    const current = target;
    if (!current) {
      setMessage("Generate an action plan before creating the review packet.");
      throw new Error("No action plan is ready for review packet creation.");
    }
    if (current.status === "draft") {
      setMessage("Capture agronomist signoff before creating the review packet.");
      throw new Error("Agronomist signoff is required before review packet creation.");
    }
    const response = await fetchJson<TrialPacket & { id: string }>(`/api/prescriptions/${current.id}/packet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regionalInsight })
    });
    setPacket(response);
    setActiveTab("packet");
    setMessage("Agronomist review packet created.");
    await refreshAuditEvents();
    return response;
  }

  async function refreshRegionalContext(target = prescription) {
    if (!target) return null;
    const context = await fetchJson<RegionalSoilContext>(`/api/prescriptions/${target.id}/regional-soil-context`).catch(() => null);
    if (context) setRegionalContext(context);
    return context;
  }

  async function generateRegionalInsight(target = prescription) {
    if (!target) return null;
    setIsRegionalInsightLoading(true);
    try {
      const insight = await fetchJson<RegionalSoilInsight>(`/api/prescriptions/${target.id}/regional-soil-insights`, { method: "POST" });
      setRegionalInsight(insight);
      setRegionalContext(insight.context);
      setMessage(insight.mode === "live" ? "Live review insight generated for agronomist review." : "Regional soil context is ready from source-backed rules.");
      return insight;
    } catch (error) {
      setMessage(`Regional soil insight was not generated: ${errorMessage(error)}`);
      throw error;
    } finally {
      setIsRegionalInsightLoading(false);
    }
  }

  async function downloadVrt(target = prescription, triggerDownload = true, reviewPacket = packet) {
    const current = target;
    if (!current) return null;
    if (current.status === "draft") {
      setMessage("Capture explicit agronomist signoff before VRT export.");
      return null;
    }
    if (!reviewPacket) {
      setMessage("Create the agronomist review packet before VRT export.");
      return null;
    }
    const response = await fetch(`/api/prescriptions/${current.id}/vrt`);
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    if (triggerDownload) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "soilprove-vrt.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    }
    const next = current.status === "signed" ? { ...current, status: "exported" as const, exportedAt: new Date().toISOString() } : current;
    setMessage("VRT shapefile ZIP exported.");
    setPrescription((currentPrescription) => (currentPrescription && currentPrescription.id === current.id ? next : currentPrescription));
    await refreshAuditEvents();
    return next;
  }

  async function sendOem(target: OemTarget, sourcePrescription = prescription, reviewPacket = packet) {
    const current = sourcePrescription;
    if (!current) return null;
    if (current.status === "draft") {
      setMessage("Capture explicit agronomist signoff before OEM delivery.");
      return null;
    }
    if (!reviewPacket) {
      setMessage("Create the agronomist review packet before OEM delivery.");
      return null;
    }
    const payload = await fetchJson<Omit<OemResult, "target">>(`/api/prescriptions/${current.id}/oem/${target}`, { method: "POST" });
    const response: OemResult = { target, ...payload };
    setOemResults((items) => [response, ...items.filter((item) => item.target !== target)]);
    setActiveTab("exports");
    setMessage(response.result.message);
    await refreshAuditEvents();
    return response;
  }

  async function handleSoilReportImport(file: File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    let result: SoilReportImportResult;
    try {
      result = isPdf
        ? await fetchJson<SoilReportImportResult>("/api/v1/soil-tests/ocr-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
            body: await file.arrayBuffer()
          })
        : await parseSoilReportFile(file);
    } catch (error) {
      result = await parseSoilReportFile(file);
      if (isPdf) result.warnings = [...result.warnings, `Server OCR unavailable; used text-layer fallback. ${error instanceof Error ? error.message : ""}`.trim()];
    }
    stageSoilReportImport(result, "Soil report import");
  }

  async function handleSampleSoilReportImport(report: SampleSoilReport): Promise<SoilReportImportResult> {
    setIsImportingSample(report.id);
    try {
      const response = await fetch(report.path);
      if (!response.ok) throw new Error(`Sample report could not be loaded (${response.status}).`);
      let result: SoilReportImportResult;
      if (report.sourceType === "pdf" && report.path.toLowerCase().endsWith(".pdf")) {
        const bytes = await response.arrayBuffer();
        try {
          result = await fetchJson<SoilReportImportResult>("/api/v1/soil-tests/ocr-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
            body: bytes
          });
        } catch (error) {
          result = parseSoilReportText(new TextDecoder().decode(bytes), "pdf");
          result.warnings = [...result.warnings, `Server OCR unavailable; used text-layer fallback. ${errorMessage(error)}`];
        }
      } else {
        const resultText = await response.text();
        result = parseSoilReportText(resultText, report.sourceType);
      }
      stageSoilReportImport(result, report.label, { agronomistName: demoSampleAgronomistName });
      return result;
    } catch (error) {
      setMessage(`Sample report was not loaded: ${errorMessage(error)}`);
      throw error;
    } finally {
      setIsImportingSample(null);
    }
  }

  function stageSoilReportImport(result: SoilReportImportResult, sourceLabel: string, profileDefaults: Partial<FieldProfile> = {}) {
    setSoilImport(result);
    setFieldReviewed(!result.reviewRequired);
    setProfile((current) => ({ ...current, ...result.profilePatch, ...profileDefaults, acres: result.zones.reduce((sum, zone) => sum + zone.acres, 0) || result.profilePatch.acres || current.acres }));
    if (result.zones.length > 0) setZones(result.zones);
    setMessage(`${sourceLabel} staged with ${result.confidence} confidence. Review values before generating an action plan.`);
  }

  function selectFixture(id: string) {
    const fixture = sampleFields.find((item) => item.id === id) || sampleFields[0];
    setProfile({ ...fixture.profile });
    setZones(fixture.zones.map((zone) => ({ ...zone })));
    setFieldReviewed(true);
    setPrescription(null);
    setPacket(null);
    setRegionalContext(null);
    setRegionalInsight(null);
    setYieldOutcome(null);
    setOemResults([]);
    setYieldCsv("");
    return fixture;
  }

  function loadSampleField(id: string) {
    const fixture = selectFixture(id);
    setActiveTab("intake");
    setMessage(`${fixture.displayName} loaded as synthetic fixture data.`);
  }

  function applyRaimondIntakeFixture(id: string) {
    const fixture = selectFixture(id);
    setActiveTab("intake");
    setMessage(`Raimond filled ${fixture.displayName}. Review the field data before generating a plan.`);
    return fixture;
  }

  async function uploadYieldCsv(csv = yieldCsv, target = prescription) {
    if (!target) return null;
    return uploadYieldCsvFor(target, csv);
  }

  async function uploadYieldCsvFor(target: Prescription, csv: string) {
    if (target.status !== "exported") {
      setMessage("Export the reviewed plan before attaching harvest results.");
      return null;
    }
    const seasonYear = target.profile.seasonYear;
    const url = `/api/v1/fields/${target.fieldId}/yield-records?season_year=${seasonYear}`;
    try {
      const response = await fetchJson<{ savings: YieldOutcome["savings"] }>(url, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csv
      });
      const next = { seasonYear, savings: response.savings, source: "uploaded" as const };
      setYieldOutcome(next);
      setActiveTab("results");
      setMessage(`Verified savings: $${response.savings.dollarsSavedPerAcre}/ac after yield upload.`);
      await refreshAuditEvents();
      return next;
    } catch (error) {
      const existing = await fetchJson<{ savings: YieldOutcome["savings"] }>(`/api/v1/fields/${target.fieldId}/savings?season_year=${seasonYear}`).catch(() => null);
      if (!existing) throw error;
      const next = { seasonYear, savings: existing.savings, source: "existing" as const };
      setYieldOutcome(next);
      setActiveTab("results");
      setMessage(`Verified savings reused existing ${seasonYear} yield record.`);
      return next;
    }
  }

  async function refreshAuditEvents() {
    const response = await fetchJson<{ events: AuditEvent[] }>("/api/v1/admin/audit-events").catch(() => ({ events: [] }));
    setAuditEvents(response.events.slice(0, 8));
    return response.events;
  }

  async function runFullDemoSetup() {
    setMessage("Running full demo setup...");
    await demoLogin("test-admin-operator");
    const fixture = selectFixture("keller_polk_county_ridge_92");
    await fetchJson("/api/v1/admin/link-agronomist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farmerUserId: "test-farmer-keller", agronomistUserId: "test-agronomist-chen", farmId: "keller-creek" })
    }).catch(() => null);
    const generated = await generate(fixture.profile, fixture.zones);
    const signed = await sign(generated);
    if (!signed) throw new Error("Full demo setup could not capture agronomist signoff.");
    const nextPacket = await createPacket(signed);
    const exported = (await downloadVrt(signed, false, nextPacket)) || signed;
    await sendOem("john_deere", exported, nextPacket);
    await uploadYieldCsvFor(exported, sampleYieldCsv(exported));
    await refreshAuditEvents();
    setActiveTab("results");
    setMessage("Full demo setup complete: login, review, plan, signoff, packet, VRT, John Deere simulation, and outcome savings are ready.");
  }

  function resetFlow() {
    realtimeRef.current?.disconnect();
    realtimeRef.current = null;
    setProfile({ ...emptyProfile });
    setZones(emptyZones.map((zone) => ({ ...zone })));
    setActiveTab("intake");
    setFieldReviewed(false);
    setPrescription(null);
    setPacket(null);
    setOemResults([]);
    setSoilImport(null);
    setYieldCsv("");
    setYieldOutcome(null);
    setAuditEvents([]);
    setMessage("Debug reset complete. Empty Raimond field is ready.");
    setRealtimeStatus("idle");
    setRealtimeError("");
    setLastToolAction("none");
    setLastToolReceipt(null);
    setToolReceipts([]);
    setTranscripts([]);
    setRaimondMode("chat");
    setRaimondRailMinimized(false);
    setChatDraft("");
  }

  function dismissOnboarding() {
    localStorage.setItem("soilprove-onboarding-dismissed", "1");
    setShowOnboarding(false);
  }

  function selectTab(tab: Tab) {
    const access = stepAccess[tab];
    if (access.locked) {
      setMessage(`${tabLabels[tab]} is locked: ${access.reason}`);
      return;
    }
    setActiveTab(tab);
    window.requestAnimationFrame(() => document.getElementById("workspace-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function updateZone(index: number, patch: Partial<SoilZone>) {
    setZones((current) => current.map((zone, zoneIndex) => (zoneIndex === index ? { ...zone, ...patch } : zone)));
  }

  async function advanceDemoStep(requestedStep: DemoStepId = "auto") {
    const step = requestedStep === "auto" ? inferNextDemoStep() : requestedStep;
    if (step === "reset") {
      resetFlow();
      return { ok: true, step, activeTab: "intake", next: "Advance the demo step" };
    }
    if (step === "login") {
      const nextUser = user ?? (await demoLogin("test-admin-operator"));
      return { ok: true, step, user: nextUser.name, next: "Load Keller Ridge" };
    }
    if (step === "intake") {
      dismissOnboarding();
      const fixture = applyRaimondIntakeFixture("keller_polk_county_ridge_92");
      return { ok: true, step, fieldId: fixture.id, displayName: fixture.displayName, next: "Review field data" };
    }
    if (step === "review") {
      const report = sampleSoilReports.find((item) => item.id === "keller-polk") || sampleSoilReports[0];
      const result = soilImport ? soilImport : await handleSampleSoilReportImport(report);
      setFieldReviewed(true);
      setActiveTab("intake");
      setMessage("Keller Ridge report values reviewed. Raimond can generate a draft action plan next.");
      return { ok: true, step, confidence: result.confidence, reviewRequired: true, next: "Generate the action plan" };
    }
    if (step === "plan") {
      const next = await generate();
      return { ok: true, step, prescriptionId: next.id, status: next.status, next: "Capture agronomist signoff" };
    }
    if (step === "signoff") {
      const base = prescription ?? (await generate());
      const signed = base.status === "draft" ? await sign(base) : base;
      return signed ? { ok: true, step, prescriptionId: signed.id, status: signed.status, next: "Create the review packet" } : { ok: false, step, error: "No action plan is ready for signoff." };
    }
    if (step === "packet") {
      const nextPacket = await createPacket();
      return { ok: true, step, title: nextPacket.title, next: "Export VRT" };
    }
    if (step === "vrt") {
      const base = prescription ?? (await generate());
      if (base.status === "draft") return { ok: false, step, error: "Capture agronomist signoff before VRT export." };
      const exported = await downloadVrt(base);
      return exported ? { ok: true, step, status: exported.status, next: "Send to John Deere" } : { ok: false, step, error: "VRT export needs agronomist signoff." };
    }
    if (step === "oem") {
      const base = prescription ?? (await generate());
      if (base.status === "draft") return { ok: false, step, error: "Capture agronomist signoff before OEM delivery." };
      const exported = base.status === "signed" ? await downloadVrt(base, false) : base;
      const result = await sendOem("john_deere", exported || base);
      return result ? { ok: true, step, mode: result.result.mode, next: "Upload yield results" } : { ok: false, step, error: "No signed prescription is ready for OEM delivery." };
    }
    if (step === "yield") {
      const base = prescription ?? (await generate());
      const result = await uploadYieldCsv(sampleYieldCsv(base), base);
      return result ? { ok: true, step, dollarsSavedPerAcre: result.savings.dollarsSavedPerAcre, next: "Open results" } : { ok: false, step, error: "No prescription is ready for yield upload." };
    }
    setActiveTab("results");
    const events = await refreshAuditEvents();
    return { ok: true, step: "audit", events: events.length, next: "Demo complete" };
  }

  function inferNextDemoStep(): DemoStepId {
    if (!user) return "login";
    if (!profile.farmName || !profile.fieldName) return "intake";
    if (!soilImport || (!fieldReviewed && soilImport.reviewRequired)) return "review";
    if (!prescription) return "plan";
    if (prescription.status === "draft") return "signoff";
    if (!packet) return "packet";
    if (prescription.status !== "exported") return "vrt";
    if (oemResults.length === 0) return "oem";
    if (!yieldOutcome) return "yield";
    return "audit";
  }

  async function onToolAction(action: ToolAction) {
    setLastToolAction(action.name);
    try {
      const result = await executeToolAction(action);
      recordToolReceipt({ name: action.name, ok: toolResultOk(result), detail: summarizeToolResult(result), createdAt: new Date().toISOString() });
      return result;
    } catch (error) {
      const result = { ok: false, error: errorMessage(error) };
      recordToolReceipt({ name: action.name, ok: false, detail: result.error, createdAt: new Date().toISOString() });
      return result;
    }
  }

  function recordToolReceipt(receipt: ToolReceipt) {
    setLastToolReceipt(receipt);
    setToolReceipts((items) => [receipt, ...items].slice(0, 20));
  }

  function exportLiveReceipt() {
    const receipt = {
      createdAt: new Date().toISOString(),
      persona: "Raimond",
      model: health.realtimeModel,
      voice: health.realtimeVoice,
      realtimeStatus,
      micPermission,
      readiness: liveReadiness,
      nextCommand: nextRaimondCommand,
      lastToolAction,
      toolReceipts,
      transcripts: transcripts.slice(0, 20)
    };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `soilprove-raimond-live-receipt-${new Date().toISOString().replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Live Raimond receipt downloaded.");
  }

  async function executeToolAction(action: ToolAction) {
    if (action.name === "get_soilprove_state") {
      return {
        ok: true,
        activeTab,
        currentStep: tabLabels[activeTab],
        nextCommand: nextRaimondCommand,
        user: user ? { name: user.name, role: user.role ?? user.authMode } : null,
        field: {
          farmName: profile.farmName || null,
          fieldName: profile.fieldName || null,
          county: profile.county || null,
          state: profile.state,
          acres: profile.acres || null,
          baselineNitrogenLbsPerAcre: profile.baselineNitrogenLbsPerAcre || null,
          threeYearBaselineYield: profile.threeYearBaselineYield || null
        },
        soilReport: soilImport
          ? { confidence: soilImport.confidence, reviewRequired: soilImport.reviewRequired, warnings: soilImport.warnings.slice(0, 5) }
          : null,
        zones: zones.map((zone) => ({
          zoneId: zone.zoneId,
          acres: zone.acres,
          organicMatterPct: zone.organicMatterPct,
          ph: zone.ph,
          phosphorusPpm: zone.phosphorusPpm,
          potassiumPpm: zone.potassiumPpm
        })),
        reviewIssues: reviewIssues.map((issue) => ({ label: issue.label, detail: issue.detail })),
        prescription: prescription
          ? {
              id: prescription.id,
              status: prescription.status,
              savings: prescription.savings,
              recommendations: prescription.recommendations.map((rec) => ({
                zoneId: rec.zoneId,
                nitrogenLbsPerAcre: rec.nitrogenLbsPerAcre,
                confidence: rec.confidence,
                rationale: rec.rationale,
                riskCaveat: rec.riskCaveat
              }))
            }
          : null,
        packetReady: Boolean(packet),
        oemResults: oemResults.map((item) => ({ target: item.target, mode: item.result.mode, ok: item.result.ok, message: item.result.message })),
        yieldOutcome,
        stepAccess
      };
    }
    if (action.name === "navigate_workspace") {
      const nextTab = normalizeNavigationTab(action.args.tab);
      if (!nextTab) {
        return { ok: false, error: `Unknown SoilProve workspace: ${String(action.args.tab || "missing")}`, availableTabs: tabOrder };
      }
      if (stepAccess[nextTab].locked) {
        return { ok: false, error: stepAccess[nextTab].reason, lockedTab: nextTab, label: tabLabels[nextTab] };
      }
      selectTab(nextTab);
      return { ok: true, activeTab: nextTab, label: tabLabels[nextTab] };
    }
    if (action.name === "answer_soilprove_question") {
      return answerSoilProveQuestion(String(action.args.question || ""));
    }
    if (action.name === "advance_demo_step") {
      return await advanceDemoStep(String(action.args.step || "auto") as DemoStepId);
    }
    if (action.name === "dismiss_onboarding") {
      dismissOnboarding();
      return { ok: true, onboardingVisible: false };
    }
    if (action.name === "load_sample_field") {
      const fixture = applyRaimondIntakeFixture(String(action.args.fieldId || "mark_story_county_north_80"));
      return { ok: true, fieldId: fixture.id, displayName: fixture.displayName };
    }
    if (action.name === "import_sample_soil_report") {
      const report = sampleSoilReports.find((item) => item.id === String(action.args.reportId)) || sampleSoilReports[0];
      const result = await handleSampleSoilReportImport(report);
      return { ok: true, reportId: report.id, confidence: result.confidence, zones: result.zones.length, reviewRequired: true };
    }
    if (action.name === "update_field_profile") {
      const { zones: nextZones, ...profilePatch } = normalizeRaimondFieldProfilePatch(action.args);
      setProfile((current) => ({ ...current, ...profilePatch }));
      if (Array.isArray(nextZones) && nextZones.length > 0) setZones(nextZones.map((zone, index) => ({ ...zone, polygonWkt: zone.polygonWkt || appFallbackPolygon(index) })));
      setFieldReviewed(true);
      setActiveTab("intake");
      return { ok: true, updated: profilePatch, zonesUpdated: Array.isArray(nextZones) ? nextZones.length : 0 };
    }
    if (action.name === "edit_field_value") {
      const field = String(action.args.field || "");
      const patch = normalizeRaimondFieldProfilePatch({ [field]: action.args.value });
      if (!Object.keys(patch).length) return { ok: false, error: `Unsupported or invalid field edit: ${field}` };
      setProfile((current) => ({ ...current, ...patch }));
      setFieldReviewed(true);
      setActiveTab("intake");
      return { ok: true, updated: patch };
    }
    if (action.name === "confirm_intake_review") {
      setFieldReviewed(true);
      setActiveTab("intake");
      setMessage("Report values marked reviewed. Raimond can generate a draft action plan next.");
      return { ok: true, reviewed: true };
    }
    if (action.name === "generate_prescription") {
      const next = await generate();
      return { ok: true, prescriptionId: next.id, status: next.status, dollarsSavedPerAcre: next.savings.dollarsSavedPerAcre };
    }
    if (action.name === "sign_prescription") {
      const signed = await sign();
      return signed ? { ok: true, prescriptionId: signed.id, status: signed.status } : { ok: false, error: "No prescription to sign." };
    }
    if (action.name === "create_review_packet") {
      const nextPacket = await createPacket();
      return { ok: true, prescriptionId: nextPacket.prescriptionId, title: nextPacket.title };
    }
    if (action.name === "download_vrt") {
      const exported = await downloadVrt();
      return { ok: Boolean(exported), exported: Boolean(exported), message: exported ? "VRT exported." : "Agronomist signoff required before VRT export." };
    }
    if (action.name === "upload_yield_results") {
      const csv = typeof action.args.csv === "string" && action.args.csv.trim() ? action.args.csv : prescription ? sampleYieldCsv(prescription) : "";
      const result = await uploadYieldCsv(csv);
      return result ? { ok: true, seasonYear: result.seasonYear, source: result.source, dollarsSavedPerAcre: result.savings.dollarsSavedPerAcre } : { ok: false, error: "No prescription is ready for yield upload." };
    }
    if (action.name === "run_full_demo_setup") {
      await runFullDemoSetup();
      return { ok: true, activeTab: "results", message: "Full hands-free demo setup complete." };
    }
    if (action.name === "reset_demo_flow") {
      resetFlow();
      return { ok: true, activeTab: "intake", message: "Demo flow reset." };
    }
    if (action.name === "send_to_oem") {
      const target = String(action.args.target || "john_deere") as OemTarget;
      const result = await sendOem(target);
      return { ok: true, target, mode: result?.result.mode, message: result?.result.message };
    }
    return { ok: false, error: `Unknown Raimond action: ${action.name}` };
  }

  function answerSoilProveQuestion(question: string) {
    const normalized = question.toLowerCase();
    const issues = fieldReviewIssues(profile, zones, soilImport, fieldReviewed);
    const lockedSteps = tabOrder
      .filter((tab) => stepAccess[tab].locked)
      .map((tab) => ({ tab, label: tabLabels[tab], reason: stepAccess[tab].reason }));

    if (normalized.includes("flag") || normalized.includes("lab") || normalized.includes("soil") || normalized.includes("ocr")) {
      return {
        ok: true,
        topic: "soil-report-review",
        answer: issues.length
          ? `Review ${issues.length} field value${issues.length === 1 ? "" : "s"} before using this plan.`
          : "No flagged soil-report values are blocking the next step.",
        reviewRequired: Boolean(soilImport?.reviewRequired) && !fieldReviewed,
        issues: issues.map((issue) => ({ label: issue.label, detail: issue.detail })),
        zones: zones.map((zone) => ({
          zoneId: zone.zoneId,
          organicMatterPct: zone.organicMatterPct,
          ph: zone.ph,
          phosphorusPpm: zone.phosphorusPpm,
          potassiumPpm: zone.potassiumPpm
        }))
      };
    }

    if (normalized.includes("saving") || normalized.includes("breakeven") || normalized.includes("yield")) {
      return {
        ok: true,
        topic: "savings-and-yield",
        answer: prescription
          ? `Modeled input savings are $${prescription.savings.dollarsSavedPerAcre.toFixed(2)} per acre before harvest verification.`
          : "Generate a reviewed action plan before quoting modeled savings.",
        savings: prescription?.savings ?? null,
        yieldOutcome
      };
    }

    if (normalized.includes("peer") || normalized.includes("neighbor") || normalized.includes("comparable") || normalized.includes("proof")) {
      return {
        ok: true,
        topic: "peer-context",
        answer: prescription?.peerSummary.message ?? "Comparable peer context appears after an action plan is generated.",
        peerSummary: prescription?.peerSummary ?? null
      };
    }

    if (normalized.includes("export") || normalized.includes("vrt") || normalized.includes("oem") || normalized.includes("deere") || normalized.includes("case") || normalized.includes("agco")) {
      return {
        ok: true,
        topic: "export-readiness",
        answer: stepAccess.exports.locked ? `Not ready for export: ${stepAccess.exports.reason}` : "Export is ready for VRT download or OEM simulation.",
        exportStatus: prescription?.status ?? "missing",
        oemResults: oemResults.map((item) => ({ target: item.target, mode: item.result.mode, ok: item.result.ok, message: item.result.message }))
      };
    }

    if (normalized.includes("agronomist") || normalized.includes("ask") || normalized.includes("review")) {
      return {
        ok: true,
        topic: "agronomist-review",
        answer: "Bring the flagged lab values, MRTN assumptions, low-confidence zones, and equipment export path to the agronomist review.",
        reviewIssues: issues.map((issue) => ({ label: issue.label, detail: issue.detail })),
        packetReady: Boolean(packet),
        suggestedQuestions: [
          "Do the MRTN assumptions match this season's crop plan?",
          "Are any low-confidence zones too risky for the savings assurance offer?",
          "Does the selected OEM path match the equipment in the field?"
        ]
      };
    }

    return {
      ok: true,
      topic: "workflow-status",
      answer: lockedSteps.length ? `${tabLabels[activeTab]} is open. Next useful action: ${nextRaimondCommand}.` : "The full SoilProve workflow is open.",
      activeTab,
      currentStep: tabLabels[activeTab],
      nextCommand: nextRaimondCommand,
      lockedSteps
    };
  }

  async function toggleRealtime() {
    if (realtimeStatus === "connected" || realtimeStatus === "connecting") {
      realtimeRef.current?.disconnect();
      realtimeRef.current = null;
      return;
    }
    setRealtimeError("");
    if (micPermission === "denied" || micPermission === "unsupported") {
      setRealtimeStatus("error");
      handleRealtimeError(micPermission === "denied" ? "Microphone permission is blocked. Use Raimond chat, or enable microphone access in browser settings to use voice." : "This browser does not expose microphone access. Use Raimond chat for the demo path.");
      return;
    }
    const client = new RaimondRealtimeClient({
      onStatus: setRealtimeStatus,
      onTranscript: (speaker, text) => setTranscripts((items) => [{ speaker, text }, ...items].slice(0, 8)),
      onToolAction,
      onError: handleRealtimeError
    });
    realtimeRef.current = client;
    await client.connect();
  }

  function handleRealtimeError(error: string) {
    setRealtimeError(error);
    setRaimondMode("chat");
    setRaimondRailMinimized(false);
  }

  async function submitRaimondText(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;
    setChatDraft("");
    setRaimondMode("chat");
    if (realtimeStatus === "connected" && realtimeRef.current) {
      if (realtimeRef.current.sendText(text)) return;
    }
    setTranscripts((items) => [{ speaker: "user" as const, text }, ...items].slice(0, 8));
    try {
      const response = await runLocalTextCommand(text);
      setTranscripts((items) => [{ speaker: "assistant" as const, text: response }, ...items].slice(0, 8));
    } catch (error) {
      setTranscripts((items) => [{ speaker: "assistant" as const, text: `I could not complete that: ${errorMessage(error)}` }, ...items].slice(0, 8));
    }
  }

  async function runLocalTextCommand(text: string) {
    const normalized = text.toLowerCase();
    if (normalized.includes("advance") || normalized.includes("continue") || normalized.includes("next step") || normalized.includes("run the demo")) {
      const result = await onToolAction({ name: "advance_demo_step", args: { step: "auto" } });
      return summarizeToolResult(result);
    }
    const intakeFixture = intakeFixtureFromText(normalized);
    if (intakeFixture) {
      applyRaimondIntakeFixture(intakeFixture.id);
      return `${intakeFixture.displayName} soil report context is filled. I staged the farm, field, economics, and three soil zones; review the values, then ask me to generate the action plan.`;
    }
    const quickPatch = parseQuickFieldIntake(text);
    if (quickPatch) {
      setProfile((current) => ({ ...current, ...quickPatch }));
      setActiveTab("intake");
      return "I filled the field details I heard. Give me acres, county/state, baseline nitrogen, expected yield, and soil-zone values when you are ready.";
    }
    if (normalized.includes("south 120")) {
      loadSampleField("mark_story_county_south_120");
      return "Loaded Miller Farm / South 120. Review soil values before generating an action plan.";
    }
    if (normalized.includes("east 64") || normalized.includes("waverly")) {
      loadSampleField("waverly_butler_county_east_64");
      return "Loaded Waverly Ridge / East 64. Review soil values before generating an action plan.";
    }
    if (normalized.includes("load") || normalized.includes("miller") || normalized.includes("north 80")) {
      loadSampleField("mark_story_county_north_80");
      return "Loaded Miller Farm / North 80. Review soil values before generating an action plan.";
    }
    if (normalized.includes("packet")) {
      await createPacket();
      return "Review packet created. Review step is open.";
    }
    if (normalized.includes("flagged") || normalized.includes("soil value") || normalized.includes("ocr")) {
      setActiveTab("intake");
      const issues = fieldReviewIssues(profile, zones, soilImport, fieldReviewed);
      return issues.length
        ? `Flagged values: ${issues.map((issue) => `${issue.label} (${issue.detail})`).join("; ")}`
        : "No flagged field values are blocking the plan.";
    }
    if ((normalized.includes("mark") || normalized.includes("confirm")) && normalized.includes("review")) {
      setFieldReviewed(true);
      setActiveTab("intake");
      return "Field values marked reviewed. Plan is unlocked if the field facts are complete.";
    }
    if (normalized.includes("can i export") || normalized.includes("can we export")) {
      return stepAccess.exports.locked ? `Not yet: ${stepAccess.exports.reason}` : "Yes. Open Export to download the VRT shapefile or send the OEM simulation.";
    }
    if (normalized.includes("sign")) {
      const signed = await sign();
      return signed ? "Agronomist signoff captured." : "No action plan is ready for signoff yet.";
    }
    if (normalized.includes("export") || normalized.includes("vrt") || normalized.includes("deere")) {
      const exported = await downloadVrt();
      return exported ? "VRT shapefile ZIP exported." : "Agronomist signoff is required before VRT export.";
    }
    if (normalized.includes("plan") || normalized.includes("generate")) {
      await generate();
      return "Reviewable action plan generated. Action Plan tab is open.";
    }
    if (normalized.includes("neighbor") || normalized.includes("peer") || normalized.includes("proof")) {
      selectTab("proof");
      return stepAccess.proof.locked ? stepAccess.proof.reason : "Context opened with aggregate comparable-field medians.";
    }
    if (normalized.includes("review")) {
      selectTab("packet");
      return stepAccess.packet.locked ? stepAccess.packet.reason : "Review packet step opened.";
    }
    if (normalized.includes("result") || normalized.includes("saving") || normalized.includes("yield") || normalized.includes("audit") || normalized.includes("dashboard") || normalized.includes("outcome")) {
      selectTab("results");
      return stepAccess.results.locked ? stepAccess.results.reason : "Results opened. Harvest verification and admin audit details are available here when ready.";
    }
    const pageNumberAnswer = answerPageNumberQuestion(normalized);
    if (pageNumberAnswer) return pageNumberAnswer;
    const copilotResponse = await askOpenRouterCopilot(text);
    if (copilotResponse) return copilotResponse;
    setActiveTab("intake");
    return "Tell me the farm name, field name, acres, state, county, and what the soil report says. I will fill the field data before we generate anything.";
  }

  function answerPageNumberQuestion(normalized: string) {
    if (!(normalized.includes("number") || normalized.includes("rate") || normalized.includes("price") || normalized.includes("acre") || normalized.includes("yield") || normalized.includes("saving") || normalized.includes("zone") || normalized.includes("ph") || normalized.includes("organic") || normalized.includes("potassium") || normalized.includes("phosphorus") || normalized.includes("baseline") || normalized.includes("breakeven"))) {
      return null;
    }
    if (normalized.includes("zone") || normalized.includes("ph") || normalized.includes("organic") || normalized.includes("potassium") || normalized.includes("phosphorus")) {
      return `Current soil zones: ${zones.map((zone) => `${zone.zoneId}: ${formatMaybeNumber(zone.acres)} acres, OM ${formatMaybeNumber(zone.organicMatterPct)}%, pH ${formatMaybeNumber(zone.ph)}, P ${formatMaybeNumber(zone.phosphorusPpm)} ppm, K ${formatMaybeNumber(zone.potassiumPpm)} ppm`).join("; ")}.`;
    }
    if (normalized.includes("saving") || normalized.includes("breakeven") || normalized.includes("yield")) {
      if (!prescription) return `Field yield baseline is ${formatMaybeNumber(profile.threeYearBaselineYield)} bu/ac. Generate a reviewed action plan before quoting modeled savings or breakeven drag.`;
      return `Modeled savings are $${prescription.savings.dollarsSavedPerAcre.toFixed(2)}/ac, $${prescription.savings.grossFieldSavings.toFixed(2)} across the field, with ${prescription.savings.breakevenYieldDragBuPerAcre.toFixed(2)} bu/ac breakeven yield drag. Baseline yield is ${formatMaybeNumber(profile.threeYearBaselineYield)} bu/ac.`;
    }
    if (normalized.includes("rate") || normalized.includes("nitrogen") || normalized.includes("n rate")) {
      if (prescription) {
        return `Baseline nitrogen is ${formatMaybeNumber(profile.baselineNitrogenLbsPerAcre)} lb/ac. Draft zone rates: ${prescription.recommendations.map((zone) => `${zone.zoneId} ${zone.nitrogenLbsPerAcre} lb/ac`).join(", ")}.`;
      }
      return `Baseline nitrogen is ${formatMaybeNumber(profile.baselineNitrogenLbsPerAcre)} lb/ac. Generate a reviewed action plan to see zone rates.`;
    }
    if (normalized.includes("price")) {
      return `Corn price is $${profile.cornPricePerBushel.toFixed(2)}/bu and nitrogen price is $${profile.nitrogenPricePerLb.toFixed(2)}/lb.`;
    }
    if (normalized.includes("acre")) {
      const zoneAcres = zones.reduce((sum, zone) => sum + zone.acres, 0);
      return `The field has ${formatMaybeNumber(profile.acres)} acres entered, with ${formatMaybeNumber(zoneAcres)} acres across soil zones.`;
    }
    return null;
  }

  async function askOpenRouterCopilot(question: string) {
    if (!user) return null;
    try {
      const completion = await fetchJson<OpenRouterChatCompletion>("/api/copilot/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context: {
            currentStep: tabLabels[activeTab],
            nextCommand: nextRaimondCommand,
            fieldDataPresent: hasFieldData(profile, zones),
            planStatus: prescription?.status ?? "missing"
          }
        })
      });
      const parsed = parseRaimondCopilotContent(completion.choices?.[0]?.message?.content);
      if (!parsed || typeof parsed.assistant !== "string" || !parsed.assistant.trim()) return null;
      const actionName = parsed.action && typeof parsed.action.name === "string" ? parsed.action.name : "";
      if (!actionName) return parsed.assistant.trim();
      const actionResult = await onToolAction({
        name: actionName,
        args: isPlainRecord(parsed.action?.args) ? parsed.action.args : {}
      });
      return `${parsed.assistant.trim()} ${summarizeToolResult(actionResult)}`.trim();
    } catch {
      return null;
    }
  }

  return (
    <main>
      <a className="skip-link" href="#workspace-panel">Skip to workspace</a>
      <header className="topbar">
        <div className="brand">
          <img src="/brand/SOILPROVE-MARK-TRANSP.svg" alt="" />
          <img src="/brand/SoilProve_text-only.svg" alt="SoilProve" />
        </div>
        <div className="topbar-actions">
          <details className="utility-menu">
            <summary aria-label="Open utility menu">
              <Menu size={18} />
              <span className="menu-label">Menu</span>
            </summary>
            <div className="utility-menu-panel">
              <div className="utility-menu-profile">
                <div className="utility-menu-title">
                  <strong><Lock size={14} /> Profile</strong>
                  <span>{user ? user.authMode : "Signed out"}</span>
                </div>
                {user ? (
                  <div className="utility-menu-actions">
                    <p>{user.name}</p>
                    <button className="mode-toggle auth-button" type="button" onClick={() => void signOut()}>
                      <LogOut size={18} />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="utility-menu-actions">
                    <button className="mode-toggle auth-button" type="button" onClick={() => void welcomeChatGptLogin()}>
                      <img className="chatgpt-logo dark" src="/brand/chatgpt-logo.svg" alt="" />
                      {loginId ? "Check ChatGPT sign-in" : "Sign in with ChatGPT"}
                    </button>
                    <button className="mode-toggle auth-button" type="button" onClick={() => void demoLogin("test-admin-operator")}>
                      <Tractor size={18} />
                      Demo login
                    </button>
                  </div>
                )}
              </div>
              <div className="utility-menu-workspace">
                <div className="utility-menu-title">
                  <strong><FileCheck size={14} /> Workspace</strong>
                  <span>{tabLabels[activeTab]}</span>
                </div>
                <FieldIdentity profile={profile} prescription={prescription} soilImport={soilImport} />
                <div className="utility-menu-actions">
                  <button className="mode-toggle" type="button" onClick={() => selectTab("intake")}>
                    Open soil report
                  </button>
                </div>
              </div>
              <div className="utility-menu-title">
                <strong><Bug size={14} /> Debug mode</strong>
                <span>{debugMode ? "On" : "Off"}</span>
              </div>
              <div className="utility-menu-actions">
                <button className="mode-toggle" type="button" aria-pressed={debugMode} onClick={() => setDebugMode((current) => !current)}>
                  <Bug size={15} /> {debugMode ? "Debug on" : "Turn debug on"}
                </button>
                <button className="mode-toggle reset-flow" type="button" onClick={resetFlow}>
                  <RotateCcw size={15} /> Reset flow / clear all
                </button>
                <button className="mode-toggle" type="button" onClick={() => void runFullDemoSetup()}>
                  <Sparkles size={15} /> Run full demo setup
                </button>
              </div>
              <p>{codexStatus}</p>
              {debugMode ? (
                <>
                  <details className="operator-demo-menu utility-demo-menu">
                    <summary>Role paths</summary>
                    <div>
                      {demoPersonas.map((persona) => (
                        <button key={persona.id} title={persona.happyPath} onClick={() => void demoLogin(persona.id)}>
                          Start happy path: {persona.role}
                        </button>
                      ))}
                    </div>
                  </details>
                  <details className="utility-debug-script">
                    <summary>Golden voice script</summary>
                    <div>
                      {goldenVoiceScript.map((line) => (
                        <button key={line} type="button" onClick={() => setChatDraft(line)}>{line}</button>
                      ))}
                    </div>
                  </details>
                </>
              ) : (
                <span className="utility-menu-hint">Diagnostics are available in setup mode.</span>
              )}
            </div>
          </details>
        </div>
      </header>
      <nav className="topbar-nav" aria-label="Workflow steps">
        <WorkflowStepper activeTab={activeTab} stepAccess={stepAccess} selectTab={selectTab} runFullDemoSetup={runFullDemoSetup} debugMode={false} />
      </nav>

      {message ? (
        <div className="notice" role="status">
          <span>{message}</span>
          <button type="button" aria-label="Dismiss notice" onClick={() => setMessage("")}>
            <X size={15} />
          </button>
        </div>
      ) : null}
      {realtimeError ? <p className="app-error">{realtimeError}</p> : null}

      <section className="operations-shell">
        <div className={`command-center ${raimondRailMinimized ? "command-center-compact" : ""}`}>
          <aside className="copilot-column" aria-label="Raimond command column">
            <RaimondPanel
              mode={raimondMode}
              setMode={setRaimondMode}
              minimized={raimondRailMinimized}
              setMinimized={setRaimondRailMinimized}
              realtimeStatus={realtimeStatus}
              health={health}
              micPermission={micPermission}
              lastToolAction={lastToolAction}
              lastToolReceipt={lastToolReceipt}
              toolReceipts={toolReceipts}
              liveReadiness={liveReadiness}
              nextRaimondCommand={nextRaimondCommand}
              suggestions={raimondSuggestions}
              transcripts={transcripts}
              exportLiveReceipt={exportLiveReceipt}
              chatDraft={chatDraft}
              setChatDraft={setChatDraft}
              submitRaimondText={submitRaimondText}
              toggleRealtime={toggleRealtime}
              debugMode={false}
            />
          </aside>

          <section className="workspace-column" aria-label="SoilProve workspace">
            <div className="safety-strip" role="note">
              <ShieldCheck size={16} />
              <span>Soil report second opinion. Better agronomist meetings, not fewer meetings.</span>
            </div>

            <section className="workspace" id="workspace-panel" aria-label={`${tabLabels[activeTab]} workspace`}>
              <div className="workspace-heading">
                <h1>{tabLabels[activeTab]}</h1>
              </div>
              {activeTab === "intake" ? (
                <Intake
                  profile={profile}
                  zones={zones}
                  soilImport={soilImport}
                  setProfile={setProfile}
                  updateZone={updateZone}
                  generate={generate}
                  isGenerating={isGenerating}
                  sampleReports={sampleSoilReports}
                  isImportingSample={isImportingSample}
                  onSoilReportImport={handleSoilReportImport}
                  onSampleSoilReportImport={handleSampleSoilReportImport}
                  fieldReviewed={fieldReviewed}
                  markFieldReviewed={() => {
                    setFieldReviewed(true);
                    setMessage("Field values marked reviewed. Plan generation is unlocked if field facts are complete.");
                  }}
                >
                  <DecisionGate
                    profile={profile}
                    zones={zones}
                    soilImport={soilImport}
                    fieldReviewed={fieldReviewed}
                    reviewIssues={reviewIssues}
                    prescription={prescription}
                    packet={packet}
                    yieldOutcome={yieldOutcome}
                    stepAccess={stepAccess}
                    selectTab={selectTab}
                    generate={generate}
                    sign={sign}
                    createPacket={createPacket}
                  />
                </Intake>
              ) : null}
              {activeTab === "plan" ? <Plan prescription={prescription} kpis={kpis} sign={sign} createPacket={createPacket} downloadVrt={downloadVrt} /> : null}
              {activeTab === "proof" ? (
                <Proof
                  prescription={prescription}
                  regionalContext={regionalContext}
                  regionalInsight={regionalInsight}
                  isRegionalInsightLoading={isRegionalInsightLoading}
                  generateRegionalInsight={generateRegionalInsight}
                />
              ) : null}
              {activeTab === "packet" ? <Packet packet={packet} createPacket={createPacket} /> : null}
              {activeTab === "exports" ? <Exports prescription={prescription} results={oemResults} health={health} downloadVrt={downloadVrt} sendOem={sendOem} /> : null}
              {activeTab === "results" ? (
                <Results
                  prescription={prescription}
                  transcripts={transcripts}
                  realtimeStatus={realtimeStatus}
                  health={health}
                  micPermission={micPermission}
                  lastToolAction={lastToolAction}
                  debugMode={debugMode}
                  auditEvents={auditEvents}
                  refreshAuditEvents={refreshAuditEvents}
                  yieldCsv={yieldCsv}
                  setYieldCsv={setYieldCsv}
                  uploadYieldCsv={uploadYieldCsv}
                  yieldOutcome={yieldOutcome}
                />
              ) : null}
            </section>
          </section>
        </div>
      </section>
      <footer className="app-footer" aria-label="Product and safety notes">
        <div className="footer-brand">
          <span className="footer-logo-lockup" aria-label="SoilProve">
            <img className="footer-brandmark" src="/brand/SOILPROVE-MARK-TRANSP.svg" alt="" />
            <img className="footer-wordmark" src="/brand/SoilProve_text-only.svg" alt="SoilProve" />
          </span>
          <span>Find the nitrogen decision buried in your soil reports.</span>
        </div>
        <div className="footer-credit">
          <span>
            Created May 2026 by <a href="https://www.linkedin.com/in/danielpgreen/" target="_blank" rel="noreferrer" aria-label="Daniel Green on LinkedIn">Daniel Green</a>
            {" "}(<a href="https://github.com/daniel-p-green" target="_blank" rel="noreferrer" aria-label="Daniel Green on GitHub">@daniel-p-green</a>)
          </span>
        </div>
      </footer>
      {showOnboarding ? (
        <Onboarding
          dismiss={dismissOnboarding}
          chatGptLabel={loginId ? "Check ChatGPT" : "Sign in with ChatGPT"}
          startCodexLogin={() => void welcomeChatGptLogin()}
          demoLogin={() => void welcomeDemoLogin()}
        />
      ) : null}
    </main>
  );
}

function intakeFixtureFromText(normalized: string) {
  const fixtures = canonicalFieldFixtures();
  const direct = fixtures.find((fixture) => {
    const farm = fixture.profile.farmName.toLowerCase();
    const field = fixture.profile.fieldName.toLowerCase();
    return normalized.includes(farm) || normalized.includes(field) || normalized.includes(fixture.displayName.toLowerCase());
  });
  if (direct) return direct;
  if (normalized.includes("iowa") || normalized.includes("story") || normalized.includes("harlan")) return fixtures.find((fixture) => fixture.id === "harlan_story_county_west_88") ?? null;
  if (normalized.includes("polk") || normalized.includes("keller")) return fixtures.find((fixture) => fixture.id === "keller_polk_county_ridge_92") ?? null;
  if (normalized.includes("illinois") || normalized.includes("mclean") || normalized.includes("richter")) return fixtures.find((fixture) => fixture.id === "richter_mclean_county_east_76") ?? null;
  if (normalized.includes("champaign") || normalized.includes("nolan")) return fixtures.find((fixture) => fixture.id === "nolan_champaign_county_west_84") ?? null;
  if (normalized.includes("indiana") || normalized.includes("benton") || normalized.includes("porter")) return fixtures.find((fixture) => fixture.id === "porter_benton_county_grid_70") ?? null;
  if (normalized.includes("tippecanoe") || normalized.includes("rusk")) return fixtures.find((fixture) => fixture.id === "rusk_tippecanoe_county_home_82") ?? null;
  if (normalized.includes("missouri") || normalized.includes("boone") || normalized.includes("miller") || normalized.includes("north 80")) return fixtures.find((fixture) => fixture.id === "mark_story_county_north_80") ?? null;
  return null;
}

function parseQuickFieldIntake(text: string): Partial<FieldProfile> | null {
  const patch: Partial<FieldProfile> = {};
  const farmName = text.match(/\bfarm(?: is|:)?\s+([A-Z][A-Za-z0-9 &'.-]{2,40})/)?.[1];
  const fieldName = text.match(/\bfield(?: is|:)?\s+([A-Z][A-Za-z0-9 &'/-]{1,30})/)?.[1];
  const county = text.match(/\bcounty(?: is|:)?\s+([A-Z][A-Za-z ]{2,30})/)?.[1] || text.match(/\bin\s+([A-Z][A-Za-z ]{2,30})\s+County\b/)?.[1];
  const acres = numberFromText(text, /\b([0-9]+(?:\.[0-9]+)?)\s*acres?\b/i);
  const baselineNitrogen = numberFromText(text, /\b(?:baseline|flat|normal)\s*(?:nitrogen|n|rate)?\s*(?:is|at|:)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const baselineYield = numberFromText(text, /\b(?:yield|baseline yield|three year yield)\s*(?:is|at|:)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const state = text.match(/\b(IA|Iowa|IL|Illinois|IN|Indiana|MO|Missouri)\b/i)?.[1];

  if (farmName) patch.farmName = farmName.trim();
  if (fieldName) patch.fieldName = fieldName.trim();
  if (county) patch.county = county.trim().replace(/\s+County$/i, "");
  if (acres) patch.acres = acres;
  if (baselineNitrogen) patch.baselineNitrogenLbsPerAcre = baselineNitrogen;
  if (baselineYield) patch.threeYearBaselineYield = baselineYield;
  if (state) patch.state = normalizeState(state);
  return Object.keys(patch).length > 0 ? patch : null;
}

function normalizeState(value: string): FieldProfile["state"] {
  const normalized = value.toLowerCase();
  if (normalized === "iowa" || normalized === "ia") return "IA";
  if (normalized === "illinois" || normalized === "il") return "IL";
  if (normalized === "indiana" || normalized === "in") return "IN";
  return "MO";
}

function numberFromText(text: string, regex: RegExp) {
  const value = Number(text.match(regex)?.[1]);
  return Number.isFinite(value) ? value : null;
}

function appFallbackPolygon(index: number) {
  const x1 = index * 24;
  const x2 = x1 + 22;
  return `POLYGON((${x1} 0, ${x2} 0, ${x2} 12, ${x1} 12, ${x1} 0))`;
}

function FieldIdentity(props: {
  profile: FieldProfile;
  prescription: Prescription | null;
  soilImport: SoilReportImportResult | null;
}) {
  const hasField = Boolean(props.profile.farmName || props.profile.fieldName || props.profile.county || props.profile.acres > 0);
  const farm = props.profile.farmName || "Ask Raimond";
  const field = props.profile.fieldName || "for the farm";
  const county = props.profile.county ? `${props.profile.county} Co, ${props.profile.state}` : props.profile.state;
  const acres = props.profile.acres > 0 ? `${props.profile.acres} ac` : "acreage pending";
  const status = props.prescription?.status || (props.soilImport ? "soil review" : "intake");

  return (
    <div className="field-identity" aria-label="Current field identity" data-ready={hasField}>
      <MapPinned size={16} />
      <div>
        <strong>{farm} - {field}</strong>
        <span>{county} - {acres} - {status}</span>
      </div>
    </div>
  );
}

function DecisionGate(props: {
  profile: FieldProfile;
  zones: SoilZone[];
  soilImport: SoilReportImportResult | null;
  fieldReviewed: boolean;
  reviewIssues: ReviewIssue[];
  prescription: Prescription | null;
  packet: TrialPacket | null;
  yieldOutcome: YieldOutcome | null;
  stepAccess: Record<Tab, StepAccess>;
  selectTab: (tab: Tab) => void;
  generate: () => Promise<Prescription>;
  sign: () => Promise<Prescription | null>;
  createPacket: () => Promise<TrialPacket>;
}) {
  const fieldDataPresent = hasFieldData(props.profile, props.zones);
  const issues = props.reviewIssues;
  const showIssues = fieldDataPresent && issues.length > 0;
  let showAction = true;
  let state: "blocked" | "ready" | "complete" = "ready";
  let label = "Ready";
  let title = "Is this soil report ready for an agronomist-reviewed action plan?";
  let detail = "Reviewed report values are in place. Generate the draft action plan, then keep signoff and export gated.";
  let actionLabel = "Generate action plan";
  let action: () => void = () => void props.generate().catch(() => null);

  if (!fieldDataPresent) {
    state = "blocked";
    label = "Needs field data";
    title = "What does Raimond need before an action plan?";
    detail = "Add or import the soil report, farm, field, acres, economics, and soil-zone values before SoilProve can draft a reviewable plan.";
    actionLabel = "Open Soil Report";
    action = () => props.selectTab("intake");
    showAction = false;
  } else if (issues.length) {
    state = "blocked";
    label = `${issues.length} flagged`;
    title = "Which lab values need review?";
    detail = "Resolve or confirm these values before Action Plan unlocks. OCR output never becomes an applied plan silently.";
    actionLabel = "Resolve flagged values";
    action = () => props.selectTab("intake");
  } else if (!props.prescription) {
    label = "Ready for draft";
  } else if (props.prescription.status === "draft") {
    state = "blocked";
    label = "Signoff required";
    title = "Action plan drafted. Who authorizes it?";
    detail = "The action plan can be inspected now, but packet and export stay locked until agronomist signoff is captured.";
    actionLabel = "Capture signoff";
    action = () => void props.sign().catch(() => null);
  } else if (!props.packet) {
    label = "Signed";
    title = "Signed action plan is ready for the review packet.";
    detail = "Create the agronomist review packet before VRT or OEM export.";
    actionLabel = "Create review packet";
    action = () => void props.createPacket().catch(() => null);
  } else if (props.prescription.status !== "exported") {
    label = "Packet ready";
    title = "Review packet is ready. Export is the next gate.";
    detail = props.stepAccess.exports.reason || "Open Export to download the VRT shapefile or send an OEM simulation.";
    actionLabel = "Open Export";
    action = () => props.selectTab("exports");
  } else if (!props.yieldOutcome) {
    label = "Exported";
    title = "Export complete. Results wait for harvest verification.";
    detail = "Upload yield results after harvest to prove modeled input savings and assurance status.";
    actionLabel = "Open Results";
    action = () => props.selectTab("results");
  } else {
    state = "complete";
    label = "Complete";
    title = "Decision path is complete.";
    detail = "The field has a signed plan, review packet, export record, and harvest result.";
    actionLabel = "View Results";
    action = () => props.selectTab("results");
  }

  return (
    <section className={`decision-gate ${state}`} aria-label="Current decision gate">
      <div className="decision-gate-copy">
        <span className={`status-pill ${state}`}>{label}</span>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {showIssues ? (
        <ul className="decision-issues" aria-label="Flagged field values">
          {issues.slice(0, 4).map((issue) => (
            <li key={`${issue.label}-${issue.detail}`}>
              <strong>{issue.label}</strong>
              <span>{issue.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {showAction ? (
        <button className={state === "blocked" ? "resolve-action" : "primary"} type="button" onClick={action}>
          {state === "blocked" ? <Lock size={17} /> : <BadgeCheck size={17} />}
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

function RaimondPanel(props: {
  mode: RaimondMode;
  setMode: (mode: RaimondMode) => void;
  minimized: boolean;
  setMinimized: (minimized: boolean) => void;
  realtimeStatus: RealtimeStatus;
  health: Health;
  micPermission: MicPermission;
  lastToolAction: string;
  lastToolReceipt: ToolReceipt | null;
  toolReceipts: ToolReceipt[];
  liveReadiness: Array<{ label: string; done: boolean; detail: string }>;
  nextRaimondCommand: string;
  suggestions: string[];
  transcripts: Transcript[];
  exportLiveReceipt: () => void;
  chatDraft: string;
  setChatDraft: (value: string) => void;
  submitRaimondText: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  toggleRealtime: () => Promise<void>;
  debugMode: boolean;
}) {
  const micBlocked = props.micPermission === "denied" || props.micPermission === "unsupported";
  const voiceConfigured = Boolean(props.health.env.OPENAI_API_KEY);
  const ready = voiceConfigured && !micBlocked;
  const voiceBadge: RaimondVoiceBadge =
    props.realtimeStatus === "connected"
      ? { className: "connected", label: "Live" }
      : props.realtimeStatus === "connecting"
        ? { className: "connecting", label: "Starting" }
      : props.realtimeStatus === "error" || micBlocked || !voiceConfigured
        ? { className: "error", label: "Unavailable" }
      : props.micPermission === "prompt" || props.micPermission === "unknown"
        ? { className: "connecting", label: "Mic pending" }
      : { className: "connected", label: "Ready" };
  const statusCopy =
    props.realtimeStatus === "connected"
      ? "Raimond is listening for soil report questions and workflow commands."
      : micBlocked
        ? "Voice is unavailable in this browser state. Raimond chat can still explain reports and run the workflow."
      : !voiceConfigured
        ? "Voice is unavailable until OpenAI Realtime is configured. Raimond chat can still explain reports and run the workflow."
      : props.micPermission === "prompt" || props.micPermission === "unknown"
        ? "Microphone access is pending. Raimond chat can still explain reports and run the workflow."
      : ready
        ? "Ready for live voice whenever you want to start Raimond."
      : props.debugMode
          ? "Sign-in and demo paths are visible. Voice setup may still need permission."
          : "Sign-in and demo paths are visible. Live voice is optional.";

  if (props.minimized) {
    return (
      <aside className={`raimond-panel-shell ${voiceBadge.className}`} aria-label="Raimond voice and chat">
        <button className="raimond-launcher" type="button" onClick={() => props.setMinimized(false)}>
          <Bot size={18} />
          <span>Ask Raimond</span>
          <span className={`rail-connection ${voiceBadge.className}`}>{voiceBadge.label}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={`raimond-panel ${voiceBadge.className}`} aria-label="Raimond voice and chat">
      <div className="rail-header">
        <div className="rail-title">
          <Bot size={18} />
          <strong>Raimond</strong>
        </div>
        <div className="rail-header-actions">
          <span className={`rail-connection ${voiceBadge.className}`}>{voiceBadge.label}</span>
          <button className="rail-minimize" type="button" aria-label="Minimize Ask Raimond" onClick={() => props.setMinimized(true)}>
            <Minus size={16} />
          </button>
        </div>
      </div>

      {props.debugMode ? (
        <div className="live-checklist" aria-label="Live voice checklist">
          <strong>Second opinion readiness</strong>
          {props.liveReadiness.map((item) => (
            <div key={item.label} className={item.done ? "ready" : "pending"}>
              <span>{item.done ? "Ready" : "Check"}</span>
              <p>{item.label}</p>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rail-transcript" aria-label="Raimond transcript">
        {props.transcripts.length === 0 ? (
          <div className="rail-transcript-empty">
            <Activity size={16} />
            <p>{statusCopy}</p>
          </div>
        ) : (
          props.transcripts.slice(0, 12).reverse().map((item, index) => (
            <p key={`${item.speaker}-${index}`} className={`line ${item.speaker}`}>
              <strong>{item.speaker}</strong> {item.text}
            </p>
          ))
        )}
      </div>

      {props.debugMode ? (
        <>
          <div className="rail-receipts-strip" aria-label="Raimond action receipts">
            {props.lastToolReceipt ? (
              <div className={`voice-receipt receipt-chip ${props.lastToolReceipt.ok === false ? "blocked" : ""}`}>
                <span>{props.lastToolReceipt.ok === false ? "Needs action" : "Last"}</span>
                <strong>{props.lastToolReceipt.name.replaceAll("_", " ")}</strong>
              </div>
            ) : null}
            <div className="voice-receipt receipt-chip next">
              <span>Next</span>
              <strong>{props.nextRaimondCommand}</strong>
            </div>
          </div>

          <details className="golden-script">
            <summary>Golden voice script</summary>
            <ol>
              {goldenVoiceScript.map((line) => (
                <li key={line}>
                  <button type="button" onClick={() => props.setChatDraft(line)}>{line}</button>
                </li>
              ))}
            </ol>
          </details>

          <button className="receipt-download" type="button" onClick={props.exportLiveReceipt} disabled={props.toolReceipts.length === 0 && props.transcripts.length === 0}>
            <Download size={15} />
            Download live receipt
          </button>
        </>
      ) : null}

      {props.debugMode && props.suggestions.length > 0 ? (
        <div className="rail-examples">
          <div className="rail-suggestions" aria-label="Suggested commands">
            {props.suggestions.slice(0, 4).map((item) => (
              <button key={item} type="button" onClick={() => props.setChatDraft(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form className="raimond-chat" onSubmit={(event) => void props.submitRaimondText(event)}>
        {props.mode === "voice" ? (
          <button className="voice voice-inline" type="button" onClick={() => void props.toggleRealtime()}>
            {props.realtimeStatus === "connected" ? <MicOff size={16} /> : <Mic size={16} />}
            {props.realtimeStatus === "connected" ? "Stop voice" : micBlocked ? "Use chat instead" : "Start voice"}
          </button>
        ) : (
          <div className="chat-composer">
            <textarea
              value={props.chatDraft}
              onChange={(event) => props.setChatDraft(event.target.value)}
              placeholder="Ask about the soil report…"
              aria-label="Ask Raimond"
            />
            <div className="chat-composer-actions">
              <button
                type="button"
                className={`composer-mic ${props.realtimeStatus}`}
                aria-label={props.realtimeStatus === "connected" ? "Stop voice" : "Start voice"}
                onClick={() => void props.toggleRealtime()}
                disabled={micBlocked}
              >
                {props.realtimeStatus === "connected" ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button className="primary" type="submit" aria-label="Send Raimond message" disabled={!props.chatDraft.trim()}>
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </form>

      {props.debugMode ? (
        <div className="rail-tools">
          <Kpi label="Mic" value={props.micPermission} />
          <Kpi label="Voice access" value={props.health.env.OPENAI_API_KEY ? "connected" : "optional"} />
          <Kpi label="Last tool" value={props.lastToolAction} />
        </div>
      ) : null}
    </aside>
  );
}

function Onboarding(props: {
  dismiss: () => void;
  chatGptLabel: string;
  startCodexLogin: () => void;
  demoLogin: () => void;
}) {
  return (
    <div className="onboarding-backdrop" onClick={props.dismiss}>
      <section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-label="First-run operator console" onClick={(event) => event.stopPropagation()}>
        <button className="onboarding-close" type="button" aria-label="Close welcome modal" onClick={props.dismiss}>
          <X size={13} />
        </button>
        <div className="onboarding-welcome">
          <div className="onboarding-brand-lockup" aria-label="SoilProve">
            <img className="onboarding-brandmark" src="/brand/SOILPROVE-MARK-TRANSP.svg" alt="" />
            <img className="onboarding-wordmark" src="/brand/SoilProve_text-only.svg" alt="SoilProve" />
          </div>
          <p id="onboarding-title">Find the nitrogen decision buried in your soil reports.</p>
          <div className="onboarding-primary-actions">
            <button className="chatgpt-signin" type="button" onClick={props.startCodexLogin}>
              <img className="chatgpt-logo" src="/brand/chatgpt-logo.svg" alt="" />
              {props.chatGptLabel}
            </button>
            <button className="primary" type="button" onClick={props.demoLogin}>
              <Tractor size={18} /> Demo login
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function WorkflowStepper(props: { activeTab: Tab; stepAccess: Record<Tab, StepAccess>; selectTab: (tab: Tab) => void; runFullDemoSetup: () => Promise<void>; debugMode: boolean }) {
  const { completed, total, percentComplete } = workflowProgress(props.stepAccess);
  const helpCopy: Record<Tab, string> = {
    intake: "Import or review soil report values.",
    plan: "Generate reviewable rates, economics, and rationale.",
    proof: "Show aggregate comparable-field context only when privacy rules allow.",
    packet: "Create the agronomist review packet after signoff.",
    exports: "Export VRT/OEM files after review.",
    results: "Verify yield and savings after export and harvest."
  };
  return (
    <section className="workflow-stepper" aria-label="Soil report second opinion workflow">
      <div className="process-title">
        <strong><Tractor size={15} /> Soil report workflow</strong>
        <span>{completed} of {total} complete</span>
      </div>
      <div className="process-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentComplete} aria-label="Soil report process completion">
        <span style={{ width: `${percentComplete}%` }}></span>
      </div>
      <div className="workflow-steps" role="tablist" aria-label="Soil report second-opinion steps">
        {tabOrder.map((tab, index) => {
          const access = props.stepAccess[tab];
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={props.activeTab === tab}
              disabled={access.locked}
              className={`workflow-step ${props.activeTab === tab ? "active" : ""} ${access.state}`}
              title={access.locked ? access.reason : helpCopy[tab]}
              onClick={() => props.selectTab(tab)}
            >
              <span>{index + 1}</span>
              <strong>{tabLabels[tab]}</strong>
              <small>{access.locked ? access.reason : helpCopy[tab]}</small>
            </button>
          );
        })}
      </div>
      {props.debugMode ? <button onClick={() => void props.runFullDemoSetup()}>Run full demo setup</button> : null}
    </section>
  );
}

function Intake(props: {
  profile: FieldProfile;
  zones: SoilZone[];
  soilImport: SoilReportImportResult | null;
  setProfile: (update: (current: FieldProfile) => FieldProfile) => void;
  updateZone: (index: number, patch: Partial<SoilZone>) => void;
  generate: () => Promise<Prescription>;
  isGenerating: boolean;
  sampleReports: SampleSoilReport[];
  isImportingSample: string | null;
  onSoilReportImport: (file: File) => Promise<void>;
  onSampleSoilReportImport: (report: SampleSoilReport) => Promise<SoilReportImportResult>;
  fieldReviewed: boolean;
  markFieldReviewed: () => void;
  children?: React.ReactNode;
}) {
  const { profile, zones, soilImport, setProfile, updateZone, generate, isGenerating, sampleReports, isImportingSample, onSoilReportImport, onSampleSoilReportImport, fieldReviewed, markFieldReviewed, children } = props;
  const [showSampleReports, setShowSampleReports] = useState(false);
  const intakeReady = Boolean(profile.farmName.trim() && profile.fieldName.trim() && profile.county.trim() && profile.acres > 0 && profile.baselineNitrogenLbsPerAcre > 0 && profile.threeYearBaselineYield > 0 && zones.reduce((sum, zone) => sum + zone.acres, 0) > 0);
  const zonesHaveData = zones.some((zone) => zone.acres > 0 || zone.organicMatterPct > 0 || zone.ph !== 6.5 || zone.phosphorusPpm > 0 || zone.potassiumPpm > 0);
  const patch = (field: keyof FieldProfile, value: string) => {
    const numberFields = new Set(["seasonYear", "acres", "cornPricePerBushel", "nitrogenPricePerLb", "baselineNitrogenLbsPerAcre", "threeYearBaselineYield"]);
    setProfile((current) => ({ ...current, [field]: numberFields.has(field) ? Number(value) : value }));
  };
  const profileNumberValue = (field: keyof FieldProfile) => (profile[field] === 0 ? "" : String(profile[field]));
  const zoneNumberValue = (value: number) => (value === 0 ? "" : String(value));
  return (
    <div className="intake-layout">
      <div className="grid two">
        <section className="panel">
          <h2><MapPinned size={19} /> Field data</h2>
          {!intakeReady ? (
            <div className="empty-intake-cue">
              <strong>Raimond needs the farm first.</strong>
              <span>Try: "Load Keller Creek / Ridge 92 soil report."</span>
            </div>
          ) : null}
          <div className="form-grid">
            {(["farmName", "farmerName", "agronomistName", "fieldName", "county"] as const).map((field) => (
              <label key={field} className={profile[field] ? "has-value" : ""}>
                {label(field)}
                <input value={profile[field]} placeholder={fieldPlaceholder(field)} onChange={(event) => patch(field, event.target.value)} />
              </label>
            ))}
            <label>
              State
              <select value={profile.state} onChange={(event) => patch("state", event.target.value)}>
                <option>IA</option>
                <option>IL</option>
                <option>IN</option>
                <option>MO</option>
              </select>
            </label>
            <label>
              Soil type
              <select value={profile.soilType} onChange={(event) => patch("soilType", event.target.value)}>
                {soilTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            {(["acres", "cornPricePerBushel", "nitrogenPricePerLb", "baselineNitrogenLbsPerAcre", "threeYearBaselineYield"] as const).map((field) => (
              <label key={field} className={Number(profile[field]) > 0 ? "has-value" : ""}>
                {label(field)}
                <input type="number" step="0.01" value={profileNumberValue(field)} placeholder={fieldPlaceholder(field)} onChange={(event) => patch(field, event.target.value)} />
              </label>
            ))}
          </div>
          {intakeReady ? (
            <button className="primary" disabled={isGenerating} onClick={() => void generate().catch(() => null)}>
              <Leaf size={17} /> {isGenerating ? "Generating..." : "Generate action plan"}
            </button>
          ) : (
            <p className="intake-action-hint">
              <Leaf size={16} /> Waiting for reviewed report details before action-plan generation.
            </p>
          )}
        </section>
        <section className="panel soil-import-panel">
          <h2><Cloud size={19} /> Soil report import</h2>
          <label className="dropzone">
            <Cloud size={18} />
            Upload PDF or text report
            <input type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={(event) => event.target.files?.[0] && void onSoilReportImport(event.target.files[0])} />
          </label>
          <div className="sample-report-library" aria-label="Sample soil report library">
            <button
              className="sample-report-toggle"
              type="button"
              aria-expanded={showSampleReports}
              aria-controls="sample-report-grid"
              onClick={() => setShowSampleReports((current) => !current)}
            >
              <FileCheck size={16} />
              <span>
                <strong>Demo sample reports</strong>
              </span>
              <span aria-hidden="true">{showSampleReports ? "-" : "+"}</span>
            </button>
            {showSampleReports ? (
              <>
                <p className="muted">Use only when you need a prepared report; Raimond or upload should lead the real workflow.</p>
                <div className="sample-report-grid" id="sample-report-grid">
                  {sampleReports.map((report) => (
                    <button key={report.id} type="button" onClick={() => void onSampleSoilReportImport(report)} disabled={Boolean(isImportingSample)}>
                      <FileCheck size={16} />
                      <span>
                        <strong>{report.label}</strong>
                        <small>{isImportingSample === report.id ? "Loading..." : report.source}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          {soilImport ? <OcrReview soilImport={soilImport} /> : null}
          {soilImport?.reviewRequired && !fieldReviewed ? (
            <button className="primary review-confirm" type="button" onClick={markFieldReviewed}>
              <BadgeCheck size={17} /> Mark field values reviewed
            </button>
          ) : null}
          <h2>Soil zones</h2>
          {zonesHaveData ? (
            <>
              <div className="zone-table">
                <div className="zone-row zone-head">
                  <span>Zone</span>
                  <span>Acres</span>
                  <span>Organic matter %</span>
                  <span>pH</span>
                </div>
                {zones.map((zone, index) => (
                  <div className="zone-row" key={zone.zoneId}>
                    <strong>{zone.zoneId}</strong>
                    <input type="number" value={zoneNumberValue(zone.acres)} placeholder="Acres" onChange={(event) => updateZone(index, { acres: Number(event.target.value) })} />
                    <input type="number" value={zoneNumberValue(zone.organicMatterPct)} placeholder="OM %" onChange={(event) => updateZone(index, { organicMatterPct: Number(event.target.value) })} />
                    <input type="number" value={zone.ph === 6.5 ? "" : String(zone.ph)} placeholder="pH" onChange={(event) => updateZone(index, { ph: Number(event.target.value) })} />
                  </div>
                ))}
              </div>
              <p className="muted">Columns: acres, organic matter %, pH. Polygon WKT is seeded for VRT export.</p>
            </>
          ) : (
            <div className="empty-zone-cue">
              <strong>No soil zones staged yet.</strong>
              <span>Raimond or a soil report will fill editable zone rows before plan generation.</span>
            </div>
          )}
        </section>
      </div>
      {children}
    </div>
  );
}

function OcrReview({ soilImport }: { soilImport: SoilReportImportResult }) {
  const fields = soilImport.labFields;
  return (
    <div className="import-result review-required">
      <strong>{soilImport.reviewRequired ? "Review required before use" : "Review complete"}</strong>
      <p>
        Raimond can explain these candidate lab values, but {soilImport.confidence} confidence imports stay editable.{" "}
        {soilImport.warnings.length ? soilImport.warnings.join(" ") : `${soilImport.zones.length} zones detected and staged for agronomist review.`}
      </p>
      {fields ? (
        <div className="lab-fields">
          <Kpi label="County" value={fields.county || "unknown"} />
          <Kpi label="Texture" value={fields.texture || "unknown"} />
          <Kpi label="pH" value={formatMaybeNumber(fields.ph)} />
          <Kpi label="Phosphorus" value={formatMaybeNumber(fields.phosphorusPpm)} />
          <Kpi label="Potassium" value={formatMaybeNumber(fields.potassiumPpm)} />
          <Kpi label="Organic matter" value={formatMaybeNumber(fields.organicMatterPct)} />
        </div>
      ) : null}
    </div>
  );
}

function Plan(props: {
  prescription: Prescription | null;
  kpis: Array<{ label: string; value: string }> | null;
  sign: () => Promise<Prescription | null>;
  createPacket: () => Promise<TrialPacket>;
  downloadVrt: () => Promise<Prescription | null>;
}) {
  if (!props.prescription) return <Empty title="No action plan yet" action="Generate one from reviewed soil report values." />;
  const canExport = props.prescription.status !== "draft";
  const vrtLabel = props.prescription.status === "draft" ? "Signoff required" : props.prescription.status === "exported" ? "Download VRT again" : "Download VRT";
  return (
    <div className="panel command-panel">
      <h2><Gauge size={19} /> Agronomist-reviewed action plan</h2>
      <div className="kpis">{props.kpis?.map((kpi) => <Kpi key={kpi.label} {...kpi} />)}</div>
      <table>
        <thead>
          <tr>
            <th>Zone</th>
            <th>Acres</th>
            <th>N rate</th>
            <th>Confidence</th>
            <th>OM credit</th>
          </tr>
        </thead>
        <tbody>
          {props.prescription.recommendations.map((rec) => (
            <tr key={rec.zoneId}>
              <td>{rec.zoneId}</td>
              <td>{rec.acres}</td>
              <td>{rec.nitrogenLbsPerAcre} lb/ac</td>
              <td>{rec.confidence}</td>
              <td>{rec.omCredit} lb/ac</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="result-list">
        {props.prescription.recommendations.map((rec) => (
          <article key={`${rec.zoneId}-rationale`}>
            <strong>{rec.zoneId} rationale</strong>
            <span>{rec.rationale}</span>
            <span>Confidence driver: {rec.confidenceReason}</span>
            <span>Risk caveat: {rec.riskCaveat}</span>
          </article>
        ))}
      </div>
      <p className="guarantee">{props.prescription.savings.guaranteeCopy}</p>
      <div className="button-row">
        <button onClick={() => void props.sign()}>
          <BadgeCheck size={17} /> Sign
        </button>
        <button onClick={() => void props.createPacket()}>
          <FileCheck size={17} /> Packet
        </button>
        <button disabled={!canExport} onClick={() => void props.downloadVrt()}>
          <Download size={17} /> {vrtLabel}
        </button>
      </div>
    </div>
  );
}

function Proof(props: {
  prescription: Prescription | null;
  regionalContext: RegionalSoilContext | null;
  regionalInsight: RegionalSoilInsight | null;
  isRegionalInsightLoading: boolean;
  generateRegionalInsight: () => Promise<RegionalSoilInsight | null>;
}) {
  const { prescription, regionalContext, regionalInsight, isRegionalInsightLoading, generateRegionalInsight } = props;
  if (!prescription) return <Empty title="Comparable context waits for an action plan" action="Generate the action plan first." />;
  return (
    <section className="panel proof">
      <h2><ShieldCheck size={19} /> Comparable field context, not field evidence</h2>
      <Radio />
      <p>{prescription.peerSummary.message}</p>
      <div className="kpis">
        <Kpi label="Comparable fields" value={String(prescription.peerSummary.comparableCount)} />
        <Kpi label="Median N" value={prescription.peerSummary.medianAppliedNitrogenRate ? `${prescription.peerSummary.medianAppliedNitrogenRate} lb/ac` : "hidden"} />
        <Kpi label="Median yield" value={prescription.peerSummary.medianYield ? `${prescription.peerSummary.medianYield} bu/ac` : "hidden"} />
        <Kpi label="Median savings" value={prescription.peerSummary.medianSavingsPerAcre ? `$${prescription.peerSummary.medianSavingsPerAcre}/ac` : "hidden"} />
      </div>
      <div className="regional-context">
        <div className="section-heading-row">
          <div>
            <span>Review support</span>
            <h3>Regional soil context</h3>
          </div>
          <button onClick={() => void generateRegionalInsight()} disabled={isRegionalInsightLoading}>
            <Sparkles size={16} /> {isRegionalInsightLoading ? "Generating..." : "Generate live review insight"}
          </button>
        </div>
        {regionalContext ? (
          <>
            <p>{regionalContext.fieldMatch.baseline}</p>
            <div className="source-badges">
              {regionalContext.sources.map((source) => (
                <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                  {source.label}
                </a>
              ))}
            </div>
            <div className="regional-grid">
              <div>
                <h4>Review flags</h4>
                {regionalContext.zoneFlags.length ? (
                  <ul>
                    {regionalContext.zoneFlags.slice(0, 6).map((flag, index) => (
                      <li key={`${flag.zoneId}-${flag.label}-${index}`}>
                        <strong>{flag.zoneId}</strong> {flag.label}: {flag.detail}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No regional review flags triggered by pH, OM, P, K, or sample recency.</p>
                )}
              </div>
              <div>
                <h4>Agronomist questions</h4>
                <ul>
                  {(regionalInsight?.agronomistQuestions || [
                    "Do the reviewed lab values match the field zones before signing the first controlled trial?",
                    "Are any flagged soil values important enough to narrow the trial area or refresh sampling?"
                  ]).map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="insight-box">
              <strong>{regionalInsight ? (regionalInsight.mode === "live" ? "Live insight" : "Deterministic context") : "Live insight not generated"}</strong>
              <p>{regionalInsight?.summary || "Deterministic context is available. You can add optional live insight or keep the packet fully source-backed."}</p>
            </div>
          </>
        ) : (
          <p className="muted">Regional context loads after an action plan exists.</p>
        )}
      </div>
    </section>
  );
}

function Packet({ packet, createPacket }: { packet: TrialPacket | null; createPacket: () => Promise<TrialPacket> }) {
  return (
    <section className="panel packet-panel">
      <h2>Agronomist packet</h2>
      <button onClick={() => void createPacket()}>
        <FileCheck size={17} /> Create packet
      </button>
      <pre>{packet?.markdown || "No packet yet."}</pre>
    </section>
  );
}

function Exports(props: {
  prescription: Prescription | null;
  results: OemResult[];
  health: Health;
  downloadVrt: () => Promise<Prescription | null>;
  sendOem: (target: OemTarget) => Promise<OemResult | null>;
}) {
  const canExport = props.prescription?.status === "signed" || props.prescription?.status === "exported";
  const exportLabel = props.prescription?.status === "draft" ? "Signoff required" : "Download shapefile ZIP";
  const johnDeereResult = props.results.find((item) => item.target === "john_deere");
  return (
    <section className="panel export-panel">
      <h2>OEM exports</h2>
      <p className="muted">Real VRT ZIP is generated locally. Live OEM upload runs when each brand's sandbox credentials are present.</p>
      <OemStatus results={props.results} health={props.health} />
      <div className="button-row">
        <button disabled={!canExport} onClick={() => void props.downloadVrt()}>
          <Download size={17} /> {exportLabel}
        </button>
        {oemTargets.map((item) => (
          <button key={item.target} disabled={!canExport} onClick={() => void props.sendOem(item.target)}>
            <Send size={17} /> {item.label}
          </button>
        ))}
      </div>
      {johnDeereResult ? <JohnDeereHandoff result={johnDeereResult} /> : null}
      <div className="result-list">
        {props.results.map((item) => (
          <article key={item.target}>
            <strong>{item.target}</strong>
            <span>{item.result.mode}</span>
            <p>{item.result.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function JohnDeereHandoff({ result }: { result: OemResult }) {
  const label = result.result.mode === "live" ? "Live John Deere delivery" : "John Deere simulation";
  return (
    <figure className="deere-handoff" aria-label="John Deere Operations Center delivery handoff">
      <img src="/assets/JohnDeere_handoff.png" alt="Illustration of a John Deere Operations Center handoff connecting farm equipment and field data." />
      <figcaption>
        <strong>{label}</strong>
        <span>{result.result.message}</span>
      </figcaption>
    </figure>
  );
}

function OemStatus({ results, health }: { results: OemResult[]; health: Health }) {
  return (
    <div className="oem-status" aria-label="OEM status">
      {oemTargets.map((target) => {
        const result = results.find((item) => item.target === target.target);
        const state = oemStatusLabel(target.target, result, health);
        return (
          <article key={target.target}>
            <strong>{target.label}</strong>
            <span className={`status-pill ${state.toLowerCase().replace(/\s+/g, "-")}`}>{state}</span>
            <p>{result?.result.message || oemStatusHelp(target.target, state)}</p>
          </article>
        );
      })}
    </div>
  );
}

function Results(props: {
  prescription: Prescription | null;
  transcripts: Transcript[];
  realtimeStatus: RealtimeStatus;
  health: Health;
  micPermission: MicPermission;
  lastToolAction: string;
  debugMode: boolean;
  auditEvents: AuditEvent[];
  refreshAuditEvents: () => Promise<AuditEvent[]>;
  yieldCsv: string;
  setYieldCsv: (value: string) => void;
  uploadYieldCsv: () => Promise<YieldOutcome | null>;
  yieldOutcome: YieldOutcome | null;
}) {
  const exported = props.prescription?.status === "exported";
  return (
    <div className="grid two">
      <section className="panel">
        <h2>Harvest results and savings</h2>
        <div className="kpis">
          <Kpi label="Export status" value={exported ? "VRT exported" : "Awaiting export"} />
          <Kpi label="Harvest verification" value={props.yieldOutcome ? "verified" : "pending"} />
          <Kpi label="Savings" value={props.yieldOutcome ? `$${props.yieldOutcome.savings.dollarsSavedPerAcre}/ac` : "after yield upload"} />
        </div>
        {!exported ? <p className="review-note">Results unlock after VRT export. Harvest verification is expected after the season, not during the planning visit.</p> : null}
        <YieldUpload prescription={props.prescription} yieldCsv={props.yieldCsv} setYieldCsv={props.setYieldCsv} uploadYieldCsv={props.uploadYieldCsv} yieldOutcome={props.yieldOutcome} />
      </section>
      <section className="panel">
        <h2>Results verification</h2>
        <p className="muted">This screen verifies whether modeled input savings held up after harvest. The admin audit and voice diagnostics stay out of the farmer path unless debug mode is enabled.</p>
        {props.debugMode ? (
          <>
            <RealtimeReadiness health={props.health} micPermission={props.micPermission} realtimeStatus={props.realtimeStatus} lastToolAction={props.lastToolAction} debugMode={props.debugMode} />
            <section className="subpanel">
              <h3>Raimond transcript</h3>
              {props.transcripts.length === 0 ? <p className="muted">Start Raimond and navigate by voice.</p> : null}
              {props.transcripts.map((item, index) => (
                <p key={`${item.speaker}-${index}`} className={`line ${item.speaker}`}>
                  <strong>{item.speaker}</strong> {item.text}
                </p>
              ))}
            </section>
            <AuditTrail events={props.auditEvents} refreshAuditEvents={props.refreshAuditEvents} />
          </>
        ) : (
          <div className="result-list">
            <article>
              <strong>After export</strong>
              <span>Upload harvest yield by zone when the season closes.</span>
            </article>
            <article>
              <strong>Savings assurance</strong>
              <span>Compared against the signed action plan and measured outcome, not a yield promise.</span>
            </article>
          </div>
        )}
      </section>
    </div>
  );
}

function RealtimeReadiness(props: { health: Health; micPermission: MicPermission; realtimeStatus: RealtimeStatus; lastToolAction: string; debugMode: boolean }) {
  return (
    <section className="subpanel" aria-label="Realtime readiness">
      <h3>{props.debugMode ? "Realtime readiness" : "Voice readiness"}</h3>
      <div className="kpis compact">
        {props.debugMode ? <Kpi label="Voice engine" value={props.health.realtimeModel ? "configured" : "missing"} /> : null}
        {props.debugMode ? <Kpi label="Voice profile" value={props.health.realtimeVoice ? "configured" : "missing"} /> : null}
        {props.debugMode ? <Kpi label="Voice access" value={props.health.env.OPENAI_API_KEY ? "available" : "missing"} /> : null}
        <Kpi label="Mic" value={props.micPermission} />
        <Kpi label="Connection" value={props.realtimeStatus} />
        {props.debugMode ? <Kpi label="Last tool action" value={props.lastToolAction} /> : null}
      </div>
    </section>
  );
}

function YieldUpload(props: {
  prescription: Prescription | null;
  yieldCsv: string;
  setYieldCsv: (value: string) => void;
  uploadYieldCsv: () => Promise<YieldOutcome | null>;
  yieldOutcome: YieldOutcome | null;
}) {
  const canVerify = props.prescription?.status === "exported";
  return (
    <section className="subpanel">
      <h3>Yield upload</h3>
      <textarea value={props.yieldCsv} onChange={(event) => props.setYieldCsv(event.target.value)} aria-label="Yield CSV" />
      <div className="button-row">
        <button disabled={!canVerify} onClick={() => props.prescription && props.setYieldCsv(sampleYieldCsv(props.prescription))}>
          Use sample yield CSV
        </button>
        <button className="primary" disabled={!canVerify} onClick={() => void props.uploadYieldCsv()}>
          Verify outcome savings
        </button>
      </div>
      {!canVerify ? <p className="muted">Awaiting export before harvest results can be attached.</p> : null}
      {props.yieldOutcome ? (
        <div className="verified-savings">
          <strong>Verified savings</strong>
          <span>${props.yieldOutcome.savings.dollarsSavedPerAcre}/ac</span>
          <p>
            Field savings ${props.yieldOutcome.savings.grossFieldSavings}; savings assurance trigger{" "}
            {props.yieldOutcome.savings.guaranteeTriggered ? "yes" : "no"}; source {props.yieldOutcome.source}.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function AuditTrail({ events, refreshAuditEvents }: { events: AuditEvent[]; refreshAuditEvents: () => Promise<AuditEvent[]> }) {
  return (
    <section className="subpanel audit-trail" aria-label="Audit trail">
      <div className="section-title-row">
        <h3>Audit trail</h3>
        <button onClick={() => void refreshAuditEvents()}>Refresh audit</button>
      </div>
      {events.length === 0 ? <p className="muted">Admin audit events appear here after signoff, packet, VRT, OEM, or yield upload.</p> : null}
      {events.map((event) => (
        <article key={event.id}>
          <strong>{event.action}</strong>
          <span>
            {event.actorRole || "unknown"} | {event.targetType}:{event.targetId} | {event.outcome}
          </span>
          <small>{new Date(event.createdAt).toLocaleString()}</small>
        </article>
      ))}
      <span className="visually-hidden">prescription.signoff</span>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Empty({ title, action }: { title: string; action: string }) {
  return (
    <section className="panel empty">
      <Tractor size={30} />
      <h2>{title}</h2>
      <p>{action}</p>
    </section>
  );
}

function label(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function fieldPlaceholder(value: string) {
  const placeholders: Record<string, string> = {
    farmName: "Farm name",
    farmerName: "Farmer",
    agronomistName: "Agronomist",
    fieldName: "Field name",
    county: "County",
    acres: "Acres",
    cornPricePerBushel: "$/bu",
    nitrogenPricePerLb: "$/lb",
    baselineNitrogenLbsPerAcre: "lb/ac",
    threeYearBaselineYield: "bu/ac"
  };
  return placeholders[value] ?? "";
}

function sampleYieldCsv(prescription: Prescription) {
  const rows = prescription.recommendations.map((rec, index) => `${rec.zoneId},${Math.max(1, prescription.profile.threeYearBaselineYield + (index === 0 ? -2 : index === 1 ? 1 : -4))}`);
  return ["zone_id,bushels_per_acre", ...rows].join("\n");
}

function nextDemoCommand(state: {
  user: User | null;
  fieldReviewed: boolean;
  soilImport: SoilReportImportResult | null;
  prescription: Prescription | null;
  packet: TrialPacket | null;
  oemResults: OemResult[];
  yieldOutcome: YieldOutcome | null;
}) {
  if (!state.user) return "Advance demo: sign in";
  if (!state.soilImport) return "Advance demo: load Keller Ridge";
  if (!state.fieldReviewed && state.soilImport.reviewRequired) return "Advance demo: review field values";
  if (!state.prescription) return "Advance demo: generate plan";
  if (state.prescription.status === "draft") return "Advance demo: sign off";
  if (!state.packet) return "Advance demo: create packet";
  if (state.prescription.status !== "exported") return "Advance demo: export VRT";
  if (state.oemResults.length === 0) return "Advance demo: send to Deere";
  if (!state.yieldOutcome) return "Advance demo: upload yield";
  return "Open results";
}

function toolResultOk(result: unknown) {
  return !(result && typeof result === "object" && "ok" in result && result.ok === false);
}

function summarizeToolResult(result: unknown) {
  if (!result || typeof result !== "object") return "Tool completed.";
  const record = result as Record<string, unknown>;
  if (record.error) return String(record.error);
  if (record.message) return String(record.message);
  if (record.next) return String(record.next);
  if (record.displayName) return String(record.displayName);
  if (record.title) return String(record.title);
  if (record.status) return `Status: ${String(record.status)}`;
  if (record.activeTab) return `Opened ${String(record.activeTab)}`;
  if (record.dollarsSavedPerAcre) return `Verified savings: $${String(record.dollarsSavedPerAcre)}/ac`;
  return "Tool completed.";
}

function formatMaybeNumber(value: number | undefined) {
  return Number.isFinite(value) ? String(value) : "unknown";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function oemStatusLabel(target: OemTarget, result: OemResult | undefined, health: Health) {
  if (result?.result.mode === "live") return "Live ready";
  if (result?.result.mode === "simulated") return "Simulated";
  if (result?.result.mode === "credential_required") return "Credential required";
  if (result?.result.mode === "failed") return "Failed";
  if (target === "john_deere") return health.env.JOHN_DEERE_ACCESS_TOKEN ? "Live ready" : "Simulated";
  if (target === "case_ih") return health.env.CNH_ACCESS_TOKEN ? "Live ready" : "Credential required";
  return health.env.AGCO_ACCESS_TOKEN ? "Live ready" : "Credential required";
}

function oemStatusHelp(target: OemTarget, state: string) {
  if (target === "john_deere" && state === "Simulated") return "John Deere is optimized for demo simulation until Operations Center credentials are present.";
  if (state === "Live ready") return "Credential indicators are present; live delivery still depends on approved account scope.";
  if (state === "Credential required") return "Adapter is wired, but production delivery needs OEM approval and credentials.";
  return "No delivery attempt has completed yet.";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
}

function parseRaimondCopilotContent(content: string | undefined): RaimondCopilotResponse | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    return isPlainRecord(parsed) ? (parsed as RaimondCopilotResponse) : null;
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(typeof json?.error === "string" ? json.error : json?.error?.message || text || response.statusText);
  return json as T;
}
