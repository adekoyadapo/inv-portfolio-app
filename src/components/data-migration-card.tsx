"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Database, Download, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ImportSummary = {
  institutions: number;
  accounts: number;
  monthlyRecords: number;
  users: number;
  aiSettings: number;
  aiImportRuns: number;
};

export function DataMigrationCard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportFormat, setExportFormat] = useState<"json" | "xlsx">("json");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function handleChooseFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose an exported JSON dump file first.");
      return;
    }
    setError("");
    setSummary(null);
    setPendingFile(file);
    setConfirmOpen(true);
  }

  async function confirmImport() {
    if (!pendingFile) return;
    setImporting(true);
    setError("");
    try {
      const body = new FormData();
      body.set("dump", pendingFile);
      const response = await fetch("/api/admin/import", { method: "POST", body });
      const result = (await response.json()) as { summary?: ImportSummary; error?: string };
      if (!response.ok || !result.summary) {
        throw new Error(result.error || "Unable to import data.");
      }
      setSummary(result.summary);
      setConfirmOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import data.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="overflow-hidden border-border/70 bg-card shadow-[0_22px_55px_-35px_rgba(15,23,42,0.45)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database data-icon="inline-start" />
          Data migration
        </CardTitle>
        <CardDescription>Export a dump for moving to another setup, or import one here.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Export</p>
            <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as "json" | "xlsx")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <a href={`/api/admin/export?scope=portfolio&format=${exportFormat}`}>
                <Download data-icon="inline-start" />
                Export portfolio data
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/admin/export?scope=full&format=${exportFormat}`}>
                <Download data-icon="inline-start" />
                Export everything
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Portfolio data covers institutions, accounts, and monthly records. Everything also includes users (with
            password hashes) and feature settings. Institution logos live in object storage and aren&apos;t part of
            the dump. Excel exports one sheet per table and are for viewing/analysis &mdash; only JSON can be
            imported back in below.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-sm font-medium">Import</p>
          <form onSubmit={handleChooseFile} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Label className="sr-only" htmlFor="data-import-file">
                Exported JSON dump
              </Label>
              <Input id="data-import-file" ref={fileInputRef} type="file" accept="application/json" />
            </div>
            <Button type="submit" variant="outline">
              <Upload data-icon="inline-start" />
              Choose file
            </Button>
          </form>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {summary ? (
            <p className="text-sm text-emerald-600">
              Imported {summary.institutions} institutions, {summary.accounts} accounts, {summary.monthlyRecords} monthly
              records
              {summary.users > 0 ? `, ${summary.users} users` : ""}.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">Admin only. Existing records with matching IDs are overwritten.</p>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import {pendingFile?.name}?</DialogTitle>
            <DialogDescription>
              This will overwrite any existing institutions, accounts, monthly records, and other data in this dump
              wherever IDs already match on this instance. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmImport} disabled={importing}>
              {importing ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
