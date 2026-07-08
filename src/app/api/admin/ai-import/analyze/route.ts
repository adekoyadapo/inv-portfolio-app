import { NextRequest } from "next/server";

import { getAiRuntimeCredentials } from "@/lib/ai-config";
import { getSession } from "@/lib/auth";
import { analyzeInvestmentStatements, fileProgressId } from "@/lib/ai-import";
import { getAiImportSettings } from "@/lib/elasticsearch";
import { logServerEvent, serializeError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "operator")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getAiImportSettings();
  if (!settings.enabled) {
    return Response.json({ error: "Smart Import is disabled by an administrator." }, { status: 409 });
  }
  const runtimeConfig = getAiRuntimeCredentials();
  if (!runtimeConfig.apiKey) {
    return Response.json({ error: "AI provider credentials are not configured in env." }, { status: 409 });
  }

  const formData = await request.formData();
  const files = formData.getAll("file").filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length === 0) {
    return Response.json({ error: "Choose one or more PDF, image, or spreadsheet exports before analyzing." }, { status: 400 });
  }

  const uploads = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
      config: runtimeConfig
    }))
  );
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(type: "step" | "file" | "draft" | "error", payload: unknown) {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
      }

      try {
        uploads.forEach((upload, index) => {
          send("file", {
            id: fileProgressId(upload.fileName, index),
            fileName: upload.fileName,
            bytes: upload.bytes.length,
            status: "pending",
            detail: "Queued for analysis.",
            progress: 8
          });
        });
        logServerEvent("info", "ai_import_analyze_started", {
          username: session.username,
          fileCount: uploads.length,
          files: uploads.map((upload) => ({ fileName: upload.fileName, bytes: upload.bytes.length, mimeType: upload.mimeType })),
          provider: runtimeConfig.provider,
          model: runtimeConfig.model
        });
        const draft = await analyzeInvestmentStatements(
          uploads.map((upload) => ({
            ...upload,
            onStep(step) {
              send("step", step);
            },
            onFile(file) {
              send("file", file);
            }
          }))
        );
        logServerEvent("info", "ai_import_analyze_completed", {
          username: session.username,
          sourceFingerprint: draft.sourceFingerprint,
          draftCount: draft.drafts.length
        });
        send("draft", draft);
        controller.close();
      } catch (error) {
        logServerEvent("error", "ai_import_analyze_failed", {
          username: session.username,
          fileCount: uploads.length,
          error: serializeError(error)
        });
        uploads.forEach((upload, index) => {
          send("file", {
            id: fileProgressId(upload.fileName, index),
            fileName: upload.fileName,
            bytes: upload.bytes.length,
            status: "error",
            detail: error instanceof Error ? error.message : "Unable to analyze this file.",
            progress: 100
          });
        });
        send("error", { message: error instanceof Error ? error.message : "Unable to analyze the upload." });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
