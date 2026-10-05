import OpenAI from "openai";
import type { ItineraryTicketFacts } from "./itinerary-ticket-sources";

export type CompleteItineraryInput = {
  requirements: string;
  refinement?: string;
  tickets: ItineraryTicketFacts[];
  savedServices?: CompleteItinerarySavedService[];
  includeHotelRecommendations?: boolean;
  tripContext?: { startDate: string; endDate: string; adults: number; children: number } | null;
};

export type CompleteItinerarySavedService = {
  day_number: number;
  date: string;
  item_type: string;
  title: string;
  details: string[];
};

export type CompleteItineraryDay = {
  day_number: number;
  date: string | null;
  city: string;
  overnight_city: string | null;
  title: string;
  morning: string[];
  afternoon: string[];
  evening: string[];
  transfers: string[];
  hotel_requirement: string | null;
  meals: string[];
  free_time: string[];
  notes: string[];
  saved_services?: CompleteItinerarySavedService[];
};

export type CompleteItineraryPlan = {
  trip_summary: {
    destination: string;
    days: number;
    nights: number;
    start_date: string | null;
    end_date: string | null;
    adults: number | null;
    children: number | null;
    infants: number | null;
    child_ages: string | null;
    arrival_city: string | null;
    departure_city: string | null;
    arrival_mode: string | null;
    departure_mode: string | null;
    travel_style: string;
    route: string;
    assumptions: string[];
  };
  days: CompleteItineraryDay[];
  hotel_requirements: string[];
  transfer_requirements: string[];
  unresolved_questions: string[];
};

type CompleteItineraryClient = {
  responses: {
    create: (input: Record<string, unknown>) => Promise<{ output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }>;
  };
};

const MAX_REQUIREMENTS_LENGTH = 4_000;
const MAX_REFINEMENT_LENGTH = 1_000;
const MAX_TICKETS = 50;
const MAX_SAVED_SERVICES = 100;
const MAX_TICKET_FIELD_LENGTH = 500;
const TICKET_FIELDS = ["kind", "date", "departureTime", "arrivalDate", "arrivalTime", "serviceName", "serviceNumber", "departureLocation", "arrivalLocation", "travelClass"] as const;
const FINANCIAL_OR_INTERNAL = /(?:\p{Sc}|\b(?:cost|price|fare|amount|currency|margin|tax(?:es)?|supplier|internal|metadata|identifier|google\s+place\s+id|booking\s+id|customer\s+id|lead\s+id|enquiry\s+id|\b(?:inr|usd|eur|gbp|cad|aud|jpy|cny|aed|sar)\b)\b|\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b)/iu;
const FALSE_BOOKING = /\b(?:your\s+)?(?:hotel|transfer|reservation|flight|train)\s+(?:is\s+)?(?:booked|confirmed)\b|\bbooking\s+confirmed\b/i;
const INTERNAL_CUSTOMER_COPY = /\b(?:AI[- ]planned|AI[- ]generated plan|not booked|saved service|source record|segment|day_number|booking_item_id|quotation_item_id|internal requirement|database)\b/i;

export class CompleteItineraryError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_CONFIGURED" | "PROVIDER_FAILURE" | "INVALID_RESPONSE" | "VALIDATION_FAILURE", message: string) {
    super(message);
    this.name = "CompleteItineraryError";
  }
}

