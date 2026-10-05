import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveDestinationText } from "./destination-assignment";
import { findItineraryLibraryPhotoAttachments, type ItineraryLibraryPhotoAttachment } from "./activity-photo-library.server";
import { validateItineraryDraft, type ItineraryDraft, type ItineraryGenerationProvider } from "./ai-itinerary-generation.server";
import { ItineraryGenerationError, OpenAIItineraryProvider } from "./ai-itinerary-generation.server";

export type BookedServiceSource = {
  source_type: "HOTEL_BOOKING" | "TRANSPORT_SERVICE" | "ACTIVITY_SERVICE" | "BOOKING_ITEM";
  source_id: string;
  item_type: "ACCOMMODATION" | "EXTRA_TRANSPORT" | "ACTIVITY" | "SIGHTSEEING" | "NOTE" | "FLIGHT";
  date: string | null;
  end_date: string | null;
  fields: Record<string, string | number | null>;
};

type BookedServiceFields = {
  hotel_name?: string | number | null;
  city?: string | number | null;
  address?: string | number | null;
  country?: string | number | null;
  star_category?: string | number | null;
  check_in?: string | number | null;
  check_out?: string | number | null;
  nights?: string | number | null;
  room_type?: string | number | null;
  rooms?: string | number | null;
  adults?: string | number | null;
  children?: string | number | null;
  extra_beds?: string | number | null;
  meal_plan?: string | number | null;
  notes?: string | number | null;
  transport_type?: string | number | null;
  pickup?: string | number | null;
  dropoff?: string | number | null;
  date?: string | number | null;
  pickup_time?: string | number | null;
  drop_time?: string | number | null;
  vehicle_type?: string | number | null;
  vehicle_details?: string | number | null;
  driver_details?: string | number | null;
  passengers?: string | number | null;
  activity_name?: string | number | null;
  description?: string | number | null;
  location?: string | number | null;
  time?: string | number | null;
  meeting_point?: string | number | null;
  title?: string | number | null;
};

export type BookedItineraryContext = {
  booking_id: string;
  customer_id: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  destination_text: string | null;
  travel_start: string | null;
  travel_end: string | null;
  services: BookedServiceSource[];
};

