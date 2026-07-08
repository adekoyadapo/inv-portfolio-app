import "server-only";

import { createHash } from "node:crypto";

import * as XLSX from "xlsx";

import { extractPdfText } from "@/lib/pdf-extract";
import type { AiImportBatch, AiImportDraft, AiImportFileProgress, AiImportStep, AiRuntimeCredentials } from "@/lib/types";

type AnalyzeInput = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  config: AiRuntimeCredentials;
  onStep?: (step: AiImportStep) => void;
  onFile?: (file: AiImportFileProgress) => void;
};

const analysisSystemPrompt = [
  "You extract investment statement data into strict JSON.",
  "Return ONLY JSON with this shape:",
  "{",
  '  "sourceName": string,',
  '  "sourceType": "pdf" | "image" | "text" | "spreadsheet",',
  '  "notes": string[],',
  '  "sourceFingerprint": string,',
  '  "drafts": [',
  "    {",
  '      "sourceName": string,',
  '      "sourceType": "pdf" | "image" | "text" | "spreadsheet",',
  '      "summary": string,',
  '      "notes": string[],',
  '      "sourceFingerprint": string,',
  '      "institutionName": string,',
  '      "accountName": string,',
  '      "accountType": string,',
  '      "month": "YYYY-MM",',
  '      "currencyCode": "CAD" | "USD" | "NGN" | string,',
  '      "amountInvested": number,',
  '      "currentValue": number,',
  '      "confidence": number',
  "    }",
  "  ]",
  "}",
  "Never combine multiple accounts into one summary.",
  "If multiple account groups are present, return one draft per account group.",
  "Registered plan labels such as DPSP, RRSP, TFSA, RESP, FHSA, RRIF, LIRA, and LIF are distinct accounts even when they share the same plan or account number.",
  "If a statement summary table has separate DPSP and RRSP rows, return separate DPSP and RRSP drafts for the same month.",
  "Use stable account names across months. If an account number or masked account number is visible, include the account type and last visible digits in accountName.",
  "For statements from the same institution, keep accountName consistent even when source titles vary month to month.",
  "Never use placeholders like 'Unknown' unless no name exists anywhere in the source.",
  "Never invent values that are not present.",
  "If the source is ambiguous, lower confidence and add a note.",
  "Prefer the source's native currency code when visible."
].join(" ");

export async function analyzeInvestmentStatement(input: AnalyzeInput) {
  const sourceType = detectSourceType(input.mimeType, input.fileName);
  const sourceFingerprint = fingerprintBytes(input.bytes);

  await stage(input.onStep, "validate", "Validate upload", "File received and format checked.");
  await stage(
    input.onStep,
    "read",
    sourceType === "spreadsheet" ? "Read spreadsheet" : sourceType === "pdf" ? "Read PDF" : "Read source",
    sourceType === "spreadsheet"
      ? "Extracting rows and grouped values."
      : sourceType === "pdf"
        ? "Extracting page text and structure."
        : "Preparing content for analysis."
  );

  const extractedText = sourceType === "pdf" ? await extractPdfText(input.bytes) : sourceType === "spreadsheet" ? extractSpreadsheetText(input.bytes) : input.bytes.toString("utf8");
  const batch =
    sourceType === "spreadsheet"
      ? await buildSpreadsheetBatch({
          fileName: input.fileName,
          bytes: input.bytes,
          sourceFingerprint,
          config: input.config,
          mimeType: input.mimeType,
          onStep: input.onStep
        })
      : await buildModelBatch({
          fileName: input.fileName,
          sourceType,
          extractedText,
          sourceFingerprint,
          config: input.config,
          bytes: input.bytes,
          mimeType: input.mimeType,
          onStep: input.onStep
        });

  await stage(input.onStep, "normalize", "Normalize payload", `Shaping ${batch.drafts.length} draft${batch.drafts.length === 1 ? "" : "s"} into review rows.`);
  emitStep(
    input.onStep,
    "review",
    "Ready for review",
    batch.drafts.length > 0
      ? `${formatMoney(batch.drafts.reduce((sum, draft) => sum + draft.currentValue, 0), batch.drafts[0]?.currencyCode || "USD")} across ${batch.drafts.length} draft${batch.drafts.length === 1 ? "" : "s"} ready for review.`
      : "No usable summaries were found in the source.",
    "complete"
  );
  return batch;
}

