import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveDestinationText } from "./destination-assignment";
import { findItineraryLibraryPhotoAttachments, type ItineraryLibraryPhotoAttachment } from "./activity-photo-library.server";
import {
  ItineraryGenerationError,
  OpenAIItineraryProvider,
  validateItineraryDraft,
  type ItineraryDraft,
  type ItineraryGenerationInput,
  type ItineraryGenerationProvider,
} from "./ai-itinerary-generation.server";

export type ItineraryRequirementSource = "lead" | "enquiry" | "whatsapp";
export type ItineraryRequirementsRecord = ItineraryGenerationInput & {
  destination_text: string | null;
  lead_id?: string | null;
  enquiry_id?: string | null;
  customer_id?: string | null;
  assigned_to?: string | null;
};

export type ItineraryGenerationFromRequirementsResult = {
  draft: ItineraryDraft;
  photo_attachments: ItineraryLibraryPhotoAttachment[];
  destination_resolution: {
    status: "resolved" | "ambiguous" | "unresolved" | "unknown";
    destination_id: string | null;
    candidate_ids: string[];
  };
  requirements: ItineraryRequirementsRecord;
  provenance: "AI_REQUIREMENTS";
};

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableNonNegativeNumber(value: unknown, field: string) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ItineraryGenerationError("INVALID_INPUT", `${field} must be non-negative.`);
  return number;
}

function normalizeCityNightStays(value: unknown) {
  if (!Array.isArray(value)) return null;
  const stays = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const stay = entry as Record<string, unknown>;
    const city = asNullableString(stay["city"]);
    const nights = Number(stay["nights"]);
    if (!city || !Number.isInteger(nights) || nights < 1) return [];
    return [{ city, nights }];
  });
  return stays.length ? stays : null;
}

function normalizeRequirements(row: Record<string, unknown>): ItineraryRequirementsRecord {
  const destinationText = asNullableString(row["destination_text"]);
  if (!destinationText) throw new ItineraryGenerationError("INVALID_INPUT", "A destination is required before generation.");
  const start = asNullableString(row["travel_start_date"]);
  const end = asNullableString(row["travel_end_date"]);
  if (start && end && end < start) throw new ItineraryGenerationError("INVALID_INPUT", "Travel end date cannot be before start date.");
  return {
    destination: destinationText,
    destination_text: destinationText,
    travel_start_date: start,
    travel_end_date: end,
    travel_month: asNullableString(row["travel_month"]),
    adults: asNullableNonNegativeNumber(row["adults"], "Adults"),
    children: asNullableNonNegativeNumber(row["children"], "Children"),
    departure_city: asNullableString(row["departure_city"]),
    approximate_budget: asNullableNonNegativeNumber(row["approximate_budget"], "Approximate budget"),
    hotel_preference: asNullableString(row["hotel_preference"]),
    special_requirements: asNullableString(row["special_requirements"]),
    trip_type: asNullableString(row["trip_type"]),
    city_nights: normalizeCityNightStays(row["city_nights"]),
    lead_id: asNullableString(row["lead_id"]),
    enquiry_id: asNullableString(row["enquiry_id"]),
    customer_id: asNullableString(row["customer_id"]),
    assigned_to: asNullableString(row["assigned_to"]),
  };
}

function dateRange(start: string, end: string) {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function applySuppliedDates(draft: ItineraryDraft, requirements: ItineraryRequirementsRecord) {
  if (!requirements.travel_start_date || !requirements.travel_end_date) {
    return { ...draft, travel_start_date: null, travel_end_date: null, days: draft.days.map((day) => ({ ...day, date: null })) };
  }
  const dates = dateRange(requirements.travel_start_date, requirements.travel_end_date);
  if (draft.days.length !== dates.length) throw new ItineraryGenerationError("SCHEMA_VIOLATION", "Generated day count does not match the supplied travel dates.");
  return { ...draft, travel_start_date: requirements.travel_start_date, travel_end_date: requirements.travel_end_date, days: draft.days.map((day, index) => ({ ...day, date: dates[index]! })) };
}

export async function loadItineraryRequirements(source: ItineraryRequirementSource, sourceId: string): Promise<ItineraryRequirementsRecord> {
  if (!sourceId.trim()) throw new ItineraryGenerationError("INVALID_INPUT", "A requirement source must be selected.");
  const table = source === "lead" ? "leads" : source === "enquiry" ? "enquiries" : "whatsapp_travel_requirements";
  const query = supabaseAdmin.from(table).select("*").eq("id", sourceId).maybeSingle();
  const { data, error } = await query;
  if (error) throw new ItineraryGenerationError("PROVIDER_FAILURE", "Unable to load the selected travel requirements.");
  if (!data) throw new ItineraryGenerationError("INVALID_INPUT", "The selected travel requirements were not found.");
  const row = data as Record<string, unknown>;
  if (source === "lead") {
    row["destination_text"] = row["destination_text"] ?? row["destination"];
    row["approximate_budget"] = row["approximate_budget"] ?? row["budget"];
    row["trip_type"] = row["trip_type"] ?? row["scope"];
  }
  if (source === "enquiry") {
    row["destination_text"] = row["destination_text"] ?? row["destination"];
    row["travel_start_date"] = row["travel_start_date"] ?? row["departure_date"];
    row["travel_end_date"] = row["travel_end_date"] ?? row["return_date"];
    row["approximate_budget"] = row["approximate_budget"] ?? row["total_budget"] ?? row["budget_per_person"];
  }
  return normalizeRequirements(row);
}

export async function generateItineraryFromRequirements(
  requirements: ItineraryRequirementsRecord,
  options: { provider?: ItineraryGenerationProvider; destinations?: Array<{ id: string; name: string; is_active?: boolean }> } = {},
): Promise<ItineraryGenerationFromRequirementsResult> {
  const normalized = normalizeRequirements(requirements as unknown as Record<string, unknown>);
  const destinations = options.destinations ?? ((await supabaseAdmin.from("destinations").select("id,name,is_active").eq("is_active", true)).data ?? []);
  const resolution = resolveDestinationText(normalized.destination_text, destinations);
  if (resolution.status !== "resolved") {
    throw new ItineraryGenerationError("INVALID_INPUT", `Destination could not be safely resolved: ${resolution.status}.`);
  }
  const provider = options.provider ?? new OpenAIItineraryProvider();
  const generated = await provider.generateItinerary(normalized);
  const draft = applySuppliedDates(validateItineraryDraft(generated.draft), normalized);
  const photo_attachments = await findItineraryLibraryPhotoAttachments(draft, normalized.special_requirements ?? "");
  return { draft, photo_attachments, destination_resolution: resolution, requirements: normalized, provenance: "AI_REQUIREMENTS" };
}

export const generateItineraryFromRequirementsFn = createServerFn({ method: "POST" })
  .validator((input: { source: ItineraryRequirementSource; sourceId: string }) => input)
  .handler(async ({ data }) => {
    const requirements = await loadItineraryRequirements(data.source, data.sourceId);
    return generateItineraryFromRequirements(requirements);
  });
