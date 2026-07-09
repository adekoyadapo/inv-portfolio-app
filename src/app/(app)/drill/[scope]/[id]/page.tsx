import { notFound } from "next/navigation";

import { DrilldownView } from "@/components/drilldown-view";
import { buildDrilldownData } from "@/lib/dashboard";
import { listAccounts, listInstitutions, listMonthlyRecords } from "@/lib/elasticsearch";
import { withMinDuration } from "@/lib/timing";
import type { DrilldownScope } from "@/lib/types";

export default async function LiveDrilldownPage({
  params
}: {
  params: Promise<{ scope: string; id: string }>;
}) {
  const data = await withMinDuration(async () => {
    const { scope, id } = await params;
    if (!isScope(scope)) notFound();

    const [institutions, accounts, records] = await Promise.all([listInstitutions(), listAccounts(), listMonthlyRecords()]);
    const data = buildDrilldownData(institutions, accounts, records, scope, decodeURIComponent(id));
    if (!data) notFound();

    return data;
  }, 2000);

  return <DrilldownView data={data} backHref="/dashboard" drilldownBasePath="/drill" />;
}

function isScope(scope: string): scope is DrilldownScope {
  return scope === "institution" || scope === "type" || scope === "account";
}
