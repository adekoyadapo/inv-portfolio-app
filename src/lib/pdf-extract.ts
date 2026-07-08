import { PDFParse } from "pdf-parse";
import path from "node:path";

export type PdfExtraction = {
  text: string;
  pageCount: number;
};

export async function extractPdfText(bytes: Buffer): Promise<PdfExtraction> {
  try {
    const workerSrc = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
    PDFParse.setWorker(workerSrc);
    const parser = new PDFParse({ data: bytes });

    try {
      const result = await parser.getText();
      const pages = result.pages || [];
      const text = pages.length > 0
        ? pages.map((page) => `--- Page ${page.num} ---\n${page.text}`).join("\n\n")
        : result.text || "";
      return { text, pageCount: pages.length || result.total || 0 };
    } finally {
      await parser.destroy();
    }
  } catch {
    return { text: "", pageCount: 0 };
  }
}
