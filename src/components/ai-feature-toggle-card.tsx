import { Bot } from "lucide-react";

import { FeatureToggleCard } from "@/components/feature-toggle-card";
import type { AiRuntimeConfig } from "@/lib/types";

export function AiFeatureToggleCard({
  enabled,
  runtimeConfig
}: {
  enabled: boolean;
  runtimeConfig: AiRuntimeConfig;
}) {
  return (
    <FeatureToggleCard
      title="AI import feature"
      description="Turn the statement importer on or off for everyone. This is admin-only."
      enabled={enabled}
      label="Enable AI import for all users"
      settingKey="aiImport"
      icon={<Bot data-icon="inline-start" />}
      refreshTitle="AI import updated"
      refreshDescription="The new feature flag is saved. Refresh the UI to make sure all panels reflect the updated state."
    >
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Runtime provider</p>
        <p className="text-muted-foreground">
          {runtimeConfig.provider} / {runtimeConfig.model}
        </p>
        <p className="text-xs text-muted-foreground">
          Credentials and base URL come from env: `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`.
        </p>
        <p className="text-xs text-muted-foreground">
          API key status: {runtimeConfig.hasApiKey ? "configured" : "missing"}.
        </p>
      </div>
    </FeatureToggleCard>
  );
}