export async function analyzeInvestmentStatements(inputs: AnalyzeInput[]) {
  if (inputs.length === 0) {
    throw new Error("Choose at least one PDF, image, or spreadsheet export before analyzing.");
  }

  if (inputs.length === 1) {
    const input = inputs[0];
    input.onFile?.({
      id: fileProgressId(input.fileName, 0),
      fileName: input.fileName,
      bytes: input.bytes.length,
      status: "running",
      detail: "Processing statement.",
      progress: 35
    });
    const batch = await analyzeInvestmentStatement(input);
    input.onFile?.({
      id: fileProgressId(input.fileName, 0),
      fileName: input.fileName,
      bytes: input.bytes.length,
      status: "complete",
      detail: `${batch.drafts.length} summary row${batch.drafts.length === 1 ? "" : "s"} extracted.`,
      progress: 100,
      draftCount: batch.drafts.length
    });
    return batch;
  }

  const batches: AiImportBatch[] = [];
  for (const [index, input] of inputs.entries()) {
    input.onFile?.({
      id: fileProgressId(input.fileName, index),
      fileName: input.fileName,
      bytes: input.bytes.length,
      status: "running",
      detail: `Processing file ${index + 1} of ${inputs.length}.`,
      progress: 35
    });
    await stage(
      input.onStep,
      "read",
      "Read source batch",
      `Analyzing ${input.fileName} (${index + 1} of ${inputs.length}).`
    );
    const batch = await analyzeInvestmentStatement(input);
    batches.push(batch);
    input.onFile?.({
      id: fileProgressId(input.fileName, index),
      fileName: input.fileName,
      bytes: input.bytes.length,
      status: "complete",
      detail: `${batch.drafts.length} summary row${batch.drafts.length === 1 ? "" : "s"} extracted.`,
      progress: 100,
      draftCount: batch.drafts.length
    });
  }

  const sourceTypes = Array.from(new Set(batches.map((batch) => batch.sourceType)));
  const sourceFingerprint = fingerprintText(batches.map((batch) => batch.sourceFingerprint).sort().join("|"));
  const sourceName =
    inputs.length <= 3
      ? inputs.map((input) => input.fileName).join(", ")
      : `${inputs.length} statement files`;
  const drafts = batches.flatMap((batch) =>
    batch.drafts.map((draft) => ({
      ...draft,
      sourceFingerprint: draft.sourceFingerprint || batch.sourceFingerprint,
      notes: Array.from(new Set([...draft.notes, `Imported from ${draft.sourceName || batch.sourceName}.`]))
    }))
  );

  const batch = finalizeBatch({
    sourceName,
    sourceType: sourceTypes.length === 1 ? sourceTypes[0] : "text",
    sourceFingerprint,
    notes: [
      `Analyzed ${inputs.length} statement file${inputs.length === 1 ? "" : "s"} as one review batch.`,
      ...batches.flatMap((item) => item.notes)
    ],
    drafts
  });

  emitStep(
    inputs[0].onStep,
    "review",
    "Ready for review",
    `${batch.drafts.length} summary row${batch.drafts.length === 1 ? "" : "s"} ready across ${inputs.length} files.`,
    "complete"
  );
  return batch;
}

export function fileProgressId(fileName: string, index: number) {
  return `${index}:${fileName}`;
}

function detectSourceType(mimeType: string, fileName: string): AiImportBatch["sourceType"] {
  const lower = fileName.toLowerCase();
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv" ||
    lower.endsWith(".csv") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  ) {
    return "spreadsheet";
  }
  return "text";
}

async function buildModelBatch(input: {
  fileName: string;
  sourceType: AiImportBatch["sourceType"];
  extractedText: string;
  sourceFingerprint: string;
  config: AiRuntimeCredentials;
  bytes: Buffer;
  mimeType: string;
  onStep?: AnalyzeInput["onStep"];
}): Promise<AiImportBatch> {
  const prompt = buildPrompt({
    fileName: input.fileName,
    sourceType: input.sourceType,
    extractedText: input.extractedText,
    sourceFingerprint: input.sourceFingerprint
  });

  await stage(input.onStep, "infer", "LLM extraction", `Using ${input.config.provider} / ${input.config.model}.`);

  const raw = await requestProviderDraft({
    provider: input.config.provider,
    model: input.config.model,
    baseUrl: input.config.baseUrl,
    apiKey: input.config.apiKey,
    mimeType: input.mimeType,
    bytes: input.bytes,
    prompt,
    sourceType: input.sourceType,
    sourceFingerprint: input.sourceFingerprint
  }).catch(async (error) => {
    if (input.sourceType === "pdf" && input.extractedText.trim().length > 0) {
      await stage(input.onStep, "fallback", "Local fallback", "Provider call failed, using text extraction fallback.");
      return buildFallbackBatch({
        fileName: input.fileName,
        sourceType: input.sourceType,
        extractedText: input.extractedText,
        sourceFingerprint: input.sourceFingerprint,
        reason: error instanceof Error ? error.message : "Provider unavailable"
      });
    }

    throw error;
  });

  return normalizeBatch(raw, input.fileName, input.sourceType, input.extractedText, input.sourceFingerprint);
}

function buildPrompt(input: { fileName: string; sourceType: AiImportBatch["sourceType"]; extractedText: string; sourceFingerprint: string }) {
  return [
    analysisSystemPrompt,
    `Source name: ${input.fileName}`,
    `Source type: ${input.sourceType}`,
    `Source fingerprint: ${input.sourceFingerprint}`,
    input.extractedText ? `Extracted source text:\n${input.extractedText}` : "No extracted text was available.",
    "Return one draft per account group and per month that is visible in the source.",
    "If the source contains separate account sections, split them into separate drafts.",
    "If account numbers are visible, use the same account naming pattern across all months, for example 'TFSA 1234' or 'RRSP 9876'.",
    "If the source is a spreadsheet or export with one row per account/month, keep one draft per grouped account/month.",
    "Do not merge different accounts into one summary."
  ].join("\n\n");
}

async function requestProviderDraft(input: {
  provider: AiRuntimeCredentials["provider"];
  model: string;
  baseUrl?: string;
  apiKey: string;
  mimeType: string;
  bytes: Buffer;
  prompt: string;
  sourceType: AiImportBatch["sourceType"];
  sourceFingerprint: string;
}) {
  if (!input.model.trim()) {
    throw new Error("Configure a model before analyzing statements.");
  }

  if (!input.apiKey) {
    throw new Error("Configure an API key before analyzing statements.");
  }

  if (input.provider === "gemini") return requestGeminiDraft(input);
  if (input.provider === "anthropic") return requestAnthropicDraft(input);
  return requestOpenAiCompatibleDraft(input);
}

