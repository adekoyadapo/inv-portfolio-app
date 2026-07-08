"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Circle, CheckSquare2, Loader2, Sparkles, Square, UploadCloud, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiImportBatch, AiImportSettings, AiImportStep, AiRuntimeConfig } from "@/lib/types";
import { currency } from "@/lib/utils";

const initialSteps: AiImportStep[] = [
  { id: "validate", label: "Validate upload", detail: "Waiting for a file.", status: "pending" },
  { id: "read", label: "Read source", detail: "Preparing the source for analysis.", status: "pending" },
  { id: "infer", label: "LLM extraction", detail: "Waiting for model output.", status: "pending" },
  { id: "fallback", label: "Fallback parsing", detail: "Only used when the model cannot return structured output.", status: "pending" },
  { id: "normalize", label: "Normalize draft", detail: "Shaping the response into records.", status: "pending" },
  { id: "review", label: "Review ready", detail: "Waiting for extracted values.", status: "pending" }
];

export function AiImportWorkbench({
  settings,
  runtimeConfig
}: {
  settings: AiImportSettings;
  runtimeConfig: AiRuntimeConfig;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [steps, setSteps] = useState(initialSteps);
  const [batch, setBatch] = useState<AiImportBatch | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptMessage, setAcceptMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const activeCount = useMemo(() => steps.filter((step) => step.status === "complete").length, [steps]);
  const reviewCounts = useMemo(() => {
    const drafts = batch?.drafts || [];
    const selectable = drafts.filter((draft) => !draft.duplicateOf);
    const selected = selectable.filter((draft) => draft.selected !== false);
    return {
      selectable: selectable.length,
      selected: selected.length,
      allSelected: selectable.length > 0 && selected.length === selectable.length,
      someSelected: selected.length > 0 && selected.length < selectable.length
    };
  }, [batch]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = reviewCounts.someSelected;
  }, [reviewCounts.someSelected]);

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBatch(null);
    setAcceptMessage("");
    setIsRunning(true);
    setSteps(initialSteps);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a PDF, image, or spreadsheet export before starting the analysis.");
      setIsRunning(false);
      return;
    }

    setSelectedFile(file);

    try {
      const response = await fetch("/api/admin/ai-import/analyze", {
        method: "POST",
        body: formData
      });

      if (!response.ok || !response.body) {
        const message = await response.text();
        throw new Error(message || "Unable to analyze the upload.");
      }

      await readEventStream(response.body, {
        onStep(step) {
          setSteps((current) => current.map((item) => (item.id === step.id ? step : item)));
        },
        onDraft(nextBatch) {
          setBatch(nextBatch);
        },
        onError(message) {
          throw new Error(message);
        }
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to analyze the upload.");
    } finally {
      setIsRunning(false);
    }
  }

  async function handleAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAcceptMessage("");

    if (!batch) {
      setError("Run an analysis before accepting summaries.");
      return;
    }

    setIsAccepting(true);
    try {
      const response = await fetch("/api/admin/ai-import/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ draft: batch })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to save the import.");
      }

      const result = (await response.json()) as {
        status: "saved";
        savedCount: number;
        skippedCount: number;
      };
      setBatch(null);
      setSelectedFile(null);
      setSteps(initialSteps);
      setAcceptMessage(
        result.status === "saved"
          ? `Saved ${result.savedCount} row${result.savedCount === 1 ? "" : "s"} and skipped ${result.skippedCount} duplicate${result.skippedCount === 1 ? "" : "s"}.`
          : "Import saved. Upload another statement to run a new review."
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save the import.");
    } finally {
      setIsAccepting(false);
    }
  }

  function toggleAllDrafts(checked: boolean) {
    setBatch((current) => {
      if (!current) return current;
      return {
        ...current,
        drafts: current.drafts.map((draft) => (draft.duplicateOf ? draft : { ...draft, selected: checked }))
      };
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Runtime config</CardTitle>
            <CardDescription>Provider and credentials are read from env for this deployment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-medium">Provider</p>
              <p className="text-muted-foreground">{runtimeConfig.provider}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-medium">Model</p>
              <p className="text-muted-foreground">{runtimeConfig.model}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-medium">Base URL</p>
              <p className="text-muted-foreground">{runtimeConfig.baseUrl || "Provider default"}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-medium">API key</p>
              <p className="text-muted-foreground">{runtimeConfig.hasApiKey ? "Configured" : "Missing"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import upload</CardTitle>
            <CardDescription>Upload a PDF, image, or spreadsheet export and review each extracted account row before saving.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAnalyze} className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="file">Statement file</Label>
                <Input
                  ref={fileInputRef}
                  id="file"
                  name="file"
                  type="file"
                  accept=".pdf,.csv,.xlsx,.xls,image/*"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  required
                />
              </div>
              <Button type="submit" disabled={isRunning || !settings.enabled || !runtimeConfig.hasApiKey}>
                {isRunning ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UploadCloud data-icon="inline-start" />}
                {isRunning ? "Analyzing" : "Analyze statement"}
              </Button>
              {!settings.enabled ? (
                <p className="text-sm text-muted-foreground">Enable the feature above before users can run imports.</p>
              ) : !runtimeConfig.hasApiKey ? (
                <p className="text-sm text-muted-foreground">Set `AI_API_KEY` in env before running imports.</p>
              ) : null}
              {selectedFile ? (
                <p className="text-xs text-muted-foreground">
                  Selected {selectedFile.name} {selectedFile.size ? `(${formatBytes(selectedFile.size)})` : null}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Processing steps</CardTitle>
            <CardDescription>{activeCount} of {steps.length} stages completed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step) => (
              <div key={step.id} className="flex gap-3 rounded-md border p-3">
                <StepIcon status={step.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{step.label}</p>
                    <Badge variant={step.status === "complete" ? "default" : step.status === "running" ? "secondary" : "outline"}>
                      {step.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>Confirm the summary before it is written to Elasticsearch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
            {acceptMessage ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">{acceptMessage}</p> : null}
            {batch ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.35)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{batch.sourceName}</p>
                      <p className="text-sm text-muted-foreground">
                        {batch.drafts.length} summary row{batch.drafts.length === 1 ? "" : "s"} extracted from the source.
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-2 py-1 text-xs font-medium text-muted-foreground">
                      {batch.sourceType}
                    </div>
                  </div>
                  {batch.notes.length > 0 ? (
                    <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                      {batch.notes.map((note) => (
                        <li key={note}>• {note}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <form onSubmit={handleAccept} className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-3 text-xs text-muted-foreground">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={reviewCounts.allSelected}
                      disabled={reviewCounts.selectable === 0}
                      onChange={(event) => toggleAllDrafts(event.currentTarget.checked)}
                      className="size-4 rounded border-border text-primary"
                    />
                    <span>
                      Select all {reviewCounts.selectable > 0 ? `(${reviewCounts.selected}/${reviewCounts.selectable})` : ""}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => toggleAllDrafts(false)}
                      disabled={reviewCounts.selectable === 0 || reviewCounts.selected === 0 || isAccepting}
                    >
                      Clear
                    </Button>
                    <Button type="submit" disabled={isAccepting}>
                      {isAccepting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                      {isAccepting ? "Saving" : "Accept and save"}
                    </Button>
                  </div>
                </form>

                <div className="space-y-3">
                  {batch.drafts.map((item, index) => (
                    <div
                      key={`${item.sourceFingerprint}-${item.accountName}-${item.month}-${index}`}
                      className="grid gap-3 rounded-xl border border-border/70 bg-background/90 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.28)] lg:grid-cols-[auto_1fr_auto]"
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name={`selected-${index}`}
                          checked={item.selected !== false}
                          disabled={item.selected === false}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setBatch((current) => {
                              if (!current) return current;
                              return {
                                ...current,
                                drafts: current.drafts.map((draft, draftIndex) =>
                                  draftIndex === index ? { ...draft, selected: checked } : draft
                                )
                              };
                            });
                          }}
                          className="mt-1 size-4 rounded border-border text-primary"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.accountName}</p>
                            <Badge variant="outline">{item.accountType}</Badge>
                            <Badge variant="secondary">{item.currencyCode}</Badge>
                            {item.duplicateOf ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="size-3.5" />
                                Duplicate
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.institutionName} · {item.month} · {item.summary}
                          </p>
                          {item.notes.length > 0 ? <p className="text-xs text-muted-foreground">{item.notes.join(" ")}</p> : null}
                        </div>
                      </label>
                      <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
                        <p className="font-medium">{currency(item.currentValue, item.currencyCode)}</p>
                        <p className="text-xs text-muted-foreground">Invested {currency(item.amountInvested, item.currencyCode)}</p>
                      </div>
                      <div className="flex items-start justify-end">
                        {item.selected === false ? (
                          <Badge variant="outline" className="gap-1">
                            <Square className="size-3.5" />
                            Off
                          </Badge>
                        ) : (
                          <Badge variant="default" className="gap-1">
                            <CheckSquare2 className="size-3.5" />
                            On
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Run an analysis to populate the final review panel.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onStep: (step: AiImportStep) => void;
    onDraft: (draft: AiImportBatch) => void;
    onError: (message: string) => never;
  }
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const event = parseEventChunk(chunk);
      if (!event) continue;

      if (event.type === "step") {
        handlers.onStep(event.payload as AiImportStep);
      } else if (event.type === "draft") {
        handlers.onDraft(event.payload as AiImportBatch);
      } else if (event.type === "error") {
        handlers.onError(String((event.payload as { message?: string }).message || "Unable to analyze the upload."));
      }
    }
  }
}

function parseEventChunk(chunk: string) {
  const lines = chunk.split("\n");
  const typeLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!typeLine || !dataLine) return null;

  const type = typeLine.slice("event:".length).trim();
  const data = dataLine.slice("data:".length).trim();
  try {
    return { type, payload: JSON.parse(data) };
  } catch {
    return null;
  }
}

function StepIcon({ status }: { status: AiImportStep["status"] }) {
  if (status === "complete") return <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />;
  if (status === "running") return <Loader2 className="mt-0.5 size-4 animate-spin text-primary" />;
  if (status === "error") return <Circle className="mt-0.5 size-4 text-destructive" />;
  return <Circle className="mt-0.5 size-4 text-muted-foreground" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
