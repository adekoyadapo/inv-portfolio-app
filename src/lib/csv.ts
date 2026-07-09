import "server-only";

import { z } from "zod";

import { listAccounts, listInstitutions, upsertAccount, upsertInstitution, upsertMonthlyRecord } from "@/lib/elasticsearch";

export const monthlyRecordCsvHeaders = [
  "institution_name",
  "account_name",
  "account_type",
  "month",
  "amount_invested",
  "current_value",
  "currency_code"
] as const;

export const monthlyRecordCsvTemplate = `${monthlyRecordCsvHeaders.join(",")}
Wealthsimple,Growth TFSA,TFSA,2026-01,12000,12850
CIBC,Family RESP,RESP,2026-01,5400,5610
Questrade,Index ETF,Index,2026-01,22000,23175
`;

const csvRowSchema = z.object({
  institution_name: z.string().trim().min(1),
  account_name: z.string().trim().min(1),
  account_type: z.string().trim().min(1),
  month: z.string().trim().regex(/^\d{4}-\d{2}$/),
  amount_invested: z.coerce.number().nonnegative(),
  current_value: z.coerce.number().nonnegative(),
  currency_code: z.string().trim().min(1).default("USD")
});

export async function importMonthlyRecordsCsv(file: File) {
  if (file.size > 512 * 1024) {
    throw new Error("CSV file must be 512KB or smaller.");
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV must include a header row and at least one data row.");

  const headers = rows[0].map((header) => header.trim());
  const requiredHeaders = monthlyRecordCsvHeaders.filter((header) => header !== "currency_code");
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}.`);
  }

  const institutions = await listInstitutions();
  const accounts = await listAccounts();
  const institutionByName = new Map(institutions.map((institution) => [normalize(institution.name), institution]));
  const accountByKey = new Map(accounts.map((account) => [`${account.institutionId}:${normalize(account.name)}:${normalize(account.type)}`, account]));

  let imported = 0;
  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim().length === 0)) continue;

    const object = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    const parsed = csvRowSchema.parse(object);

    let institution = institutionByName.get(normalize(parsed.institution_name));
    if (!institution) {
      institution = await upsertInstitution({ name: parsed.institution_name });
      institutionByName.set(normalize(institution.name), institution);
    }

    const accountKey = `${institution.id}:${normalize(parsed.account_name)}:${normalize(parsed.account_type)}`;
    let account = accountByKey.get(accountKey);
    if (!account) {
      account = await upsertAccount({
        institutionId: institution.id,
        name: parsed.account_name,
        type: parsed.account_type
      });
      accountByKey.set(accountKey, account);
    }

    await upsertMonthlyRecord({
      institutionId: institution.id,
      accountId: account.id,
      month: parsed.month,
      amountInvested: parsed.amount_invested,
      currentValue: parsed.current_value,
      currencyCode: parsed.currency_code
    });
    imported += 1;
  }

  return { imported };
}

export function stringifyCsv(headers: readonly string[], rows: string[][]): string {
  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n") + "\n";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
