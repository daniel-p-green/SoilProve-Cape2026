// GENERATED SUBSET. Derived from `codex app-server generate-ts` for the SoilProve bridge methods.
// Keep this file narrow: it documents only the app-server protocol surface this app uses.

export type CodexPlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "prolite"
  | "team"
  | "self_serve_business_usage_based"
  | "business"
  | "enterprise_cbp_usage_based"
  | "enterprise"
  | "edu"
  | "unknown";

export type CodexAccount = { type: "apiKey" } | { type: "chatgpt"; email: string; planType: CodexPlanType } | { type: "amazonBedrock" };

export type CodexGetAccountResponse = {
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
};

export type CodexLoginAccountParams =
  | { type: "apiKey"; apiKey: string }
  | { type: "chatgpt"; codexStreamlinedLogin?: boolean }
  | { type: "chatgptDeviceCode" }
  | {
      type: "chatgptAuthTokens";
      accessToken: string;
      chatgptAccountId: string;
      chatgptPlanType?: string | null;
    };

export type CodexLoginAccountResponse =
  | { type: "apiKey" }
  | { type: "chatgpt"; loginId: string; authUrl: string }
  | { type: "chatgptDeviceCode"; loginId: string; verificationUrl: string; userCode: string }
  | { type: "chatgptAuthTokens" };

export type CodexCancelLoginAccountParams = {
  loginId: string;
};

export type CodexRateLimitReachedType =
  | "rate_limit_reached"
  | "workspace_owner_credits_depleted"
  | "workspace_member_credits_depleted"
  | "workspace_owner_usage_limit_reached"
  | "workspace_member_usage_limit_reached";

export type CodexRateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type CodexRateLimitSnapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  credits: unknown | null;
  planType: CodexPlanType | null;
  rateLimitReachedType: CodexRateLimitReachedType | null;
};

export type CodexGetAccountRateLimitsResponse = {
  rateLimits: CodexRateLimitSnapshot;
  rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot | undefined> | null;
};
