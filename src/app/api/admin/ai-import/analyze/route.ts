import { NextRequest } from "next/server";

import { getAiRuntimeCredentials } from "@/lib/ai-config";
import { getSession } from "@/lib/auth";
import { analyzeInvestmentStatement } from "@/lib/ai-import";
import { getAiImportSettings } from "@/lib/elasticsearch";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "operator")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getAiImportSettings();
  if (!settings.enabled) {
    return Response.json({ error: "AI import is disabled by an administrator." }, { status: 409 });
  }
  const runtimeConfig = getAiRuntimeCredentials();
  if (!runtimeConfig.apiKey) {
    return Response.json({ error: "AI provider credentials are not configured in env." }, { status: 409 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a PDF, image, or spreadsheet export before analyzing." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(type: "step" | "draft" | "error", payload: unknown) {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
      }

      try {
        const draft = await analyzeInvestmentStatement({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          bytes,
          config: runtimeConfig,
          onStep(step) {
            send("step", step);
          }
        });
        send("draft", draft);
        controller.close();
      } catch (error) {
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
