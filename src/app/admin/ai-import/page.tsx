import { Bot } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminOrOperator } from "@/lib/auth";
import { getAiImportSettings } from "@/lib/elasticsearch";
import { getAiRuntimeConfig } from "@/lib/ai-config";
import { getInitialSidebarCollapsed } from "@/lib/sidebar";
import { AiImportWorkbench } from "@/components/ai-import-workbench";

export default async function AiImportPage() {
  const [session, initialSidebarCollapsed, settings] = await Promise.all([
    requireAdminOrOperator(),
    getInitialSidebarCollapsed(),
    getAiImportSettings()
  ]);
  const runtimeConfig = getAiRuntimeConfig();

  return (
    <AppShell
      session={session}
      initialSidebarCollapsed={initialSidebarCollapsed}
      aiImportEnabled={settings.enabled}
      demoEnabled={settings.demoEnabled}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Bot />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-normal">AI import</h1>
          <p className="text-sm text-muted-foreground">
            Upload a statement or spreadsheet export, watch the model split the accounts into review rows, and accept the rows you want to save.
          </p>
        </div>
      </div>

      {!settings.enabled ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-amber-700 dark:text-amber-300">
            AI import is disabled globally. Enable it in the settings panel below to allow statement analysis.
          </CardContent>
        </Card>
      ) : null}

      <AiImportWorkbench settings={settings} runtimeConfig={runtimeConfig} />
    </AppShell>
  );
}