const SYSTEM_PROMPT = `You are an experienced travel consultant preparing a concise, customer-ready itinerary. Produce a complete, practical trip plan from the client requirement, date/traveller context, existing saved-service facts, and confirmed flight/train facts supplied in the request. You may use general destination knowledge to suggest well-known sights and sensible geographic order, but do not use external search, CRM profiles, prior conversations, or unsupported operational claims.

Understand destinations and their requested order, trip duration, traveller counts/ages, dates, style, interests, purpose, pace, arrival/departure and special requests. Resolve explicit city/night allocations first; where the client gives only a list of destinations and total duration, distribute nights sensibly along the route, favor consecutive stays and avoid unnecessary hotel changes. Follow the route forward without backtracking. Fit arrival/departure and intercity travel to the actual day; leave realistic time to settle in and rest. A relaxed trip has few major activities each day and leisure; moderate is balanced; packed is efficient but feasible; family plans include breaks; honeymoon plans favor gentle/scenic experiences; business plans favor logistics and convenience. For approximate intercity driving durations, use cautious estimates and qualify that traffic affects them; never invent exact clock times, opening hours, availability, bookings, or travel reservations.

If only days are specified, assume nights = days - 1; if only nights are specified, assume days = nights + 1. If neither is stated, create a practical 3-day/2-night draft and disclose the assumed duration. Use traveller counts in tripContext as authoritative where provided; otherwise use explicit prompt counts. Infer two adults only for a clearly described couple; otherwise use null if unknown. State only useful assumptions and unresolved questions.

Saved-service entries and ticket facts are immutable source facts. Do not omit, replace, reschedule, re-date, re-time, re-route, rename, or change the details of a saved hotel, activity, transfer, flight, or train. Plan surrounding activities around their real dates/times and saved hotel check-in/check-out. Use saved services on their supplied itinerary day/date; do not move them to make the narrative fit. A saved-service date may anchor the itinerary date sequence when no explicit/current trip range or ticket range is available. Ticket departure and arrival details are hard constraints, and no sightseeing may occur before arrival or after departure. Retain the factual details in the relevant day narrative when applicable. Never claim an item is booked/confirmed unless the input explicitly establishes that status; do not present an AI suggestion as a reservation.

Create a coherent PLAN, not a database dump, quotation, or booking. For days, write concise natural narrative entries answering what the traveller will do. Use morning/afternoon/evening only when useful; avoid placeholders such as “planned”, “free time” without context, or empty filler. Group geographically close attractions sensibly, keep sightseeing realistic for the requested pace, allow breaks and sufficient leisure, and describe transfers as suggested arrangements unless they are saved facts. Make the final day connect logically to departure. When hotelRecommendations says include hotels, set overnight_city and hotel_requirement on exactly the days with an overnight stay (one overnight per trip night); overnight_city is the city where the traveller actually sleeps, which can differ from the daytime city on a transfer day. Consecutive nights in the same overnight city must use the same area/category requirement so they become one hotel stay. Do not add a hotel requirement to the checkout/departure day. Hotels without a saved named hotel must be requirements by area/category, never invented property names. When hotelRecommendations says omit hotels, leave generated overnight_city and hotel_requirement null. Never invent ratings, facilities, prices, room inventory, or availability. Suggest optional experiences only when relevant and label them as optional/recommended. Meals/restaurants are suggestions only when food preferences were requested; do not claim reservations.

Use only provided dates, or derive each consecutive itinerary date from the explicit date range, validated tripContext, confirmed ticket date, or saved-service date. Otherwise dates and summary range must be null. Make day numbers consecutive and titles natural, informative, and customer-friendly. Keep prose brief and polished. Do not expose CRM/technical language, including “AI planned”, “AI-generated plan”, “not booked”, “saved service”, “source record”, “segment”, “day_number”, record IDs, “internal requirement”, or “database”. Do not include any price, fare, currency, tax, margin, commission, supplier cost, or other monetary content, even if present in a saved record. Never invent exact clock times. Return only the required JSON.`;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    trip_summary: {
      type: "object", additionalProperties: false,
      properties: {
        destination: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 30 }, nights: { type: "integer", minimum: 0, maximum: 30 },
        start_date: { type: ["string", "null"] }, end_date: { type: ["string", "null"] },
        adults: { type: ["integer", "null"], minimum: 0 }, children: { type: ["integer", "null"], minimum: 0 }, infants: { type: ["integer", "null"], minimum: 0 },
        child_ages: { type: ["string", "null"] }, arrival_city: { type: ["string", "null"] }, departure_city: { type: ["string", "null"] },
        arrival_mode: { type: ["string", "null"] }, departure_mode: { type: ["string", "null"] },
        travel_style: { type: "string" }, route: { type: "string" }, assumptions: { type: "array", items: { type: "string" } },
      }, required: ["destination", "days", "nights", "start_date", "end_date", "adults", "children", "infants", "child_ages", "arrival_city", "departure_city", "arrival_mode", "departure_mode", "travel_style", "route", "assumptions"],
    },
    days: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        day_number: { type: "integer", minimum: 1 }, date: { type: ["string", "null"] }, city: { type: "string" }, overnight_city: { type: ["string", "null"] }, title: { type: "string" },
        morning: { type: "array", items: { type: "string" } }, afternoon: { type: "array", items: { type: "string" } }, evening: { type: "array", items: { type: "string" } },
        transfers: { type: "array", items: { type: "string" } }, hotel_requirement: { type: ["string", "null"] }, meals: { type: "array", items: { type: "string" } },
        free_time: { type: "array", items: { type: "string" } }, notes: { type: "array", items: { type: "string" } },
      }, required: ["day_number", "date", "city", "overnight_city", "title", "morning", "afternoon", "evening", "transfers", "hotel_requirement", "meals", "free_time", "notes"],
    } },
    hotel_requirements: { type: "array", items: { type: "string" } },
    transfer_requirements: { type: "array", items: { type: "string" } },
    unresolved_questions: { type: "array", items: { type: "string" } },
  },
  required: ["trip_summary", "days", "hotel_requirements", "transfer_requirements", "unresolved_questions"],
} as const;

