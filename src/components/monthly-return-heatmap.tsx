import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeatmapRow } from "@/lib/dashboard";
import { cn, currency, monthLabel } from "@/lib/utils";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthlyReturnHeatmap({ rows, currencyCode = "USD" }: { rows: HeatmapRow[]; currencyCode?: string }) {
  const maxAbsDelta = Math.max(1, ...rows.flatMap((row) => row.cells.map((cell) => Math.abs(cell.delta ?? 0))));

  return (
    <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_22px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
      <CardHeader>
        <CardTitle>Monthly return heatmap</CardTitle>
        <CardDescription>Month-over-month change in current value, colored by gain or loss intensity.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[2.5rem_repeat(12,1fr)] gap-1.5">
              <span />
              {MONTH_LABELS.map((label) => (
                <span key={label} className="text-center text-[11px] text-muted-foreground">
                  {label}
                </span>
              ))}
            </div>
            {rows.map((row) => (
              <div key={row.year} className="grid grid-cols-[2.5rem_repeat(12,1fr)] gap-1.5">
                <span className="flex items-center text-xs text-muted-foreground">{row.year}</span>
                {row.cells.map((cell) => (
                  <div
                    key={cell.month}
                    title={cell.delta === null ? `${monthLabel(cell.month)}: no data` : `${monthLabel(cell.month)}: ${currency(cell.delta, currencyCode)}`}
                    className={cn("aspect-square rounded-md", cellTone(cell.delta, maxAbsDelta))}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel message="Add monthly records across more than one month to see the return heatmap." />
        )}
      </CardContent>
    </Card>
  );
}

function cellTone(delta: number | null, maxAbsDelta: number) {
  if (delta === null) return "bg-muted/30 dark:bg-muted/50";
  const intensity = Math.min(1, Math.abs(delta) / maxAbsDelta);
  if (delta >= 0) {
    if (intensity > 0.75) return "bg-emerald-500/40 dark:bg-emerald-400/70";
    if (intensity > 0.5) return "bg-emerald-500/30 dark:bg-emerald-400/55";
    if (intensity > 0.25) return "bg-emerald-500/20 dark:bg-emerald-400/40";
    return "bg-emerald-500/10 dark:bg-emerald-400/25";
  }
  if (intensity > 0.75) return "bg-destructive/40 dark:bg-red-400/70";
  if (intensity > 0.5) return "bg-destructive/30 dark:bg-red-400/55";
  if (intensity > 0.25) return "bg-destructive/20 dark:bg-red-400/40";
  return "bg-destructive/10 dark:bg-red-400/25";
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">{message}</div>;
}
