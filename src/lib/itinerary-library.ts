export type ItineraryRecordInput = {
  id?: string | null;
  name?: string | null;
  destination_id?: string | null;
  duration_nights?: number | string | null;
  duration_days?: number | string | null;
  price?: number | string | null;
  currency?: string | null;
  hotel_category?: string | null;
  trip_type?: string | null;
  description?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  document_path?: string | null;
  document_name?: string | null;
  document_mime_type?: string | null;
  document_size?: number | null;
  is_active?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function validateItineraryInput(input: ItineraryRecordInput) {
  const errors: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors["name"] = "Itinerary name is required.";
  }

  if (!input.destination_id) {
    errors["destination_id"] = "Destination is required.";
  }

  const durationNights = Number(input.duration_nights ?? 0);
  const durationDays = Number(input.duration_days ?? 0);

  if (
    input.duration_nights === undefined ||
    input.duration_nights === null ||
    Number.isNaN(durationNights) ||
    durationNights < 0
  ) {
    errors["duration_nights"] = "Duration nights must be a non-negative number.";
  }

  if (
    input.duration_days === undefined ||
    input.duration_days === null ||
    Number.isNaN(durationDays) ||
    durationDays < 0
  ) {
    errors["duration_days"] = "Duration days must be a non-negative number.";
  }

  const priceValue =
    input.price === undefined || input.price === null || input.price === "" ? null : Number(input.price);
  if (priceValue !== null && (Number.isNaN(priceValue) || priceValue < 0)) {
    errors["price"] = "Price must be non-negative when provided.";
  }

  if (input.valid_from && input.valid_until) {
    const start = new Date(input.valid_from);
    const end = new Date(input.valid_until);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
      errors["valid_until"] = "Valid until cannot be before valid from.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export const TRIP_ITINERARY_STATUSES = ["DRAFT", "READY"] as const;
export type TripItineraryStatus = (typeof TRIP_ITINERARY_STATUSES)[number];

export type TripItineraryInput = {
  title?: string | null;
  customer_id?: string | null;
  lead_id?: string | null;
  enquiry_id?: string | null;
  destination_id?: string | null;
  destination_text?: string | null;
  travel_start_date?: string | null;
  travel_end_date?: string | null;
  adults?: number | string | null;
  children?: number | string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  summary?: string | null;
  status?: TripItineraryStatus | string | null;
};

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isUuid(value?: string | null) {
  return !value || UUID_PATTERN.test(value.trim());
}

export function validateTripItineraryInput(input: TripItineraryInput) {
  const errors: Record<string, string> = {};

  if (!input.title || !input.title.trim()) {
    errors["title"] = "Itinerary title is required.";
  }

  if (!input.destination_id && !input.destination_text?.trim()) {
    errors["destination_id"] = "Destination is required.";
  }

  if (input.customer_id && !isUuid(input.customer_id)) {
    errors["customer_id"] = "Customer reference is invalid.";
  }

  if (input.lead_id && !isUuid(input.lead_id)) {
    errors["lead_id"] = "Lead reference is invalid.";
  }

  if (input.enquiry_id && !isUuid(input.enquiry_id)) {
    errors["enquiry_id"] = "Enquiry reference is invalid.";
  }

  if (input.assigned_to && !isUuid(input.assigned_to)) {
    errors["assigned_to"] = "Assigned employee reference is invalid.";
  }

  const adultsValue = Number(input.adults ?? 0);
  if (Number.isNaN(adultsValue) || adultsValue < 0) {
    errors["adults"] = "Adults must be a non-negative integer.";
  }

  const childrenValue = Number(input.children ?? 0);
  if (Number.isNaN(childrenValue) || childrenValue < 0) {
    errors["children"] = "Children must be a non-negative integer.";
  }

  if (input.travel_start_date && input.travel_end_date) {
    const start = new Date(input.travel_start_date);
    const end = new Date(input.travel_end_date);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
      errors["travel_end_date"] = "End date cannot be before start date.";
    }
  }

  if (input.status && !TRIP_ITINERARY_STATUSES.includes(input.status as TripItineraryStatus)) {
    errors["status"] = "Status must be DRAFT or READY.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export type TripItineraryDayInput = {
  itinerary_id?: string | null;
  day_number?: number | null;
  date?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
};

export function validateTripItineraryDayInput(input: TripItineraryDayInput) {
  const errors: Record<string, string> = {};

  if (!input.itinerary_id || !UUID_PATTERN.test(input.itinerary_id.trim())) {
    errors["itinerary_id"] = "Itinerary reference is required.";
  }

  const dayNumber = Number(input.day_number ?? 0);
  if (!Number.isFinite(dayNumber) || dayNumber < 1) {
    errors["day_number"] = "Day number must be a positive integer.";
  }

  if (!input.title || !input.title.trim()) {
    errors["title"] = "Day title is required.";
  }

  if (input.date) {
    const parsed = new Date(input.date);
    if (Number.isNaN(parsed.getTime())) {
      errors["date"] = "Day date must be a valid date.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function reorderTripItineraryDays<T extends { id?: string; day_number: number }>(days: T[]) {
  return [...days]
    .map((day, index) => ({
      ...day,
      id: day.id ?? `day-${index + 1}`,
      day_number: Number(day.day_number) || index + 1,
    }))
    .sort((left, right) => (Number(left.day_number) || 0) - (Number(right.day_number) || 0))
    .map((day, index) => ({
      ...day,
      day_number: index + 1,
    }));
}

export function validateDocumentMetadata(input: {
  document_name?: string | null;
  document_mime_type?: string | null;
  document_size?: number | null;
}) {
  const errors: Record<string, string> = {};
  const fileName = input.document_name ?? "";
  const mimeType = input.document_mime_type ?? "";
  const size = input.document_size ?? null;

  if (fileName && !/\.pdf$/i.test(fileName)) {
    errors["document_name"] = "Only PDF documents are supported for the itinerary library.";
  }

  if (mimeType && mimeType !== "application/pdf") {
    errors["document_mime_type"] = "Itinerary document MIME type must be application/pdf.";
  }

  if (size !== null && size > 10 * 1024 * 1024) {
    errors["document_size"] = "Itinerary PDF should be 10 MB or smaller.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
