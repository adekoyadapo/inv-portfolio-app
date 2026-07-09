"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { BulkActionBar, BulkSelectionCheckbox, useBulkSelection } from "@/components/bulk-select-toolbar";
import { DeleteRecordButton } from "@/components/delete-confirm-button";
import { MonthlyRecordsPaginationControls } from "@/components/monthly-records-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SortDirection } from "@/lib/pagination";
import type { MonthlyRecord } from "@/lib/types";
import { cn, currency, monthLabel } from "@/lib/utils";

export type MonthlyRecordSortKey = "month" | "institution" | "account" | "currency" | "invested" | "current";
export type MonthlyRecordRow = MonthlyRecord & { institutionLabel: string; accountLabel: string };

function MonthlyRecordSortHeader({
  href,
  active,
  dir,
  align,
  children
}: {
  href: string;
  active: boolean;
  dir: SortDirection;
  align?: "right";
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-1 transition-colors hover:text-primary", align === "right" ? "flex-row-reverse" : "")}
    >
      {children}
      {active ? dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}
    </Link>
  );
}

export function MonthlyRecordsTable({
  rows,
  sort,
  dir,
  sortHrefs,
  start,
  end,
  totalItems,
  pageSize,
  pageSizeHrefs,
  prevHref,
  nextHref
}: {
  rows: MonthlyRecordRow[];
  sort: MonthlyRecordSortKey;
  dir: SortDirection;
  sortHrefs: Record<MonthlyRecordSortKey, string>;
  start: number;
  end: number;
  totalItems: number;
  pageSize: number;
  pageSizeHrefs: Record<number, string>;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const ids = rows.map((row) => row.id);
  const { selected, toggle, toggleAll, clear, allSelected, someSelected } = useBulkSelection(ids);
  const selectedIds = Array.from(selected);

  return (
    <div className="flex flex-col gap-4">
      <BulkActionBar kind="monthlyRecords" selectedIds={selectedIds} onCleared={clear} />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <BulkSelectionCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  ariaLabel="Select all monthly records on this page"
                />
              </TableHead>
              <TableHead>
                <MonthlyRecordSortHeader href={sortHrefs.month} active={sort === "month"} dir={dir}>
                  Month
                </MonthlyRecordSortHeader>
              </TableHead>
              <TableHead>
                <MonthlyRecordSortHeader href={sortHrefs.institution} active={sort === "institution"} dir={dir}>
                  Institution
                </MonthlyRecordSortHeader>
              </TableHead>
              <TableHead>
                <MonthlyRecordSortHeader href={sortHrefs.account} active={sort === "account"} dir={dir}>
                  Account
                </MonthlyRecordSortHeader>
              </TableHead>
              <TableHead>
                <MonthlyRecordSortHeader href={sortHrefs.currency} active={sort === "currency"} dir={dir}>
                  Currency
                </MonthlyRecordSortHeader>
              </TableHead>
              <TableHead className="text-right">
                <MonthlyRecordSortHeader href={sortHrefs.invested} active={sort === "invested"} dir={dir} align="right">
                  Invested
                </MonthlyRecordSortHeader>
              </TableHead>
              <TableHead className="text-right">
                <MonthlyRecordSortHeader href={sortHrefs.current} active={sort === "current"} dir={dir} align="right">
                  Current value
                </MonthlyRecordSortHeader>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <BulkSelectionCheckbox
                    checked={selected.has(record.id)}
                    onChange={() => toggle(record.id)}
                    ariaLabel={`Select record for ${record.accountLabel}, ${record.month}`}
                  />
                </TableCell>
                <TableCell>{monthLabel(record.month)}</TableCell>
                <TableCell>{record.institutionLabel}</TableCell>
                <TableCell>{record.accountLabel}</TableCell>
                <TableCell>{record.currencyCode || "USD"}</TableCell>
                <TableCell className="text-right">{currency(record.amountInvested, record.currencyCode)}</TableCell>
                <TableCell className="text-right">{currency(record.currentValue, record.currencyCode)}</TableCell>
                <TableCell className="text-right">
                  <DeleteRecordButton kind="monthlyRecords" id={record.id} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                  No monthly records yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <MonthlyRecordsPaginationControls
        start={start}
        end={end}
        totalItems={totalItems}
        pageSize={pageSize}
        pageSizeHrefs={pageSizeHrefs}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </div>
  );
}
