import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, DollarSign, Landmark, TrendingUp } from "lucide-react";

import { AccountValueBarChart, AllocationDonutChart, MomDeltaBarChart, PortfolioTimelineChart } from "@/components/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DrilldownData } from "@/lib/types";
import { currency, monthLabel, percent } from "@/lib/utils";

export function DrilldownView({
  data,
  backHref,
  drilldownBasePath
}: {
  data: DrilldownData;
  backHref: string;
  drilldownBasePath: string;
}) {
  const gainPositive = data.totals.gainLoss >= 0;
  const momPositive = data.totals.momDelta >= 0;
  const displayCurrencyCode = data.records.find((record) => record.currencyCode)?.currencyCode || "USD";

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Button asChild variant="ghost" size="sm" className="w-fit px-0">
            <Link href={backHref}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Link>
          </Button>
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary">{data.scope}</Badge>
              <span className="text-sm text-muted-foreground">{data.subtitle}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">{data.label}</h1>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Current value" value={currency(data.totals.currentValue, displayCurrencyCode)} icon={<DollarSign />} />
        <MetricCard title="Amount invested" value={currency(data.totals.invested, displayCurrencyCode)} icon={<Landmark />} />
        <MetricCard
          title="Gain / loss"
          value={currency(data.totals.gainLoss, displayCurrencyCode)}
          detail={percent(data.totals.gainLossPercent)}
          icon={gainPositive ? <ArrowUpRight /> : <ArrowDownRight />}
          tone={gainPositive ? "positive" : "negative"}
        />
        <MetricCard
          title="MoM change"
          value={currency(data.totals.momDelta, displayCurrencyCode)}
          icon={momPositive ? <TrendingUp /> : <ArrowDownRight />}
          tone={momPositive ? "positive" : "negative"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Value trend</CardTitle>
            <CardDescription>Invested amount compared with current value for this selection.</CardDescription>
          </CardHeader>
          <CardContent>
            <PortfolioTimelineChart data={data.timeline} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MoM movement</CardTitle>
            <CardDescription>Month-over-month change in current value.</CardDescription>
          </CardHeader>
          <CardContent>
            <MomDeltaBarChart data={data.momRows} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{data.scope === "type" ? "Institutions" : "Account types"}</CardTitle>
            <CardDescription>Current-value allocation within this drill-down.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.scope === "type" ? (
              <AllocationDonutChart data={data.institutionBreakdown} nameKey="name" />
            ) : (
              <AllocationDonutChart data={data.typeBreakdown} nameKey="type" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account comparison</CardTitle>
            <CardDescription>Latest invested amount and current value by account.</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountValueBarChart data={data.accountBreakdown} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Accounts in this view</CardTitle>
          <CardDescription>Click through to isolate an individual account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Invested</TableHead>
                <TableHead className="text-right">Current value</TableHead>
                <TableHead className="text-right">Gain / loss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accountBreakdown.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Link
                      href={`${drilldownBasePath}/account/${encodeURIComponent(account.id)}`}
                      className="font-medium transition-colors hover:text-primary"
                    >
                      {account.name}
                    </Link>
                  </TableCell>
                  <TableCell>{account.institutionName}</TableCell>
                  <TableCell>
                    <Link href={`${drilldownBasePath}/type/${encodeURIComponent(account.type)}`}>
                      <Badge variant="secondary" className="cursor-pointer">
                        {account.type}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{currency(account.invested, displayCurrencyCode)}</TableCell>
                  <TableCell className="text-right">{currency(account.currentValue, displayCurrencyCode)}</TableCell>
                  <TableCell className={account.gainLoss >= 0 ? "text-right text-emerald-600" : "text-right text-destructive"}>
                    {currency(account.gainLoss, displayCurrencyCode)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly records</CardTitle>
          <CardDescription>MoM values for the selected institution, account type, or account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Invested</TableHead>
                <TableHead className="text-right">Current value</TableHead>
                <TableHead className="text-right">Gain / loss</TableHead>
                <TableHead className="text-right">MoM change</TableHead>
                <TableHead className="text-right">MoM %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.momRows.map((row) => (
                <TableRow key={row.month}>
                  <TableCell>{monthLabel(row.month)}</TableCell>
                  <TableCell className="text-right">{currency(row.invested, displayCurrencyCode)}</TableCell>
                  <TableCell className="text-right">{currency(row.currentValue, displayCurrencyCode)}</TableCell>
                  <TableCell className={row.gainLoss >= 0 ? "text-right text-emerald-600" : "text-right text-destructive"}>
                    {currency(row.gainLoss, displayCurrencyCode)}
                  </TableCell>
                  <TableCell className={row.momDelta >= 0 ? "text-right text-emerald-600" : "text-right text-destructive"}>
                    {currency(row.momDelta, displayCurrencyCode)}
                  </TableCell>
                  <TableCell className={row.momPercent >= 0 ? "text-right text-emerald-600" : "text-right text-destructive"}>
                    {percent(row.momPercent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  tone = "neutral"
}: {
  title: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tracking-normal">{value}</p>
          {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        </div>
        <div
          className={
            tone === "positive"
              ? "flex size-10 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600"
              : tone === "negative"
                ? "flex size-10 items-center justify-center rounded-md bg-destructive/10 text-destructive"
                : "flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
          }
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
