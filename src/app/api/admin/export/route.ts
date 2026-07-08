import { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { buildDataExport } from "@/lib/elasticsearch";
import { logServerEvent, serializeError } from "@/lib/logger";
import type { DataExportScope } from "@/lib/types";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const scopeParam = request.nextUrl.searchParams.get("scope");
  const scope: DataExportScope = scopeParam === "full" ? "full" : "portfolio";

  try {
    const dump = await buildDataExport(scope);
    logServerEvent("info", "data_export_completed", {
      username: session.username,
      scope,
      institutionCount: dump.data.institutions.length,
      accountCount: dump.data.accounts.length,
      monthlyRecordCount: dump.data.monthlyRecords.length,
      userCount: dump.data.users?.length ?? 0
    });

    const fileName = `investment-dashboard-export-${scope}-${dump.exportedAt.slice(0, 10)}.json`;
    return new Response(JSON.stringify(dump, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    logServerEvent("error", "data_export_failed", { username: session.username, scope, error: serializeError(error) });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to export data." }, { status: 500 });
  }
}
