import { createServerFn } from "@tanstack/react-start";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normaliseDestinationName, resolveDestinationText } from "./destination-assignment";
import { findItineraryLibraryPhotoAttachments, type ItineraryLibraryPhotoAttachment } from "./activity-photo-library.server";
import {
  ItineraryGenerationError,
  OpenAIItineraryProvider,
  validateItineraryDraft,
  sanitizeSupplierItineraryItemFields,
  type ItineraryDraft,
  type ItineraryGenerationProvider,
} from "./ai-itinerary-generation.server";
import { extractDocumentCandidate, PaddleOCRAdapter } from "./document-ocr";
import { extractSupplierDocumentTables, type SupplierDocumentTable } from "./supplier-document-tables";

export type SupplierDocumentInput = {
  sourceText?: string;
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  destinationText?: string;
};

export type SupplierImportResult = {
  draft: ItineraryDraft;
  photo_attachments: ItineraryLibraryPhotoAttachment[];
  extracted_text: string;
  extracted_text_length: number;
  tables: SupplierDocumentTable[];
  destination_resolution: { status: "resolved" | "ambiguous" | "unresolved" | "unknown"; destination_id: string | null; candidate_ids: string[] };
  provenance: "AI_SUPPLIER_IMPORT";
};

function decodeBase64(value: string) {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new ItineraryGenerationError("INVALID_INPUT", "The uploaded document could not be read.");
  }
}

export async function extractSupplierDocumentText(input: SupplierDocumentInput) {
  const directText = input.sourceText?.trim();
  if (directText) return directText;
  if (!input.fileBase64 || !input.fileName) throw new ItineraryGenerationError("INVALID_INPUT", "Paste supplier text or provide a document.");
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
            const ocrResult = await new PaddleOCRAdapter().extract({ fileName: input.fileName, mimeType, file: buffer });
            if (ocrResult.tables?.length) {
              return ocrResult.text.trim() || text;
            }
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
      throw new ItineraryGenerationError("INVALID_INPUT", "This document has no readable text. Paste the supplier text or provide a text-readable PDF, DOCX, TXT, or Markdown file.");
    }

    throw new ItineraryGenerationError("INVALID_INPUT", "Use pasted text, a text-readable PDF, DOCX, TXT, or Markdown file.");
  } catch (error) {
    if (error instanceof ItineraryGenerationError) throw error;
    throw new ItineraryGenerationError("INVALID_INPUT", "The supplier document could not be converted to text.");
  }
}

