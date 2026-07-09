import { redirect } from "next/navigation";

import { DashboardView } from "@/components/dashboard-view";
import { Card, CardContent } from "@/components/ui/card";
import { getDemoDashboardData } from "@/lib/demo-data";
import { getAiImportSettings } from "@/lib/elasticsearch";
import { withMinDuration } from "@/lib/timing";

export default async function DemoPage() {
  const data = await withMinDuration(async () => {
    const aiImportSettings = await getAiImportSettings();
    if (!aiImportSettings.demoEnabled) {
      redirect("/dashboard");
    }

    return getDemoDashboardData();
  }, 2000);

  return (
    <>
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
    </>
  );
}
