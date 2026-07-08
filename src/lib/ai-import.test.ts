import { readFileSync } from "node:fs";
import path from "node:path";

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { analyzeInvestmentStatement } from "@/lib/ai-import";
import { extractPdfText } from "@/lib/pdf-extract";

describe("extractPdfText", () => {
  it("extracts text from a real statement PDF fixture", async () => {
    const pdfPath = path.resolve(process.cwd(), "onlineStatement.pdf");
    const bytes = readFileSync(pdfPath);

    const text = await extractPdfText(bytes);

    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toContain("CIBC Securities Inc.");
  });
});

describe("analyzeInvestmentStatement", () => {
  it("builds CSV-compatible monthly snapshots from BMO transaction XLSX exports", async () => {
    const xlsxPath = path.resolve(process.cwd(), "Activities_for_01Jan2025_to_06Jul2026.xlsx");
    const bytes = readFileSync(xlsxPath);

    const batch = await analyzeInvestmentStatement({
      fileName: "Activities_for_01Jan2025_to_06Jul2026.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
      config: {
        provider: "gemini",
        model: "unused-for-local-spreadsheet-parser",
        baseUrl: "",
        apiKey: ""
      }
    });

    expect(batch.drafts.length).toBeGreaterThanOrEqual(32);
    expect(batch.notes).toContain("Generated CSV-compatible monthly snapshots from transaction history.");

    const respMarch = batch.drafts.find(
      (draft) => draft.accountName === "Individual family RESP - 53447846" && draft.month === "2025-03" && draft.currencyCode === "CAD"
    );
    expect(respMarch?.amountInvested).toBe(360);
    expect(respMarch?.currentValue).toBe(360);

    const respNovember = batch.drafts.find(
      (draft) => draft.accountName === "Individual family RESP - 53447846" && draft.month === "2025-11" && draft.currencyCode === "CAD"
    );
    expect(respNovember?.amountInvested).toBeGreaterThan(0);
    expect(respNovember?.currentValue).toBeGreaterThan(0);

    expect(batch.drafts.some((draft) => draft.summary.includes("set to null"))).toBe(false);
    expect(batch.drafts.every((draft) => draft.currentValue > 0)).toBe(true);

    // Regression coverage for the transaction-only gain/loss fix: an account that buys the
    // same symbol more than once at different prices should show a real, fluctuating
    // gain/loss instead of a flat $0 every month (the RESP account rebuys NFLX in Nov 2025
    // and Jan 2026 at different prices).
    const respTimeline = batch.drafts
      .filter((draft) => draft.accountName === "Individual family RESP - 53447846" && draft.currencyCode === "CAD")
      .sort((left, right) => left.month.localeCompare(right.month));
    const gains = respTimeline.map((draft) => draft.currentValue - draft.amountInvested);
    expect(gains.some((gain) => gain !== 0)).toBe(true);
    expect(new Set(gains.map((gain) => gain.toFixed(2))).size).toBeGreaterThan(1);
  });

  it("does not invent a loss when a transaction export has no balance column", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        institution_name: "Imported institution",
        account_number: "52831379",
        account_type: "Individual TFSA",
        transaction_date: "2025-01-15",
        action: "Deposit",
        amount: "1000.00",
        currency_code: "CAD"
      },
      {
        institution_name: "Imported institution",
        account_number: "52831379",
        account_type: "Individual TFSA",
        transaction_date: "2025-02-15",
        action: "Fee",
        amount: "-970.93",
        currency_code: "CAD"
      }
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Transactions");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const batch = await analyzeInvestmentStatement({
      fileName: "transaction-export.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
      config: {
        provider: "gemini",
        model: "unused-for-local-spreadsheet-parser",
        baseUrl: "",
        apiKey: ""
      }
    });

    const february = batch.drafts.find(
      (draft) => draft.accountName === "Individual TFSA - 52831379" && draft.month === "2025-02" && draft.currencyCode === "CAD"
    );

    expect(february?.amountInvested).toBe(1000);
    expect(february?.currentValue).toBe(1000);
    expect(february?.notes.join(" ")).toContain("No balance column or trade activity was present; current value was set to the invested amount");
  });

  it("parses a balance-snapshot sample statement from an alternate provider format", async () => {
    const csvPath = path.resolve(process.cwd(), "fixtures/sample-statements/balance-snapshot-sample.csv");
    const bytes = readFileSync(csvPath);

    const batch = await analyzeInvestmentStatement({
      fileName: "balance-snapshot-sample.csv",
      mimeType: "text/csv",
      bytes,
      config: { provider: "gemini", model: "unused-for-local-spreadsheet-parser", baseUrl: "", apiKey: "" }
    });

    expect(batch.drafts).toHaveLength(2);
    const january = batch.drafts.find((draft) => draft.month === "2025-01");
    expect(january?.institutionName).toBe("Fictional Trust Co");
    expect(january?.amountInvested).toBe(5000);
    expect(january?.currentValue).toBe(5120);
    expect(january?.confidence).toBe(0.9);
  });

  it("parses a transaction sample using alternate column names, with real gain/loss from repriced trades", async () => {
    const csvPath = path.resolve(process.cwd(), "fixtures/sample-statements/transaction-activity-sample.csv");
    const bytes = readFileSync(csvPath);

    const batch = await analyzeInvestmentStatement({
      fileName: "transaction-activity-sample.csv",
      mimeType: "text/csv",
      bytes,
      config: { provider: "gemini", model: "unused-for-local-spreadsheet-parser", baseUrl: "", apiKey: "" }
    });

    const timeline = batch.drafts.filter((draft) => draft.accountName === "Summary - SW-0001").sort((left, right) => left.month.localeCompare(right.month));
    expect(timeline).toHaveLength(2);
    expect(timeline[0].month).toBe("2025-01");
    expect(timeline[0].amountInvested).toBe(1000);
    expect(timeline[0].currentValue).toBe(1000);
    expect(timeline[1].month).toBe("2025-02");
    expect(timeline[1].currentValue).toBeCloseTo(1062.5, 2);
    expect(timeline[1].currentValue).not.toBe(timeline[1].amountInvested);
  });

  it("parses a transaction sample with an ending-balance column under alternate header names", async () => {
    const csvPath = path.resolve(process.cwd(), "fixtures/sample-statements/transaction-with-balance-sample.csv");
    const bytes = readFileSync(csvPath);

    const batch = await analyzeInvestmentStatement({
      fileName: "transaction-with-balance-sample.csv",
      mimeType: "text/csv",
      bytes,
      config: { provider: "gemini", model: "unused-for-local-spreadsheet-parser", baseUrl: "", apiKey: "" }
    });

    const timeline = batch.drafts.filter((draft) => draft.accountName === "Summary - TD-778899").sort((left, right) => left.month.localeCompare(right.month));
    expect(timeline).toHaveLength(2);
    expect(timeline[0].currentValue).toBe(1550);
    expect(timeline[0].confidence).toBe(0.78);
    expect(timeline[1].currentValue).toBe(1750);
    expect(timeline[1].confidence).toBe(0.78);
  });
});
