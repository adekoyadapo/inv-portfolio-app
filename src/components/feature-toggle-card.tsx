"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ToggleState = {
  status: "idle" | "saved";
  enabled: boolean;
  saveId: string;
  error?: string;
};

export function FeatureToggleCard({
  title,
  description,
  enabled,
  label,
  settingKey,
  children,
  icon,
  refreshTitle,
  refreshDescription
}: {
  title: string;
  description: string;
  enabled: boolean;
  label: string;
  settingKey: "aiImport" | "demo";
  children?: ReactNode;
  icon: ReactNode;
  refreshTitle: string;
  refreshDescription: string;
}) {
  const router = useRouter();
  const [dismissedSaveId, setDismissedSaveId] = useState("");
  const [checked, setChecked] = useState(enabled);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ToggleState>({
    status: "idle",
    enabled,
    saveId: ""
  });
  const showRefreshPrompt = state.status === "saved" && state.saveId !== dismissedSaveId;

  useEffect(() => {
    const timeout = window.setTimeout(() => setChecked(state.enabled), 0);
    return () => window.clearTimeout(timeout);
  }, [state.enabled]);

  useEffect(() => {
    if (!state.error) return;
    console.error("[investment-app] feature toggle save failed", {
      title,
      settingKey,
      error: state.error
    });
  }, [settingKey, state.error, title]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState((current) => ({ ...current, error: undefined }));

    try {
      const response = await fetch("/api/admin/settings/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, enabled: checked })
      });

      if (!response.ok) {
        const message = await readResponseError(response);
        throw new Error(message || "Unable to save setting.");
      }

      const result = (await response.json()) as ToggleState;
      setState({
        status: "saved",
        enabled: result.enabled,
        saveId: result.saveId || crypto.randomUUID()
      });
      setChecked(result.enabled);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save setting.";
      console.error("[investment-app] feature toggle save failed", { title, settingKey, error });
      setState({
        status: "idle",
        enabled: checked,
        saveId: "",
        error: message
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Card className="overflow-hidden border-border/70 bg-card shadow-[0_22px_55px_-35px_rgba(15,23,42,0.45)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-3">
              <span className="text-sm font-medium">{label}</span>
              <input
                type="checkbox"
                name="enabled"
                checked={checked}
                onChange={(event) => setChecked(event.currentTarget.checked)}
                className="size-4 rounded border-border"
              />
            </label>
            {children}
            {state.error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save setting"}
              </Button>
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
                <ShieldAlert data-icon="inline-start" />
                Changes apply after refresh.
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={showRefreshPrompt}
        onOpenChange={(open) => {
          if (!open) setDismissedSaveId(state.saveId);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{refreshTitle}</DialogTitle>
            <DialogDescription>{refreshDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDismissedSaveId(state.saveId);
              }}
            >
              Later
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDismissedSaveId(state.saveId);
                router.refresh();
              }}
            >
              <RefreshCcw data-icon="inline-start" />
              Refresh now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function readResponseError(response: Response) {
  const text = await response.text();
  if (!text) return response.statusText;
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error || text;
  } catch {
    return text;
  }
}
