import { PDFParse } from "pdf-parse";
import path from "node:path";

export async function extractPdfText(bytes: Buffer) {
  try {
    const workerSrc = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
    PDFParse.setWorker(workerSrc);
    const parser = new PDFParse({ data: bytes });

    try {
      const result = await parser.getText();
      return result.text || "";
    } finally {
      await parser.destroy();
    }
  } catch {
    return "";
  }
}