async function requestOpenAiCompatibleDraft(input: {
  provider: AiRuntimeCredentials["provider"];
  model: string;
  baseUrl?: string;
  apiKey: string;
  mimeType: string;
  bytes: Buffer;
  prompt: string;
  sourceType: AiImportBatch["sourceType"];
  sourceFingerprint: string;
}) {
  const url = `${normalizeBaseUrl(input.provider, input.baseUrl)}/chat/completions`;
  const body = {
    model: input.model,
    messages: [
      { role: "system", content: analysisSystemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: input.prompt },
          ...(input.sourceType === "image"
            ? [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.bytes.toString("base64")}`
                  }
                }
              ]
            : [])
        ]
      }
    ],
    temperature: 0
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(await response.text());
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content || "";
}

async function requestAnthropicDraft(input: {
  provider: AiRuntimeCredentials["provider"];
  model: string;
  baseUrl?: string;
  apiKey: string;
  mimeType: string;
  bytes: Buffer;
  prompt: string;
  sourceType: AiImportBatch["sourceType"];
  sourceFingerprint: string;
}) {
  const url = `${normalizeBaseUrl(input.provider, input.baseUrl)}/messages`;
  const body = {
    model: input.model,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: input.prompt },
          ...(input.sourceType === "image"
            ? [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: input.mimeType,
                    data: input.bytes.toString("base64")
                  }
                }
              ]
            : [])
        ]
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(await response.text());
  const json = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  return json.content?.map((part) => part.text || "").join("") || "";
}

async function requestGeminiDraft(input: {
  provider: AiRuntimeCredentials["provider"];
  model: string;
  baseUrl?: string;
  apiKey: string;
  mimeType: string;
  bytes: Buffer;
  prompt: string;
  sourceType: AiImportBatch["sourceType"];
  sourceFingerprint: string;
}) {
  const model = input.model.startsWith("models/") ? input.model : `models/${input.model}`;
  const url = `${normalizeBaseUrl(input.provider, input.baseUrl)}/${model}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: input.prompt },
          ...(input.sourceType === "image"
            ? [
                {
                  inlineData: {
                    mimeType: input.mimeType,
                    data: input.bytes.toString("base64")
                  }
                }
              ]
            : [])
        ]
      }
    ],
    generationConfig: {
      temperature: 0
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(await response.text());
  const json = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

function normalizeBatch(
  raw: string | AiImportBatch | AiImportDraft,
  fileName: string,
  sourceType: AiImportBatch["sourceType"],
  extractedText: string,
  sourceFingerprint: string
): AiImportBatch {
  if (typeof raw !== "string") {
    if (isBatchLike(raw)) {
      const drafts = raw.drafts.map((draft) => normalizeDraft(draft, fileName, sourceType, extractedText, sourceFingerprint));
      return finalizeBatch({
        sourceName: raw.sourceName || fileName,
        sourceType: raw.sourceType || sourceType,
        notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
        sourceFingerprint: raw.sourceFingerprint || sourceFingerprint,
        drafts
      });
    }

    return finalizeBatch({
      sourceName: fileName,
      sourceType,
      notes: [],
      sourceFingerprint,
      drafts: [normalizeDraft(raw, fileName, sourceType, extractedText, sourceFingerprint)]
    });
  }

  const parsed = parseJsonDraft(raw);
  if (!parsed) {
    return finalizeBatch({
      sourceName: fileName,
      sourceType,
      notes: ["Model output was not valid JSON."],
      sourceFingerprint,
      drafts: [buildFallbackDraft(fileName, sourceType, extractedText, sourceFingerprint, "Model output was not valid JSON.")]
    });
  }

  const parsedDrafts = Array.isArray(parsed.drafts) ? parsed.drafts : Array.isArray(parsed.summaries) ? parsed.summaries : null;
  if (parsedDrafts) {
    const drafts = parsedDrafts.map((draft) => normalizeDraft(draft, fileName, sourceType, extractedText, sourceFingerprint));
    return finalizeBatch({
      sourceName: parsed.sourceName || fileName,
      sourceType: parsed.sourceType || sourceType,
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
      sourceFingerprint: parsed.sourceFingerprint || sourceFingerprint,
      drafts
    });
  }

  return finalizeBatch({
    sourceName: fileName,
    sourceType,
    notes: [],
    sourceFingerprint,
    drafts: [normalizeDraft(parsed, fileName, sourceType, extractedText, sourceFingerprint)]
  });
}

function normalizeDraft(
  raw: Partial<AiImportDraft> | unknown,
  fileName: string,
  sourceType: AiImportBatch["sourceType"],
  extractedText: string,
  sourceFingerprint: string
): AiImportDraft {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const institutionName = normalizeText(String(value.institutionName || "")) || guessInstitutionFromText(extractedText.split(/\r?\n/).find(Boolean) || fileName);
  const accountType = buildAccountType(String(value.accountType || ""), extractedText);
  const accountName = buildAccountName(String(value.accountName || ""), extractedText, accountType);
  const month = normalizeMonth(String(value.month || "")) || extractLatestMonth(extractedText) || currentMonth();
  const currencyCode = normalizeCurrencyCode(String(value.currencyCode || "")) || detectCurrencyCode(extractedText) || "USD";
  const amountInvested = normalizeNumber(value.amountInvested);
  const currentValue = normalizeNumber(value.currentValue);
  const summary = normalizeText(String(value.summary || "")) || buildSummaryText(institutionName, month, currencyCode, currentValue);
  const confidence = clampNumber(Number(value.confidence || 0), 0, 1) || (extractedText.trim() ? 0.6 : 0.1);

  return {
    sourceName: normalizeText(String(value.sourceName || "")) || fileName,
    sourceType: (value.sourceType as AiImportDraft["sourceType"]) || sourceType,
    summary,
    notes: Array.isArray(value.notes) ? value.notes.map(String) : [],
    sourceFingerprint: normalizeText(String(value.sourceFingerprint || "")) || sourceFingerprint,
    institutionName,
    accountName,
    accountType,
    month,
    currencyCode,
    amountInvested,
    currentValue,
    confidence,
    selected: value.selected === false ? false : true,
    duplicateOf: typeof value.duplicateOf === "string" ? value.duplicateOf : undefined
  };
}

function finalizeBatch(input: AiImportBatch): AiImportBatch {
  const seen = new Map<string, string>();
  const drafts = input.drafts.map((draft, index) => {
    const key = draftKey(draft);
    const duplicateOf = seen.get(key);
    if (!duplicateOf) {
      seen.set(key, draft.accountName);
      return { ...draft, selected: draft.selected !== false, duplicateOf: draft.duplicateOf };
    }

    return {
      ...draft,
      selected: false,
      duplicateOf: duplicateOf || `Item ${index + 1}`
    };
  });

  return {
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    sourceFingerprint: input.sourceFingerprint,
    notes: input.notes,
    drafts
  };
}

function buildFallbackBatch(input: {
  fileName: string;
  sourceType: AiImportBatch["sourceType"];
  extractedText: string;
  sourceFingerprint: string;
  reason: string;
}): AiImportBatch {
  return finalizeBatch({
    sourceName: input.fileName,
    sourceType: input.sourceType,
    notes: [input.reason, "Review and adjust values before applying."],
    sourceFingerprint: input.sourceFingerprint,
    drafts: [buildFallbackDraft(input.fileName, input.sourceType, input.extractedText, input.sourceFingerprint, input.reason)]
  });
}

function buildFallbackDraft(
  fileName: string,
  sourceType: AiImportBatch["sourceType"],
  extractedText: string,
  sourceFingerprint: string,
  reason: string
): AiImportDraft {
  const month = extractLatestMonth(extractedText) || currentMonth();
  const currencyCode = detectCurrencyCode(extractedText) || "USD";
  const currentValue = sumAllMatches(extractedText, /(?:current value|market value|balance|ending value|account value)\s*[:\-]?\s*(?:C\$|US\$|\$|₦)?\s*([\d,]+(?:\.\d{1,2})?)/gi);
  const amountInvested = sumAllMatches(extractedText, /(?:amount invested|contributions?|invested)\s*[:\-]?\s*(?:C\$|US\$|\$|₦)?\s*([\d,]+(?:\.\d{1,2})?)/gi);
  const institutionName = guessInstitutionFromText(findFirstMatch(extractedText, /\b(?:institution|advisor|brokerage)\s*[:\-]\s*([A-Za-z0-9 &()/.-]{2,})/i) || fileName);

  return {
    sourceName: fileName,
    sourceType,
    summary: buildSummaryText(institutionName, month, currencyCode, currentValue),
    notes: [reason],
    sourceFingerprint,
    institutionName,
    accountName: buildAccountName(
      findFirstMatch(extractedText, /\b(?:account|portfolio|plan)\s*[:\-]\s*([A-Za-z0-9 &()/.-]{3,})/i),
      extractedText,
      buildAccountType("Summary", extractedText)
    ),
    accountType: buildAccountType("Summary", extractedText),
    month,
    currencyCode,
    amountInvested,
    currentValue,
    confidence: extractedText.trim().length > 0 ? 0.62 : 0.1,
    selected: true
  };
}

async function buildSpreadsheetBatch(input: {
  fileName: string;
  bytes: Buffer;
  sourceFingerprint: string;
  config: AiRuntimeCredentials;
  mimeType: string;
  onStep?: AnalyzeInput["onStep"];
}): Promise<AiImportBatch> {
  // raw: true keeps CSV cell text exactly as written; without it, SheetJS auto-detects
  // date-like strings (e.g. a bare "2025-01" month column) and silently reformats/shifts
  // them, which then fails our own date/month regexes.
  const workbook = XLSX.read(input.bytes, { type: "buffer", raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return finalizeBatch({
      sourceName: input.fileName,
      sourceType: "spreadsheet",
      notes: ["The spreadsheet did not contain a readable sheet."],
      sourceFingerprint: input.sourceFingerprint,
      drafts: []
    });
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false });
  const summaryRows = rows
    .map((row) => normalizeSpreadsheetRow(row))
    .filter((row): row is NonNullable<ReturnType<typeof normalizeSpreadsheetRow>> => Boolean(row));

  if (summaryRows.length > 0) {
    emitStep(
      input.onStep,
      "infer",
      "Structured spreadsheet parser",
      `Detected ${summaryRows.length} CSV-style summary row${summaryRows.length === 1 ? "" : "s"}; no LLM review was needed.`,
      "complete"
    );
    return finalizeSummarySpreadsheetBatch({
      fileName: input.fileName,
      sheetName,
      rows: summaryRows,
      sourceFingerprint: input.sourceFingerprint
    });
  }

  const transactionRows = rows
    .map((row) => normalizeTransactionSpreadsheetRow(row))
    .filter((row): row is NonNullable<ReturnType<typeof normalizeTransactionSpreadsheetRow>> => Boolean(row));

  if (transactionRows.length > 0) {
    emitStep(
      input.onStep,
      "infer",
      "Structured spreadsheet parser",
      `Detected ${transactionRows.length} transaction row${transactionRows.length === 1 ? "" : "s"}; no LLM review was needed.`,
      "complete"
    );
    return finalizeTransactionSpreadsheetBatch({
      fileName: input.fileName,
      sheetName,
      rows: transactionRows,
      sourceFingerprint: input.sourceFingerprint
    });
  }

  return buildModelBatch({
    fileName: input.fileName,
    sourceType: "spreadsheet",
    extractedText: extractSpreadsheetText(input.bytes),
    sourceFingerprint: input.sourceFingerprint,
    config: input.config,
    bytes: input.bytes,
    mimeType: input.mimeType,
    onStep: input.onStep
  });
}

function finalizeSummarySpreadsheetBatch(input: {
  fileName: string;
  sheetName: string;
  rows: Array<{
    institutionName: string;
    accountName: string;
    accountType: string;
    month: string;
    currencyCode: string;
    amountInvested: number;
    currentValue: number;
  }>;
  sourceFingerprint: string;
}): AiImportBatch {
  const grouped = new Map<string, AiImportDraft>();
  for (const row of input.rows) {
    const key = draftKey({
      institutionName: row.institutionName,
      accountName: row.accountName,
      accountType: row.accountType,
      month: row.month,
      currencyCode: row.currencyCode
    });
    const existing = grouped.get(key);
    if (existing) {
      existing.amountInvested += row.amountInvested;
      existing.currentValue += row.currentValue;
      existing.notes = Array.from(new Set([...existing.notes, `Combined ${existing.notes.length + 1} export rows.`]));
      continue;
    }

    grouped.set(key, {
      sourceName: input.fileName,
      sourceType: "spreadsheet",
      summary: buildSummaryText(row.institutionName, row.month, row.currencyCode, row.currentValue),
      notes: [`Imported from spreadsheet sheet ${input.sheetName}.`],
      sourceFingerprint: input.sourceFingerprint,
      institutionName: row.institutionName,
      accountName: row.accountName,
      accountType: row.accountType,
      month: row.month,
      currencyCode: row.currencyCode,
      amountInvested: row.amountInvested,
      currentValue: row.currentValue,
      confidence: 0.9,
      selected: true
    });
  }

  return finalizeBatch({
    sourceName: input.fileName,
    sourceType: "spreadsheet",
    notes: [`Parsed ${input.rows.length} spreadsheet row${input.rows.length === 1 ? "" : "s"}.`],
    sourceFingerprint: input.sourceFingerprint,
    drafts: Array.from(grouped.values())
  });
}

type TransactionTrade = { symbol: string; quantity: number; price: number; direction: 1 | -1 };

function finalizeTransactionSpreadsheetBatch(input: {
  fileName: string;
  sheetName: string;
  rows: Array<{
    institutionName: string;
    accountName: string;
    accountType: string;
    month: string;
    currencyCode: string;
    amount: number;
    investedActivity: number;
    valueActivity: number;
    tradeCost: number;
    balance?: number;
    transactionDate?: string;
    symbol?: string;
    quantity?: number;
    price?: number;
  }>;
  sourceFingerprint: string;
}): AiImportBatch {
  const grouped = new Map<string, {
    institutionName: string;
    accountName: string;
    accountType: string;
    month: string;
    currencyCode: string;
    monthlyInvested: number;
    monthlyValueActivity: number;
    monthlyTradeCost: number;
    monthlyCashDelta: number;
    trades: TransactionTrade[];
    netActivity: number;
    lastBalance?: number;
    latestDate: string;
    rowCount: number;
    notes: string[];
  }>();

  for (const row of input.rows) {
    const key = draftKey({
      institutionName: row.institutionName,
      accountName: row.accountName,
      accountType: row.accountType,
      month: row.month,
      currencyCode: row.currencyCode
    });
    const existing =
      grouped.get(key) ||
      {
        institutionName: row.institutionName,
        accountName: row.accountName,
        accountType: row.accountType,
        month: row.month,
        currencyCode: row.currencyCode,
        monthlyInvested: 0,
        monthlyValueActivity: 0,
        monthlyTradeCost: 0,
        monthlyCashDelta: 0,
        trades: [] as TransactionTrade[],
        netActivity: 0,
        lastBalance: undefined,
        latestDate: "",
        rowCount: 0,
        notes: [`Imported from transaction history sheet ${input.sheetName}.`]
      };

    existing.rowCount += 1;
    existing.netActivity += row.amount;
    existing.monthlyInvested += row.investedActivity;
    existing.monthlyValueActivity += row.valueActivity;
    existing.monthlyTradeCost += row.tradeCost;
    existing.monthlyCashDelta += row.amount;

    if (row.symbol && row.quantity !== undefined && row.price !== undefined) {
      existing.trades.push({
        symbol: row.symbol,
        quantity: row.quantity,
        price: row.price,
        direction: row.amount < 0 ? 1 : -1
      });
    }

    const candidateBalance = typeof row.balance === "number" && Number.isFinite(row.balance) ? row.balance : undefined;
    if (candidateBalance !== undefined) {
      if (!existing.latestDate || !row.transactionDate || row.transactionDate >= existing.latestDate) {
        existing.lastBalance = candidateBalance;
        existing.latestDate = row.transactionDate || existing.latestDate;
      }
    }
    grouped.set(key, existing);
  }

  const running = new Map<string, {
    amountInvested: number;
    cash: number;
    holdings: Map<string, { quantity: number; lastPrice: number }>;
    hasTraded: boolean;
  }>();
  const drafts = Array.from(grouped.values())
    .sort((left, right) => {
      const leftKey = `${left.institutionName}|${left.accountName}|${left.accountType}|${left.currencyCode}|${left.month}`;
      const rightKey = `${right.institutionName}|${right.accountName}|${right.accountType}|${right.currencyCode}|${right.month}`;
      return leftKey.localeCompare(rightKey);
    })
    .map((row) => {
      const runningKey = draftKey({
        institutionName: row.institutionName,
        accountName: row.accountName,
        accountType: row.accountType,
        month: "",
        currencyCode: row.currencyCode
      });
      const previous = running.get(runningKey) || {
        amountInvested: 0,
        cash: 0,
        holdings: new Map<string, { quantity: number; lastPrice: number }>(),
        hasTraded: false
      };
      const investedActivity = row.monthlyInvested > 0 ? row.monthlyInvested : row.monthlyTradeCost;
      const amountInvested = Math.max(previous.amountInvested + investedActivity, 0);
      const cash = previous.cash + row.monthlyCashDelta;
      const holdings = previous.holdings;
      for (const trade of row.trades) {
        const position = holdings.get(trade.symbol) || { quantity: 0, lastPrice: 0 };
        position.quantity += trade.direction * trade.quantity;
        position.lastPrice = trade.price;
        holdings.set(trade.symbol, position);
      }
      const hasTraded = previous.hasTraded || row.trades.length > 0;

      let currentValue: number;
      let confidence: number;
      let valueNote: string;
      if (row.lastBalance !== undefined) {
        currentValue = row.lastBalance;
        confidence = 0.78;
        valueNote = "The export included a balance column; the latest available value was used for the month summary.";
      } else if (hasTraded) {
        const holdingsValue = Array.from(holdings.values()).reduce((sum, position) => sum + position.quantity * position.lastPrice, 0);
        currentValue = cash + holdingsValue;
        confidence = 0.74;
        valueNote =
          "No balance column was present; current value was estimated from transaction history (cash flows plus each holding marked at its most recently observed trade price). Positions acquired before this statement's date range aren't reflected.";
      } else {
        currentValue = amountInvested;
        confidence = 0.68;
        valueNote = "No balance column or trade activity was present; current value was set to the invested amount to avoid inventing a synthetic gain or loss.";
      }

      running.set(runningKey, { amountInvested, cash, holdings, hasTraded });

      return {
        sourceName: input.fileName,
        sourceType: "spreadsheet" as const,
        summary: `${row.institutionName} ${row.accountName} ${row.month} snapshot: ${formatMoney(amountInvested, row.currencyCode)} invested, ${formatMoney(currentValue, row.currencyCode)} current value.`,
        notes: [
          ...row.notes,
          `Grouped ${row.rowCount} transaction${row.rowCount === 1 ? "" : "s"} for this account and month.`,
          valueNote
        ],
        sourceFingerprint: input.sourceFingerprint,
        institutionName: row.institutionName,
        accountName: row.accountName,
        accountType: row.accountType,
        month: row.month,
        currencyCode: row.currencyCode,
        amountInvested,
        currentValue,
        confidence,
        selected: true
      };
    })
    .filter((draft) => draft.amountInvested > 0 || draft.currentValue > 0);

  return finalizeBatch({
    sourceName: input.fileName,
    sourceType: "spreadsheet",
    notes: [
      `Parsed ${input.rows.length} transaction row${input.rows.length === 1 ? "" : "s"}.`,
      "Generated CSV-compatible monthly snapshots from transaction history."
    ],
    sourceFingerprint: input.sourceFingerprint,
    drafts
  });
}

function normalizeSpreadsheetRow(row: Record<string, unknown>) {
  const institutionName = normalizeText(String(readAlias(row, ["institution_name", "institution", "bank", "provider", "institution name"])) || "") || "";
  const accountName = normalizeText(String(readAlias(row, ["account_name", "account", "portfolio", "plan", "account name"])) || "") || "";
  const accountType = normalizeText(String(readAlias(row, ["account_type", "type", "category", "account type"])) || "") || "";
  const month = normalizeMonth(String(readAlias(row, ["month", "period", "statement_month", "date"]) || ""));
  if (!institutionName || !accountName || !month) return null;

  return {
    institutionName,
    accountName,
    accountType: accountType || "Summary",
    month,
    currencyCode: normalizeCurrencyCode(String(readAlias(row, ["currency_code", "currency", "currency code"]) || "")) || "USD",
    amountInvested: normalizeNumber(readAlias(row, ["amount_invested", "amount invested", "book_cost", "book cost", "invested"])),
    currentValue: normalizeNumber(readAlias(row, ["current_value", "current value", "market_value", "market value", "balance", "value"]))
  };
}

function normalizeTransactionSpreadsheetRow(row: Record<string, unknown>) {
  const institutionName = normalizeText(String(readAlias(row, ["institution_name", "institution", "bank", "provider", "institution name"])) || "") || "Imported institution";
  const accountNumber = normalizeText(String(readAlias(row, ["account #", "account_number", "account number", "account id", "account"])) || "");
  const accountType = normalizeText(String(readAlias(row, ["account_type", "type", "category", "account type"])) || "") || "Summary";
  const transactionDateRaw = String(readAlias(row, ["transaction_date", "transaction date", "trade_date", "trade date", "posted_date", "posted date", "date", "activity_date", "activity date"]) || "");
  const month = normalizeMonth(transactionDateRaw) || normalizeMonth(String(readAlias(row, ["month", "period", "statement_month"]) || ""));
  const amount = extractSignedAmount(row);
  if (!month || !Number.isFinite(amount)) return null;

  const balanceValue = extractNumericField(row, [
    "running_balance",
    "running balance",
    "ending_balance",
    "ending balance",
    "closing_balance",
    "closing balance",
    "balance",
    "market_value",
    "market value",
    "current_value",
    "current value",
    "value"
  ]);
  const classification = classifyTransactionActivity(row, amount);
  const isTrade = classification.tradeCost > 0;
  const symbol = isTrade ? normalizeText(String(readAlias(row, ["symbol", "ticker"]) || "")) : "";
  const quantityRaw = extractNumericField(row, ["quantity", "shares"]);
  const quantity = isTrade && symbol && Number.isFinite(quantityRaw) && quantityRaw !== 0 ? Math.abs(quantityRaw) : undefined;
  // Derived from the settlement-currency net amount rather than the sheet's raw price column,
  // since some exports report price in the security's trading currency (e.g. USD) while the
  // net amount is FX-converted to the account's settlement currency (e.g. CAD) — using the raw
  // price would understate/overstate holdings value by the FX rate.
  const price = isTrade && quantity !== undefined ? Math.abs(amount) / quantity : undefined;

  return {
    institutionName,
    accountName: buildTransactionAccountName(accountNumber, accountType, row),
    accountType,
    month,
    currencyCode: normalizeCurrencyCode(String(readAlias(row, ["currency_code", "currency", "currency code"]) || "")) || "USD",
    amount,
    investedActivity: classification.investedActivity,
    valueActivity: classification.valueActivity,
    tradeCost: classification.tradeCost,
    balance: balanceValue,
    transactionDate: normalizeTransactionDate(transactionDateRaw),
    symbol: symbol || undefined,
    quantity,
    price
  };
}

function readAlias(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const key = Object.keys(row).find((item) => normalizeText(item).toLowerCase() === normalizeText(alias).toLowerCase());
    if (key) return row[key];
  }
  return "";
}

