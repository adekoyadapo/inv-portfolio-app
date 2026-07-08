import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DrilldownView } from "@/components/drilldown-view";
import { getSession } from "@/lib/auth";
import { buildDrilldownData } from "@/lib/dashboard";
import { listAccounts, listInstitutions, listMonthlyRecords } from "@/lib/elasticsearch";
import { getAiImportSettings } from "@/lib/elasticsearch";
import { getInitialSidebarCollapsed } from "@/lib/sidebar";
import type { DrilldownScope } from "@/lib/types";

export default async function LiveDrilldownPage({
  params
}: {
  params: Promise<{ scope: string; id: string }>;
}) {
  const [session, initialSidebarCollapsed, aiImportSettings] = await Promise.all([
    getSession(),
    getInitialSidebarCollapsed(),
    getAiImportSettings()
  ]);
  const { scope, id } = await params;
  if (!isScope(scope)) notFound();

  const [institutions, accounts, records] = await Promise.all([listInstitutions(), listAccounts(), listMonthlyRecords()]);
  const data = buildDrilldownData(institutions, accounts, records, scope, decodeURIComponent(id));
  if (!data) notFound();

  return (
    <AppShell session={session} initialSidebarCollapsed={initialSidebarCollapsed} aiImportEnabled={aiImportSettings.enabled}>
      <DrilldownView data={data} backHref="/dashboard" drilldownBasePath="/drill" />
    </AppShell>
  );
}

function isScope(scope: string): scope is DrilldownScope {
  return scope === "institution" || scope === "type" || scope === "account";
}
