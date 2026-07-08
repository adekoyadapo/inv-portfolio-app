"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, RefreshCcw, ShieldAlert } from "lucide-react";

import { saveAiImportSettingsAction } from "@/app/actions";
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
import type { AiRuntimeConfig } from "@/lib/types";

type ToggleState = {
  status: "idle" | "saved";
  enabled: boolean;
  saveId: string;
};

const initialState: ToggleState = {
  status: "idle",
  enabled: false,
  saveId: ""
};

export function AiFeatureToggleCard({
  enabled,
  runtimeConfig
}: {
  enabled: boolean;
  runtimeConfig: AiRuntimeConfig;
}) {
  const router = useRouter();
  const [dismissedSaveId, setDismissedSaveId] = useState("");
  const [state, formAction, pending] = useActionState(saveAiImportSettingsAction, {
    ...initialState,
    enabled
  } satisfies ToggleState);
  const showRefreshPrompt = state.status === "saved" && state.saveId !== dismissedSaveId;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4" />
            AI import feature
          </CardTitle>
          <CardDescription>Turn the statement importer on or off for everyone. This is admin-only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={formAction} className="space-y-4">
            <label className="flex items-center gap-3 rounded-md border px-3 py-2">
              <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4 rounded border-border" />
              <span className="text-sm">Enable AI import for all users</span>
            </label>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Runtime provider</p>
              <p className="text-muted-foreground">
                {runtimeConfig.provider} / {runtimeConfig.model}
              </p>
              <p className="text-xs text-muted-foreground">
                Credentials and base URL come from env: `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`.
              </p>
              <p className="text-xs text-muted-foreground">
                API key status: {runtimeConfig.hasApiKey ? "configured" : "missing"}.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save toggle"}
              </Button>
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
                <ShieldAlert className="size-4" />
                Changes affect all users immediately after refresh.
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
            <DialogTitle>AI import updated</DialogTitle>
            <DialogDescription>
              The new feature flag is saved. Refresh the UI to make sure all panels reflect the updated state.
            </DialogDescription>
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
