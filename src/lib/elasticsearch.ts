import "server-only";

import { Client, type estypes } from "@elastic/elasticsearch";

import { env } from "@/lib/env";
import { hashPassword } from "@/lib/passwords";
import type {
  Account,
  AiImportRun,
  AiImportSettings,
  AppUser,
  Institution,
  MonthlyRecord,
  PublicUser,
  UserRole
} from "@/lib/types";

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

export async function getAiImportSettings() {
  await ensureIndices();
  const settings = await getById<AiImportSettings>(indices.aiSettings, "active");
  return settings || defaultAiImportSettings();
}

export async function saveAiImportSettings(input: { enabled: boolean; updatedBy: string }) {
  await ensureIndices();
  const now = new Date().toISOString();
  const document: AiImportSettings = {
    id: "active",
    enabled: input.enabled,
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
    updatedAt: new Date().toISOString(),
    updatedBy: ""
  };
}
