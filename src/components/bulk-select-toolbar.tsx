"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { bulkDeleteAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type BulkDeleteState = { status: "idle" | "deleted"; error?: string; deletedCount?: number };

const SLOW_DELETE_WARNING_MS = 8000;

export function useBulkSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(visibleIds) : new Set());
  }

  function clear() {
    setSelected(new Set());
  }

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  return { selected, toggle, toggleAll, clear, allSelected, someSelected };
}

export function BulkSelectionCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
      aria-label={ariaLabel}
      className="size-4 rounded border-border"
    />
  );
}

function useBulkDeleteFormAction(onCleared: () => void) {
  const router = useRouter();
  const refreshedRef = useRef(false);
  const [slow, setSlow] = useState(false);
  const [state, formAction, pending] = useActionState<BulkDeleteState, FormData>(
    async (_previousState, formData) => bulkDeleteAction(formData),
    { status: "idle" }
  );

  useEffect(() => {
    if (state.status === "deleted" && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
      onCleared();
    }
  }, [router, state.status, onCleared]);

  useEffect(() => {
    if (!pending) return;
    const timeout = window.setTimeout(() => setSlow(true), SLOW_DELETE_WARNING_MS);
    return () => {
      window.clearTimeout(timeout);
      setSlow(false);
    };
  }, [pending]);

  return { state, formAction, pending, slow };
}

export function BulkActionBar({
  kind,
  selectedIds,
  impactMessage,
  onCleared
}: {
  kind: "institutions" | "accounts" | "monthlyRecords";
  selectedIds: string[];
  impactMessage?: string;
  onCleared: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { state, formAction, pending, slow } = useBulkDeleteFormAction(onCleared);
  const dialogOpen = open && state.status !== "deleted";
  const label = kind === "institutions" ? "institutions" : kind === "accounts" ? "accounts" : "monthly records";

  if (selectedIds.length === 0) return null;

  return (
    <div className="sticky top-16 z-10 flex items-center justify-between gap-3 rounded-md border bg-background/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
      <p>
        <span className="font-medium">{selectedIds.length}</span> selected
      </p>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 data-icon="inline-start" />
        Delete selected
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.length} {label}?
            </DialogTitle>
            <DialogDescription>
              {impactMessage ? `This will ${impactMessage}. This action cannot be undone.` : "This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="kind" value={kind} />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="id" value={id} />
            ))}
            <input type="hidden" name="confirm" value="on" />
            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            {pending && slow ? (
              <p className="text-sm text-muted-foreground">
                This is taking longer than expected. It should still complete — you can keep waiting, or cancel and
                check back in a moment.
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
                {pending ? "Deleting" : "Delete"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