function validateInput(raw: CompleteItineraryInput): CompleteItineraryInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || Object.keys(raw).some((key) => !["requirements", "refinement", "tickets", "savedServices", "includeHotelRecommendations", "tripContext"].includes(key))) {
    throw new CompleteItineraryError("INVALID_INPUT", "Invalid itinerary-planning request.");
  }
  if (typeof raw.requirements !== "string" || !raw.requirements.trim() || raw.requirements.length > MAX_REQUIREMENTS_LENGTH) {
    throw new CompleteItineraryError("INVALID_INPUT", "Enter a short travel requirement (up to 4,000 characters).");
  }
  if (raw.refinement !== undefined && (typeof raw.refinement !== "string" || raw.refinement.length > MAX_REFINEMENT_LENGTH)) {
    throw new CompleteItineraryError("INVALID_INPUT", "Refinement instructions must be no longer than 1,000 characters.");
  }
  if (!Array.isArray(raw.tickets) || raw.tickets.length > MAX_TICKETS) throw new CompleteItineraryError("INVALID_INPUT", "Invalid confirmed ticket details.");
  const tickets = raw.tickets.map((ticket) => {
    if (!ticket || typeof ticket !== "object" || (ticket.kind !== "flight" && ticket.kind !== "train")) throw new CompleteItineraryError("INVALID_INPUT", "Invalid confirmed ticket details.");
    const sanitized: Record<string, string> = { kind: ticket.kind };
    for (const field of TICKET_FIELDS) {
      if (field === "kind") continue;
      const value = ticket[field];
      if (value === undefined) continue;
      if (typeof value !== "string" || value.length > MAX_TICKET_FIELD_LENGTH) throw new CompleteItineraryError("INVALID_INPUT", "Invalid confirmed ticket details.");
      if ((field === "date" || field === "arrivalDate") && !isValidDateOnly(value)) throw new CompleteItineraryError("INVALID_INPUT", "Invalid confirmed ticket dates.");
      if (!FINANCIAL_OR_INTERNAL.test(value)) sanitized[field] = value;
    }
    return sanitized as unknown as ItineraryTicketFacts;
  });
  if (raw.savedServices !== undefined && (!Array.isArray(raw.savedServices) || raw.savedServices.length > MAX_SAVED_SERVICES)) {
    throw new CompleteItineraryError("INVALID_INPUT", "Invalid saved itinerary services.");
  }
  const savedServices = (raw.savedServices ?? []).flatMap((service) => {
    if (!service || typeof service !== "object" || Array.isArray(service)
      || Object.keys(service).some((key) => !["day_number", "date", "item_type", "title", "details"].includes(key))
      || !Number.isInteger(service.day_number) || service.day_number < 1 || service.day_number > 30
      || typeof service.date !== "string" || (service.date !== "" && !isValidDateOnly(service.date))
      || typeof service.item_type !== "string" || service.item_type.length > 40
      || typeof service.title !== "string" || !service.title.trim() || service.title.length > MAX_TICKET_FIELD_LENGTH
      || !Array.isArray(service.details) || service.details.length > 30
      || service.details.some((detail) => typeof detail !== "string" || detail.length > MAX_TICKET_FIELD_LENGTH)) {
      throw new CompleteItineraryError("INVALID_INPUT", "Invalid saved itinerary services.");
    }
    if (FINANCIAL_OR_INTERNAL.test(service.title)) return [];
    return [{
      day_number: service.day_number,
      date: service.date,
      item_type: service.item_type,
      title: service.title.trim(),
      details: service.details.map((detail) => detail.trim()).filter((detail) => detail && !FINANCIAL_OR_INTERNAL.test(detail)),
    } satisfies CompleteItinerarySavedService];
  });
  if (raw.includeHotelRecommendations !== undefined && typeof raw.includeHotelRecommendations !== "boolean") {
    throw new CompleteItineraryError("INVALID_INPUT", "Hotel recommendation preference must be true or false.");
  }
  let tripContext: CompleteItineraryInput["tripContext"];
  if (raw.tripContext != null) {
    const context = raw.tripContext;
    if (!context || typeof context !== "object" || Object.keys(context).some((key) => !["startDate", "endDate", "adults", "children"].includes(key))
      || typeof context.startDate !== "string" || typeof context.endDate !== "string"
      || !isValidDateOnly(context.startDate) || !isValidDateOnly(context.endDate)
      || context.endDate < context.startDate || !Number.isInteger(context.adults) || context.adults < 0
      || !Number.isInteger(context.children) || context.children < 0) {
      throw new CompleteItineraryError("INVALID_INPUT", "Current trip dates or traveller counts are invalid.");
    }
    tripContext = { startDate: context.startDate, endDate: context.endDate, adults: context.adults, children: context.children };
  }
  return {
    requirements: raw.requirements.trim(),
    ...(raw.refinement?.trim() ? { refinement: raw.refinement.trim() } : {}),
    tickets,
    savedServices,
    includeHotelRecommendations: raw.includeHotelRecommendations ?? true,
    ...(tripContext ? { tripContext } : {}),
  };
}

function durationFromPrompt(requirements: string): { days?: number; nights?: number } {
  const nightsFirst = /(\d{1,2})\s*nights?\D{0,24}(\d{1,2})\s*days?/i.exec(requirements);
  const daysFirst = /(\d{1,2})\s*days?\D{0,24}(\d{1,2})\s*nights?/i.exec(requirements);
  const duration = nightsFirst ? { nights: Number(nightsFirst[1]), days: Number(nightsFirst[2]) }
    : daysFirst ? { days: Number(daysFirst[1]), nights: Number(daysFirst[2]) } : {};
  if (duration.days === undefined) {
    const daysOnly = /(\d{1,2})\s*days?/i.exec(requirements);
    if (daysOnly) duration.days = Number(daysOnly[1]);
  }
  if (duration.nights === undefined) {
    const nightsOnly = /(\d{1,2})\s*nights?/i.exec(requirements);
    if (nightsOnly) duration.nights = Number(nightsOnly[1]);
  }
  if (duration.days !== undefined && duration.nights === undefined) duration.nights = Math.max(0, duration.days - 1);
  if (duration.nights !== undefined && duration.days === undefined) duration.days = duration.nights + 1;
  return duration;
}

