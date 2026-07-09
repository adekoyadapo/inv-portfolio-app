"use client";

import { BulkActionBar, BulkSelectionCheckbox, useBulkSelection } from "@/components/bulk-select-toolbar";
import { DeleteRecordButton } from "@/components/delete-confirm-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Institution } from "@/lib/types";

type ImpactCounts = { accountCount: number; recordCount: number };

function formatImpact({ accountCount, recordCount }: ImpactCounts): string | undefined {
  if (accountCount === 0 && recordCount === 0) return undefined;
  return `also delete ${accountCount} account${accountCount === 1 ? "" : "s"} and ${recordCount} record${recordCount === 1 ? "" : "s"}`;
}

export function InstitutionsTable({
  institutions,
  impactById
}: {
  institutions: Institution[];
  impactById: Record<string, ImpactCounts>;
}) {
  const ids = institutions.map((institution) => institution.id);
  const { selected, toggle, toggleAll, clear, allSelected, someSelected } = useBulkSelection(ids);
  const selectedIds = Array.from(selected);
  const aggregated = selectedIds.reduce(
    (totals, id) => {
      const counts = impactById[id] || { accountCount: 0, recordCount: 0 };
      return { accountCount: totals.accountCount + counts.accountCount, recordCount: totals.recordCount + counts.recordCount };
    },
    { accountCount: 0, recordCount: 0 }
  );
  const aggregatedMessage =
    aggregated.accountCount > 0 || aggregated.recordCount > 0
      ? `also delete ${aggregated.accountCount} account${aggregated.accountCount === 1 ? "" : "s"} and ${aggregated.recordCount} record${
          aggregated.recordCount === 1 ? "" : "s"
        } across ${selectedIds.length} institution${selectedIds.length === 1 ? "" : "s"}`
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <BulkActionBar kind="institutions" selectedIds={selectedIds} impactMessage={aggregatedMessage} onCleared={clear} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <BulkSelectionCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleAll}
                ariaLabel="Select all institutions"
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {institutions.map((institution) => (
            <TableRow key={institution.id}>
              <TableCell>
                <BulkSelectionCheckbox
                  checked={selected.has(institution.id)}
                  onChange={() => toggle(institution.id)}
                  ariaLabel={`Select ${institution.name}`}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar>
                    {institution.logoUrl ? <AvatarImage src={institution.logoUrl} alt={`${institution.name} logo`} /> : null}
                    <AvatarFallback>{institution.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{institution.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <DeleteRecordButton
                  kind="institutions"
                  id={institution.id}
                  impactMessage={formatImpact(impactById[institution.id] || { accountCount: 0, recordCount: 0 })}
                />
              </TableCell>
            </TableRow>
          ))}
          {institutions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                No institutions yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
