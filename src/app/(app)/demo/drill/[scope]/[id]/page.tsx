import { notFound, redirect } from "next/navigation";

import { DrilldownView } from "@/components/drilldown-view";
import { buildDrilldownData } from "@/lib/dashboard";
import { getDemoCollections } from "@/lib/demo-data";
import { getAiImportSettings } from "@/lib/elasticsearch";
import type { DrilldownScope } from "@/lib/types";

export default async function DemoDrilldownPage({
  params
}: {
  params: Promise<{ scope: string; id: string }>;
}) {
  const aiImportSettings = await getAiImportSettings();
  if (!aiImportSettings.demoEnabled) {
    redirect("/dashboard");
  }

  const { scope, id } = await params;
  if (!isScope(scope)) notFound();

  const { institutions, accounts, records } = getDemoCollections();
  const data = buildDrilldownData(institutions, accounts, records, scope, decodeURIComponent(id));
  if (!data) notFound();

  return <DrilldownView data={data} backHref="/demo" drilldownBasePath="/demo/drill" />;
}

function isScope(scope: string): scope is DrilldownScope {
  return scope === "institution" || scope === "type" || scope === "account";
}