function explicitDateRange(requirements: string): { start: string; end: string; days: number } | undefined {
  const match = /(20\d{2}-\d{2}-\d{2})\s*(?:to|through|–|—|-)\s*(20\d{2}-\d{2}-\d{2})/i.exec(requirements);
  if (!match) return undefined;
  if (!isValidDateOnly(match[1]!) || !isValidDateOnly(match[2]!)) throw new CompleteItineraryError("INVALID_INPUT", "The supplied travel date range is invalid or too long.");
  const start = new Date(`${match[1]}T00:00:00Z`);
  const end = new Date(`${match[2]}T00:00:00Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 30) throw new CompleteItineraryError("INVALID_INPUT", "The supplied travel date range is invalid or too long.");
  return { start: match[1]!, end: match[2]!, days };
}

function currentTripDateRange(input: CompleteItineraryInput): { start: string; end: string; days: number } | undefined {
  const context = input.tripContext;
  if (!context) return undefined;
  const start = new Date(`${context.startDate}T00:00:00Z`);
  const end = new Date(`${context.endDate}T00:00:00Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 30) throw new CompleteItineraryError("INVALID_INPUT", "The current itinerary date range is invalid or too long.");
  return { start: context.startDate, end: context.endDate, days };
}

function dateOffset(value: string, offset: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateRangeFromTickets(requirements: string, tickets: ItineraryTicketFacts[], days: number): { start: string; end: string; days: number } | undefined {
  if (days < 1) return undefined;
  const context = requirements.toLocaleLowerCase();
  const arrivalTicket = tickets.find((ticket) => ticket.arrivalLocation && context.includes(ticket.arrivalLocation.toLocaleLowerCase()) && (ticket.arrivalDate || ticket.date));
  if (arrivalTicket) {
    const start = arrivalTicket.arrivalDate || arrivalTicket.date!;
    return { start, end: dateOffset(start, days - 1), days };
  }
  const departureTicket = tickets.find((ticket) => ticket.departureLocation && context.includes(ticket.departureLocation.toLocaleLowerCase()) && ticket.date);
  if (departureTicket) {
    const end = departureTicket.date!;
    return { start: dateOffset(end, 1 - days), end, days };
  }
  return undefined;
}

function dateRangeFromSavedServices(services: CompleteItinerarySavedService[], days: number): { start: string; end: string; days: number } | undefined {
  const datedServices = services.filter((service) => service.date);
  if (!datedServices.length) return undefined;
  const possibleStarts = new Set(datedServices.map((service) => dateOffset(service.date, 1 - service.day_number)));
  if (possibleStarts.size !== 1) {
    throw new CompleteItineraryError("VALIDATION_FAILURE", "Saved itinerary service dates do not align with their itinerary days.");
  }
  const start = [...possibleStarts][0]!;
  return { start, end: dateOffset(start, days - 1), days };
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length > 1_000)) throw new CompleteItineraryError("INVALID_RESPONSE", `The generated plan has invalid ${label}.`);
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function assertSafeText(text: string): void {
  if (FINANCIAL_OR_INTERNAL.test(text) || FALSE_BOOKING.test(text) || INTERNAL_CUSTOMER_COPY.test(text)) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated plan included pricing, internal terminology, or an unconfirmed booking claim and was blocked.");
}

function assertSafePlanCopy(plan: CompleteItineraryPlan): void {
  const summary = plan.trip_summary;
  const dayCopy = plan.days.flatMap((day) => [
    day.city, day.overnight_city ?? "", day.title, ...day.morning, ...day.afternoon, ...day.evening, ...day.transfers,
    day.hotel_requirement ?? "", ...day.meals, ...day.free_time, ...day.notes,
    ...(day.saved_services ?? []).flatMap((service) => [service.title, ...service.details]),
  ]);
  assertSafeText([
    summary.destination, summary.travel_style, summary.route, ...summary.assumptions,
    ...dayCopy, ...plan.hotel_requirements, ...plan.transfer_requirements, ...plan.unresolved_questions,
  ].join("\n"));
}