function findDestinationText(
  text: string,
  explicit: string | undefined,
  destinations: Array<{ name: string }>,
) {
  if (explicit?.trim()) return explicit.trim();
  const destinationLine = text.match(/^\s*(?:destination|destinations?)\s*[:\-]\s*(.+)$/im)?.[1]?.trim();
  if (destinationLine) return destinationLine.split(/[|,;]/)[0]!.trim();

  const firstDay = text.match(/(?:^|\s)day\s*(?:1|one)\b[^\r\n]*(?:\r?\n|$)?[\s\S]*?(?=(?:^|\s)day\s*(?:2|two)\b|$)/im)?.[0] ?? "";
  const searchText = firstDay || text.slice(0, 2_000);
  const normalizedText = ` ${searchText.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  const matches = destinations
    .map((destination) => ({
      name: destination.name.trim(),
      index: normalizedText.indexOf(` ${destination.name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `),
    }))
    .filter((destination) => destination.name && destination.index >= 0)
    .sort((left, right) => left.index - right.index || right.name.length - left.name.length);
  if (matches[0]) return matches[0].name;

  const dayHeading = text.match(/(?:^|\s)day\s*(?:1|one)\s*[:.\-–—)]\s*(.+?)(?=(?:\s+day\s*2\b)|$)/im)?.[1]?.trim();
  if (dayHeading) {
    const city = dayHeading
      .replace(/^(?:(?:arrival|arrive|check[ -]?in|overnight\s+stay)\s+(?:in|at|to)\s+)+/i, "")
      .replace(/\b(?:city\s+tour|sightseeing|arrival|day\s+at|overnight\s+stay|check[ -]?in)\b.*$/i, "")
      .split(/[,:;|–—-]/)[0]
      ?.trim();
    if (city) return city;
  }
  return null;
}

function hasExactCalendarDate(text: string) {
  return /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/.test(text);
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isTermsOnlyTable(table: SupplierDocumentTable): boolean {
  return table.columns.length > 0 && table.columns.every((column) => /^(?:inclusions?|included|exclusions?|excluded)$/i.test(column.trim().replace(/:$/, "")));
}

export async function extractItineraryFromSupplierDocument(
  input: SupplierDocumentInput,
  options: { provider?: ItineraryGenerationProvider; destinations?: Array<{ id: string; name: string; is_active?: boolean }> } = {},
): Promise<SupplierImportResult> {
  const text = await extractSupplierDocumentText(input);
  const destinationQuery = options.destinations
    ? { data: options.destinations }
    : await supabaseAdmin.from("destinations").select("id,name,is_active");
  const destinations = destinationQuery.data ?? [];
  const destinationText = findDestinationText(text, input.destinationText, destinations);
  if (!destinationText) throw new ItineraryGenerationError("INVALID_INPUT", "A destination is required for supplier import.");
  let resolution = resolveDestinationText(destinationText, destinations);
  if (resolution.status === "ambiguous") throw new ItineraryGenerationError("INVALID_INPUT", "The destination matches multiple catalog entries. Add a Destination: label or choose a destination before importing.");
  if (resolution.status !== "resolved") {
    const existing = destinations.find((destination) => normaliseDestinationName(destination.name) === normaliseDestinationName(destinationText));
    if (existing) {
      if (existing.is_active === false && !options.destinations) {
        const { error } = await supabaseAdmin.from("destinations").update({ is_active: true }).eq("id", existing.id);
        if (error) throw new ItineraryGenerationError("PROVIDER_FAILURE", "The destination could not be added to the active catalog.");
      }
      resolution = { status: "resolved", destination_id: existing.id, candidate_ids: [existing.id] };
    } else if (!options.destinations) {
      const { data: created, error } = await supabaseAdmin
        .from("destinations")
        .insert({ name: destinationText })
        .select("id")
        .single();
      if (error || !created) throw new ItineraryGenerationError("PROVIDER_FAILURE", "The destination could not be added to the catalog.");
      resolution = { status: "resolved", destination_id: created.id, candidate_ids: [created.id] };
    }
  }
  const provider = options.provider ?? new OpenAIItineraryProvider();
  const generated = await provider.generateItinerary({ destination: destinationText, supplier_content: text, special_requirements: "Carefully interpret the complete supplier document, including OCR/table/two-column layout. Reconstruct a polished customer-ready itinerary with one concise descriptive title and useful narrative per source day. Classify inclusions and exclusions independently from their meaning, not extraction order. Preserve every supported trip fact and day order; do not copy paragraphs, duplicate day labels, or invent missing details." });
  const datesAreExplicit = hasExactCalendarDate(text);
  const dateOrNull = (value: unknown) => datesAreExplicit && validCalendarDate(value) ? value : null;
  const draft = validateItineraryDraft(sanitizeSupplierItineraryItemFields({
    ...generated.draft,
    travel_start_date: dateOrNull(generated.draft.travel_start_date),
    travel_end_date: dateOrNull(generated.draft.travel_end_date),
    days: generated.draft.days.map((day) => ({ ...day, date: dateOrNull(day.date) })),
  }));
  const photo_attachments = await findItineraryLibraryPhotoAttachments(draft, text);
  const tables = extractSupplierDocumentTables(text).filter((table) => !isTermsOnlyTable(table));
  return { draft, photo_attachments, extracted_text: text, extracted_text_length: text.length, tables, destination_resolution: resolution, provenance: "AI_SUPPLIER_IMPORT" };
}

export const extractItineraryFromSupplierDocumentFn = createServerFn({ method: "POST" })
  .validator((input: SupplierDocumentInput) => input)
  .handler(async ({ data }) => extractItineraryFromSupplierDocument(data));
