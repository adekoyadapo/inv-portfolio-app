import "server-only";

import { Client, type estypes } from "@elastic/elasticsearch";

import { env } from "@/lib/env";
import { hashPassword } from "@/lib/passwords";
import type {
  Account,
  AiImportRun,
  AiImportSettings,
  AppUser,
  DataExportDump,
  DataExportScope,
  Institution,
  MonthlyRecord,
  PublicUser,
  UserRole
} from "@/lib/types";
import { DATA_EXPORT_VERSION } from "@/lib/types";

const indices = {
  institutions: "institutions",
  accounts: "accounts",
  monthlyRecords: "monthly_records",
  users: "users",
  aiSettings: "ai_settings",
  aiImportRuns: "ai_import_runs"
};

let client: Client | null = null;
let initialized = false;

function elasticClient() {
  if (client) return client;

  client = new Client({
    node: env.ELASTICSEARCH_ENDPOINT,
    auth: env.ELASTICSEARCH_API_KEY
      ? { apiKey: env.ELASTICSEARCH_API_KEY }
      : {
          username: env.ELASTICSEARCH_USERNAME,
          password: env.ELASTICSEARCH_PASSWORD
        }
  });

  return client;
}

async function ensureIndex(index: string, properties: Record<string, estypes.MappingProperty>) {
  const es = elasticClient();
  const exists = await es.indices.exists({ index });
  if (exists) return;

  await es.indices.create({
    index,
    mappings: {
      dynamic: false,
      properties
    }
  });
}

export async function ensureIndices() {
  if (initialized) return;

  await ensureIndex(indices.institutions, {
    id: { type: "keyword" },
    name: { type: "text", fields: { keyword: { type: "keyword" } } },
    logoObjectKey: { type: "keyword" },
    logoUrl: { type: "keyword" },
    createdAt: { type: "date" },
    updatedAt: { type: "date" }
  });

  await ensureIndex(indices.accounts, {
    id: { type: "keyword" },
    institutionId: { type: "keyword" },
    name: { type: "text", fields: { keyword: { type: "keyword" } } },
    type: { type: "keyword" },
    createdAt: { type: "date" },
    updatedAt: { type: "date" }
  });

  await ensureIndex(indices.monthlyRecords, {
    id: { type: "keyword" },
    institutionId: { type: "keyword" },
    accountId: { type: "keyword" },
    month: { type: "keyword" },
    amountInvested: { type: "double" },
    currentValue: { type: "double" },
    currencyCode: { type: "keyword" },
    sourceFingerprint: { type: "keyword" },
    createdAt: { type: "date" },
    updatedAt: { type: "date" }
  });

  await ensureIndex(indices.users, {
    id: { type: "keyword" },
    username: { type: "keyword" },
    passwordHash: { type: "keyword", index: false },
    role: { type: "keyword" },
    createdAt: { type: "date" },
    updatedAt: { type: "date" }
  });

  await ensureIndex(indices.aiSettings, {
    id: { type: "keyword" },
    enabled: { type: "boolean" },
    demoEnabled: { type: "boolean" },
    updatedAt: { type: "date" },
    updatedBy: { type: "keyword" }
  });

  await ensureIndex(indices.aiImportRuns, {
    id: { type: "keyword" },
    status: { type: "keyword" },
    sourceName: { type: "keyword" },
    sourceType: { type: "keyword" },
    sourceFingerprint: { type: "keyword" },
    settingsId: { type: "keyword" },
    draft: { type: "object", enabled: false },
    createdAt: { type: "date" },
    updatedAt: { type: "date" },
    createdBy: { type: "keyword" },
    errorMessage: { type: "text" }
  });

  initialized = true;
}

async function searchAll<T>(index: string, sort: Array<Record<string, string>>) {
  await ensureIndices();
  const response = await elasticClient().search<T>({
    index,
    size: 1000,
    sort,
    query: { match_all: {} }
  });
  return response.hits.hits.map((hit) => hit._source).filter(Boolean) as T[];
}

