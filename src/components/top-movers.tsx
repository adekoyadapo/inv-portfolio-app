import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TopMover } from "@/lib/dashboard";
import { currency, percent } from "@/lib/utils";

export function TopMovers({ movers }: { movers: TopMover[] }) {
  return (
    <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_22px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
      <CardHeader>
        <CardTitle>Top movers</CardTitle>
        <CardDescription>Accounts with the largest month-over-month change in current value.</CardDescription>
      </CardHeader>
      <CardContent>
        {movers.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {movers.map((mover) => {
              const positive = mover.delta >= 0;
              return (
                <li
                  key={mover.accountId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={
                        positive
                          ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"
                          : "flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                      }
                    >
                      {positive ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{mover.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{mover.institutionLabel}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={positive ? "text-sm font-semibold text-emerald-600" : "text-sm font-semibold text-destructive"}>
                      {currency(mover.delta, mover.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">{percent(mover.deltaPercent)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyPanel message="Add a second month of records for an account to see its movement here." />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">{message}</div>;
}
