import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { ItineraryGenerationError } from "./ai-itinerary-generation.server";
import type { SupplierDocumentInput } from "./ai-supplier-itinerary-import.server";
import { extractDocumentCandidate, PaddleOCRAdapter } from "./document-ocr";

type SupplierDocumentFileInput = SupplierDocumentInput & {
  fileBase64: string;
  fileName: string;
};

function decodeBase64(value: string) {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new ItineraryGenerationError("INVALID_INPUT", "The uploaded document could not be read.");
  }
}

export async function extractSupplierDocumentTextFromFile(input: SupplierDocumentFileInput) {
  const buffer = decodeBase64(input.fileBase64);
  const name = input.fileName.toLowerCase();
  const mimeType = input.mimeType ?? "";

  try {
    if (name.endsWith(".pdf") || mimeType === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      const text = result.text.trim();
      if (text) {
        const hasLegacyServerOcr = Boolean(process.env.PADDLE_OCR_URL || process.env.OCR_SERVICE_API_KEY);
        if (hasLegacyServerOcr) {
          try {
            const ocrResult = await new PaddleOCRAdapter().extract({
              fileName: input.fileName,
              mimeType,
              file: buffer,
            });
            if (ocrResult.tables?.length) return ocrResult.text.trim() || text;
          } catch {
            // Native text remains usable when the optional OCR service is unavailable.
          }
        }
        return text;
      }
    }

    if (name.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      if (text) return text;
    }

    if (name.endsWith(".txt") || name.endsWith(".md") || mimeType.startsWith("text/")) {
      const text = buffer.toString("utf8").trim();
      if (text) return text;
    }

    const looksLikeScannedImage = name.match(/\.(png|jpg|jpeg|bmp|tiff|webp)$/i) || mimeType.startsWith("image/");
    if (looksLikeScannedImage || name.endsWith(".pdf") || mimeType === "application/pdf") {
      const ocrCandidate = await extractDocumentCandidate({
        fileName: input.fileName,
        mimeType: input.mimeType,
        file: buffer,
      });
      if (ocrCandidate.text.trim()) return ocrCandidate.text.trim();
      throw new ItineraryGenerationError(
        "INVALID_INPUT",
        "This document has no readable text. Paste the supplier text or provide a text-readable PDF, DOCX, TXT, or Markdown file.",
      );
    }

    throw new ItineraryGenerationError(
      "INVALID_INPUT",
      "Use pasted text, a text-readable PDF, DOCX, TXT, or Markdown file.",
    );
  } catch (error) {
    if (error instanceof ItineraryGenerationError) throw error;
    throw new ItineraryGenerationError("INVALID_INPUT", "The supplier document could not be converted to text.");
  }
}
