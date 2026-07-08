"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { deleteAction, deleteUserAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type DeleteState = {
  status: "idle" | "deleted";
  error?: string;
};

export function DeleteRecordButton({
  kind,
  id,
  impactMessage
}: {
  kind: "institutions" | "accounts" | "monthlyRecords";
  id: string;
  impactMessage?: string;
}) {
  if (kind === "institutions" || kind === "accounts") {
    return <DeleteWithDialog kind={kind} id={id} impactMessage={impactMessage} />;
  }

  return <DeleteInlineConfirm kind={kind} id={id} />;
}

export function DeleteUserButton({
  id,
  username,
  currentUsername
}: {
  id: string;
  username: string;
  currentUsername: string;
}) {
  if (username === currentUsername) return null;

  return <DeleteInlineConfirm kind="users" id={id} username={username} />;
}

const SLOW_DELETE_WARNING_MS = 8000;

function useDeleteFormAction(kind: "institutions" | "accounts" | "monthlyRecords" | "users") {
  const router = useRouter();
  const refreshedRef = useRef(false);
  const [slow, setSlow] = useState(false);
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(
    async (_previousState, formData) => {
      if (kind === "users") {
        return deleteUserAction(formData);
      }
      return deleteAction(formData);
    },
    { status: "idle" }
  );

  useEffect(() => {
    if (state.status === "deleted" && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [router, state.status]);

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

function DeleteWithDialog({
  kind,
  id,
  impactMessage
}: {
  kind: "institutions" | "accounts";
  id: string;
  impactMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const { state, formAction, pending, slow } = useDeleteFormAction(kind);
  const dialogOpen = open && state.status !== "deleted";

  const label = kind === "institutions" ? "institution" : "account";

  return (
    <>
      <Button type="button" variant="ghost" size="icon" aria-label="Delete" onClick={() => setOpen(true)}>
        <Trash2 data-icon="inline-start" />
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {label}?</DialogTitle>
            <DialogDescription>
              {impactMessage ? `This will ${impactMessage}. This action cannot be undone.` : "This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
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
    </>
  );
}

function DeleteInlineConfirm({
  kind,
  id,
  username
}: {
  kind: "monthlyRecords" | "users";
  id: string;
  username?: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const { state, formAction, pending } = useDeleteFormAction(kind);

  return (
    <form action={formAction} className="flex items-center justify-end gap-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
          className="size-4 rounded border-border"
        />
        Confirm
      </label>
      <input type="hidden" name="kind" value={kind === "users" ? "" : kind} />
      <input type="hidden" name="id" value={id} />
      {username ? <input type="hidden" name="username" value={username} /> : null}
      {state.error ? <span className="sr-only">{state.error}</span> : null}
      <Button type="submit" variant="ghost" size="icon" aria-label="Delete" disabled={!confirmed || pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 data-icon="inline-start" />}
      </Button>
    </form>
  );
}