function extractSignedAmount(row: Record<string, unknown>) {
  const netAmount = extractNumericField(row, ["net_amount", "net amount"]);
  if (Number.isFinite(netAmount)) {
    return signedAmountByContext(netAmount, row);
  }

  const grossAmount = extractNumericField(row, ["gross_amount", "gross amount"]);
  const commission = extractNumericField(row, ["commission", "fees", "fee"]);
  if (Number.isFinite(grossAmount)) {
    return signedAmountByContext(grossAmount - (Number.isFinite(commission) ? commission : 0), row);
  }

  const amount = extractNumericField(row, ["amount", "transaction_amount", "value"]);
  if (Number.isFinite(amount)) {
    return signedAmountByContext(amount, row);
  }

  const debit = extractNumericField(row, ["debit", "withdrawal", "outflow", "sell"]);
  const credit = extractNumericField(row, ["credit", "deposit", "inflow", "buy", "contribution"]);
  if (Number.isFinite(debit) || Number.isFinite(credit)) {
    return (Number.isFinite(credit) ? credit : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0);
  }

  const quantity = extractNumericField(row, ["quantity", "shares"]);
  const price = extractNumericField(row, ["price", "unit_price", "unit price"]);
  if (Number.isFinite(quantity) && Number.isFinite(price)) {
    return signedAmountByContext(quantity * price, row);
  }

  return NaN;
}

