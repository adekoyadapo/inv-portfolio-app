import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Download, FileUp, ImageUp, Plus, Save, Shield, UserPlus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  createUserAction,
  importCsvAction,
  renameAccountTypeAction,
  saveAccountAction,
  saveInstitutionAction,
  saveMonthlyRecordAction,
  updateInstitutionLogoAction
} from "@/app/actions";
import { AiFeatureToggleCard } from "@/components/ai-feature-toggle-card";
import { DeleteRecordButton, DeleteUserButton } from "@/components/delete-confirm-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoFeatureToggleCard } from "@/components/demo-feature-toggle-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonthlyRecordsPaginationControls } from "@/components/monthly-records-pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminOrPortfolioAccess } from "@/lib/auth";
import { getAiImportSettings, listAccounts, listInstitutions, listMonthlyRecords, listUsers } from "@/lib/elasticsearch";
import { getAiRuntimeConfig } from "@/lib/ai-config";
import { paginate, sortByComparator, type SortDirection } from "@/lib/pagination";
import type { Account, Institution, MonthlyRecord, PublicUser } from "@/lib/types";
import { cn, currency, monthLabel } from "@/lib/utils";

const baseAccountTypes = ["RESP", "RRSP", "TFSA", "FHSA", "DPSP", "Stock", "Index", "Cash", "Other"];

type MonthlyRecordSortKey = "month" | "institution" | "account" | "currency" | "invested" | "current";

const MONTHLY_RECORD_SORT_KEYS: MonthlyRecordSortKey[] = ["month", "institution", "account", "currency", "invested", "current"];
const MONTHLY_RECORD_PAGE_SIZES = [10, 25, 50, 100] as const;

type MonthlyRecordRow = MonthlyRecord & { institutionLabel: string; accountLabel: string };

const MONTHLY_RECORD_COMPARATORS: Record<MonthlyRecordSortKey, (a: MonthlyRecordRow, b: MonthlyRecordRow) => number> = {
  month: (a, b) => a.month.localeCompare(b.month),
  institution: (a, b) => a.institutionLabel.localeCompare(b.institutionLabel),
  account: (a, b) => a.accountLabel.localeCompare(b.accountLabel),
  currency: (a, b) => (a.currencyCode || "USD").localeCompare(b.currencyCode || "USD"),
  invested: (a, b) => a.amountInvested - b.amountInvested,
  current: (a, b) => a.currentValue - b.currentValue
};

type MonthlyRecordsState = { sort: MonthlyRecordSortKey; dir: SortDirection; page: number; size: number };

function firstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseMonthlyRecordsState(searchParams: Record<string, string | string[] | undefined>): MonthlyRecordsState {
  const rawSort = firstSearchParamValue(searchParams.mr_sort);
  const sort = MONTHLY_RECORD_SORT_KEYS.includes(rawSort as MonthlyRecordSortKey) ? (rawSort as MonthlyRecordSortKey) : "month";

  const rawDir = firstSearchParamValue(searchParams.mr_dir);
  const dir: SortDirection = rawDir === "asc" || rawDir === "desc" ? rawDir : rawSort ? "asc" : "desc";

  const rawPage = Number(firstSearchParamValue(searchParams.mr_page));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawSize = Number(firstSearchParamValue(searchParams.mr_size));
  const size = (MONTHLY_RECORD_PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : 10;

  return { sort, dir, page, size };
}

function buildMonthlyRecordsHref(
  baseSearchParams: Record<string, string | string[] | undefined>,
  state: MonthlyRecordsState,
  overrides: Partial<MonthlyRecordsState>
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(baseSearchParams)) {
    if (key.startsWith("mr_")) continue;
    const resolved = firstSearchParamValue(value);
    if (resolved !== undefined) params.set(key, resolved);
  }
  const merged = { ...state, ...overrides };
  params.set("mr_sort", merged.sort);
  params.set("mr_dir", merged.dir);
  params.set("mr_page", String(merged.page));
  params.set("mr_size", String(merged.size));
  return `/admin?${params.toString()}#monthly-records`;
}