// Paginates past the 1000-document cap on searchAll, for export use cases where completeness matters more than a single round trip.
async function fetchAllDocuments<T>(index: string, sort: Array<Record<string, string>>) {
  await ensureIndices();
  const pageSize = 1000;
  const documents: T[] = [];
  let searchAfter: estypes.SortResults | undefined;

  for (;;) {
    const response = await elasticClient().search<T>({
      index,
      size: pageSize,
      sort,
      query: { match_all: {} },
      ...(searchAfter ? { search_after: searchAfter } : {})
    });
    const hits = response.hits.hits;
    if (hits.length === 0) break;
    for (const hit of hits) {
      if (hit._source) documents.push(hit._source);
    }
    if (hits.length < pageSize) break;
    searchAfter = hits[hits.length - 1].sort;
  }

  return documents;
}

export async function listInstitutions() {
  return searchAll<Institution>(indices.institutions, [{ "name.keyword": "asc" }]);
}

export async function getInstitutionById(id: string) {
  await ensureIndices();
  return getById<Institution>(indices.institutions, id);
}

export async function findInstitutionByName(name: string) {
  const normalized = name.trim().toLowerCase();
  return (await listInstitutions()).find((institution) => institution.name.trim().toLowerCase() === normalized) ?? null;
}

export async function findInstitutionByLooseName(name: string) {
  const normalized = normalizeEntityKey(name);
  if (!normalized) return null;

  const institutions = await listInstitutions();
  return (
    institutions.find((institution) => normalizeEntityKey(institution.name) === normalized) ??
    institutions.find((institution) => {
      const candidate = normalizeEntityKey(institution.name);
      return candidate && (candidate.includes(normalized) || normalized.includes(candidate));
    }) ??
    institutions.find((institution) => similarityScore(normalized, normalizeEntityKey(institution.name)) >= 0.66) ??
    null
  );
}

export async function listAccounts() {
  return searchAll<Account>(indices.accounts, [{ "name.keyword": "asc" }]);
}

export async function findAccountByKey(input: { institutionId: string; name: string; type: string }) {
  const name = input.name.trim().toLowerCase();
  const type = input.type.trim().toLowerCase();
  return (
    (await listAccounts()).find(
      (account) =>
        account.institutionId === input.institutionId &&
        account.name.trim().toLowerCase() === name &&
        account.type.trim().toLowerCase() === type
    ) ?? null
  );
}

export async function findAccountByLooseKey(input: { institutionId: string; name: string; type: string }) {
  const targetName = normalizeEntityKey(input.name);
  const targetType = normalizeEntityKey(input.type);
  const targetDigits = extractAccountDigits(input.name);
  const candidates = (await listAccounts()).filter((account) => account.institutionId === input.institutionId);

  return (
    candidates.find((account) => normalizeEntityKey(account.name) === targetName && normalizeEntityKey(account.type) === targetType) ??
    candidates.find((account) => {
      const candidateDigits = extractAccountDigits(account.name);
      return Boolean(
        targetDigits &&
          candidateDigits &&
          targetDigits === candidateDigits &&
          accountTypesCompatible(input.type, account.type, input.name, account.name)
      );
    }) ??
    candidates.find((account) => normalizeEntityKey(account.type) === targetType && similarityScore(targetName, normalizeEntityKey(account.name)) >= 0.62) ??
    candidates.find((account) => similarityScore(targetName, normalizeEntityKey(account.name)) >= 0.72) ??
    null
  );
}

export async function listMonthlyRecords() {
  return searchAll<MonthlyRecord>(indices.monthlyRecords, [{ month: "asc" }]);
}

export async function findMonthlyRecordByAccountMonth(accountId: string, month: string) {
  await ensureIndices();
  return getById<MonthlyRecord>(indices.monthlyRecords, `${accountId}:${month}`);
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await searchAll<AppUser>(indices.users, [{ username: "asc" }]);
  return users.map(stripPasswordHash);
}

