import { NextRequest } from "next/server";

import { acceptAiImportAction } from "@/app/actions";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "operator")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: { draft?: unknown };
  try {
    payload = (await request.json()) as { draft?: unknown };
  } catch {
    return Response.json({ error: "Invalid import payload." }, { status: 400 });
  }

  if (!payload?.draft) {
    return Response.json({ error: "Missing import draft." }, { status: 400 });
  }

  const formData = new FormData();
  formData.set("draft", JSON.stringify(payload.draft));

  try {
    const result = await acceptAiImportAction(null, formData);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save the import." },
      { status: 400 }
    );
  }
}