function timeKey(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
  if (!match) return value.trim().toUpperCase();
  let hour = Number(match[1]);
  if (match[3]) {
    hour %= 12;
    if (match[3]!.toUpperCase() === "PM") hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function validateNoInventedTimes(plan: CompleteItineraryPlan, input: CompleteItineraryInput): void {
  const allowedTimes = new Set<string>();
  for (const match of input.requirements.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM))?\b/gi)) allowedTimes.add(timeKey(match[0]));
  for (const service of input.savedServices ?? []) {
    for (const detail of service.details) {
      for (const match of detail.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM))?\b/gi)) allowedTimes.add(timeKey(match[0]));
    }
  }
  for (const ticket of input.tickets) {
    if (ticket.departureTime) allowedTimes.add(timeKey(ticket.departureTime));
    if (ticket.arrivalTime) allowedTimes.add(timeKey(ticket.arrivalTime));
  }
  const outputText = plan.days.flatMap((day) => [...day.morning, ...day.afternoon, ...day.evening, ...day.transfers, ...day.meals, ...day.free_time, ...day.notes, day.hotel_requirement ?? ""]).join("\n");
  for (const match of outputText.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM))?\b/gi)) {
    if (!allowedTimes.has(timeKey(match[0]))) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated schedule invented an exact time not present in the requirements, saved services, or confirmed tickets.");
  }
}

function sanitizePreferenceBoundaries(plan: CompleteItineraryPlan, input: CompleteItineraryInput): void {
  const request = input.requirements.toLocaleLowerCase();
  const restrictedThemes: Array<[RegExp, RegExp]> = [
    [/\b(?:shopping|shops?|bazaar|marketplace)\b/i, /\b(?:shopping|shop|bazaar|market)\b/i],
    [/\b(?:local\s+markets?|street\s+markets?|marketplace)\b/i, /\b(?:shopping|shop|bazaar|market)\b/i],
    [/\b(?:restaurant|cafe|café|dining|food|culinary|local\s+cuisine|street\s+food)\b/i, /\b(?:food|cuisine|culinary|restaurant|dining|eat|gastronom)\b/i],
    [/\b(?:nightlife|nightclubs?|night clubs?|pub crawl|bar hopping)\b/i, /\b(?:nightlife|nightclubs?|night clubs?|pub|bar)\b/i],
    [/\b(?:zoo|wildlife|safari|animal park)\b/i, /\b(?:wildlife|zoo|animal|nature)\b/i],
    [/\b(?:beach|snorkel|scuba|water sports?)\b/i, /\b(?:beach|snorkel|scuba|water sports?)\b/i],
    [/\b(?:adventure|trek(?:king)?|rafting|paragliding|zip[- ]?line)\b/i, /\b(?:adventure|trek|rafting|paragliding|zip[- ]?line)\b/i],
    [/\b(?:spa|wellness retreat)\b/i, /\b(?:spa|wellness|relaxation)\b/i],
  ];
  for (const [generatedPattern, requestPattern] of restrictedThemes) {
    if (requestPattern.test(request)) continue;
    for (const day of plan.days) {
      day.morning = day.morning.filter((entry) => !generatedPattern.test(entry));
      day.afternoon = day.afternoon.filter((entry) => !generatedPattern.test(entry));
      day.evening = day.evening.filter((entry) => !generatedPattern.test(entry));
      day.meals = day.meals.filter((entry) => !generatedPattern.test(entry));
      day.free_time = day.free_time.filter((entry) => !generatedPattern.test(entry));
      day.notes = day.notes.filter((entry) => !generatedPattern.test(entry));
    }
  }
  for (const day of plan.days) {
    day.morning = day.morning.filter((entry) => !/\bif available\b|\bsubject to availability\b/i.test(entry));
    day.afternoon = day.afternoon.filter((entry) => !/\bif available\b|\bsubject to availability\b/i.test(entry));
    day.evening = day.evening.filter((entry) => !/\bif available\b|\bsubject to availability\b/i.test(entry));
    day.meals = day.meals.filter((entry) => !/\bif available\b|\bsubject to availability\b/i.test(entry));
    day.free_time = day.free_time.filter((entry) => !/\bif available\b|\bsubject to availability\b/i.test(entry));
    day.notes = day.notes.filter((entry) => !/\bif available\b|\bsubject to availability\b/i.test(entry));
  }
  plan.hotel_requirements = plan.hotel_requirements.filter((entry) => !/\bif available\b|\bsubject to availability\b/i.test(entry));
  plan.transfer_requirements = plan.transfer_requirements.filter((entry) => !/\bif available\b|\bsubject to availability\b/i.test(entry));
}

