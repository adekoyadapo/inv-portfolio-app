"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function MonthlyRecordsPaginationControls({
  start,
  end,
  totalItems,
  pageSize,
  pageSizeHrefs,
  prevHref,
  nextHref
}: {
  start: number;
  end: number;
  totalItems: number;
  pageSize: number;
  pageSizeHrefs: Record<number, string>;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const pageSizeOptions = Object.keys(pageSizeHrefs)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {totalItems > 0 ? `Showing ${start + 1}-${end} of ${totalItems}` : "No monthly records yet."}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              const href = pageSizeHrefs[Number(value)];
              if (href) router.push(href);
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!prevHref} asChild={Boolean(prevHref)}>
            {prevHref ? (
              <Link href={prevHref}>
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Link>
            ) : (
              <>
                <ChevronLeft data-icon="inline-start" />
                Previous
              </>
            )}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!nextHref} asChild={Boolean(nextHref)}>
            {nextHref ? (
              <Link href={nextHref}>
                Next
                <ChevronRight data-icon="inline-end" />
              </Link>
            ) : (
              <>
                Next
                <ChevronRight data-icon="inline-end" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
