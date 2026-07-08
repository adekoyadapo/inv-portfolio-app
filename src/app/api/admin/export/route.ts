import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { getSession } from "@/lib/auth";
import { buildDataExport } from "@/lib/elasticsearch";
import { logServerEvent, serializeError } from "@/lib/logger";
import type { DataExportDump, DataExportScope } from "@/lib/types";

type ExportFormat = "json" | "xlsx";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const scopeParam = request.nextUrl.searchParams.get("scope");
  const scope: DataExportScope = scopeParam === "full" ? "full" : "portfolio";
  const formatParam = request.nextUrl.searchParams.get("format");
  const format: ExportFormat = formatParam === "xlsx" ? "xlsx" : "json";

  try {
    const dump = await buildDataExport(scope);
    logServerEvent("info", "data_export_completed", {
      username: session.username,
      scope,
      format,
      institutionCount: dump.data.institutions.length,
      accountCount: dump.data.accounts.length,
      monthlyRecordCount: dump.data.monthlyRecords.length,
      userCount: dump.data.users?.length ?? 0
    });

    const datePart = dump.exportedAt.slice(0, 10);
    if (format === "xlsx") {
      const workbook = buildExportWorkbook(dump);
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="investment-dashboard-export-${scope}-${datePart}.xlsx"`,
          "Cache-Control": "no-store"
        }
      });
    }

    return new Response(JSON.stringify(dump, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="investment-dashboard-export-${scope}-${datePart}.json"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    logServerEvent("error", "data_export_failed", { username: session.username, scope, format, error: serializeError(error) });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to export data." }, { status: 500 });
  }
}

function buildExportWorkbook(dump: DataExportDump) {
  const workbook = XLSX.utils.book_new();
  addSheet(workbook, "Institutions", dump.data.institutions);
  addSheet(workbook, "Accounts", dump.data.accounts);
  addSheet(workbook, "Monthly Records", dump.data.monthlyRecords);

  if (dump.data.users) {
    addSheet(workbook, "Users", dump.data.users);
  }
  if (dump.data.aiSettings) {
    addSheet(workbook, "AI Settings", dump.data.aiSettings);
  }
  if (dump.data.aiImportRuns) {
    // The "draft" field is a large nested object (the full parsed batch) that doesn't flatten
    // into a spreadsheet cell usefully, so this sheet only carries the run's own metadata.
    addSheet(
      workbook,
      "AI Import Runs",
      dump.data.aiImportRuns.map((run) => ({
        id: run.id,
        status: run.status,
        sourceName: run.sourceName,
        sourceType: run.sourceType,
        sourceFingerprint: run.sourceFingerprint,
        settingsId: run.settingsId,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        createdBy: run.createdBy,
        errorMessage: run.errorMessage
      }))
    );
  }

  return workbook;
}

function addSheet(workbook: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const sheet = rows.length > 0 ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["No data"]]);
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}