function extractNumericField(row: Record<string, unknown>, aliases: string[]) {
  const raw = readAlias(row, aliases);
  if (raw === "" || raw === null || raw === undefined) return NaN;
  const parsed = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function signedAmountByContext(value: number, row: Record<string, unknown>) {
  const actionText = transactionContext(row);
  if (/(WITHDRAW|BUY|DEBIT|FEE|PURCHASE|TRANSFER OUT|REDEMPTION|OUTFLOW)/.test(actionText)) {
    return -Math.abs(value);
  }
  if (/(CON\b|DEP\b|DEPOSIT|DIV|CREDIT|INTEREST|TRANSFER IN|BONUS|INCOME|REINVEST|SELL|PROCEED)/.test(actionText)) {
    return Math.abs(value);
  }
  return value;
}

function classifyTransactionActivity(row: Record<string, unknown>, amount: number) {
  const context = transactionContext(row);

  if (/(BUY|SELL|TRADE|PURCHASE)/.test(context)) {
    return { investedActivity: 0, valueActivity: 0, tradeCost: Math.abs(amount) };
  }

  if (/(CON\b|DEP\b|DEPOSIT|TRANSFER IN)/.test(context)) {
    return {
      investedActivity: Math.max(amount, 0),
      valueActivity: amount,
      tradeCost: 0
    };
  }

  if (/(WITHDRAW|EFT\b|TRANSFER OUT|REDEMPTION|OUTFLOW)/.test(context)) {
    return {
      investedActivity: -Math.abs(amount),
      valueActivity: -Math.abs(amount),
      tradeCost: 0
    };
  }

  if (/(DIV|DIVIDEND|INTEREST|INCOME|BONUS)/.test(context)) {
    return { investedActivity: 0, valueActivity: amount, tradeCost: 0 };
  }

  if (/(FXT\b|FX CONVERSION)/.test(context)) {
    return { investedActivity: Math.max(amount, 0), valueActivity: amount, tradeCost: 0 };
  }

  return { investedActivity: Math.max(amount, 0), valueActivity: amount, tradeCost: 0 };
}

function transactionContext(row: Record<string, unknown>) {
  return normalizeText(
    [
      readAlias(row, ["action"]),
      readAlias(row, ["activity_type", "activity type"]),
      readAlias(row, ["transaction_type", "transaction type"]),
      readAlias(row, ["description"])
    ]
      .map(String)
      .join(" ")
  ).toUpperCase();
}

function buildTransactionAccountName(accountNumber: string, accountType: string, row: Record<string, unknown>) {
  const number = normalizeText(accountNumber);
  if (number) {
    return `${accountType} - ${number}`.trim();
  }

  const description = normalizeText(String(readAlias(row, ["description", "security", "symbol"]) || ""));
  if (description) {
    return description.length > 48 ? `${description.slice(0, 45).trim()}...` : description;
  }

  return "Imported account";
}

function normalizeTransactionDate(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const match = normalized.match(/(20\d{2})[-/](\d{2})[-/](\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toISOString().slice(0, 10);
}

function extractSpreadsheetText(bytes: Buffer) {
  try {
    const workbook = XLSX.read(bytes, { type: "buffer", raw: true });
    return workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_csv(sheet);
      return `Sheet ${sheetName}\n${rows}`;
    }).join("\n\n");
  } catch {
    return "";
  }
}

function parseJsonDraft(raw: string) {
  const text = raw.trim();
  const cleaned = text.startsWith("```") ? text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim() : text;
  try {
    return JSON.parse(cleaned) as Partial<AiImportBatch> & Partial<AiImportDraft> & { drafts?: unknown[]; summaries?: unknown[] };
  } catch {
    return null;
  }
}

function isBatchLike(value: unknown): value is AiImportBatch {
  return Boolean(
    value &&
      typeof value === "object" &&
      (Array.isArray((value as { drafts?: unknown[] }).drafts) || Array.isArray((value as { summaries?: unknown[] }).summaries))
  );
}

function draftKey(draft: Pick<AiImportDraft, "institutionName" | "accountName" | "accountType" | "month" | "currencyCode">) {
  return [
    normalizeText(draft.institutionName),
    normalizeText(draft.accountName),
    normalizeText(draft.accountType),
    normalizeText(draft.month),
    normalizeCurrencyCode(draft.currencyCode)
  ].join("|");
}

function detectCurrencyCode(text: string) {
  const value = text.toUpperCase();
  if (value.includes("C$") || value.includes("CAD")) return "CAD";
  if (value.includes("₦") || value.includes("NGN") || value.includes("NAIRA")) return "NGN";
  if (value.includes("US$") || value.includes("USD")) return "USD";
  if (value.includes("$")) return "USD";
  return "";
}

function buildAccountName(value: string, text: string, accountType = "") {
  const normalized = normalizeText(value);
  if (normalized && !isPlaceholderAccountName(normalized)) return normalized;

  const accountNumber = extractAccountNumber(text);
  const normalizedType = normalizeText(accountType);
  if (normalizedType && !isPlaceholderAccountType(normalizedType)) {
    return accountNumber ? `${normalizedType} ${accountNumber}` : `${normalizedType} summary`;
  }

  const accountGroups = extractAccountGroups(text);
  if (accountGroups.length === 1) return accountNumber ? `${accountGroups[0]} ${accountNumber}` : `${accountGroups[0]} summary`;

  const fallback = findFirstMatch(text, /\b(?:account|portfolio|plan)\s*[:\-]\s*([A-Za-z0-9 &()/.-]{3,})/i);
  if (fallback && !isPlaceholderAccountName(fallback)) return fallback;

  return "Portfolio summary";
}

function buildAccountType(value: string, text: string) {
  const normalized = normalizeText(value);
  if (normalized && !isPlaceholderAccountType(normalized)) return normalized;

  const accountGroups = extractAccountGroups(text);
  if (accountGroups.length > 1) return "Mixed Investment";
  if (accountGroups.length === 1) {
    if (/(tfsa|rrsp|resp|fhsa|rrif|lira|lif)/i.test(accountGroups[0])) return "Registered Investment";
    if (/(cash|bank|deposit)/i.test(accountGroups[0])) return "Cash";
    if (/(stock|equity|shares|index)/i.test(accountGroups[0])) return "Market Investment";
  }

  return "Summary";
}

function extractAccountGroups(text: string) {
  const patterns: Array<[RegExp, string]> = [
    [/\bTFSA\b/i, "TFSA"],
    [/\bRRSP\b/i, "RRSP"],
    [/\bRESP\b/i, "RESP"],
    [/\bFHSA\b/i, "FHSA"],
    [/\bRRIF\b/i, "RRIF"],
    [/\bLIRA\b/i, "LIRA"],
    [/\bLIF\b/i, "LIF"],
    [/\bCash\b/i, "Cash"],
    [/\bStocks?\b/i, "Stock"],
    [/\bIndex\b/i, "Index"],
    [/\bMutual Funds?\b/i, "Mutual Fund"],
    [/\bBonds?\b/i, "Bond"],
    [/\bGICs?\b/i, "GIC"],
    [/\bSavings?\b/i, "Savings"]
  ];

  return Array.from(new Set(patterns.filter(([pattern]) => pattern.test(text)).map(([, label]) => label)));
}

function extractAccountNumber(text: string) {
  const labeled = findFirstMatch(text, /\b(?:account|acct|plan|portfolio)\s*(?:number|no\.?|#)?\s*[:\-#]?\s*([*xX\-\s\d]{4,24})/i);
  const labeledDigits = labeled.match(/\d{4,}/)?.[0];
  const looseDigits = text.match(/(?:\*{2,}|x{2,}|X{2,}|-)?\s*(\d{4,8})\b/)?.[1];
  return (labeledDigits || looseDigits || "").slice(-8);
}

function isPlaceholderAccountName(value: string) {
  return /^(unknown|portfolio summary|summary|imported account|imported institution)$/i.test(value);
}

function isPlaceholderAccountType(value: string) {
  return /^(unknown|summary|mixed investment|imported)$/i.test(value);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildSummaryText(institutionName: string, month: string, currencyCode: string, currentValue: number) {
  const formatted = formatMoney(currentValue, currencyCode);
  const monthText = month ? `for ${month}` : "for the statement period";
  return `${institutionName} summary ${monthText} with a current value of ${formatted}.`;
}

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizeCurrencyCode(currencyCode) || "USD",
    currencyDisplay: "symbol",
    maximumFractionDigits: 2
  }).format(value);
}

function normalizeCurrencyCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!code) return "";
  if (code === "N" || code === "NAIRA") return "NGN";
  if (code === "C$" || code === "CAD$") return "CAD";
  if (code === "US$") return "USD";
  return code.slice(0, 3);
}

