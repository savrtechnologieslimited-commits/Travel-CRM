import { HOTEL_MEAL_PLANS, HOTEL_STAR_CATEGORIES, ROOM_TYPES, nightsBetween } from "@/lib/hotel";
import { TRANSPORT_TYPES, VEHICLE_TYPES } from "@/lib/transport";
import type { Json } from "@/integrations/supabase/types";

export const ITINERARY_CONTENT_ITEM_TYPES = [
  "ACTIVITY",
  "SIGHTSEEING",
  "TRANSPORT",
  "MEAL",
  "ACCOMMODATION",
  "FLIGHT",
  "VISA",
  "EXTRA_TRANSPORT",
  "NOTE",
] as const;

export type ItineraryContentItemType = (typeof ITINERARY_CONTENT_ITEM_TYPES)[number];
export type MealType = "BREAKFAST" | "LUNCH" | "DINNER";

export type ItineraryContentItem = {
  id?: string | undefined;
  itinerary_day_id: string;
  itinerary_id?: string | null | undefined;
  package_id?: string | null | undefined;
  item_type: ItineraryContentItemType;
  title: string;
  description: string;
  location?: string | null | undefined;
  duration?: string | null | undefined;
  notes?: string | null | undefined;
  pickup?: string | null | undefined;
  dropoff?: string | null | undefined;
  departure_time?: string | null | undefined;
  arrival_time?: string | null | undefined;
  vehicle_details?: string | null | undefined;
  meal_type?: MealType | null | undefined;
  hotel_name?: string | null | undefined;
  hotel_city?: string | null | undefined;
  check_in?: string | null | undefined;
  check_out?: string | null | undefined;
  room_details?: string | null | undefined;
  hotel_address?: string | null | undefined;
  hotel_country?: string | null | undefined;
  star_category?: string | null | undefined;
  nights?: number | null | undefined;
  room_type?: string | null | undefined;
  rooms?: number | null | undefined;
  adults?: number | null | undefined;
  children?: number | null | undefined;
  extra_beds?: number | null | undefined;
  meal_plan?: string | null | undefined;
  hotel_description?: string | null | undefined;
  customer_facing_info?: string | null | undefined;
  hotel_option_group?: string | null | undefined;
  hotel_option_label?: string | null | undefined;
  hotel_option_sequence?: number | null | undefined;
  flight_airline?: string | null | undefined;
  flight_number?: string | null | undefined;
  departure_airport?: string | null | undefined;
  departure_city?: string | null | undefined;
  arrival_airport?: string | null | undefined;
  arrival_city?: string | null | undefined;
  flight_departure_date?: string | null | undefined;
  flight_departure_time?: string | null | undefined;
  flight_arrival_date?: string | null | undefined;
  flight_arrival_time?: string | null | undefined;
  flight_cabin?: string | null | undefined;
  baggage_information?: string | null | undefined;
  flight_duration?: string | null | undefined;
  flight_price?: number | null | undefined;
  flight_currency?: string | null | undefined;
  visa_country?: string | null | undefined;
  visa_type?: string | null | undefined;
  visa_validity?: string | null | undefined;
  visa_processing_time?: string | null | undefined;
  visa_required_documents?: string | null | undefined;
  visa_entry_exit_information?: string | null | undefined;
  visa_customer_information?: string | null | undefined;
  extra_transport_type?: string | null | undefined;
  extra_transport_date?: string | null | undefined;
  extra_transport_pickup_time?: string | null | undefined;
  extra_transport_drop_time?: string | null | undefined;
  extra_transport_vehicle_type?: string | null | undefined;
  extra_transport_vehicle_details?: string | null | undefined;
  extra_transport_driver_details?: string | null | undefined;
  extra_transport_passengers?: number | null | undefined;
  extra_transport_customer_notes?: string | null | undefined;
  sequence: number;
  created_at?: string | null | undefined;
  updated_at?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type ItineraryTable = {
  id?: string | undefined;
  title: string;
  columns: string[];
  rows: string[][];
};

export type ItineraryPhoto = {
  id?: string | undefined;
  itinerary_id: string;
  day_id?: string | null | undefined;
  day_item_id?: string | null | undefined;
  url: string;
  storage_path?: string | null | undefined;
  caption?: string | null | undefined;
  alt_text?: string | null | undefined;
  source?: string | null | undefined;
  selection_type?: string | null | undefined;
  is_primary?: boolean | undefined;
  google_place_id?: string | null | undefined;
  place_name?: string | null | undefined;
  google_photo_reference?: string | null | undefined;
  attribution?: Json | undefined;
  sequence: number;
  created_at?: string | null | undefined;
  updated_at?: string | null | undefined;
};

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function normalizeItineraryItem(input: Partial<ItineraryContentItem> & { itinerary_day_id: string; item_type: ItineraryContentItemType }): ItineraryContentItem {
  const sequence = Number(input.sequence ?? 0);
  const title = readString(input.title, "Untitled item") || "Untitled item";
  const itemType = ITINERARY_CONTENT_ITEM_TYPES.includes(input.item_type as ItineraryContentItemType)
    ? (input.item_type as ItineraryContentItemType)
    : "NOTE";

  const result: ItineraryContentItem = {
    itinerary_day_id: input.itinerary_day_id,
    itinerary_id: input.itinerary_id ?? null,
    item_type: itemType,
    title,
    description: typeof input.description === "string" ? input.description : "",
    location: typeof input.location === "string" ? input.location : null,
    duration: typeof input.duration === "string" ? input.duration : null,
    notes: typeof input.notes === "string" ? input.notes : null,
    pickup: typeof input.pickup === "string" ? input.pickup : null,
    dropoff: typeof input.dropoff === "string" ? input.dropoff : null,
    departure_time: typeof input.departure_time === "string" ? input.departure_time : null,
    arrival_time: typeof input.arrival_time === "string" ? input.arrival_time : null,
    vehicle_details: typeof input.vehicle_details === "string" ? input.vehicle_details : null,
    meal_type: input.meal_type && ["BREAKFAST", "LUNCH", "DINNER"].includes(input.meal_type) ? input.meal_type : null,
    hotel_name: typeof input.hotel_name === "string" ? input.hotel_name : null,
    hotel_city: typeof input.hotel_city === "string" ? input.hotel_city : null,
    check_in: typeof input.check_in === "string" ? input.check_in : null,
    check_out: typeof input.check_out === "string" ? input.check_out : null,
    room_details: typeof input.room_details === "string" ? input.room_details : null,
    hotel_address: typeof input.hotel_address === "string" ? input.hotel_address : null,
    hotel_country: typeof input.hotel_country === "string" ? input.hotel_country : null,
    star_category: typeof input.star_category === "string" ? input.star_category : null,
    nights: typeof input.nights === "number" ? input.nights : null,
    room_type: typeof input.room_type === "string" ? input.room_type : null,
    rooms: typeof input.rooms === "number" ? input.rooms : null,
    adults: typeof input.adults === "number" ? input.adults : null,
    children: typeof input.children === "number" ? input.children : null,
    extra_beds: typeof input.extra_beds === "number" ? input.extra_beds : null,
    meal_plan: typeof input.meal_plan === "string" ? input.meal_plan : null,
    hotel_description: typeof input.hotel_description === "string" ? input.hotel_description : null,
    customer_facing_info: typeof input.customer_facing_info === "string" ? input.customer_facing_info : null,
    hotel_option_group: typeof input.hotel_option_group === "string" ? input.hotel_option_group : null,
    hotel_option_label: typeof input.hotel_option_label === "string" ? input.hotel_option_label : null,
    hotel_option_sequence: typeof input.hotel_option_sequence === "number" ? input.hotel_option_sequence : null,
    flight_airline: typeof input.flight_airline === "string" ? input.flight_airline : null,
    flight_number: typeof input.flight_number === "string" ? input.flight_number : null,
    departure_airport: typeof input.departure_airport === "string" ? input.departure_airport : null,
    departure_city: typeof input.departure_city === "string" ? input.departure_city : null,
    arrival_airport: typeof input.arrival_airport === "string" ? input.arrival_airport : null,
    arrival_city: typeof input.arrival_city === "string" ? input.arrival_city : null,
    flight_departure_date: typeof input.flight_departure_date === "string" ? input.flight_departure_date : null,
    flight_departure_time: typeof input.flight_departure_time === "string" ? input.flight_departure_time : null,
    flight_arrival_date: typeof input.flight_arrival_date === "string" ? input.flight_arrival_date : null,
    flight_arrival_time: typeof input.flight_arrival_time === "string" ? input.flight_arrival_time : null,
    flight_cabin: typeof input.flight_cabin === "string" ? input.flight_cabin : null,
    baggage_information: typeof input.baggage_information === "string" ? input.baggage_information : null,
    flight_duration: typeof input.flight_duration === "string" ? input.flight_duration : null,
    flight_price: typeof input.flight_price === "number" ? input.flight_price : null,
    flight_currency: typeof input.flight_currency === "string" ? input.flight_currency : null,
    visa_country: typeof input.visa_country === "string" ? input.visa_country : null,
    visa_type: typeof input.visa_type === "string" ? input.visa_type : null,
    visa_validity: typeof input.visa_validity === "string" ? input.visa_validity : null,
    visa_processing_time: typeof input.visa_processing_time === "string" ? input.visa_processing_time : null,
    visa_required_documents: typeof input.visa_required_documents === "string" ? input.visa_required_documents : null,
    visa_entry_exit_information: typeof input.visa_entry_exit_information === "string" ? input.visa_entry_exit_information : null,
    visa_customer_information: typeof input.visa_customer_information === "string" ? input.visa_customer_information : null,
    extra_transport_type: typeof input.extra_transport_type === "string" ? input.extra_transport_type : null,
    extra_transport_date: typeof input.extra_transport_date === "string" ? input.extra_transport_date : null,
    extra_transport_pickup_time: typeof input.extra_transport_pickup_time === "string" ? input.extra_transport_pickup_time : null,
    extra_transport_drop_time: typeof input.extra_transport_drop_time === "string" ? input.extra_transport_drop_time : null,
    extra_transport_vehicle_type: typeof input.extra_transport_vehicle_type === "string" ? input.extra_transport_vehicle_type : null,
    extra_transport_vehicle_details: typeof input.extra_transport_vehicle_details === "string" ? input.extra_transport_vehicle_details : null,
    extra_transport_driver_details: typeof input.extra_transport_driver_details === "string" ? input.extra_transport_driver_details : null,
    extra_transport_passengers: typeof input.extra_transport_passengers === "number" ? input.extra_transport_passengers : null,
    extra_transport_customer_notes: typeof input.extra_transport_customer_notes === "string" ? input.extra_transport_customer_notes : null,
    sequence: Number.isFinite(sequence) ? Math.max(0, sequence) : 0,
    created_at: input.created_at ?? null,
    updated_at: input.updated_at ?? null,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };

  if (typeof input.id === "string") {
    result.id = input.id;
  }

  return result;
}

export function validateItineraryDayItem(input: Partial<ItineraryContentItem>) {
  if (!input.itinerary_day_id || !UUID_PATTERN.test(input.itinerary_day_id.trim())) {
    throw new Error("Itinerary day reference is invalid.");
  }

  if (!input.item_type || !ITINERARY_CONTENT_ITEM_TYPES.includes(input.item_type as ItineraryContentItemType)) {
    throw new Error("Item type is invalid.");
  }

  if (!input.title || !input.title.trim()) {
    throw new Error("Item title is required.");
  }

  const sequence = Number(input.sequence ?? 0);
  if (!Number.isFinite(sequence) || sequence < 0) {
    throw new Error("Item sequence must be a non-negative integer.");
  }

  if (input.item_type === "ACCOMMODATION") {
    validateAccommodationItem(input);
  }
  if (input.item_type === "FLIGHT") {
    validateFlightItem(input);
  }
  if (input.item_type === "VISA") {
    validateVisaItem(input);
  }
  if (input.item_type === "EXTRA_TRANSPORT") {
    validateExtraTransportItem(input);
  }

  return normalizeItineraryItem({
    ...input,
    item_type: input.item_type as ItineraryContentItemType,
    itinerary_day_id: input.itinerary_day_id,
    sequence,
  });
}

function completeDateTime(date?: string | null, time?: string | null) {
  if (!date || !time) return null;
  if (!isValidDateOnly(date) || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-");
  const year = Number(parts[0]!);
  const month = Number(parts[1]!);
  const day = Number(parts[2]!);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateFlightItem(input: Partial<ItineraryContentItem>) {
  if (!input.flight_airline?.trim()) throw new Error("Airline is required for flight.");
  for (const [label, value] of [["departure", input.flight_departure_date], ["arrival", input.flight_arrival_date]] as const) {
    if (value && !isValidDateOnly(value)) throw new Error(`Flight ${label} date is invalid.`);
  }
  const departure = completeDateTime(input.flight_departure_date, input.flight_departure_time);
  const arrival = completeDateTime(input.flight_arrival_date, input.flight_arrival_time);
  if (input.flight_departure_time && !departure) throw new Error("Flight departure date/time is invalid.");
  if (input.flight_arrival_time && !arrival) throw new Error("Flight arrival date/time is invalid.");
  if (departure && arrival && arrival < departure) throw new Error("Flight arrival cannot be before departure.");
  if (input.flight_price != null && input.flight_price < 0) throw new Error("Flight price cannot be negative.");
  if (input.flight_price != null && (!input.flight_currency || !/^[A-Z]{3}$/.test(input.flight_currency))) throw new Error("A valid three-letter flight currency is required when price is supplied.");
  return input;
}

export function validateVisaItem(input: Partial<ItineraryContentItem>) {
  if (!input.visa_country?.trim()) throw new Error("Visa country is required.");
  if (!input.visa_type?.trim()) throw new Error("Visa type is required.");
  return input;
}

export function validateExtraTransportItem(input: Partial<ItineraryContentItem>) {
  if (!input.extra_transport_type?.trim()) throw new Error("Transport type is required.");
  if (!input.pickup?.trim() || !input.dropoff?.trim()) throw new Error("Transport pickup and drop locations are required.");
  if (input.extra_transport_date && !isValidDateOnly(input.extra_transport_date)) throw new Error("Transport date is invalid.");
  if (input.extra_transport_passengers != null && input.extra_transport_passengers < 0) throw new Error("Transport passengers cannot be negative.");
  if (!TRANSPORT_TYPES.includes(input.extra_transport_type as (typeof TRANSPORT_TYPES)[number]) && input.extra_transport_type !== "Other") throw new Error("Transport type is not supported.");
  if (input.extra_transport_vehicle_type && !VEHICLE_TYPES.includes(input.extra_transport_vehicle_type as (typeof VEHICLE_TYPES)[number])) throw new Error("Vehicle type is not supported.");
  return input;
}

export function validateAccommodationItem(input: Partial<ItineraryContentItem>) {
  const isUnselectedAiSuggestion = input.metadata?.["hotel_suggestion"] === true;
  if (!input.hotel_name?.trim() && !isUnselectedAiSuggestion) {
    throw new Error("Hotel name is required for accommodation.");
  }

  if (input.check_in && input.check_out) {
    const nights = nightsBetween(input.check_in, input.check_out);
    if (new Date(input.check_out).getTime() <= new Date(input.check_in).getTime()) {
      throw new Error("Hotel check-out must be after check-in.");
    }
    if (input.nights != null && input.nights !== nights) {
      throw new Error("Hotel nights must match the check-in and check-out dates.");
    }
  }

  if (input.rooms != null && (!Number.isInteger(input.rooms) || input.rooms <= 0)) {
    throw new Error("Hotel rooms must be a positive integer.");
  }
  for (const [field, value] of [["adults", input.adults], ["children", input.children], ["extra beds", input.extra_beds]] as const) {
    if (value != null && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`Hotel ${field} cannot be negative.`);
    }
  }
  if (input.meal_plan && !HOTEL_MEAL_PLANS.includes(input.meal_plan as (typeof HOTEL_MEAL_PLANS)[number])) {
    throw new Error("Hotel meal plan is not supported.");
  }
  if (input.star_category && !HOTEL_STAR_CATEGORIES.includes(input.star_category as (typeof HOTEL_STAR_CATEGORIES)[number])) {
    throw new Error("Hotel star category is not supported.");
  }
  if (input.room_type && !ROOM_TYPES.includes(input.room_type as (typeof ROOM_TYPES)[number])) {
    throw new Error("Hotel room type is not supported.");
  }
  if (input.hotel_option_sequence != null && (!Number.isInteger(input.hotel_option_sequence) || input.hotel_option_sequence < 0)) {
    throw new Error("Hotel option sequence must be non-negative.");
  }

  return input;
}

export function reorderItineraryItems<T extends { id?: string | undefined; sequence: number }>(items: T[]) {
  return [...items]
    .map((item, index) => ({ ...item, sequence: Number(item.sequence) || index + 1 }))
    .sort((left, right) => (Number(left.sequence) || 0) - (Number(right.sequence) || 0))
    .map((item, index) => ({ ...item, sequence: index + 1 }));
}

export function normalizeItineraryPhoto(input: Partial<ItineraryPhoto> & { itinerary_id: string; url?: string | null; storage_path?: string | null; sequence: number }): ItineraryPhoto {
  const sequence = Number(input.sequence ?? 0);
  const result: ItineraryPhoto = {
    itinerary_id: input.itinerary_id,
    url: typeof input.url === "string" ? input.url.trim() : "",
    storage_path: typeof input.storage_path === "string" ? input.storage_path.trim() : null,
    caption: typeof input.caption === "string" ? input.caption : null,
    alt_text: typeof input.alt_text === "string" ? input.alt_text : null,
    sequence: Number.isFinite(sequence) ? Math.max(0, sequence) : 0,
    day_id: typeof input.day_id === "string" ? input.day_id : null,
    day_item_id: typeof input.day_item_id === "string" ? input.day_item_id : null,
  };

  if (input.source !== undefined) result.source = input.source;
  if (input.selection_type !== undefined) result.selection_type = input.selection_type;
  if (typeof input.is_primary === "boolean") result.is_primary = input.is_primary;
  if (input.google_place_id !== undefined) result.google_place_id = input.google_place_id;
  if (input.place_name !== undefined) result.place_name = input.place_name;
  if (input.google_photo_reference !== undefined) result.google_photo_reference = input.google_photo_reference;
  if (input.attribution !== undefined) result.attribution = input.attribution;

  if (typeof input.id === "string") {
    result.id = input.id;
  }
  if (typeof input.created_at === "string") {
    result.created_at = input.created_at;
  }
  if (typeof input.updated_at === "string") {
    result.updated_at = input.updated_at;
  }

  return result;
}

export function validateItineraryPhoto(input: Partial<ItineraryPhoto> & { itinerary_id: string; url?: string | null; storage_path?: string | null; sequence: number }) {
  if (!input.itinerary_id || !UUID_PATTERN.test(input.itinerary_id.trim())) {
    throw new Error("Itinerary reference is invalid.");
  }

  if (!(typeof input.url === "string" && input.url.trim()) && !(typeof input.storage_path === "string" && input.storage_path.trim())) {
    throw new Error("Photo URL or Storage path is required.");
  }

  if (input.day_id && !UUID_PATTERN.test(input.day_id.trim())) {
    throw new Error("Day reference is invalid.");
  }

  if (input.day_item_id && !UUID_PATTERN.test(input.day_item_id.trim())) {
    throw new Error("Item reference is invalid.");
  }

  if (input.day_id && input.day_item_id && input.day_id === input.day_item_id) {
    throw new Error("Photo references must point to either a day or an item, not the same record.");
  }

  const sequence = Number(input.sequence ?? 0);
  if (!Number.isFinite(sequence) || sequence < 0) {
    throw new Error("Photo sequence must be a non-negative integer.");
  }

  return normalizeItineraryPhoto({
    ...input,
    itinerary_id: input.itinerary_id,
    url: input.url ?? "",
    storage_path: input.storage_path ?? null,
    sequence,
  });
}

export function reorderItineraryPhotos<T extends { id?: string | undefined; sequence: number }>(items: T[]) {
  return [...items]
    .map((item, index) => ({ ...item, sequence: Number(item.sequence) || index + 1 }))
    .sort((left, right) => (Number(left.sequence) || 0) - (Number(right.sequence) || 0))
    .map((item, index) => ({ ...item, sequence: index + 1 }));
}

export function validateItineraryTable(input: Partial<ItineraryTable>) {
  if (!input.title || !input.title.trim()) {
    throw new Error("Table title is required.");
  }

  const columns = Array.isArray(input.columns) ? input.columns.map((column) => String(column ?? "").trim()) : [];
  if (columns.length === 0) {
    throw new Error("A custom table must have at least one column.");
  }

  const rows = Array.isArray(input.rows) ? input.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [])) : [];
  if (rows.some((row) => row.length !== columns.length)) {
    throw new Error("Each table row must match the current column count.");
  }

  const result: ItineraryTable = {
    title: input.title.trim(),
    columns,
    rows,
  };

  if (typeof input.id === "string") {
    result.id = input.id;
  }

  return result;
}

export function normalizeItineraryTable(input: Partial<ItineraryTable>): ItineraryTable {
  const fallbackTitle = input.title?.trim() || "Custom table";
  const columns = Array.isArray(input.columns) ? input.columns.map((column) => String(column ?? "").trim()).filter(Boolean) : ["Column 1"];
  const rows = Array.isArray(input.rows)
    ? input.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : new Array(columns.length).fill("")))
    : [];

  const result: ItineraryTable = {
    title: fallbackTitle,
    columns: columns.length > 0 ? columns : ["Column 1"],
    rows: rows.length > 0 ? rows : [[""]],
  };

  if (typeof input.id === "string") {
    result.id = input.id;
  }

  return result;
}
