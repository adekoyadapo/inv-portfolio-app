import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

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