function MonthlyRecordSortHeader({
  href,
  active,
  dir,
  align,
  children
}: {
  href: string;
  active: boolean;
  dir: SortDirection;
  align?: "right";
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-1 transition-colors hover:text-primary", align === "right" ? "flex-row-reverse" : "")}
    >
      {children}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" />
      )}
    </Link>
  );
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, aiImportSettings, rawSearchParams] = await Promise.all([
    requireAdminOrPortfolioAccess(),
    getAiImportSettings(),
    searchParams
  ]);
  const runtimeConfig = getAiRuntimeConfig();
  const isAdmin = session.role === "admin";
  const canEditPortfolio = isAdmin || session.role === "operator";
  const canManageUsers = isAdmin || session.role === "user_manager";

  let institutions: Institution[] = [];
  let accounts: Account[] = [];
  let records: MonthlyRecord[] = [];
  let users: PublicUser[] = [];
  let loadError = "";

  try {
    [institutions, accounts, records, users] = await Promise.all([
      listInstitutions(),
      listAccounts(),
      listMonthlyRecords(),
      listUsers()
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load admin data.";
  }

  const institutionName = new Map(institutions.map((institution) => [institution.id, institution.name]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const accountCountByInstitution = new Map<string, number>();
  for (const account of accounts) {
    accountCountByInstitution.set(account.institutionId, (accountCountByInstitution.get(account.institutionId) || 0) + 1);
  }
  const recordCountByAccount = new Map<string, number>();
  const recordCountByInstitution = new Map<string, number>();
  for (const record of records) {
    recordCountByAccount.set(record.accountId, (recordCountByAccount.get(record.accountId) || 0) + 1);
    recordCountByInstitution.set(record.institutionId, (recordCountByInstitution.get(record.institutionId) || 0) + 1);
  }

  function institutionDeleteImpact(institutionId: string) {
    const accountCount = accountCountByInstitution.get(institutionId) || 0;
    const recordCount = recordCountByInstitution.get(institutionId) || 0;
    if (accountCount === 0 && recordCount === 0) return undefined;
    return `also deletes ${accountCount} account${accountCount === 1 ? "" : "s"}, ${recordCount} record${recordCount === 1 ? "" : "s"}`;
  }

  function accountDeleteImpact(accountId: string) {
    const recordCount = recordCountByAccount.get(accountId) || 0;
    if (recordCount === 0) return undefined;
    return `also deletes ${recordCount} record${recordCount === 1 ? "" : "s"}`;
  }
  const accountTypes = Array.from(new Set([...baseAccountTypes, ...accounts.map((account) => account.type).filter(Boolean)])).sort((left, right) =>
    left.localeCompare(right)
  );

  const monthlyRecordsState = parseMonthlyRecordsState(rawSearchParams);
  const monthlyRecordRows: MonthlyRecordRow[] = records.map((record) => ({
    ...record,
    institutionLabel: institutionName.get(record.institutionId) || "Unknown",
    accountLabel: accountById.get(record.accountId)?.name || "Unknown"
  }));
  const sortedMonthlyRecordRows = sortByComparator(
    monthlyRecordRows,
    MONTHLY_RECORD_COMPARATORS[monthlyRecordsState.sort],
    monthlyRecordsState.dir
  );
  const monthlyRecordsPage = paginate(sortedMonthlyRecordRows, monthlyRecordsState.page, monthlyRecordsState.size);
  const monthlyRecordsPageState: MonthlyRecordsState = { ...monthlyRecordsState, page: monthlyRecordsPage.page };
  const monthlyRecordsPageSizeHrefs = Object.fromEntries(
    MONTHLY_RECORD_PAGE_SIZES.map((size) => [size, buildMonthlyRecordsHref(rawSearchParams, monthlyRecordsPageState, { size, page: 1 })])
  );
  const monthlyRecordsPrevHref =
    monthlyRecordsPage.page > 1 ? buildMonthlyRecordsHref(rawSearchParams, monthlyRecordsPageState, { page: monthlyRecordsPage.page - 1 }) : null;
  const monthlyRecordsNextHref =
    monthlyRecordsPage.page < monthlyRecordsPage.totalPages
      ? buildMonthlyRecordsHref(rawSearchParams, monthlyRecordsPageState, { page: monthlyRecordsPage.page + 1 })
      : null;

  function monthlyRecordSortHref(key: MonthlyRecordSortKey) {
    const nextDir: SortDirection = monthlyRecordsState.sort === key ? (monthlyRecordsState.dir === "asc" ? "desc" : "asc") : "asc";
    return buildMonthlyRecordsHref(rawSearchParams, monthlyRecordsPageState, { sort: key, dir: nextDir, page: 1 });
  }

  return (
    <>
      <datalist id="account-type-options">
        {accountTypes.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>

      <div className="flex flex-col gap-4 rounded-lg border bg-background/85 p-5 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.55)] backdrop-blur sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Admin</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Manage institutions, accounts, month-end values, user access, and AI import controls."
            : canEditPortfolio
              ? "Manage institutions, accounts, and month-end values."
              : "Manage user access only."}
        </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground sm:min-w-80">
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p>Institutions</p>
            <p className="text-lg font-semibold text-foreground">{institutions.length}</p>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p>Accounts</p>
            <p className="text-lg font-semibold text-foreground">{accounts.length}</p>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p>Users</p>
            <p className="text-lg font-semibold text-foreground">{users.length}</p>
          </div>
        </div>
      </div>

      {loadError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
            <AlertCircle />
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <AiFeatureToggleCard enabled={aiImportSettings.enabled} runtimeConfig={runtimeConfig} />
          <DemoFeatureToggleCard enabled={aiImportSettings.demoEnabled} />
        </section>
      ) : null}

      {canEditPortfolio ? (
        <>
          <section className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Institution</CardTitle>
                <CardDescription>Add a financial institution and upload its logo.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={saveInstitutionAction} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="institution-name">Name</Label>
                    <Input id="institution-name" name="name" placeholder="Wealthsimple" required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="institution-logo">Logo</Label>
                    <Input id="institution-logo" name="logo" type="file" accept="image/*" />
                  </div>
                  <Button type="submit">
                    <Plus data-icon="inline-start" />
                    Save institution
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Create an account under an institution.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={saveAccountAction} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="account-institution">Institution</Label>
                    <Select name="institutionId" required>
                      <SelectTrigger id="account-institution">
                        <SelectValue placeholder="Select institution" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {institutions.map((institution) => (
                            <SelectItem key={institution.id} value={institution.id}>
                              {institution.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="account-name">Name</Label>
                    <Input id="account-name" name="name" placeholder="Family RESP" required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="account-type">Type</Label>
                    <Input id="account-type" name="type" list="account-type-options" placeholder="RESP, TFSA, Cash..." required />
                  </div>
                  <Button type="submit" disabled={institutions.length === 0}>
                    <Plus data-icon="inline-start" />
                    Save account
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly record</CardTitle>
                <CardDescription>Upsert a month-end invested amount and current value.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={saveMonthlyRecordAction} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="record-account">Account</Label>
                    <Select name="accountId" required>
                      <SelectTrigger id="record-account">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {institutionName.get(account.institutionId)} / {account.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="record-month">Month</Label>
                      <Input id="record-month" name="month" type="month" required />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="record-currency">Currency</Label>
                      <Select name="currencyCode" defaultValue="USD" required>
                        <SelectTrigger id="record-currency">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {["CAD", "USD", "NGN"].map((code) => (
                              <SelectItem key={code} value={code}>
                                {code}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="amount-invested">Invested</Label>
                      <Input id="amount-invested" name="amountInvested" type="number" min="0" step="0.01" required />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="current-value">Current value</Label>
                    <Input id="current-value" name="currentValue" type="number" min="0" step="0.01" required />
                  </div>
                  <Button type="submit" disabled={accounts.length === 0}>
                    <Plus data-icon="inline-start" />
                    Save monthly record
                  </Button>
                </form>
              </CardContent>
            </Card>
          </section>

          <Card className="overflow-hidden border-border/70 bg-gradient-to-b from-background via-background to-muted/20 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.32)] dark:shadow-[0_24px_60px_-34px_rgba(0,0,0,0.82)]">
            <CardHeader>
              <CardTitle>Edit accounts</CardTitle>
              <CardDescription>Update account names and types in place. Changes reflow through the dashboard immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {accounts.length > 0 ? (
                accounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid gap-3 rounded-xl border border-border/70 bg-background/80 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.28)] lg:grid-cols-[1.1fr_1.2fr_180px_auto_auto]"
                  >
                    <div className="flex flex-col justify-center gap-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Institution</p>
                      <p className="font-medium">{institutionName.get(account.institutionId) || "Unknown"}</p>
                    </div>
                    <form action={saveAccountAction} className="contents">
                      <input type="hidden" name="id" value={account.id} />
                      <input type="hidden" name="institutionId" value={account.institutionId} />
                      <div className="flex flex-col gap-2">
                        <Label className="sr-only" htmlFor={`edit-account-name-${account.id}`}>
                          Account name
                        </Label>
                        <Input id={`edit-account-name-${account.id}`} name="name" defaultValue={account.name} required />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label className="sr-only" htmlFor={`edit-account-type-${account.id}`}>
                          Account type
                        </Label>
                        <Input
                          id={`edit-account-type-${account.id}`}
                          name="type"
                          list="account-type-options"
                          defaultValue={account.type}
                          required
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button type="submit">
                          <Save data-icon="inline-start" />
                          Save
                        </Button>
                      </div>
                    </form>
                    <div className="flex items-center justify-end">
                      <DeleteRecordButton kind="accounts" id={account.id} impactMessage={accountDeleteImpact(account.id)} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No accounts yet.</p>
              )}
            </CardContent>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.32)]">
              <CardHeader>
                <CardTitle>Edit institutions</CardTitle>
                <CardDescription>Rename institutions without losing their logos, accounts, or monthly records.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {institutions.length > 0 ? (
                  institutions.map((institution) => (
                    <div
                      key={institution.id}
                      className="grid gap-3 rounded-xl border border-border/70 bg-background/80 p-4 sm:grid-cols-[auto_1fr_auto_auto]"
                    >
                      <Avatar>
                        {institution.logoUrl ? <AvatarImage src={institution.logoUrl} alt={`${institution.name} logo`} /> : null}
                        <AvatarFallback>{institution.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <form action={saveInstitutionAction} className="contents">
                        <input type="hidden" name="id" value={institution.id} />
                        <div className="flex flex-col gap-2">
                          <Label className="sr-only" htmlFor={`edit-institution-name-${institution.id}`}>
                            Institution name
                          </Label>
                          <Input id={`edit-institution-name-${institution.id}`} name="name" defaultValue={institution.name} required />
                        </div>
                        <Button type="submit">
                          <Save data-icon="inline-start" />
                          Save
                        </Button>
                      </form>
                      <DeleteRecordButton kind="institutions" id={institution.id} impactMessage={institutionDeleteImpact(institution.id)} />
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No institutions yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.32)]">
              <CardHeader>
                <CardTitle>Account type tools</CardTitle>
                <CardDescription>Add a new type by typing it on an account, or rename a type across existing accounts.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <form action={renameAccountTypeAction} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="rename-account-type-current">Current type</Label>
                    <Input id="rename-account-type-current" name="currentType" list="account-type-options" placeholder="TFSA" required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="rename-account-type-new">New type</Label>
                    <Input id="rename-account-type-new" name="newType" list="account-type-options" placeholder="Registered TFSA" required />
                  </div>
                  <Button type="submit" disabled={accounts.length === 0}>
                    <Save data-icon="inline-start" />
                    Rename type
                  </Button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {accountTypes.map((type) => (
                    <Badge key={type} variant="secondary">
                      {type}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Update institution logo</CardTitle>
                <CardDescription>Replace the logo for an existing institution.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={updateInstitutionLogoAction} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="logo-institution">Institution</Label>
                    <Select name="institutionId" required>
                      <SelectTrigger id="logo-institution">
                        <SelectValue placeholder="Select institution" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {institutions.map((institution) => (
                            <SelectItem key={institution.id} value={institution.id}>
                              {institution.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="replacement-logo">Logo</Label>
                    <Input id="replacement-logo" name="logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required />
                  </div>
                  <Button type="submit" disabled={institutions.length === 0}>
                    <ImageUp data-icon="inline-start" />
                    Update logo
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CSV import</CardTitle>
                <CardDescription>Import institutions, accounts, and month-end records in one file.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <form action={importCsvAction} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="csv-import">CSV file</Label>
                    <Input id="csv-import" name="csv" type="file" accept=".csv,text/csv" required />
                  </div>
                  <Button type="submit">
                    <FileUp data-icon="inline-start" />
                    Import CSV
                  </Button>
                </form>
                <div className="rounded-md border">
                  <div className="flex items-center justify-between border-b p-3">
                    <p className="text-sm font-medium">Template preview</p>
                    <Button asChild variant="outline" size="sm">
                      <a href="/admin/monthly-records-template.csv" download>
                        <Download data-icon="inline-start" />
                        Download
                      </a>
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>institution_name</TableHead>
                        <TableHead>account_name</TableHead>
                      <TableHead>account_type</TableHead>
                      <TableHead>month</TableHead>
                      <TableHead>amount_invested</TableHead>
                      <TableHead>current_value</TableHead>
                      <TableHead>currency_code</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>Wealthsimple</TableCell>
                        <TableCell>Growth TFSA</TableCell>
                        <TableCell>TFSA</TableCell>
                      <TableCell>2026-01</TableCell>
                      <TableCell>12000</TableCell>
                      <TableCell>12850</TableCell>
                      <TableCell>CAD</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>CIBC</TableCell>
                      <TableCell>Family RESP</TableCell>
                      <TableCell>RESP</TableCell>
                      <TableCell>2026-01</TableCell>
                      <TableCell>5400</TableCell>
                      <TableCell>5610</TableCell>
                      <TableCell>CAD</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Institutions</CardTitle>
                <CardDescription>Logo branding used across account cards and tables.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {institutions.map((institution) => (
                      <TableRow key={institution.id}>
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
                          <DeleteRecordButton kind="institutions" id={institution.id} impactMessage={institutionDeleteImpact(institution.id)} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {institutions.length === 0 ? <EmptyRow colSpan={2} message="No institutions yet." /> : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>Accounts belong to one institution.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Institution</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>{institutionName.get(account.institutionId) || "Unknown"}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell>{account.type}</TableCell>
                        <TableCell className="text-right">
                          <DeleteRecordButton kind="accounts" id={account.id} impactMessage={accountDeleteImpact(account.id)} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {accounts.length === 0 ? <EmptyRow colSpan={4} message="No accounts yet." /> : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <Card id="monthly-records">
            <CardHeader>
              <CardTitle>Monthly records</CardTitle>
              <CardDescription>Each account can have one record per month.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <MonthlyRecordSortHeader
                          href={monthlyRecordSortHref("month")}
                          active={monthlyRecordsState.sort === "month"}
                          dir={monthlyRecordsState.dir}
                        >
                          Month
                        </MonthlyRecordSortHeader>
                      </TableHead>
                      <TableHead>
                        <MonthlyRecordSortHeader
                          href={monthlyRecordSortHref("institution")}
                          active={monthlyRecordsState.sort === "institution"}
                          dir={monthlyRecordsState.dir}
                        >
                          Institution
                        </MonthlyRecordSortHeader>
                      </TableHead>
                      <TableHead>
                        <MonthlyRecordSortHeader
                          href={monthlyRecordSortHref("account")}
                          active={monthlyRecordsState.sort === "account"}
                          dir={monthlyRecordsState.dir}
                        >
                          Account
                        </MonthlyRecordSortHeader>
                      </TableHead>
                      <TableHead>
                        <MonthlyRecordSortHeader
                          href={monthlyRecordSortHref("currency")}
                          active={monthlyRecordsState.sort === "currency"}
                          dir={monthlyRecordsState.dir}
                        >
                          Currency
                        </MonthlyRecordSortHeader>
                      </TableHead>
                      <TableHead className="text-right">
                        <MonthlyRecordSortHeader
                          href={monthlyRecordSortHref("invested")}
                          active={monthlyRecordsState.sort === "invested"}
                          dir={monthlyRecordsState.dir}
                          align="right"
                        >
                          Invested
                        </MonthlyRecordSortHeader>
                      </TableHead>
                      <TableHead className="text-right">
                        <MonthlyRecordSortHeader
                          href={monthlyRecordSortHref("current")}
                          active={monthlyRecordsState.sort === "current"}
                          dir={monthlyRecordsState.dir}
                          align="right"
                        >
                          Current value
                        </MonthlyRecordSortHeader>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyRecordsPage.items.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{monthLabel(record.month)}</TableCell>
                        <TableCell>{record.institutionLabel}</TableCell>
                        <TableCell>{record.accountLabel}</TableCell>
                        <TableCell>{record.currencyCode || "USD"}</TableCell>
                        <TableCell className="text-right">{currency(record.amountInvested, record.currencyCode)}</TableCell>
                        <TableCell className="text-right">{currency(record.currentValue, record.currencyCode)}</TableCell>
                        <TableCell className="text-right">
                          <DeleteRecordButton kind="monthlyRecords" id={record.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {monthlyRecordsPage.items.length === 0 ? <EmptyRow colSpan={7} message="No monthly records yet." /> : null}
                  </TableBody>
                </Table>
              </div>
              <MonthlyRecordsPaginationControls
                start={monthlyRecordsPage.start}
                end={Math.min(monthlyRecordsPage.start + monthlyRecordsState.size, monthlyRecordsPage.totalItems)}
                totalItems={monthlyRecordsPage.totalItems}
                pageSize={monthlyRecordsState.size}
                pageSizeHrefs={monthlyRecordsPageSizeHrefs}
                prevHref={monthlyRecordsPrevHref}
                nextHref={monthlyRecordsNextHref}
              />
            </CardContent>
          </Card>
        </>
      ) : null}

      {canManageUsers ? (
        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>User access</CardTitle>
              <CardDescription>
                {isAdmin
                  ? "Create admins, operators, user managers, or viewers."
                  : "Create viewer accounts only."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createUserAction} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-username">Username</Label>
                  <Input id="new-username" name="username" autoComplete="username" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-password">Temporary password</Label>
                  <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-role">Role</Label>
                  {isAdmin ? (
                    <Select name="role" defaultValue="viewer" required>
                      <SelectTrigger id="new-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="user_manager">User manager</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <input type="hidden" name="role" value="viewer" />
                      <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">Viewer</div>
                    </>
                  )}
                </div>
                <Button type="submit">
                  <UserPlus data-icon="inline-start" />
                  Create user
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Passwords are stored as salted scrypt hashes and never displayed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    {isAdmin ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          <Shield data-icon="inline-start" />
                          {user.role}
                        </Badge>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          {user.username === session.username ? null : (
                            <DeleteUserButton id={user.id} username={user.username} currentUsername={session.username} />
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {users.length === 0 ? (
                    <EmptyRow colSpan={isAdmin ? 3 : 2} message="No users yet. The bootstrap admin is created on first login." />
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-20 text-center text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}
