export type Institution = {
  id: string;
  name: string;
  logoObjectKey?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type Account = {
  id: string;
  institutionId: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyRecord = {
  id: string;
  institutionId: string;
  accountId: string;
  month: string;
  amountInvested: number;
  currentValue: number;
  currencyCode?: string;
  sourceFingerprint?: string;
  createdAt: string;
  updatedAt: string;
};

export type UserRole = "admin" | "operator" | "user_manager" | "viewer";

export type AppUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = Omit<AppUser, "passwordHash">;

export type AiProvider = "openai-compatible" | "openai" | "anthropic" | "gemini";

export type AiImportSettings = {
  id: string;
  enabled: boolean;
  demoEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

export type AiRuntimeConfig = {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
};

export type AiRuntimeCredentials = {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
};

export type AiImportDraft = {
  sourceName: string;
  sourceType: "pdf" | "image" | "text" | "spreadsheet";
  summary: string;
  notes: string[];
  sourceFingerprint: string;
  institutionName: string;
  accountName: string;
  accountType: string;
  month: string;
  currencyCode: string;
  amountInvested: number;
  currentValue: number;
  confidence: number;
  duplicateOf?: string;
  selected?: boolean;
};

export type AiImportBatch = {
  sourceName: string;
  sourceType: "pdf" | "image" | "text" | "spreadsheet";
  sourceFingerprint: string;
  notes: string[];
  drafts: AiImportDraft[];
};

export type AiImportStep = {
  id: string;
  label: string;
  detail: string;
  status: "not_started" | "pending" | "running" | "complete" | "error";
};

export type AiImportFileProgress = {
  id: string;
  fileName: string;
  bytes: number;
  status: "not_started" | "pending" | "running" | "complete" | "error";
  detail: string;
  progress: number;
  draftCount?: number;
};

export type AiImportRun = {
  id: string;
  status: "draft" | "reviewed" | "applied" | "failed";
  sourceName: string;
  sourceType: "pdf" | "image" | "text" | "spreadsheet";
  sourceFingerprint: string;
  settingsId: string;
  draft?: AiImportBatch;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  errorMessage?: string;
};

export type AccountSnapshot = {
  account: Account;
  institution: Institution;
  latest?: MonthlyRecord;
};

export type DashboardData = {
  institutions: Institution[];
  accounts: Account[];
  records: MonthlyRecord[];
  accountSnapshots: AccountSnapshot[];
  totals: {
    currentValue: number;
    invested: number;
    gainLoss: number;
    gainLossPercent: number;
    momDelta: number;
  };
  timeline: Array<{
    month: string;
    invested: number;
    currentValue: number;
  }>;
  institutionBreakdown: Array<{
    id?: string;
    name: string;
    currentValue: number;
    invested: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    currentValue: number;
    invested: number;
  }>;
};

export type DrilldownScope = "institution" | "type" | "account";

export type DrilldownData = DashboardData & {
  scope: DrilldownScope;
  id: string;
  label: string;
  subtitle: string;
  momRows: Array<{
    month: string;
    invested: number;
    currentValue: number;
    gainLoss: number;
    momDelta: number;
    momPercent: number;
  }>;
  accountBreakdown: Array<{
    id: string;
    name: string;
    institutionName: string;
    type: string;
    currentValue: number;
    invested: number;
    gainLoss: number;
  }>;
};
