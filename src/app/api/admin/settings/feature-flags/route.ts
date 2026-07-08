import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { saveAiImportSettings, saveDemoSettings } from "@/lib/elasticsearch";
import { logServerEvent, serializeError } from "@/lib/logger";

const featureFlagSchema = z.object({
  key: z.enum(["aiImport", "demo"]),
  enabled: z.boolean()
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const parsed = featureFlagSchema.parse(await request.json());

    if (parsed.key === "aiImport") {
      await saveAiImportSettings({
        enabled: parsed.enabled,
        updatedBy: session.username
      });
      revalidatePath("/admin");
      revalidatePath("/admin/ai-import");
      revalidatePath("/dashboard");
    } else {
      await saveDemoSettings({
        enabled: parsed.enabled,
        updatedBy: session.username
      });
      revalidatePath("/admin");
      revalidatePath("/demo");
      revalidatePath("/dashboard");
    }

    logServerEvent("info", "feature_flag_saved", {
      key: parsed.key,
      enabled: parsed.enabled,
      updatedBy: session.username
    });

    return Response.json({
      status: "saved",
      enabled: parsed.enabled,
      saveId: crypto.randomUUID()
    });
  } catch (error) {
    logServerEvent("error", "feature_flag_save_failed", { error: serializeError(error) });
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save feature flag." },
      { status: 400 }
    );
  }
}
