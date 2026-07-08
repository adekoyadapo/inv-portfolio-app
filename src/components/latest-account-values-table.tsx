"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeStaleAccountIds } from "@/lib/dashboard";
import type { DashboardData } from "@/lib/types";
import { currency, monthLabel } from "@/lib/utils";

const PAGE_SIZE = 20;

export function LatestAccountValuesTable({
  data,
  drilldownBasePath
}: {
  data: DashboardData;
  drilldownBasePath: string;
}) {
  const [page, setPage] = useState(1);
  const staleAccountIds = computeStaleAccountIds(data);
  const totalPages = Math.max(1, Math.ceil(data.accountSnapshots.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleRows = data.accountSnapshots.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:hidden">
        {visibleRows.length > 0 ? (
          visibleRows.map((snapshot) => {
            const gain = (snapshot.latest?.currentValue || 0) - (snapshot.latest?.amountInvested || 0);
            return (
              <Link
                key={snapshot.account.id}
                href={`${drilldownBasePath}/account/${encodeURIComponent(snapshot.account.id)}`}
                className="flex cursor-pointer flex-col gap-3 rounded-lg border bg-background/90 p-4 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.5)] transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10">
                      {snapshot.institution.logoUrl ? (
                        <AvatarImage src={snapshot.institution.logoUrl} alt={`${snapshot.institution.name} logo`} />
                      ) : null}
                      <AvatarFallback>{snapshot.institution.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{snapshot.account.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{snapshot.institution.name}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">{snapshot.account.type}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">Current value</p>
                    <p className="font-semibold">{currency(snapshot.latest?.currentValue || 0, snapshot.latest?.currencyCode)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">Gain / loss</p>
                    <p className={gain >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-destructive"}>
                      {currency(gain, snapshot.latest?.currencyCode)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    {snapshot.latest ? monthLabel(snapshot.latest.month) : "No record"}
                    {staleAccountIds.has(snapshot.account.id) ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                        title="Other accounts at this institution have newer records"
                      >
                        Stale
                      </Badge>
                    ) : null}
                  </span>
                  <span>{snapshot.latest?.currencyCode || "USD"}</span>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No accounts yet. Add an institution, account, and monthly record in Admin.
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto lg:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Institution</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Month</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">Invested</TableHead>
            <TableHead className="text-right">Current value</TableHead>
            <TableHead className="text-right">Gain / loss</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length > 0 ? (
            visibleRows.map((snapshot) => {
              const gain = (snapshot.latest?.currentValue || 0) - (snapshot.latest?.amountInvested || 0);
              return (
                <TableRow key={snapshot.account.id}>
                  <TableCell>
                    <Link
                      href={`${drilldownBasePath}/institution/${encodeURIComponent(snapshot.institution.id)}`}
                      className="flex items-center gap-3 rounded-md transition-colors hover:text-primary"
                    >
                      <Avatar>
                        {snapshot.institution.logoUrl ? (
                          <AvatarImage src={snapshot.institution.logoUrl} alt={`${snapshot.institution.name} logo`} />
                        ) : null}
                        <AvatarFallback>{snapshot.institution.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{snapshot.institution.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`${drilldownBasePath}/account/${encodeURIComponent(snapshot.account.id)}`}
                      className="font-medium transition-colors hover:text-primary"
                    >
                      {snapshot.account.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`${drilldownBasePath}/type/${encodeURIComponent(snapshot.account.type)}`}>
                      <Badge variant="secondary" className="cursor-pointer">
                        {snapshot.account.type}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {snapshot.latest ? monthLabel(snapshot.latest.month) : "No record"}
                      {staleAccountIds.has(snapshot.account.id) ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                          title="Other accounts at this institution have newer records"
                        >
                          Stale
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>{snapshot.latest?.currencyCode || "USD"}</TableCell>
                  <TableCell className="text-right">{currency(snapshot.latest?.amountInvested || 0, snapshot.latest?.currencyCode)}</TableCell>
                  <TableCell className="text-right">{currency(snapshot.latest?.currentValue || 0, snapshot.latest?.currencyCode)}</TableCell>
                  <TableCell className={gain >= 0 ? "text-right text-emerald-600" : "text-right text-destructive"}>
                    {currency(gain, snapshot.latest?.currencyCode)}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                No accounts yet. Add an institution, account, and monthly record in Admin.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>

      {data.accountSnapshots.length > PAGE_SIZE ? (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {start + 1}-{Math.min(start + PAGE_SIZE, data.accountSnapshots.length)} of {data.accountSnapshots.length}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
              <ChevronLeft data-icon="inline-start" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
