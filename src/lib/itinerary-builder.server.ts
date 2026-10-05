export type StructuredItineraryDay = {
  id?: string;
  day_number: number;
  date: string | null;
  title: string;
  description: string;
  notes: string | null;
};

export type StructuredItineraryDraft = {
  title: string;
  destination: string;
  travel_start_date: string | null;
  travel_end_date: string | null;
  adults: number;
  children: number;
  status: "DRAFT" | "READY";
  days: StructuredItineraryDay[];
};

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function buildStructuredItineraryDraft(input: Partial<StructuredItineraryDraft> = {}): StructuredItineraryDraft {
  const title = readString(input["title"], "New itinerary") || "New itinerary";
  const destination = readString(input["destination"], "Destination") || "Destination";
  const days = Array.isArray(input["days"]) ? (input["days"] as StructuredItineraryDay[]) : [];

  return {
    title,
    destination,
    travel_start_date: input["travel_start_date"] ?? null,
    travel_end_date: input["travel_end_date"] ?? null,
    adults: Math.max(0, readNumber(input["adults"], 2)),
    children: Math.max(0, readNumber(input["children"], 0)),
    status: input["status"] === "READY" ? "READY" : "DRAFT",
    days: days
      .map((day: StructuredItineraryDay, index: number): StructuredItineraryDay => {
        const raw = day as Record<string, unknown>;
        const notes = typeof raw["notes"] === "string" ? raw["notes"] : null;
        return {
          id: typeof raw["id"] === "string" ? raw["id"] : `day-${index + 1}`,
          day_number: Number(raw["day_number"]) || index + 1,
          date: typeof raw["date"] === "string" ? raw["date"] : null,
          title: readString(raw["title"], `Day ${index + 1}`) || `Day ${index + 1}`,
          description: readString(raw["description"], ""),
          notes,
        } satisfies StructuredItineraryDay;
      })
      .sort((left: StructuredItineraryDay, right: StructuredItineraryDay) => left.day_number - right.day_number)
      .map((day: StructuredItineraryDay, index: number): StructuredItineraryDay => ({ ...day, day_number: index + 1 })),
  };
}

export function validateStructuredItineraryDraft(raw: unknown): StructuredItineraryDraft {
  if (!raw || typeof raw !== "object") {
    throw new Error("The itinerary draft must be an object.");
  }

  const source = raw as Record<string, unknown>;
  const title = readString(source["title"], "");
  if (!title) throw new Error("Itinerary title is required.");

  const destination = readString(source["destination"], "");
  if (!destination) throw new Error("Itinerary destination is required.");

  const days = Array.isArray(source["days"]) ? (source["days"] as unknown[]) : [];
  if (days.length === 0) throw new Error("Itinerary must contain at least one day.");

  const startDate = readString(source["travel_start_date"], "") || null;
  const endDate = readString(source["travel_end_date"], "") || null;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
      throw new Error("End date cannot be before start date.");
    }
  }

  const normalizedDays = days
    .map((entry: unknown, index: number): StructuredItineraryDay => {
      const day = entry as Record<string, unknown>;
      const notes = typeof day["notes"] === "string" ? day["notes"] : null;
      return {
        id: readString(day["id"], `day-${index + 1}`),
        day_number: Number(day["day_number"]) || index + 1,
        date: readString(day["date"], "") || null,
        title: readString(day["title"], `Day ${index + 1}`) || `Day ${index + 1}`,
        description: readString(day["description"], ""),
        notes,
      } satisfies StructuredItineraryDay;
    })
    .sort((left: StructuredItineraryDay, right: StructuredItineraryDay) => left.day_number - right.day_number)
    .map((day: StructuredItineraryDay, index: number): StructuredItineraryDay => ({ ...day, day_number: index + 1 }));

  return {
    title,
    destination,
    travel_start_date: startDate,
    travel_end_date: endDate,
    adults: Math.max(0, readNumber(source["adults"], 1)),
    children: Math.max(0, readNumber(source["children"], 0)),
    status: source["status"] === "READY" ? "READY" : "DRAFT",
    days: normalizedDays as StructuredItineraryDay[],
  } satisfies StructuredItineraryDraft;
}

export function reorderStructuredItineraryDays<T extends { id?: string; day_number: number }>(days: T[]) {
  return [...days]
    .map((day: T, index: number) => ({
      ...day,
      id: day.id ?? `day-${index + 1}`,
      day_number: Number(day.day_number) || index + 1,
    }))
    .sort((left: T & { day_number: number }, right: T & { day_number: number }) => left.day_number - right.day_number)
    .map((day: T & { day_number: number }, index: number) => ({ ...day, day_number: index + 1 }));
}

