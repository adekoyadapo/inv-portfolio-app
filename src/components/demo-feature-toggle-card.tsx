import { Sparkles } from "lucide-react";

import { FeatureToggleCard } from "@/components/feature-toggle-card";

export function DemoFeatureToggleCard({ enabled }: { enabled: boolean }) {
  return (
    <FeatureToggleCard
      title="Demo portal"
      description="Control whether the generated demo portfolio is visible to non-admin users."
      enabled={enabled}
      label="Enable demo portal for users"
      settingKey="demo"
      icon={<Sparkles data-icon="inline-start" />}
      refreshTitle="Demo portal updated"
      refreshDescription="The demo visibility setting is saved. Refresh the UI so navigation and route access reflect the new state."
    >
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        Demo data is generated in memory and never writes to Elasticsearch or object storage.
      </div>
    </FeatureToggleCard>
  );
}