export async function getUserByUsername(username: string) {
  await ensureIndices();
  const response = await elasticClient().search<AppUser>({
    index: indices.users,
    size: 1,
    query: {
      term: {
        username
      }
    }
  });

  return response.hits.hits[0]?._source ?? null;
}

export async function upsertInstitution(input: { id?: string; name: string; logoObjectKey?: string; logoUrl?: string }) {
  await ensureIndices();
  const now = new Date().toISOString();
  const existing = input.id ? await getById<Institution>(indices.institutions, input.id) : await findInstitutionByName(input.name);
  const id = input.id || existing?.id || crypto.randomUUID();
  const document: Institution = {
    id,
    name: input.name,
    logoObjectKey: input.logoObjectKey ?? existing?.logoObjectKey,
    logoUrl: input.logoUrl ?? existing?.logoUrl,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  await elasticClient().index({ index: indices.institutions, id, document, refresh: true });
  return document;
}

export async function upsertAccount(input: { id?: string; institutionId: string; name: string; type: string }) {
  await ensureIndices();
  const now = new Date().toISOString();
  const existing = input.id ? await getById<Account>(indices.accounts, input.id) : await findAccountByKey(input);
  const id = input.id || existing?.id || crypto.randomUUID();
  const document: Account = {
    id,
    institutionId: input.institutionId,
    name: input.name,
    type: input.type,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  await elasticClient().index({ index: indices.accounts, id, document, refresh: true });
  return document;
}

export async function upsertMonthlyRecord(input: {
  institutionId: string;
  accountId: string;
  month: string;
  amountInvested: number;
  currentValue: number;
  currencyCode?: string;
  sourceFingerprint?: string;
}) {
  await ensureIndices();
  const now = new Date().toISOString();
  const id = `${input.accountId}:${input.month}`;
  const existing = await getById<MonthlyRecord>(indices.monthlyRecords, id);
  const document: MonthlyRecord = {
    id,
    institutionId: input.institutionId,
    accountId: input.accountId,
    month: input.month,
    amountInvested: input.amountInvested,
    currentValue: input.currentValue,
    currencyCode: input.currencyCode,
    sourceFingerprint: input.sourceFingerprint,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  await elasticClient().index({ index: indices.monthlyRecords, id, document, refresh: true });
  return document;
}

export async function createUser(input: { username: string; password: string; role: UserRole }) {
  await ensureIndices();
  const now = new Date().toISOString();
  const existing = await getUserByUsername(input.username);
  if (existing) throw new Error("A user with that username already exists.");

  const id = crypto.randomUUID();
  const document: AppUser = {
    id,
    username: input.username,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    createdAt: now,
    updatedAt: now
  };

  await elasticClient().index({ index: indices.users, id, document, refresh: true });
  return stripPasswordHash(document);
}

export async function ensureBootstrapAdmin() {
  await ensureIndices();
  const users = await searchAll<AppUser>(indices.users, [{ username: "asc" }]);
  if (users.length > 0) return;

  const now = new Date().toISOString();
  const document: AppUser = {
    id: crypto.randomUUID(),
    username: env.ADMIN_USERNAME,
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    role: "admin",
    createdAt: now,
    updatedAt: now
  };

  await elasticClient().index({ index: indices.users, id: document.id, document, refresh: true });
}

export async function deleteUser(id: string) {
  await ensureIndices();
  const users = await searchAll<AppUser>(indices.users, [{ username: "asc" }]);
  const target = users.find((user) => user.id === id);
  if (!target) return;

  const adminCount = users.filter((user) => user.role === "admin").length;
  if (target.role === "admin" && adminCount <= 1) {
    throw new Error("Cannot delete the last admin user.");
  }

  await elasticClient().delete({ index: indices.users, id, refresh: true }, { ignore: [404] });
}

export async function deleteDocument(kind: keyof typeof indices, id: string) {
  await ensureIndices();
  await elasticClient().delete({ index: indices[kind], id, refresh: true }, { ignore: [404] });
}

export async function deleteByField(kind: keyof typeof indices, field: string, value: string) {
  await ensureIndices();
  await elasticClient().deleteByQuery({
    index: indices[kind],
    // Not forcing a refresh here: this runs ahead of the top-level deleteDocument call in a
    // cascade, which does force one. Elasticsearch's default ~1s refresh interval is well within
    // that gap, and forcing a refresh per cascade step added avoidable latency to every delete.
    refresh: false,
    query: { term: { [field]: value } }
  });
}

export async function getAiImportSettings() {
  await ensureIndices();
  const settings = await getById<AiImportSettings>(indices.aiSettings, "active");
  return { ...defaultAiImportSettings(), ...settings };
}

export async function saveAiImportSettings(input: { enabled: boolean; updatedBy: string }) {
  await ensureIndices();
  const now = new Date().toISOString();
  const existing = await getAiImportSettings();
  const document: AiImportSettings = {
    id: "active",
    enabled: input.enabled,
    demoEnabled: existing.demoEnabled,
    updatedAt: now,
    updatedBy: input.updatedBy
  };

  await elasticClient().index({ index: indices.aiSettings, id: "active", document, refresh: true });
  return document;
}

export async function saveDemoSettings(input: { enabled: boolean; updatedBy: string }) {
  await ensureIndices();
  const now = new Date().toISOString();
  const existing = await getAiImportSettings();
  const document: AiImportSettings = {
    id: "active",
    enabled: existing.enabled,
    demoEnabled: input.enabled,
    updatedAt: now,
    updatedBy: input.updatedBy
  };

  await elasticClient().index({ index: indices.aiSettings, id: "active", document, refresh: true });
  return document;
}

export async function createAiImportRun(input: {
  sourceName: string;
  sourceType: AiImportRun["sourceType"];
  sourceFingerprint: string;
  settingsId: string;
  createdBy: string;
}) {
  await ensureIndices();
  const now = new Date().toISOString();
  const document: AiImportRun = {
    id: crypto.randomUUID(),
    status: "draft",
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    sourceFingerprint: input.sourceFingerprint,
    settingsId: input.settingsId,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy
  };

  await elasticClient().index({ index: indices.aiImportRuns, id: document.id, document, refresh: true });
  return document;
}

export async function findAiImportRunByFingerprint(sourceFingerprint: string) {
  await ensureIndices();
  const response = await elasticClient().search<AiImportRun>({
    index: indices.aiImportRuns,
    size: 10,
    query: {
      term: {
        sourceFingerprint
      }
    }
  });

  return response.hits.hits.map((hit) => hit._source).find(Boolean) ?? null;
}

export async function findMonthlyRecordByFingerprint(sourceFingerprint: string) {
  await ensureIndices();
  const response = await elasticClient().search<MonthlyRecord>({
    index: indices.monthlyRecords,
    size: 10,
    query: {
      term: {
        sourceFingerprint
      }
    }
  });

  return response.hits.hits.map((hit) => hit._source).find(Boolean) ?? null;
}

export async function saveAiImportRun(input: AiImportRun) {
  await ensureIndices();
  await elasticClient().index({ index: indices.aiImportRuns, id: input.id, document: input, refresh: true });
  return input;
}

async function getById<T>(index: string, id: string) {
  try {
    const response = await elasticClient().get<T>({ index, id });
    return response._source ?? null;
  } catch {
    return null;
  }
}

function stripPasswordHash(user: AppUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function defaultAiImportSettings(): AiImportSettings {
  return {
    id: "active",
    enabled: false,
    demoEnabled: true,
    updatedAt: new Date().toISOString(),
    updatedBy: ""
  };
}

function normalizeEntityKey(value: string) {
  const stopwords = new Set([
    "account",
    "acct",
    "portfolio",
    "summary",
    "investment",
    "investments",
    "securities",
    "security",
    "inc",
    "incorporated",
    "ltd",
    "limited",
    "corp",
    "corporation",
    "bank",
    "financial",
    "wealth",
    "the"
  ]);

  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !stopwords.has(token))
    .join(" ");
}

function extractAccountDigits(value: string) {
  const matches = value.match(/\d{4,}/g);
  return matches?.at(-1)?.slice(-8) || "";
}

function accountTypesCompatible(leftType: string, rightType: string, leftName: string, rightName: string) {
  const left = canonicalAccountType(`${leftType} ${leftName}`);
  const right = canonicalAccountType(`${rightType} ${rightName}`);
  if (!left || !right) return true;
  return left === right;
}

function canonicalAccountType(value: string) {
  const normalized = value.toUpperCase();
  const registeredTypes = ["DPSP", "RRSP", "TFSA", "RESP", "FHSA", "RRIF", "LIRA", "LIF"];
  return registeredTypes.find((type) => new RegExp(`\\b${type}\\b`).test(normalized)) || "";
}

function similarityScore(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

async function bulkUpsertDocuments<T extends { id: string }>(index: string, documents: T[]) {
  if (documents.length === 0) return 0;
  await ensureIndices();
  const chunkSize = 500;
  let imported = 0;

  for (let i = 0; i < documents.length; i += chunkSize) {
    const chunk = documents.slice(i, i + chunkSize);
    const operations = chunk.flatMap((document) => [{ index: { _index: index, _id: document.id } }, document]);
    await elasticClient().bulk({ operations, refresh: false });
    imported += chunk.length;
  }

  await elasticClient().indices.refresh({ index });
  return imported;
}

export async function exportPortfolioData(): Promise<DataExportDump["data"]> {
  const [institutions, accounts, monthlyRecords] = await Promise.all([
    fetchAllDocuments<Institution>(indices.institutions, [{ "name.keyword": "asc" }, { id: "asc" }]),
    fetchAllDocuments<Account>(indices.accounts, [{ "name.keyword": "asc" }, { id: "asc" }]),
    fetchAllDocuments<MonthlyRecord>(indices.monthlyRecords, [{ month: "asc" }, { id: "asc" }])
  ]);
  return { institutions, accounts, monthlyRecords };
}

export async function exportFullData(): Promise<DataExportDump["data"]> {
  const [portfolio, users, aiSettings, aiImportRuns] = await Promise.all([
    exportPortfolioData(),
    fetchAllDocuments<AppUser>(indices.users, [{ username: "asc" }, { id: "asc" }]),
    fetchAllDocuments<AiImportSettings>(indices.aiSettings, [{ id: "asc" }]),
    fetchAllDocuments<AiImportRun>(indices.aiImportRuns, [{ createdAt: "asc" }, { id: "asc" }])
  ]);
  return { ...portfolio, users, aiSettings, aiImportRuns };
}

export async function buildDataExport(scope: DataExportScope): Promise<DataExportDump> {
  const data = scope === "full" ? await exportFullData() : await exportPortfolioData();
  return {
    version: DATA_EXPORT_VERSION,
    scope,
    exportedAt: new Date().toISOString(),
    data
  };
}

export type DataImportSummary = {
  institutions: number;
  accounts: number;
  monthlyRecords: number;
  users: number;
  aiSettings: number;
  aiImportRuns: number;
};

export async function importDataDump(dump: DataExportDump): Promise<DataImportSummary> {
  await ensureIndices();
  const [institutions, accounts, monthlyRecords, users, aiSettings, aiImportRuns] = await Promise.all([
    bulkUpsertDocuments(indices.institutions, dump.data.institutions),
    bulkUpsertDocuments(indices.accounts, dump.data.accounts),
    bulkUpsertDocuments(indices.monthlyRecords, dump.data.monthlyRecords),
    bulkUpsertDocuments(indices.users, dump.data.users || []),
    bulkUpsertDocuments(indices.aiSettings, dump.data.aiSettings || []),
    bulkUpsertDocuments(indices.aiImportRuns, dump.data.aiImportRuns || [])
  ]);
  return { institutions, accounts, monthlyRecords, users, aiSettings, aiImportRuns };
}