function normalizeMonth(value: string) {
  const match = value.match(/(20\d{2})[-/](\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return "";
}

function extractLatestMonth(text: string) {
  const monthMap: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };

  const matches = Array.from(text.matchAll(/as of\s+([A-Za-z]{3})\.?\s+(\d{1,2}),\s+(\d{4})/gi));
  const last = matches.at(-1);
  if (!last) return "";

  const month = monthMap[last[1].toLowerCase()];
  const year = last[3];
  return month ? `${year}-${month}` : "";
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function findFirstMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[1]?.trim() || "";
}

function guessInstitutionFromText(text: string) {
  const fallback = text.replace(/[^A-Za-z0-9 &()-]/g, " ").trim();
  if (!fallback) return "Imported institution";
  return fallback.split(/\s+/).slice(0, 3).join(" ");
}

function normalizeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBaseUrl(provider: AiRuntimeCredentials["provider"], baseUrl?: string) {
  const value = (baseUrl || "").trim();
  if (!value) {
    if (provider === "anthropic") return "https://api.anthropic.com/v1";
    if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
    return "https://api.openai.com/v1";
  }
  return value.replace(/\/$/, "");
}

function fingerprintBytes(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("base64url");
}

function fingerprintText(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function sumAllMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).reduce((sum, match) => sum + normalizeNumber(match[1]), 0);
}

function emitStep(
  onStep: AnalyzeInput["onStep"] | undefined,
  id: string,
  label: string,
  detail: string,
  status: AiImportStep["status"]
) {
  onStep?.({ id, label, detail, status });
}

async function stage(onStep: AnalyzeInput["onStep"] | undefined, id: string, label: string, detail: string) {
  emitStep(onStep, id, label, detail, "running");
  await delay(160);
  emitStep(onStep, id, label, detail, "complete");
  await delay(80);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
