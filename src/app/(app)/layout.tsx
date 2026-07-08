import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth";
import { getAiImportSettings } from "@/lib/elasticsearch";
import { getInitialSidebarCollapsed } from "@/lib/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, initialSidebarCollapsed, aiImportSettings] = await Promise.all([
    getSession(),
    getInitialSidebarCollapsed(),
    getAiImportSettings()
  ]);

  return (
    <AppShell
      session={session}
      initialSidebarCollapsed={initialSidebarCollapsed}
      aiImportEnabled={aiImportSettings.enabled}
      demoEnabled={aiImportSettings.demoEnabled}
    >
      {children}
    </AppShell>
  );
}
