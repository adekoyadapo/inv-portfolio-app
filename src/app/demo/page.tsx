import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard-view";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getDemoDashboardData } from "@/lib/demo-data";
import { getAiImportSettings } from "@/lib/elasticsearch";
import { getInitialSidebarCollapsed } from "@/lib/sidebar";

export default async function DemoPage() {
  const [session, initialSidebarCollapsed, aiImportSettings] = await Promise.all([
    getSession(),
    getInitialSidebarCollapsed(),
    getAiImportSettings()
  ]);
  const data = getDemoDashboardData();

  return (
    <AppShell session={session} initialSidebarCollapsed={initialSidebarCollapsed} aiImportEnabled={aiImportSettings.enabled}>
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Demo data is generated in-memory and does not write to Elasticsearch or object storage.
        </CardContent>
      </Card>
      <DashboardView
        data={data}
        title="Demo investment dashboard"
        description="A populated sample portfolio across institutions, accounts, and twelve months of records."
        drilldownBasePath="/demo/drill"
      />
    </AppShell>
  );
}