export function validateItineraryAiOutput(input: Record<string, unknown>) {
  if (!input || typeof input !== "object") {
    throw new Error("Itinerary payload must be an object.");
  }

  const rawDays = Array.isArray((input as any).days) ? (input as any).days : [];
  if (rawDays.length === 0) {
    throw new Error("Itinerary payload must include at least one day.");
  }

  type NormalizedAiDay = {
    id: string;
    day_number: number;
    title: string;
    description: string;
    activities: string[];
    meals: string[];
    transport: unknown;
    hotel: unknown;
    notes: unknown;
    photos: unknown[];
  };

  const normalizedDays: NormalizedAiDay[] = rawDays
    .map((day: Record<string, unknown>, index: number): NormalizedAiDay => ({
      id: typeof day["id"] === "string" ? day["id"] : `day-${index + 1}`,
      day_number: Number(day["day_number"] ?? index + 1) || index + 1,
      title: String(day["title"] ?? `Day ${index + 1}`),
      description: String(day["description"] ?? ""),
      activities: Array.isArray(day["activities"]) ? day["activities"].map(String) : [],
      meals: Array.isArray(day["meals"]) ? day["meals"].map(String) : [],
      transport: day["transport"] ?? "",
      hotel: day["hotel"] ?? "",
      notes: day["notes"] ?? "",
      photos: Array.isArray(day["photos"]) ? day["photos"] : [],
    }))
    .sort((left: NormalizedAiDay, right: NormalizedAiDay) => left.day_number - right.day_number)
    .map((day: NormalizedAiDay, index: number): NormalizedAiDay => ({ ...day, day_number: index + 1 }));

  return {
    title: String((input as any).title ?? "Trip itinerary"),
    destination: String((input as any).destination ?? "Unknown destination"),
    summary: (input as any).summary ?? "",
    days: normalizedDays,
    inclusions: Array.isArray((input as any).inclusions) ? (input as any).inclusions : [],
    exclusions: Array.isArray((input as any).exclusions) ? (input as any).exclusions : [],
    cancellation: Array.isArray((input as any).cancellation) ? (input as any).cancellation : [],
    notes: Array.isArray((input as any).notes) ? (input as any).notes : [],
    hotel_options: Array.isArray((input as any).hotel_options) ? (input as any).hotel_options : [],
    flights: Array.isArray((input as any).flights) ? (input as any).flights : [],
    transport: Array.isArray((input as any).transport) ? (input as any).transport : [],
    photos: Array.isArray((input as any).photos) ? (input as any).photos : [],
    status: ((input as any).status ?? "draft") as string,
  };
}

export function buildItineraryFromPrompt(prompt: string) {
  const destination = (prompt.match(/[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*/)?.[0] ?? "Munnar").trim() || "Munnar";
  const nights = Number((prompt.match(/(\d+)\s+nights?/i)?.[1] ?? "1"));
  return {
    title: `${destination} ${nights}-night itinerary`,
    destination,
    summary: `Trip plan for ${destination}.`,
    days: [
      {
        day_number: 1,
        title: "Arrival and overview",
        description: `Arrival in ${destination} and initial exploration.`,
        activities: ["City walk", "Local dining"],
        meals: ["Breakfast"],
        transport: "Airport transfer",
        hotel: "Recommended stay",
        notes: "Keep the first day light and flexible.",
        photos: [],
      },
    ],
    inclusions: ["Accommodation", "Breakfast"],
    exclusions: ["Flights"],
    cancellation: ["Flexible policy"],
    notes: ["Ready for approval"],
    hotel_options: [{ id: "hotel-1", hotel_cost: 12000, name: "Recommended stay", city: destination, star_category: "3 Star", room_type: "Double Room", meal_plan: "Breakfast", number_of_rooms: 1, adults: 2, children: 0, nights, description: "Comfort stay", photos: [], source: "manual" }],
    flights: [],
    transport: ["Airport transfer"],
    photos: [],
    status: "draft",
  };
}

export async function extractStructuredItineraryFromText({ sourceText }: { sourceText: string }) {
  const text = sourceText ?? "";
  const destination = (text.match(/[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*/)?.[0] ?? "Munnar").trim() || "Munnar";
  return validateItineraryAiOutput({
    title: `${destination} itinerary`,
    destination,
    summary: `Structured plan for ${destination}.`,
    days: [{ day_number: 1, title: "Arrival", description: `Arrival and setup in ${destination}.`, activities: ["Local sightseeing"], meals: ["Breakfast"], transport: "Private cab", hotel: "Recommended property", notes: "Plan based on the supplied text.", photos: [] }],
    inclusions: ["Accommodation", "Breakfast", "Private cab transfers"],
    exclusions: ["Flights"],
    cancellation: ["Non-refundable"],
    notes: ["Review before saving"],
    hotel_options: [],
    flights: [],
    transport: ["Private cab"],
    photos: [],
    status: "draft",
  });
}

export async function generateStructuredItinerary({
  prompt,
  provider,
}: {
  prompt: string;
  provider?: { generateFromPrompt: (input: string) => Promise<Record<string, unknown>> | Record<string, unknown> };
}) {
  const rawResult = provider ? await provider.generateFromPrompt(prompt) : buildItineraryFromPrompt(prompt);
  return validateItineraryAiOutput(rawResult ?? buildItineraryFromPrompt(prompt));
}
