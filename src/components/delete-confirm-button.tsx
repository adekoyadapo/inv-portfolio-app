"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { deleteAction, deleteUserAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

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
  return <DeleteActionControl kind={kind} id={id} impactMessage={impactMessage} />;
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

  return <DeleteActionControl kind="users" id={id} username={username} />;
}

function DeleteActionControl({
  kind,
  id,
  username,
  impactMessage
}: {
  kind: "institutions" | "accounts" | "monthlyRecords" | "users";
  id: string;
  username?: string;
  impactMessage?: string;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const refreshedRef = useRef(false);
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

  return (
    <form action={formAction} className="flex items-center justify-end gap-3">
      <label
        className="flex items-center gap-2 text-xs text-muted-foreground"
        title={impactMessage}
      >
        <input
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
          className="size-4 rounded border-border"
        />
        Confirm
        {impactMessage ? <span className="text-destructive">({impactMessage})</span> : null}
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