function validatePlan(raw: unknown, input: CompleteItineraryInput): CompleteItineraryPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CompleteItineraryError("INVALID_RESPONSE", "OpenAI returned an invalid complete itinerary.");
  const plan = raw as Record<string, unknown>;
  if (Object.keys(plan).sort().join(",") !== "days,hotel_requirements,transfer_requirements,trip_summary,unresolved_questions") throw new CompleteItineraryError("INVALID_RESPONSE", "OpenAI returned an invalid complete itinerary.");
  const summary = plan["trip_summary"] as Record<string, unknown>;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) throw new CompleteItineraryError("INVALID_RESPONSE", "OpenAI returned an invalid trip summary.");
  const required = ["destination", "days", "nights", "start_date", "end_date", "adults", "children", "infants", "child_ages", "arrival_city", "departure_city", "arrival_mode", "departure_mode", "travel_style", "route", "assumptions"];
  if (Object.keys(summary).sort().join(",") !== [...required].sort().join(",")) throw new CompleteItineraryError("INVALID_RESPONSE", "OpenAI returned an invalid trip summary.");
  const destination = typeof summary["destination"] === "string" ? summary["destination"].trim() : "";
  const tripDays = summary["days"];
  const nights = summary["nights"];
  if (!destination || !Number.isInteger(tripDays) || (tripDays as number) < 1 || !Number.isInteger(nights) || (nights as number) < 0) throw new CompleteItineraryError("INVALID_RESPONSE", "OpenAI returned an invalid trip duration or destination.");
  const duration = durationFromPrompt(input.requirements);
  const dateRange = explicitDateRange(input.requirements);
  const currentDates = currentTripDateRange(input);
  const dateRangeForDuration = dateRange ?? currentDates;
  const expectedDays = dateRangeForDuration?.days ?? duration.days;
  const expectedNights = duration.nights ?? (dateRangeForDuration ? Math.max(0, dateRangeForDuration.days - 1) : undefined);
  if (expectedDays !== undefined && tripDays !== expectedDays) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated number of days did not match the requested trip duration.");
  if (expectedNights !== undefined && nights !== expectedNights) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated number of nights did not match the requested trip duration.");
  const authoritativeDateRange = dateRange ?? currentDates
    ?? dateRangeFromTickets(input.requirements, input.tickets, tripDays as number)
    ?? dateRangeFromSavedServices(input.savedServices ?? [], tripDays as number);
  if (authoritativeDateRange && (summary["start_date"] !== authoritativeDateRange.start || summary["end_date"] !== authoritativeDateRange.end)) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated trip summary changed the supplied or ticket-derived travel dates.");
  if (!authoritativeDateRange && (summary["start_date"] !== null || summary["end_date"] !== null)) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated trip summary invented travel dates that were not supplied.");
  if (!Array.isArray(plan["days"]) || plan["days"].length !== tripDays) throw new CompleteItineraryError("VALIDATION_FAILURE", `The generated plan returned ${Array.isArray(plan["days"]) ? plan["days"].length : 0} day entries; exactly ${tripDays} are required.`);
  const assumptions = stringArray(summary["assumptions"], "assumptions");
  const confirmedTicketDates = new Set(input.tickets.flatMap((ticket) => [ticket.date, ticket.arrivalDate].filter((date): date is string => Boolean(date))));
  const days: CompleteItineraryDay[] = (plan["days"] as unknown[]).map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new CompleteItineraryError("INVALID_RESPONSE", "The generated plan contains an invalid day.");
    const day = entry as Record<string, unknown>;
    const keys = ["day_number", "date", "city", "overnight_city", "title", "morning", "afternoon", "evening", "transfers", "hotel_requirement", "meals", "free_time", "notes"];
    if (Object.keys(day).sort().join(",") !== [...keys].sort().join(",") || day["day_number"] !== index + 1 || typeof day["city"] !== "string" || typeof day["title"] !== "string") throw new CompleteItineraryError("INVALID_RESPONSE", "The generated plan contains an invalid or out-of-order day.");
    if (day["overnight_city"] !== null && typeof day["overnight_city"] !== "string") throw new CompleteItineraryError("INVALID_RESPONSE", "The generated plan contains an invalid overnight city.");
    const date = day["date"];
    if (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new CompleteItineraryError("INVALID_RESPONSE", "The generated plan contains an invalid date.");
    if (authoritativeDateRange) {
      const expected = dateOffset(authoritativeDateRange.start, index);
      if (date !== expected) throw new CompleteItineraryError("VALIDATION_FAILURE", `Day ${index + 1} must use ${expected}, but the generated day date did not match.`);
    } else if (date !== null && !confirmedTicketDates.has(date) && !(input.savedServices ?? []).some((service) => service.date === date)) {
      throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated plan invented travel dates that were not supplied.");
    }
    const hotelRequirement = day["hotel_requirement"];
    if (hotelRequirement !== null && typeof hotelRequirement !== "string") throw new CompleteItineraryError("INVALID_RESPONSE", "The generated plan contains an invalid hotel requirement.");
    const normalized: CompleteItineraryDay = {
      day_number: index + 1, date: date as string | null, city: (day["city"] as string).trim(),
      overnight_city: (day["overnight_city"] as string | null)?.trim() || null, title: (day["title"] as string).trim(),
      morning: stringArray(day["morning"], "morning plan"), afternoon: stringArray(day["afternoon"], "afternoon plan"), evening: stringArray(day["evening"], "evening plan"),
      transfers: stringArray(day["transfers"], "transfers"), hotel_requirement: (hotelRequirement as string | null)?.trim() || null,
      meals: stringArray(day["meals"], "meals"), free_time: stringArray(day["free_time"], "free time"), notes: stringArray(day["notes"], "notes"),
    };
    return normalized;
  });
  const requestedContext = `${input.requirements} ${destination}`.toLocaleLowerCase();
  const confirmedArrival = input.tickets.find((ticket) => ticket.arrivalLocation && requestedContext.includes(ticket.arrivalLocation.toLocaleLowerCase()));
  const confirmedDeparture = input.tickets.find((ticket) => ticket.departureLocation && requestedContext.includes(ticket.departureLocation.toLocaleLowerCase()));
  const planResult: CompleteItineraryPlan = {
    trip_summary: {
      destination, days: tripDays as number, nights: nights as number,
      start_date: authoritativeDateRange?.start ?? null,
      end_date: authoritativeDateRange?.end ?? null,
      adults: input.tripContext?.adults ?? (typeof summary["adults"] === "number" ? summary["adults"] : null),
      children: input.tripContext?.children ?? (typeof summary["children"] === "number" ? summary["children"] : null),
      infants: typeof summary["infants"] === "number" ? summary["infants"] : null,
      child_ages: typeof summary["child_ages"] === "string" ? summary["child_ages"].trim() || null : null,
      arrival_city: confirmedArrival?.arrivalLocation ?? (typeof summary["arrival_city"] === "string" ? summary["arrival_city"].trim() || null : null),
      departure_city: confirmedDeparture?.departureLocation ?? (typeof summary["departure_city"] === "string" ? summary["departure_city"].trim() || null : null),
      arrival_mode: confirmedArrival?.kind ?? (typeof summary["arrival_mode"] === "string" ? summary["arrival_mode"].trim() || null : null),
      departure_mode: confirmedDeparture?.kind ?? (typeof summary["departure_mode"] === "string" ? summary["departure_mode"].trim() || null : null),
      travel_style: typeof summary["travel_style"] === "string" ? summary["travel_style"].trim() : "Moderate",
      route: typeof summary["route"] === "string" ? summary["route"].trim() : destination,
      assumptions,
    },
    days: days.map((day) => ({
      ...day,
      saved_services: input.savedServices?.filter((service) => service.date
        ? service.date === day.date
        : service.day_number === day.day_number) ?? [],
    })),
    hotel_requirements: stringArray(plan["hotel_requirements"], "hotel requirements"),
    transfer_requirements: stringArray(plan["transfer_requirements"], "transfer requirements"),
    unresolved_questions: stringArray(plan["unresolved_questions"], "unresolved questions"),
  };
  if (input.includeHotelRecommendations) {
    for (let index = 0; index < (nights as number); index += 1) {
      const day = planResult.days[index];
      if (!day) throw new CompleteItineraryError("VALIDATION_FAILURE", "A hotel-enabled plan is missing a day for one or more trip nights.");
      const alreadySavedHotel = day.saved_services?.some((service) => service.item_type === "ACCOMMODATION") ?? false;
      if (!alreadySavedHotel && (!day.overnight_city || !day.hotel_requirement)) {
        throw new CompleteItineraryError("VALIDATION_FAILURE", `Day ${index + 1} must specify an overnight city and hotel requirement for the requested hotel-enabled plan.`);
      }
      if (day.hotel_requirement && !day.overnight_city) {
        throw new CompleteItineraryError("VALIDATION_FAILURE", `Day ${index + 1} has a hotel requirement but no overnight city.`);
      }
    }
    for (const day of planResult.days.slice(nights as number)) {
      if (day.hotel_requirement || day.overnight_city) {
        throw new CompleteItineraryError("VALIDATION_FAILURE", `Day ${day.day_number} is outside the requested overnight count and cannot have a hotel stay.`);
      }
    }
  }
  sanitizePreferenceBoundaries(planResult, input);
  assertSafePlanCopy(planResult);
  validateNoInventedTimes(planResult, input);
  validateTicketTimeConstraints(planResult, input.tickets, input.requirements);
  return planResult;
}

