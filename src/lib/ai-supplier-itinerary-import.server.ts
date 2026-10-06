import { createServerFn } from "@tanstack/react-start";
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

export async function extractSupplierDocumentText(input: SupplierDocumentInput) {
  const directText = input.sourceText?.trim();
  if (directText) return directText;
  if (!input.fileBase64 || !input.fileName) throw new ItineraryGenerationError("INVALID_INPUT", "Paste supplier text or provide a document.");
  const { extractSupplierDocumentTextFromFile } = await import("./supplier-document-text.server");
  return extractSupplierDocumentTextFromFile({
    fileBase64: input.fileBase64,
    fileName: input.fileName,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
  });
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
  let destinationQuery: { data: Array<{ id: string; name: string; is_active?: boolean }> | null; error?: unknown };
  try {
    destinationQuery = options.destinations
      ? { data: options.destinations }
      : await supabaseAdmin.from("destinations").select("id,name,is_active");
  } catch (error) {
    destinationQuery = { data: null, error };
  }
  if (destinationQuery.error) {
    console.warn("[Supplier itinerary import] Destination catalog lookup failed; continuing with the destination text.", destinationQuery.error);
  }
  const destinations = destinationQuery.data ?? [];
  const destinationText = findDestinationText(text, input.destinationText, destinations);
  if (!destinationText) throw new ItineraryGenerationError("INVALID_INPUT", "A destination is required for supplier import.");
  let resolution = destinationQuery.error
    ? { status: "unknown" as const, destination_id: null, candidate_ids: [] }
    : resolveDestinationText(destinationText, destinations);
  if (resolution.status === "ambiguous") {
    console.warn("[Supplier itinerary import] Destination matches multiple catalog entries; generating the draft without linking a destination.", {
      candidateIds: resolution.candidate_ids,
    });
  }
  if (resolution.status !== "resolved" && resolution.status !== "ambiguous") {
    const existing = destinations.find((destination) => normaliseDestinationName(destination.name) === normaliseDestinationName(destinationText));
    if (existing) {
      if (existing.is_active === false && !options.destinations) {
        try {
          const { error } = await supabaseAdmin.from("destinations").update({ is_active: true }).eq("id", existing.id);
          if (error) {
            console.warn("[Supplier itinerary import] Could not reactivate the destination; generating without a catalog link.", error);
          } else {
            resolution = { status: "resolved", destination_id: existing.id, candidate_ids: [existing.id] };
          }
        } catch (error) {
          console.warn("[Supplier itinerary import] Could not reactivate the destination; generating without a catalog link.", error);
        }
      } else if (existing.is_active !== false) {
        resolution = { status: "resolved", destination_id: existing.id, candidate_ids: [existing.id] };
      }
    } else if (!options.destinations) {
      try {
        const { data: created, error } = await supabaseAdmin
          .from("destinations")
          .insert({ name: destinationText })
          .select("id")
          .single();
        if (error) {
          console.warn("[Supplier itinerary import] Could not add the destination to the catalog; generating without a catalog link.", error);
        } else if (created) {
          resolution = { status: "resolved", destination_id: created.id, candidate_ids: [created.id] };
        }
      } catch (error) {
        console.warn("[Supplier itinerary import] Could not add the destination to the catalog; generating without a catalog link.", error);
      }
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
