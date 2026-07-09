"use client";

import { BulkActionBar, BulkSelectionCheckbox, useBulkSelection } from "@/components/bulk-select-toolbar";
import { DeleteRecordButton } from "@/components/delete-confirm-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Account } from "@/lib/types";

function formatImpact(recordCount: number): string | undefined {
  if (recordCount === 0) return undefined;
  return `also delete ${recordCount} record${recordCount === 1 ? "" : "s"}`;
}

export function AccountsTable({
  accounts,
  institutionNameById,
  recordCountByAccountId
}: {
  accounts: Account[];
  institutionNameById: Record<string, string>;
  recordCountByAccountId: Record<string, number>;
}) {
  const ids = accounts.map((account) => account.id);
  const { selected, toggle, toggleAll, clear, allSelected, someSelected } = useBulkSelection(ids);
  const selectedIds = Array.from(selected);
  const aggregatedRecordCount = selectedIds.reduce((total, id) => total + (recordCountByAccountId[id] || 0), 0);
  const aggregatedMessage =
    aggregatedRecordCount > 0
      ? `also delete ${aggregatedRecordCount} record${aggregatedRecordCount === 1 ? "" : "s"} across ${selectedIds.length} account${
          selectedIds.length === 1 ? "" : "s"
        }`
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <BulkActionBar kind="accounts" selectedIds={selectedIds} impactMessage={aggregatedMessage} onCleared={clear} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <BulkSelectionCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} ariaLabel="Select all accounts" />
            </TableHead>
            <TableHead>Institution</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell>
                <BulkSelectionCheckbox
                  checked={selected.has(account.id)}
                  onChange={() => toggle(account.id)}
                  ariaLabel={`Select ${account.name}`}
                />
              </TableCell>
              <TableCell>{institutionNameById[account.institutionId] || "Unknown"}</TableCell>
              <TableCell>{account.name}</TableCell>
              <TableCell>{account.type}</TableCell>
              <TableCell className="text-right">
                <DeleteRecordButton kind="accounts" id={account.id} impactMessage={formatImpact(recordCountByAccountId[account.id] || 0)} />
              </TableCell>
            </TableRow>
          ))}
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                No accounts yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