function validateTicketTimeConstraints(plan: CompleteItineraryPlan, tickets: ItineraryTicketFacts[], requirements: string): void {
  const daysByDate = new Map(plan.days.filter((day) => day.date).map((day) => [day.date!, day]));
  const tripText = `${requirements} ${plan.trip_summary.destination} ${plan.trip_summary.route}`.toLocaleLowerCase();
  for (const ticket of tickets) {
    if (ticket.kind !== "flight" && ticket.kind !== "train") continue;
    const arrivalMatchesTrip = Boolean(ticket.arrivalLocation && tripText.includes(ticket.arrivalLocation.toLocaleLowerCase()));
    const departureMatchesTrip = Boolean(ticket.departureLocation && tripText.includes(ticket.departureLocation.toLocaleLowerCase()));
    const isInbound = arrivalMatchesTrip && !departureMatchesTrip;
    const isOutbound = departureMatchesTrip && !arrivalMatchesTrip;
    const arrivalDate = ticket.arrivalDate ?? ticket.date;
    const departureDate = ticket.date;
    if (!isOutbound && arrivalDate && ticket.arrivalTime) {
      const arrival = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(ticket.arrivalTime);
      const day = daysByDate.get(arrivalDate);
      if (arrival && day) {
        const hour = Number(arrival[1]);
        if (hour >= 12 && day.morning.length) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated schedule includes a morning activity before a confirmed ticket arrival.");
        if (hour >= 17 && day.evening.length) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated schedule includes an evening activity after a late confirmed ticket arrival.");
      }
    }
    if (!isInbound && departureDate && ticket.departureTime) {
      const departure = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(ticket.departureTime);
      const day = daysByDate.get(departureDate);
      if (departure && day) {
        const hour = Number(departure[1]);
        if (hour < 12 && (day.afternoon.length || day.evening.length)) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated schedule includes activities after a confirmed morning ticket departure.");
        if (hour < 17 && day.evening.length) throw new CompleteItineraryError("VALIDATION_FAILURE", "The generated schedule includes an evening activity after a confirmed ticket departure.");
      }
    }
  }
}

