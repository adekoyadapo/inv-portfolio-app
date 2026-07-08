import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard-view";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { buildDashboardData } from "@/lib/dashboard";
import { listAccounts, listInstitutions, listMonthlyRecords } from "@/lib/elasticsearch";
import { getInitialSidebarCollapsed } from "@/lib/sidebar";
import { getAiImportSettings } from "@/lib/elasticsearch";

export default async function DashboardPage() {
  const [session, initialSidebarCollapsed, aiImportSettings] = await Promise.all([
    getSession(),
    getInitialSidebarCollapsed(),
    getAiImportSettings()
  ]);

  let data;
  let loadError = "";
  try {
    data = buildDashboardData(await listInstitutions(), await listAccounts(), await listMonthlyRecords());
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load dashboard data.";
    data = buildDashboardData([], [], []);
  }

  return (
    <AppShell
      session={session}
      initialSidebarCollapsed={initialSidebarCollapsed}
      aiImportEnabled={aiImportSettings.enabled}
      demoEnabled={aiImportSettings.demoEnabled}
    >
      {!session && !loadError ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            You are viewing the live dashboard in read-only mode. Sign in to access admin tools.
          </CardContent>
        </Card>
      ) : null}
      <DashboardView data={data} loadError={loadError} />
    </AppShell>
  );
}
