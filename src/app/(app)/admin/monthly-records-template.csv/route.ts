import { monthlyRecordCsvTemplate } from "@/lib/csv";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

  return new Response(monthlyRecordCsvTemplate, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="monthly-records-template.csv"',
      "Cache-Control": "no-store"
    }
  });
}
