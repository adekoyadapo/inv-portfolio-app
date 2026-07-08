"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createSession,
  destroySession,
  requireAdmin,
  requireAdminOrOperator,
  requireAdminOrUserManager,
  validateCredentials
} from "@/lib/auth";
import { importMonthlyRecordsCsv } from "@/lib/csv";
import {
  createUser,
  saveAiImportRun,
  deleteByField,
  deleteDocument,
  deleteUser,
  getInstitutionById,
  listAccounts,
  createAiImportRun,
  findAiImportRunByFingerprint,
  findAccountByKey,
  findAccountByLooseKey,
  findInstitutionByName,
  findInstitutionByLooseName,
  findMonthlyRecordByAccountMonth,
  saveAiImportSettings,
  saveDemoSettings,
  upsertAccount,
  upsertInstitution,
  upsertMonthlyRecord
} from "@/lib/elasticsearch";
import { deleteObject, uploadLogo } from "@/lib/object-storage";
import { logServerEvent, serializeError } from "@/lib/logger";
import type { AiImportBatch } from "@/lib/types";

const institutionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Institution name is required")
});

const logoUpdateSchema = z.object({
  institutionId: z.string().min(1, "Institution is required")
});

const accountSchema = z.object({
  id: z.string().optional(),
  institutionId: z.string().min(1, "Institution is required"),
  name: z.string().min(1, "Account name is required"),
  type: z.string().min(1, "Account type is required")
});

const accountTypeRenameSchema = z.object({
  currentType: z.string().trim().min(1, "Current account type is required"),
  newType: z.string().trim().min(1, "New account type is required")
});

const monthlyRecordSchema = z.object({
  accountId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amountInvested: z.coerce.number().nonnegative(),
  currentValue: z.coerce.number().nonnegative(),
  currencyCode: z.string().trim().min(1).default("USD")
});

const userSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(64, "Username must be 64 characters or fewer")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores, or hyphens"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  role: z.enum(["admin", "operator", "user_manager", "viewer"])
});

const aiImportSettingsSchema = z.object({
  enabled: z.coerce.boolean()
});

const demoSettingsSchema = z.object({
  enabled: z.coerce.boolean()
});

const aiImportDraftSchema = z.object({
  sourceName: z.string().min(1),
  sourceType: z.enum(["pdf", "image", "text", "spreadsheet"]),
  summary: z.string().min(1),
  notes: z.array(z.string()),
  sourceFingerprint: z.string().min(1),
  institutionName: z.string().min(1),
  accountName: z.string().min(1),
  accountType: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  currencyCode: z.string().min(1),
  amountInvested: z.number().nonnegative(),
  currentValue: z.number().nonnegative(),
  confidence: z.number().min(0).max(1)
});

const aiImportBatchSchema = z.object({
  sourceName: z.string().min(1),
  sourceType: z.enum(["pdf", "image", "text", "spreadsheet"]),
  sourceFingerprint: z.string().min(1),
  notes: z.array(z.string()),
  drafts: z.array(
    aiImportDraftSchema.extend({
      selected: z.boolean().optional(),
      duplicateOf: z.string().optional()
    })
  )
});

