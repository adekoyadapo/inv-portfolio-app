import { NextRequest } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { importDataDump } from "@/lib/elasticsearch";
import { logServerEvent, serializeError } from "@/lib/logger";
import { DATA_EXPORT_VERSION } from "@/lib/types";

const institutionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  logoObjectKey: z.string().optional(),
  logoUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const accountSchema = z.object({
  id: z.string().min(1),
  institutionId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});

const monthlyRecordSchema = z.object({
  id: z.string().min(1),
  institutionId: z.string().min(1),
  accountId: z.string().min(1),
  month: z.string(),
  amountInvested: z.number(),
  currentValue: z.number(),
  currencyCode: z.string().optional(),
  sourceFingerprint: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const userSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  passwordHash: z.string().min(1),
  role: z.enum(["admin", "operator", "user_manager", "viewer"]),
  createdAt: z.string(),
  updatedAt: z.string()
});

const aiSettingsSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  demoEnabled: z.boolean(),
  updatedAt: z.string(),
  updatedBy: z.string()
});

const aiImportRunSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["draft", "reviewed", "applied", "failed"]),
    sourceName: z.string(),
    sourceType: z.enum(["pdf", "image", "text", "spreadsheet"]),
    sourceFingerprint: z.string(),
    settingsId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    createdBy: z.string()
  })
  .passthrough();

const dumpSchema = z.object({
  version: z.number(),
  scope: z.enum(["portfolio", "full"]),
  exportedAt: z.string(),
  data: z.object({
    institutions: z.array(institutionSchema),
    accounts: z.array(accountSchema),
    monthlyRecords: z.array(monthlyRecordSchema),
    users: z.array(userSchema).optional(),
    aiSettings: z.array(aiSettingsSchema).optional(),
    aiImportRuns: z.array(aiImportRunSchema).optional()
  })
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("dump");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose an exported JSON dump file to import." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return Response.json({ error: "That file is not valid JSON." }, { status: 400 });
  }

  const parsed = dumpSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "That file doesn't match the expected export format." }, { status: 400 });
  }

  if (parsed.data.version > DATA_EXPORT_VERSION) {
    return Response.json({ error: "This dump was exported by a newer version of the app and can't be imported here." }, { status: 400 });
  }

  try {
    const summary = await importDataDump(parsed.data);
    logServerEvent("info", "data_import_completed", { username: session.username, scope: parsed.data.scope, summary });
    return Response.json({ status: "imported", summary });
  } catch (error) {
    logServerEvent("error", "data_import_failed", { username: session.username, error: serializeError(error) });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to import data." }, { status: 500 });
  }
}
