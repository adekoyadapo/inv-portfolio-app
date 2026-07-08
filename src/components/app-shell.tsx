"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BarChart3, Building2, FileUp, LogIn, LogOut, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";

import { logoutAction } from "@/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "investment-admin-sidebar";
const SIDEBAR_CHANGE_EVENT = "investment-admin-sidebar-change";
const SIDEBAR_COOKIE_NAME = "investment_admin_sidebar";

function subscribeToSidebar(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, callback);
  };
}

function getSidebarSnapshot() {
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
}

function getServerSidebarSnapshot() {
  return false;
}

function setSidebarCookie(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
}

function setSidebarCollapsedPreference(collapsed: boolean) {
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  setSidebarCookie(collapsed);
  window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
}

export function AppShell({
  children,
  session,
  initialSidebarCollapsed = false,
  aiImportEnabled = false,
  demoEnabled = false
}: {
  children: React.ReactNode;
  session?: { username: string; role: UserRole } | null;
  initialSidebarCollapsed?: boolean;
  aiImportEnabled?: boolean;
  demoEnabled?: boolean;
}) {
  const isAdmin = session?.role === "admin";
  const isOperator = session?.role === "operator";
  const isUserManager = session?.role === "user_manager";
  const canOpenAdmin = isAdmin || isOperator || isUserManager;
  const canOpenAiImport = aiImportEnabled && (isAdmin || isOperator);
  const canSeeDashboard = isAdmin || !demoEnabled;
  const pathname = usePathname();
  const isDemoRoute = pathname?.startsWith("/demo") ?? false;
  const [isNavigating, setIsNavigating] = useState(false);
  const collapsed = useSyncExternalStore(
    subscribeToSidebar,
    getSidebarSnapshot,
    () => initialSidebarCollapsed || getServerSidebarSnapshot()
  );

  function toggleCollapsed() {
    setSidebarCollapsedPreference(!collapsed);
  }

  useEffect(() => {
    setSidebarCookie(collapsed);
  }, [collapsed]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsNavigating(false), 80);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  function markNavigation(href: string) {
    if (href !== pathname) setIsNavigating(true);
  }

  const homeHref = isDemoRoute || !canSeeDashboard ? "/demo" : "/dashboard";

  const navItems = isDemoRoute
    ? [{ href: "/demo", label: "Demo", icon: Sparkles }]
    : [
        ...(canSeeDashboard ? [{ href: "/dashboard", label: "Dashboard", icon: BarChart3 }] : []),
        ...(demoEnabled ? [{ href: "/demo", label: "Demo", icon: Sparkles }] : []),
        ...(canOpenAdmin ? [{ href: "/admin", label: "Admin", icon: Building2 }] : []),
        ...(canOpenAiImport ? [{ href: "/admin/ai-import", label: "Smart Import", icon: FileUp }] : [])
      ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--muted))_0,transparent_28rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.45))] pb-20 md:pb-0">
      {isNavigating ? (
        <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-primary/15">
          <div className="route-progress-bar h-full w-1/2 bg-primary" />
        </div>
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r bg-background/92 p-4 shadow-[12px_0_40px_-32px_rgba(15,23,42,0.55)] backdrop-blur transition-[width] duration-200 md:flex md:flex-col",
          collapsed ? "w-20" : "w-64"
        )}
        data-collapsed={collapsed}
      >
        <div className={cn("flex items-center gap-3 py-3", collapsed ? "justify-center px-0" : "px-2")}>
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BarChart3 />
          </div>
          <div className={cn("min-w-0", collapsed && "sr-only")}>
            <p className="text-sm font-semibold">Investment Admin</p>
            <p className="text-xs text-muted-foreground">Monitoring dashboard</p>
          </div>
        </div>
        <Separator className="my-4" />
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              pathname?.startsWith(`${item.href}/`) ||
              (item.href === "/dashboard" && pathname?.startsWith("/drill/"));

            return (
              <Button
                key={item.href}
                asChild
                variant={active ? "secondary" : "ghost"}
                size={collapsed ? "icon" : "default"}
            className={cn("relative w-full rounded-full", collapsed ? "group justify-center" : "justify-start")}
              >
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  onClick={() => markNavigation(item.href)}
                >
                  <Icon data-icon={collapsed ? undefined : "inline-start"} />
                  <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
                  {collapsed ? <SidebarTooltip label={item.label} /> : null}
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className={cn("mt-auto flex gap-2", collapsed ? "flex-col items-center" : "items-center")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
            className="group relative"
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {collapsed ? <SidebarTooltip label="Expand" /> : null}
          </Button>
          <div className={collapsed ? "group relative" : undefined}>
            <ThemeToggle />
            {collapsed ? <SidebarTooltip label="Theme" /> : null}
          </div>
          {session ? (
            <form action={logoutAction} className={collapsed ? undefined : "flex-1"}>
              <Button
                type="submit"
                variant="outline"
                size={collapsed ? "icon" : "default"}
                aria-label={collapsed ? "Sign out" : undefined}
                title={collapsed ? "Sign out" : undefined}
                className={cn(collapsed ? "group relative" : "w-full")}
              >
                <LogOut data-icon={collapsed ? undefined : "inline-start"} />
                <span className={collapsed ? "sr-only" : undefined}>Sign out</span>
                {collapsed ? <SidebarTooltip label="Sign out" /> : null}
              </Button>
            </form>
          ) : (
            <Button
              asChild
              variant="outline"
              size={collapsed ? "icon" : "default"}
              className={collapsed ? undefined : "flex-1"}
            >
              <Link
                href="/login"
                aria-label={collapsed ? "Sign in" : undefined}
                title={collapsed ? "Sign in" : undefined}
                className={collapsed ? "group relative" : undefined}
              >
                <LogIn data-icon={collapsed ? undefined : "inline-start"} />
                <span className={collapsed ? "sr-only" : undefined}>Sign in</span>
                {collapsed ? <SidebarTooltip label="Sign in" /> : null}
              </Link>
            </Button>
          )}
        </div>
      </aside>
      <div className={cn("transition-[padding] duration-200", collapsed ? "md:pl-20" : "md:pl-64")}>
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <Link
            href={homeHref}
            className="text-sm font-semibold"
            onClick={() => markNavigation(homeHref)}
          >
            Investment Admin
          </Link>
          <div className="flex items-center gap-2">
            {!isDemoRoute && canOpenAdmin ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin" onClick={() => markNavigation("/admin")}>Admin</Link>
              </Button>
            ) : null}
            {!isDemoRoute && canOpenAiImport ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/ai-import" onClick={() => markNavigation("/admin/ai-import")}>Smart Import</Link>
              </Button>
            ) : null}
            <ThemeToggle />
          </div>
        </header>
        <main className="page-transition mx-auto flex w-full max-w-[1680px] flex-col gap-6 p-4 md:p-8">{children}</main>
        <nav className="fixed inset-x-3 bottom-3 z-20 flex items-center justify-around rounded-full border bg-background/95 p-2 shadow-[0_18px_44px_-24px_rgba(15,23,42,0.55)] backdrop-blur md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              pathname?.startsWith(`${item.href}/`) ||
              (item.href === "/dashboard" && pathname?.startsWith("/drill/"));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                onClick={() => markNavigation(item.href)}
                className={cn(
                  "flex min-w-14 flex-col items-center gap-1 rounded-full px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors",
                  active && "bg-primary text-primary-foreground"
                )}
              >
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function SidebarTooltip({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}