export type AcceptAiImportActionState =
  | {
      status: "idle";
    }
  | {
      status: "saved";
      sourceFingerprint: string;
      saveId: string;
      savedCount: number;
      skippedCount: number;
    };

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const next = safeNextPath(String(formData.get("next") || "/dashboard"));

  const user = await validateCredentials(username, password);
  if (!user) {
    redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  await createSession(user);
  redirect(next);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function saveInstitutionAction(formData: FormData) {
  await assertSameOrigin();
  await requireAdminOrOperator();
  const parsed = institutionSchema.parse({
    id: stringOrUndefined(formData.get("id")),
    name: formData.get("name")
  });

  const logo = formData.get("logo");
  const upload = logo instanceof File && logo.size > 0 ? await uploadLogo(logo, parsed.name) : undefined;

  await upsertInstitution({
    ...parsed,
    logoObjectKey: upload?.objectKey,
    logoUrl: upload?.url
  });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/drill");
}

export async function updateInstitutionLogoAction(formData: FormData) {
  await assertSameOrigin();
  await requireAdminOrOperator();
  const parsed = logoUpdateSchema.parse({
    institutionId: formData.get("institutionId")
  });
  const logo = formData.get("logo");
  if (!(logo instanceof File) || logo.size === 0) {
    throw new Error("Choose a logo file to upload.");
  }

  const institution = await getInstitutionById(parsed.institutionId);
  if (!institution) throw new Error("Institution not found.");

  const upload = await uploadLogo(logo, institution.name);
  await upsertInstitution({
    id: institution.id,
    name: institution.name,
    logoObjectKey: upload.objectKey,
    logoUrl: upload.url
  });
  await deleteObject(institution.logoObjectKey);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/drill");
}

export async function saveAccountAction(formData: FormData) {
  await assertSameOrigin();
  await requireAdminOrOperator();
  await upsertAccount(
    accountSchema.parse({
      id: stringOrUndefined(formData.get("id")),
      institutionId: formData.get("institutionId"),
      name: formData.get("name"),
      type: formData.get("type")
    })
  );
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/drill");
}

export async function renameAccountTypeAction(formData: FormData) {
  await assertSameOrigin();
  await requireAdminOrOperator();
  const parsed = accountTypeRenameSchema.parse({
    currentType: formData.get("currentType"),
    newType: formData.get("newType")
  });
  const current = parsed.currentType.trim().toLowerCase();
  const accounts = await listAccounts();
  const matchingAccounts = accounts.filter((account) => account.type.trim().toLowerCase() === current);

  await Promise.all(
    matchingAccounts.map((account) =>
      upsertAccount({
        id: account.id,
        institutionId: account.institutionId,
        name: account.name,
        type: parsed.newType
      })
    )
  );

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/drill");
}

export async function saveMonthlyRecordAction(formData: FormData) {
  await assertSameOrigin();
  await requireAdminOrOperator();
  const parsed = monthlyRecordSchema.parse({
    accountId: formData.get("accountId"),
    month: formData.get("month"),
    amountInvested: formData.get("amountInvested"),
    currentValue: formData.get("currentValue"),
    currencyCode: formData.get("currencyCode")
  });
  const account = (await listAccounts()).find((item) => item.id === parsed.accountId);
  if (!account) throw new Error("Selected account no longer exists.");

  await upsertMonthlyRecord({
    ...parsed,
    institutionId: account.institutionId
  });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/drill");
}

export async function deleteAction(
  _previousState: { status: "idle" | "deleted"; error?: string } | null,
  formData: FormData
): Promise<{ status: "idle" | "deleted"; error?: string }>;
export async function deleteAction(formData: FormData): Promise<{ status: "idle" | "deleted"; error?: string }>;
export async function deleteAction(arg1: FormData | { status: "idle" | "deleted"; error?: string } | null, arg2?: FormData) {
  await assertSameOrigin();
  await requireAdminOrOperator();
  const formData = arg2 ?? arg1;
  if (!(formData instanceof FormData)) {
    return { status: "idle" as const, error: "Invalid deletion submission." };
  }
  if (formData.get("confirm") !== "on") {
    return { status: "idle" as const, error: "Confirm deletion before continuing." };
  }
  const kind = String(formData.get("kind"));
  const id = String(formData.get("id"));
  if (!["institutions", "accounts", "monthlyRecords"].includes(kind) || !id) {
    return { status: "idle" as const, error: "Choose a record before deleting." };
  }

  if (kind === "institutions") {
    await deleteByField("monthlyRecords", "institutionId", id);
    await deleteByField("accounts", "institutionId", id);
  } else if (kind === "accounts") {
    await deleteByField("monthlyRecords", "accountId", id);
  }

  await deleteDocument(kind as "institutions" | "accounts" | "monthlyRecords", id);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/drill");
  return { status: "deleted" as const };
}

export async function createUserAction(formData: FormData) {
  await assertSameOrigin();
  const session = await requireAdminOrUserManager();
  const parsed = userSchema.parse({
    username: formData.get("username"),
    password: formData.get("password"),
    role: formData.get("role")
  });
  if (session.role === "user_manager" && parsed.role !== "viewer") {
    throw new Error("User managers can only create viewer accounts.");
  }
  await createUser(
    parsed
  );
  revalidatePath("/admin");
  revalidatePath("/users");
}

export async function deleteUserAction(
  _previousState: { status: "idle" | "deleted"; error?: string } | null,
  formData: FormData
): Promise<{ status: "idle" | "deleted"; error?: string }>;
export async function deleteUserAction(formData: FormData): Promise<{ status: "idle" | "deleted"; error?: string }>;
export async function deleteUserAction(arg1: FormData | { status: "idle" | "deleted"; error?: string } | null, arg2?: FormData) {
  await assertSameOrigin();
  const session = await requireAdmin();
  const formData = arg2 ?? arg1;
  if (!(formData instanceof FormData)) {
    return { status: "idle" as const, error: "Invalid deletion submission." };
  }
  if (formData.get("confirm") !== "on") {
    return { status: "idle" as const, error: "Confirm deletion before continuing." };
  }
  const id = String(formData.get("id") || "");
  const username = String(formData.get("username") || "");
  if (!id || username === session.username) {
    return { status: "idle" as const, error: "Cannot delete the active admin user." };
  }

  await deleteUser(id);
  revalidatePath("/admin");
  revalidatePath("/users");
  return { status: "deleted" as const };
}

export async function importCsvAction(formData: FormData) {
  await assertSameOrigin();
  await requireAdminOrOperator();
  const csv = formData.get("csv");
  if (!(csv instanceof File) || csv.size === 0) {
    throw new Error("Choose a CSV file to import.");
  }

  await importMonthlyRecordsCsv(csv);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/drill");
}

type AiImportSettingsActionState = {
  status: "idle" | "saved";
  enabled: boolean;
  saveId: string;
  error?: string;
};

export async function saveAiImportSettingsAction(formData: FormData): Promise<AiImportSettingsActionState>;
export async function saveAiImportSettingsAction(
  _previousState: AiImportSettingsActionState,
  formData: FormData
): Promise<AiImportSettingsActionState>;
export async function saveAiImportSettingsAction(arg1: AiImportSettingsActionState | FormData, arg2?: FormData) {
  const formData = arg2 ?? arg1;
  const enabled = formData instanceof FormData ? formData.get("enabled") === "on" : false;
  try {
    await assertSameOrigin();
    const session = await requireAdmin();
    if (!(formData instanceof FormData)) {
      throw new Error("Invalid AI import settings submission.");
    }
    const parsed = aiImportSettingsSchema.parse({ enabled });

    await saveAiImportSettings({
      enabled: parsed.enabled,
      updatedBy: session.username
    });
    logServerEvent("info", "ai_import_settings_saved", { enabled: parsed.enabled, updatedBy: session.username });
    revalidatePath("/admin");
    revalidatePath("/admin/ai-import");
    revalidatePath("/demo");
    return { status: "saved" as const, enabled: parsed.enabled, saveId: crypto.randomUUID() };
  } catch (error) {
    logServerEvent("error", "ai_import_settings_save_failed", { enabled, error: serializeError(error) });
    return {
      status: "idle" as const,
      enabled,
      saveId: "",
      error: error instanceof Error ? error.message : "Unable to save AI import settings."
    };
  }
}

export async function saveDemoSettingsAction(formData: FormData): Promise<AiImportSettingsActionState>;
export async function saveDemoSettingsAction(
  _previousState: AiImportSettingsActionState,
  formData: FormData
): Promise<AiImportSettingsActionState>;
export async function saveDemoSettingsAction(arg1: AiImportSettingsActionState | FormData, arg2?: FormData) {
  const formData = arg2 ?? arg1;
  const enabled = formData instanceof FormData ? formData.get("enabled") === "on" : false;
  try {
    await assertSameOrigin();
    const session = await requireAdmin();
    if (!(formData instanceof FormData)) {
      throw new Error("Invalid demo settings submission.");
    }
    const parsed = demoSettingsSchema.parse({ enabled });

    await saveDemoSettings({
      enabled: parsed.enabled,
      updatedBy: session.username
    });
    logServerEvent("info", "demo_settings_saved", { enabled: parsed.enabled, updatedBy: session.username });
    revalidatePath("/admin");
    revalidatePath("/demo");
    revalidatePath("/dashboard");
    return { status: "saved" as const, enabled: parsed.enabled, saveId: crypto.randomUUID() };
  } catch (error) {
    logServerEvent("error", "demo_settings_save_failed", { enabled, error: serializeError(error) });
    return {
      status: "idle" as const,
      enabled,
      saveId: "",
      error: error instanceof Error ? error.message : "Unable to save demo settings."
    };
  }
}

export async function acceptAiImportAction(
  _previousState: AcceptAiImportActionState | null,
  formData: FormData
): Promise<AcceptAiImportActionState>;
export async function acceptAiImportAction(formData: FormData): Promise<AcceptAiImportActionState>;
export async function acceptAiImportAction(arg1: AcceptAiImportActionState | FormData | null, arg2?: FormData) {
  await assertSameOrigin();
  const session = await requireAdminOrOperator();
  const formData = arg2 ?? arg1;
  if (!(formData instanceof FormData)) {
    throw new Error("Invalid AI import submission.");
  }
  const batch = aiImportBatchSchema.parse(JSON.parse(String(formData.get("draft") || "{}"))) as AiImportBatch;

  const existingRun = await findAiImportRunByFingerprint(batch.sourceFingerprint);
  if (existingRun?.status === "applied") {
    logServerEvent("warn", "ai_import_duplicate_batch_reapplied", {
      sourceFingerprint: batch.sourceFingerprint,
      sourceName: batch.sourceName
    });
  }

  const run = await createAiImportRun({
    sourceName: batch.sourceName,
    sourceType: batch.sourceType,
    sourceFingerprint: batch.sourceFingerprint,
    settingsId: "active",
    createdBy: session.username
  });

  let savedCount = 0;
  let skippedCount = 0;

  for (const draft of batch.drafts) {
    if (draft.selected === false) {
      skippedCount += 1;
      continue;
    }

    const institution =
      (await findInstitutionByName(draft.institutionName)) ||
      (await findInstitutionByLooseName(draft.institutionName)) ||
      (await upsertInstitution({ name: draft.institutionName }));
    const account =
      (await findAccountByKey({
        institutionId: institution.id,
        name: draft.accountName,
        type: draft.accountType
      })) ||
      (await findAccountByLooseKey({
        institutionId: institution.id,
        name: draft.accountName,
        type: draft.accountType
      })) ||
      (await upsertAccount({
        institutionId: institution.id,
        name: draft.accountName,
        type: draft.accountType
      }));

    const existingRecord = await findMonthlyRecordByAccountMonth(account.id, draft.month);
    if (existingRecord) {
      skippedCount += 1;
      logServerEvent("info", "ai_import_monthly_record_skipped_duplicate", {
        accountId: account.id,
        accountName: account.name,
        month: draft.month,
        sourceFingerprint: draft.sourceFingerprint
      });
      continue;
    }

    await upsertMonthlyRecord({
      institutionId: institution.id,
      accountId: account.id,
      month: draft.month,
      amountInvested: draft.amountInvested,
      currentValue: draft.currentValue,
      currencyCode: draft.currencyCode,
      sourceFingerprint: draft.sourceFingerprint
    });
    savedCount += 1;
  }

  await saveAiImportRun({
    ...run,
    status: "applied",
    draft: batch,
    updatedAt: new Date().toISOString()
  });

  revalidatePath("/admin");
  revalidatePath("/admin/ai-import");
  revalidatePath("/dashboard");
  revalidatePath("/drill");

  logServerEvent("info", "ai_import_batch_applied", {
    sourceFingerprint: batch.sourceFingerprint,
    sourceName: batch.sourceName,
    savedCount,
    skippedCount,
    createdBy: session.username
  });

  return {
    status: "saved" as const,
    sourceFingerprint: batch.sourceFingerprint,
    saveId: crypto.randomUUID(),
    savedCount,
    skippedCount
  };
}

function stringOrUndefined(value: FormDataEntryValue | null) {
  const stringValue = String(value || "");
  return stringValue.length > 0 ? stringValue : undefined;
}

async function assertSameOrigin() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const host = headerStore.get("host");
  if (!origin || !host) return;

  const parsed = new URL(origin);
  if (parsed.host !== host) {
    throw new Error("Cross-origin form submissions are not allowed.");
  }
}

function safeNextPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  try {
    const parsed = new URL(value, "http://local.invalid");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}