export async function generateCompleteItinerary(
  raw: CompleteItineraryInput,
  options: { apiKey?: string; model?: string; client?: CompleteItineraryClient } = {},
): Promise<CompleteItineraryPlan> {
  const input = validateInput(raw);
  const apiKey = options.apiKey?.trim() ?? process.env["OPENAI_API_KEY"]?.trim();
  const model = options.model?.trim() ?? process.env["OPENAI_MODEL"]?.trim();
  if (!apiKey || !model) throw new CompleteItineraryError("NOT_CONFIGURED", "Complete itinerary planning is not configured on the server.");
  const client = options.client ?? new OpenAI({ apiKey, dangerouslyAllowBrowser: false }) as unknown as CompleteItineraryClient;
  const duration = durationFromPrompt(input.requirements);
  const dates = explicitDateRange(input.requirements);
  const userPayload = {
    requirements: input.requirements,
    refinement: input.refinement ?? null,
    confirmedTickets: input.tickets,
    savedServices: input.savedServices ?? [],
    hotelRecommendations: input.includeHotelRecommendations
      ? "Include suitable city/area hotel recommendations as requirements only; do not name unverified properties."
      : "Do not include hotel requirements, recommendations, or suggestions. Preserve only any hotel arrangements already present in savedServices.",
    tripContext: input.tripContext ?? null,
    derivedDuration: { days: dates?.days ?? currentTripDateRange(input)?.days ?? duration.days ?? null, nights: duration.nights ?? ((dates ?? currentTripDateRange(input)) ? (dates ?? currentTripDateRange(input))!.days - 1 : null) },
    explicitDateRange: dates ? { start: dates.start, end: dates.end }
      : currentTripDateRange(input) ? { start: currentTripDateRange(input)!.start, end: currentTripDateRange(input)!.end, source: "current itinerary dates" }
      : (() => { const ticketRange = dateRangeFromTickets(input.requirements, input.tickets, duration.days ?? 0); return ticketRange ? { start: ticketRange.start, end: ticketRange.end, source: "confirmed ticket date and trip duration" } : null; })(),
  };
  let repairNote: string | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await client.responses.create({
        model,
        max_output_tokens: 12_000,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ ...userPayload, ...(repairNote ? { validationRepair: repairNote } : {}) }) },
        ],
        text: { format: { type: "json_schema", name: "complete_itinerary_plan", strict: true, schema: PLAN_SCHEMA } },
      });
    } catch (error) {
      const providerError = error as { status?: unknown };
      if (providerError.status === 401 || providerError.status === 403) throw new CompleteItineraryError("PROVIDER_FAILURE", "OpenAI rejected the configured server credentials.");
      if (providerError.status === 429) throw new CompleteItineraryError("PROVIDER_FAILURE", "OpenAI is rate-limited or out of quota. Try again later.");
      console.error("[Complete itinerary planner] OpenAI request failed", { status: providerError.status });
      throw new CompleteItineraryError("PROVIDER_FAILURE", "OpenAI could not generate the plan. Check the server model configuration and try again.");
    }
    const output = response.output_text ?? response.output?.flatMap((entry) => entry.content ?? []).map((part) => part.text ?? "").join("") ?? "";
    if (!output.trim()) throw new CompleteItineraryError("INVALID_RESPONSE", "OpenAI returned an empty itinerary plan.");
    let parsed: unknown;
    try { parsed = JSON.parse(output); } catch { throw new CompleteItineraryError("INVALID_RESPONSE", "OpenAI returned an invalid itinerary plan."); }
    try {
      const normalized = validatePlan(parsed, input);
      if (!input.includeHotelRecommendations) {
        normalized.hotel_requirements = [];
        normalized.days = normalized.days.map((day) => ({ ...day, overnight_city: null, hotel_requirement: null }));
      }
      return normalized;
    } catch (error) {
      if (attempt === 0 && error instanceof CompleteItineraryError && error.code === "VALIDATION_FAILURE") {
        repairNote = `The previous draft failed validation: ${error.message} Return a corrected complete plan that follows every original requirement, preserves confirmed ticket constraints, and passes this validation.`;
        continue;
      }
      throw error;
    }
  }
  throw new CompleteItineraryError("VALIDATION_FAILURE", "The itinerary could not be repaired to satisfy the supplied duration and confirmed travel constraints.");
}
