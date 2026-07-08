import Link from "next/link";
import { AlertCircle, ArrowDownRight, ArrowUpRight, DollarSign, Info, Landmark, TrendingUp } from "lucide-react";

import { AllocationDonutChart, InstitutionBreakdownChart, MetricSparkline, PortfolioTimelineChart } from "@/components/dashboard-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LatestAccountValuesTable } from "@/components/latest-account-values-table";
import type { DashboardData } from "@/lib/types";
import { cn, currency, percent } from "@/lib/utils";

export function DashboardView({
  data,
  loadError,
  title = "Investment overview",
  description = "Month-end monitoring across institutions, registered accounts, and investment accounts.",
  drilldownBasePath = "/drill"
}: {
  data: DashboardData;
  loadError?: string;
  title?: string;
  description?: string;
  drilldownBasePath?: string;
}) {
  const gainPositive = data.totals.gainLoss >= 0;
  const momPositive = data.totals.momDelta >= 0;
  const displayCurrencyCode = data.accountSnapshots.find((snapshot) => snapshot.latest?.currencyCode)?.latest?.currencyCode || "USD";
  const investedSparkline = data.timeline.map((point) => ({ value: point.invested }));
  const currentValueSparkline = data.timeline.map((point) => ({ value: point.currentValue }));
  const gainSparkline = data.timeline.map((point) => ({ value: point.currentValue - point.invested }));
  const momSparkline = data.timeline.map((point, index) => ({
    value: index === 0 ? 0 : point.currentValue - data.timeline[index - 1].currentValue
  }));

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border bg-background/80 p-5 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.55)] backdrop-blur sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">{title}</h1>
            <InfoTip text="Portfolio summary, allocation mix, drill-down views, and the latest account records." />
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:min-w-56">
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p>Accounts</p>
            <p className="text-lg font-semibold text-foreground">{data.accounts.length}</p>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p>Institutions</p>
            <p className="text-lg font-semibold text-foreground">{data.institutions.length}</p>
          </div>
        </div>
      </div>

      {loadError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
            <AlertCircle />
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Current value"
          value={currency(data.totals.currentValue, displayCurrencyCode)}
          icon={<DollarSign />}
          sparkline={currentValueSparkline}
          tone="positive"
        />
        <MetricCard
          title="Amount invested"
          value={currency(data.totals.invested, displayCurrencyCode)}
          icon={<Landmark />}
          sparkline={investedSparkline}
          tone="neutral"
        />
        <MetricCard
          title="Gain / loss"
          value={currency(data.totals.gainLoss, displayCurrencyCode)}
          detail={percent(data.totals.gainLossPercent)}
          icon={gainPositive ? <ArrowUpRight /> : <ArrowDownRight />}
          tone={gainPositive ? "positive" : "negative"}
          sparkline={gainSparkline}
        />
        <MetricCard
          title="MoM change"
          value={currency(data.totals.momDelta, displayCurrencyCode)}
          icon={momPositive ? <TrendingUp /> : <ArrowDownRight />}
          tone={momPositive ? "positive" : "negative"}
          sparkline={momSparkline}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_22px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
          <CardHeader>
            <CardTitle>Portfolio value over time</CardTitle>
            <CardDescription>Invested amount compared with month-end current value using filled area series.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.timeline.length > 0 ? (
              <PortfolioTimelineChart data={data.timeline} />
            ) : (
              <EmptyPanel message="Add monthly records to see the portfolio trend area." />
            )}
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_22px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
          <CardHeader>
            <CardTitle>Institution breakdown</CardTitle>
            <CardDescription>Latest account values grouped by institution.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.institutionBreakdown.length > 0 ? (
              <InstitutionBreakdownChart data={data.institutionBreakdown} />
            ) : (
              <EmptyPanel message="Add institutions and account records to see a breakdown." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_22px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
          <CardHeader>
            <CardTitle>Explore institutions</CardTitle>
            <CardDescription>Open a focused view for institution-level MoM movement and account mix.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {data.institutionBreakdown.length > 0 ? (
              data.institutionBreakdown.map((institution) => (
                <DrilldownTile
                  key={institution.name}
                  href={`${drilldownBasePath}/institution/${encodeURIComponent(institution.id || institution.name)}`}
                  label={institution.name}
                  value={institution.currentValue}
                  invested={institution.invested}
                  currencyCode={displayCurrencyCode}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No institution values yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_22px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
          <CardHeader>
            <CardTitle>Explore account types</CardTitle>
            <CardDescription>Compare TFSA, RRSP, RESP, stock, index, and cash groups.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {data.typeBreakdown.length > 0 ? (
              data.typeBreakdown.map((type) => (
                <DrilldownTile
                  key={type.type}
                  href={`${drilldownBasePath}/type/${encodeURIComponent(type.type)}`}
                  label={type.type}
                  value={type.currentValue}
                  invested={type.invested}
                  currencyCode={displayCurrencyCode}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No account type values yet.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Allocation by type</CardTitle>
            <CardDescription>Latest current value grouped by account type.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.typeBreakdown.length > 0 ? (
              <AllocationDonutChart data={data.typeBreakdown} nameKey="type" />
            ) : (
              <EmptyPanel message="Add account records to see allocation by type." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account drill-down</CardTitle>
            <CardDescription>Open an individual account for its own month-over-month history.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {data.accountSnapshots.length > 0 ? (
              data.accountSnapshots.map((snapshot) => (
                <DrilldownTile
                  key={snapshot.account.id}
                  href={`${drilldownBasePath}/account/${encodeURIComponent(snapshot.account.id)}`}
                  label={snapshot.account.name}
                  eyebrow={`${snapshot.institution.name} / ${snapshot.account.type}`}
                  value={snapshot.latest?.currentValue || 0}
                  invested={snapshot.latest?.amountInvested || 0}
                  currencyCode={snapshot.latest?.currencyCode || displayCurrencyCode}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No accounts yet.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_22px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
        <CardHeader>
          <CardTitle>Latest account values</CardTitle>
          <CardDescription>Most recent month-end record for each account.</CardDescription>
        </CardHeader>
        <CardContent>
          <LatestAccountValuesTable data={data} drilldownBasePath={drilldownBasePath} />
        </CardContent>
      </Card>
    </>
  );
}

function DrilldownTile({
  href,
  label,
  eyebrow,
  value,
  invested,
  currencyCode
}: {
  href: string;
  label: string;
  eyebrow?: string;
  value: number;
  invested: number;
  currencyCode: string;
}) {
  const gain = value - invested;
  return (
    <Link
      href={href}
      className="flex min-h-24 cursor-pointer flex-col justify-between rounded-lg border border-border/70 bg-background/90 p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent hover:text-accent-foreground hover:shadow-[0_24px_48px_-28px_rgba(15,23,42,0.5)]"
    >
      <div className="flex flex-col gap-1">
        {eyebrow ? <p className="text-xs text-muted-foreground">{eyebrow}</p> : null}
        <p className="text-sm font-medium">{label}</p>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-lg font-semibold tracking-normal">{currency(value, currencyCode)}</p>
        <p className={gain >= 0 ? "text-xs text-emerald-600" : "text-xs text-destructive"}>{currency(gain, currencyCode)}</p>
      </div>
    </Link>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  tone = "neutral",
  sparkline
}: {
  title: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  tone?: "neutral" | "positive" | "negative";
  sparkline: Array<{ value: number }>;
}) {
  const toneClass =
    tone === "positive"
      ? "from-emerald-500/16 to-background"
      : tone === "negative"
        ? "from-destructive/14 to-background"
        : "from-teal-500/14 to-background";
  return (
    <Card className="group overflow-hidden border-border/70 bg-background shadow-[0_22px_55px_-36px_rgba(15,23,42,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_30px_70px_-40px_rgba(15,23,42,0.6)]">
      <CardContent className={cn("flex min-h-44 flex-col justify-between bg-gradient-to-br p-5", toneClass)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold tracking-normal sm:text-3xl">{value}</p>
          </div>
          <div
            className={
              tone === "positive"
                ? "flex size-11 items-center justify-center rounded-full border bg-emerald-500/10 text-emerald-600 shadow-inner"
                : tone === "negative"
                  ? "flex size-11 items-center justify-center rounded-full border bg-destructive/10 text-destructive shadow-inner"
                  : "flex size-11 items-center justify-center rounded-full border bg-teal-500/10 text-teal-600 shadow-inner"
            }
          >
            {icon}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
            <p className="text-xs text-muted-foreground">Monthly movement</p>
          </div>
          <MetricSparkline
            data={sparkline}
            stroke={tone === "positive" ? "#22c55e" : tone === "negative" ? "#ef4444" : "#14b8a6"}
            fill={tone === "positive" ? "#22c55e" : tone === "negative" ? "#ef4444" : "#14b8a6"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="flex h-80 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">{message}</div>;
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" className="inline-flex size-6 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label={text}>
        <Info className="size-3.5" />
      </button>
      <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 w-64 -translate-y-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}