export type BookingItineraryResult = {
  draft: ItineraryDraft;
  photo_attachments: ItineraryLibraryPhotoAttachment[];
  source_context: BookedItineraryContext;
  traceability: Array<{ item_index: number; source_type: BookedServiceSource["source_type"]; source_id: string }>;
  destination_resolution: { status: "resolved" | "ambiguous" | "unresolved" | "unknown"; destination_id: string | null; candidate_ids: string[] };
  provenance: "AI_BOOKING_SERVICES";
};

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function num(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function jsonRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function buildBookedServiceContext(booking: Record<string, unknown>, items: Array<Record<string, unknown>>): BookedItineraryContext {
  const services: BookedServiceSource[] = [];
  for (const item of items) {
    const hotel = Array.isArray(item["hotel_bookings"]) ? jsonRecord(item["hotel_bookings"][0]) : jsonRecord(item["hotel_bookings"]);
    if (hotel["id"] || hotel["hotel_name"]) {
      services.push({ source_type: "HOTEL_BOOKING", source_id: String(hotel["id"] ?? item["id"]), item_type: "ACCOMMODATION", date: text(hotel["check_in"]), end_date: text(hotel["check_out"]), fields: {
        hotel_name: text(hotel["hotel_name"]), city: text(hotel["city"]), address: text(hotel["address"]), country: text(hotel["country"]), star_category: text(hotel["star_category"]), check_in: text(hotel["check_in"]), check_out: text(hotel["check_out"]), nights: num(hotel["nights"]), room_type: text(hotel["room_type"]), rooms: num(hotel["rooms"]), adults: num(hotel["adults"]), children: num(hotel["children"]), extra_beds: num(hotel["extra_beds"]), meal_plan: text(hotel["meal_plan"]), notes: text(hotel["notes"]),
      } });
      continue;
    }
    const transport = Array.isArray(item["transport_services"]) ? jsonRecord(item["transport_services"][0]) : jsonRecord(item["transport_services"]);
    if (transport["id"] || transport["transport_type"]) {
      services.push({ source_type: "TRANSPORT_SERVICE", source_id: String(transport["id"] ?? item["id"]), item_type: "EXTRA_TRANSPORT", date: text(transport["start_date"] ?? item["start_date"]), end_date: text(transport["end_date"] ?? item["end_date"]), fields: {
        transport_type: text(transport["transport_type"]), pickup: text(transport["pickup_location"]), dropoff: text(transport["drop_location"]), date: text(transport["start_date"] ?? item["start_date"]), pickup_time: text(transport["pickup_time"]), drop_time: text(transport["drop_time"]), vehicle_type: text(transport["vehicle_type"]), vehicle_details: text(transport["vehicle_notes"]), driver_details: text(transport["driver_name"]), passengers: num(transport["passengers"]), supplier: text(transport["supplier_id"]), notes: text(transport["notes"]),
      } });
      continue;
    }
    const activity = Array.isArray(item["activity_services"]) ? jsonRecord(item["activity_services"][0]) : jsonRecord(item["activity_services"]);
    if (activity["id"] || activity["activity_name"]) {
      services.push({ source_type: "ACTIVITY_SERVICE", source_id: String(activity["id"] ?? item["id"]), item_type: "ACTIVITY", date: text(activity["activity_date"] ?? item["start_date"]), end_date: text(activity["activity_date"] ?? item["end_date"]), fields: {
        activity_name: text(activity["activity_name"] ?? item["title"]), activity_type: text(activity["activity_type"]), date: text(activity["activity_date"] ?? item["start_date"]), time: text(activity["start_time"]), end_time: text(activity["end_time"]), city: text(activity["city"]), location: text(activity["location"]), meeting_point: text(activity["meeting_point"]), description: text(activity["notes"] ?? item["description"]), adults: num(activity["adults"]), children: num(activity["children"]), supplier: text(activity["supplier_id"]),
      } });
      continue;
    }
    services.push({ source_type: "BOOKING_ITEM", source_id: String(item["id"]), item_type: "NOTE", date: text(item["start_date"]), end_date: text(item["end_date"]), fields: { title: text(item["title"]), description: text(item["description"]), item_type: text(item["item_type"]), quantity: num(item["quantity"]) } });
  }
  return { booking_id: String(booking["id"]), customer_id: text(booking["customer_id"]), lead_id: text(booking["lead_id"]), assigned_to: text(booking["assigned_to"]), destination_text: text((booking["destinations"] as Record<string, unknown> | null)?.["name"] ?? booking["destination_text"]), travel_start: text(booking["travel_start"]), travel_end: text(booking["travel_end"]), services };
}

function datesForContext(context: BookedItineraryContext) {
  const values = context.services.flatMap((service) => [service.date, service.end_date]).filter((value): value is string => Boolean(value)).sort();
  const start = values[0] ?? context.travel_start;
  const end = values.at(-1) ?? context.travel_end ?? start;
  if (!start || !end) return [];
  if (end < start) throw new ItineraryGenerationError("SCHEMA_VIOLATION", "Booking service dates conflict.");
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (current <= last) { dates.push(current.toISOString().slice(0, 10)); current.setUTCDate(current.getUTCDate() + 1); }
  return dates;
}

function sourceItem(service: BookedServiceSource, sequence: number) {
  const f = service.fields as BookedServiceFields;
  if (service.item_type === "ACCOMMODATION") return { item_type: "ACCOMMODATION" as const, sequence, title: String(f.hotel_name ?? "Booked accommodation"), description: String(f.notes ?? ""), hotel_name: f.hotel_name, hotel_city: f.city, hotel_address: f.address, hotel_country: f.country, star_category: f.star_category, check_in: f.check_in, check_out: f.check_out, nights: f.nights, room_type: f.room_type, rooms: f.rooms, adults: f.adults, children: f.children, extra_beds: f.extra_beds, meal_plan: f.meal_plan, notes: f.notes };
  if (service.item_type === "EXTRA_TRANSPORT") return { item_type: "EXTRA_TRANSPORT" as const, sequence, title: String(f.transport_type ?? "Booked transport"), description: String(f.notes ?? ""), pickup: f.pickup, dropoff: f.dropoff, extra_transport_type: f.transport_type, extra_transport_date: f.date, extra_transport_pickup_time: f.pickup_time, extra_transport_drop_time: f.drop_time, extra_transport_vehicle_type: f.vehicle_type, extra_transport_vehicle_details: f.vehicle_details, extra_transport_driver_details: f.driver_details, extra_transport_passengers: f.passengers, extra_transport_customer_notes: f.notes };
  if (service.item_type === "ACTIVITY") return { item_type: "ACTIVITY" as const, sequence, title: String(f.activity_name ?? "Booked activity"), description: String(f.description ?? ""), location: f.location ?? f.city, duration: f.time, notes: f.meeting_point };
  return { item_type: "NOTE" as const, sequence, title: String(f.title ?? "Booked service"), description: String(f.description ?? "") };
}

export function buildDeterministicBookedDraft(context: BookedItineraryContext, aiDraft: ItineraryDraft): { draft: ItineraryDraft; traceability: BookingItineraryResult["traceability"] } {
  const dates = datesForContext(context);
  const servicesByDate = new Map<string, BookedServiceSource[]>();
  for (const service of context.services) { const date = service.date ?? dates[0]; if (!date) continue; const list = servicesByDate.get(date) ?? []; list.push(service); servicesByDate.set(date, list); }
  const traceability: BookingItineraryResult["traceability"] = [];
  const days = dates.map((date, dayIndex) => {
    const services = servicesByDate.get(date) ?? [];
    const items = services.map((service, itemIndex) => { traceability.push({ item_index: dayIndex * 100 + itemIndex, source_type: service.source_type, source_id: service.source_id }); return sourceItem(service, itemIndex + 1); });
    const aiDay = aiDraft.days[dayIndex];
    return { date, title: aiDay?.title ?? `Day ${dayIndex + 1}`, description: aiDay?.description ?? "", notes: aiDay?.notes ?? null, items };
  });
  const draft = validateItineraryDraft({ ...aiDraft, travel_start_date: dates[0] ?? null, travel_end_date: dates.at(-1) ?? null, days });
  return { draft, traceability };
}

export async function buildItineraryFromBooking(bookingId: string, options: { provider?: ItineraryGenerationProvider; booking?: Record<string, unknown>; items?: Array<Record<string, unknown>>; destinations?: Array<{ id: string; name: string; is_active?: boolean }> } = {}): Promise<BookingItineraryResult> {
  let booking = options.booking;
  let items = options.items;
  if (!booking || !items) {
    const { data: bookingRow, error: bookingError } = await supabaseAdmin.from("bookings").select("*, destinations(name,country)").eq("id", bookingId).maybeSingle();
    if (bookingError || !bookingRow) throw new ItineraryGenerationError("INVALID_INPUT", "Booking could not be loaded.");
    const { data: itemRows, error: itemsError } = await supabaseAdmin.from("booking_items").select("*, hotel_bookings(*), transport_services(*), activity_services(*)").eq("booking_id", bookingId).order("created_at");
    if (itemsError) throw new ItineraryGenerationError("INVALID_INPUT", "Booking services could not be loaded.");
    booking = bookingRow as Record<string, unknown>;
    items = (itemRows ?? []) as Array<Record<string, unknown>>;
  }
  const context = buildBookedServiceContext(booking, items);
  if (context.services.length === 0) throw new ItineraryGenerationError("INVALID_INPUT", "This booking has no supported services to organize.");
  const resolution = resolveDestinationText(context.destination_text, options.destinations ?? ((await supabaseAdmin.from("destinations").select("id,name,is_active").eq("is_active", true)).data ?? []));
  if (resolution.status !== "resolved") throw new ItineraryGenerationError("INVALID_INPUT", `Booking destination could not be safely resolved: ${resolution.status}.`);
  const provider = options.provider ?? new OpenAIItineraryProvider();
  const ai = await provider.generateItinerary({ destination: context.destination_text!, travel_start_date: context.travel_start, travel_end_date: context.travel_end, supplier_content: JSON.stringify(context), special_requirements: "Organize only these booked CRM services; do not invent or change source facts." });
  const { draft, traceability } = buildDeterministicBookedDraft(context, validateItineraryDraft(ai.draft));
  const photo_attachments = await findItineraryLibraryPhotoAttachments(draft, JSON.stringify(context));
  return { draft, photo_attachments, source_context: context, traceability, destination_resolution: resolution, provenance: "AI_BOOKING_SERVICES" };
}

export const buildItineraryFromBookingFn = createServerFn({ method: "POST" }).validator((input: { bookingId: string }) => input).handler(async ({ data }) => buildItineraryFromBooking(data.bookingId));
