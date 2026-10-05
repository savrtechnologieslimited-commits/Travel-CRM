export const TRAVEL_REQUIREMENT_FIELDS = [
  "destination_text",
  "travel_start_date",
  "travel_end_date",
  "travel_month",
  "adults",
  "children",
  "departure_city",
  "approximate_budget",
  "hotel_preference",
  "special_requirements",
  "trip_type",
] as const;

export type TravelRequirementField = (typeof TRAVEL_REQUIREMENT_FIELDS)[number];
export type ExtractionStatus = "CONFIRMED" | "INFERRED" | "UNKNOWN";

export type ExtractedTravelRequirements = {
  destination_text: string | null;
  travel_start_date: string | null;
  travel_end_date: string | null;
  travel_month: string | null;
  adults: number | null;
  children: number | null;
  departure_city: string | null;
  approximate_budget: number | null;
  hotel_preference: string | null;
  special_requirements: string | null;
  trip_type: string | null;
};

export type ExtractionFieldMetadata = {
  status: ExtractionStatus;
  confidence: number;
  explicit: boolean;
  source_message_ids: string[];
};

export type DestinationResolution = {
  status: "resolved" | "ambiguous" | "unresolved" | "unknown";
  destination_id: string | null;
  candidate_ids: string[];
};

export type TravelExtraction = {
  requirements: ExtractedTravelRequirements;
  field_metadata: Partial<Record<TravelRequirementField, ExtractionFieldMetadata>>;
  destination_resolution: DestinationResolution;
  missing_information: string[];
};

export type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  message_timestamp?: string;
};

const MONTHS: Record<string, string> = {
  january: "January",
  february: "February",
  march: "March",
  april: "April",
  may: "May",
  june: "June",
  july: "July",
  august: "August",
  september: "September",
  october: "October",
  november: "November",
  december: "December",
};

const MONTH_ALIASES: Record<string, string> = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  sept: "September",
  oct: "October",
  nov: "November",
  dec: "December",
};

const MISSING_LABELS: Record<TravelRequirementField, string> = {
  destination_text: "destination",
  travel_start_date: "travel_start_date",
  travel_end_date: "travel_end_date",
  travel_month: "travel_month",
  adults: "adults",
  children: "children",
  departure_city: "departure_city",
  approximate_budget: "approximate_budget",
  hotel_preference: "hotel_preference",
  special_requirements: "special_requirements",
  trip_type: "trip_type",
};

const EMPTY_REQUIREMENTS: ExtractedTravelRequirements = {
  destination_text: null,
  travel_start_date: null,
  travel_end_date: null,
  travel_month: null,
  adults: null,
  children: null,
  departure_city: null,
  approximate_budget: null,
  hotel_preference: null,
  special_requirements: null,
  trip_type: null,
};

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanCapturedValue(value: string): string {
  let cleaned = value.trim();
  const prefixes = [
    "want to",
    "need to",
    "looking for",
    "interested in",
    "go to",
    "going to",
    "travel to",
    "travelling to",
    "traveling to",
    "visit to",
    "visiting to",
    "to",
    "from",
    "for",
    "a",
    "the",
    "go",
    "going",
    "travel",
    "travelling",
    "traveling",
    "visit",
    "visiting",
  ];

  for (const prefix of prefixes) {
    cleaned = cleaned.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  }

  cleaned = cleaned.replace(/^(?:to|from|for|a|the)\s+/i, "");
  cleaned = cleaned.replace(/[.,!?;]+$/g, "");
  cleaned = cleaned.replace(
    /\s+(?:to|from|with|on|in|during|for|and|around|budget|cost|hotel|people|ppl|adults?|children?|kids?|travellers?|travelers?|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*$/i,
    "",
  );
  return cleaned.trim();
}

function metadata(
  status: ExtractionStatus,
  sourceMessageId: string,
  explicit: boolean,
  confidence = status === "CONFIRMED" ? 0.95 : 0.65,
): ExtractionFieldMetadata {
  return {
    status,
    confidence,
    explicit,
    source_message_ids: [sourceMessageId],
  };
}

function parsePeople(text: string, sourceMessageId: string) {
  const lower = text.toLowerCase();
  const result: Partial<ExtractedTravelRequirements> = {};
  const fieldMetadata: Partial<Record<TravelRequirementField, ExtractionFieldMetadata>> = {};

  const family = lower.match(
    /(?:me|myself)[, ]+(?:my )?(?:wife|husband|spouse)[, ]+(?:and )?(\w+) kids?/,
  );
  if (family) {
    const children = wordNumber(family[1]);
    if (children !== null) {
      result.adults = 2;
      result.children = children;
      fieldMetadata.adults = metadata("CONFIRMED", sourceMessageId, true);
      fieldMetadata.children = metadata("CONFIRMED", sourceMessageId, true);
      return { result, fieldMetadata };
    }
  }

  const explicitAdults = lower.match(/(\d+)\s*(?:adults?|ppl|people|persons|travellers?|travelers?)/);
  const explicitChildren = lower.match(/(\d+)\s*(?:children|kids)|(?:(\w+)\s+)?kids?/);
  if (explicitAdults) {
    result.adults = Number(explicitAdults[1]);
    fieldMetadata.adults = metadata("CONFIRMED", sourceMessageId, true);
  }
  if (explicitChildren) {
    const childValue = explicitChildren[1] ?? explicitChildren[2];
    const children = childValue ? (wordNumber(childValue) ?? Number(childValue)) : null;
    if (children !== null && Number.isInteger(children)) {
      result.children = children;
      fieldMetadata.children = metadata("CONFIRMED", sourceMessageId, true);
    }
  }

  const people = lower.match(
    /(?:for|party of|group of)\s+(\d+)\s+(?:people|persons|pax|travellers?|travelers?)/,
  );
  if (people) {
    result.adults = Number(people[1]);
    fieldMetadata.adults = metadata("CONFIRMED", sourceMessageId, true);
  }

  if (/\bme\s+and\s+(?:the\s+)?kids?\b/.test(lower)) {
    result.adults = 1;
    fieldMetadata.adults = metadata("CONFIRMED", sourceMessageId, true);
  }

  return { result, fieldMetadata };
}

function wordNumber(value: string | undefined): number | null {
  if (!value) return null;
  const numbers: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  return numbers[value] ?? null;
}

function parseMessage(message: ConversationMessage): {
  values: Partial<ExtractedTravelRequirements>;
  metadata: Partial<Record<TravelRequirementField, ExtractionFieldMetadata>>;
  destinationCorrection: boolean;
} {
  const text = message.body?.trim() ?? "";
  const lower = text.toLowerCase();
  const values: Partial<ExtractedTravelRequirements> = {};
  const fieldMetadata: Partial<Record<TravelRequirementField, ExtractionFieldMetadata>> = {};
  let destinationCorrection = false;

  const destinationPatterns = [
    /(?:want|need)\s+(?:to\s+)?([A-Za-z][A-Za-z .'-]{1,50}?)(?=\s+(?:in|during|for|from|with|on|around|maybe|,|and|budget|cost|hotel|people|ppl|adults|children|kids|travellers?|travelers?|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|[.?!;])|$)/i,
    /(?:looking\s+for|interested\s+in)\s+([A-Za-z][A-Za-z .'-]{1,50}?)(?=\s+(?:in|during|for|from|with|on|around|maybe|,|and|budget|cost|hotel|people|ppl|adults|children|kids|travellers?|travelers?|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|[.?!;])|$)/i,
    /(?:go(?:ing)?|travel(?:ing)?|visit(?:ing)?|holiday|trip)\s+(?:to\s+)?([A-Za-z][A-Za-z .'-]{1,50}?)(?=\s+(?:in|during|for|from|with|on|around|maybe|,|and|budget|cost|hotel|people|ppl|adults|children|kids|travellers?|travelers?|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|[.?!;])|$)/i,
    /(?:a|for)\s+([A-Za-z][A-Za-z .'-]{1,50}?)(?=\s+(?:trip|holiday|vacation|travel)\b)/i,
  ];
  const destinationMatch = destinationPatterns.find((pattern) => pattern.test(text));
  const destinationValueFromMatch = destinationMatch ? destinationMatch.exec(text)?.[1] : null;
  const correction =
    /(?:actually|instead|forget|change|changed).{0,30}(?:to|thinking|choose|want)\s+([A-Za-z][A-Za-z .'-]{1,50})/i.exec(
      text,
    );
  const destinationValue = cleanCapturedValue(
    (correction?.[1] ?? destinationValueFromMatch ?? "").trim(),
  );
  if (destinationValue) {
    values.destination_text = destinationValue;
    fieldMetadata.destination_text = metadata("CONFIRMED", message.id, true);
    destinationCorrection = Boolean(correction || destinationMatch);
  }

  const month =
    Object.keys(MONTHS).find((name) => new RegExp(`\\b${name}\\b`, "i").test(text)) ??
    Object.keys(MONTH_ALIASES).find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  if (month) {
    const monthName = MONTHS[month] ?? MONTH_ALIASES[month];
    if (monthName) values.travel_month = monthName;
    const uncertain = /\bmaybe\b|\bnot sure\b|\bperhaps\b|\bprobably\b/i.test(lower);
    fieldMetadata.travel_month = metadata(
      uncertain ? "INFERRED" : "CONFIRMED",
      message.id,
      !uncertain,
      uncertain ? 0.55 : 0.95,
    );
  }

  const dates = text.match(/\b(\d{4}-\d{2}-\d{2})\b/g) ?? [];
  const startDate = dates[0];
  const endDate = dates[1];
  if (startDate && isValidDate(startDate)) {
    values.travel_start_date = startDate;
    fieldMetadata.travel_start_date = metadata("CONFIRMED", message.id, true);
  }
  if (endDate && isValidDate(endDate)) {
    values.travel_end_date = endDate;
    fieldMetadata.travel_end_date = metadata("CONFIRMED", message.id, true);
  }

  const departure =
    text.match(
      /(?:leaving|departing|departure|flying|from)\s+(?:from\s+)?([A-Za-z][A-Za-z .'-]{1,40}?)(?=\s+(?:and|with|on|in|for|,|budget|cost|hotel|people|ppl|adults|children|kids|travellers?|travelers?|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|[.?!;])|$)/i,
    ) ??
    text.match(
      /\bfrom\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?=\s+(?:and|with|on|in|for|,|budget|cost|hotel|people|ppl|adults|children|kids|travellers?|travelers?|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|[.?!;])|$)/i,
    );
  const departureCity = cleanCapturedValue(departure?.[1] ?? "");
  if (departureCity) {
    values.departure_city = departureCity;
    fieldMetadata.departure_city = metadata("CONFIRMED", message.id, true);
  }

  const budget = text.match(
    /(?:budget|around|approximately|approx)\s*(?:of|is|around)?\s*(?:₹|rs\.?|inr\s*)?([\d,.]+)\s*(lakh|lakhs|lac|lacs|l|k)?/i,
  );
  const budgetAmount = budget?.[1];
  if (budgetAmount) {
    const amount = Number(budgetAmount.replace(/,/g, ""));
    const unit = budget[2]?.toLowerCase() ?? "";
    const multiplier = unit === "k" || unit === "l" ? (unit === "l" ? 100_000 : 1_000) : unit ? 100_000 : 1;
    values.approximate_budget = amount * multiplier;
    fieldMetadata.approximate_budget = metadata("CONFIRMED", message.id, true);
  }

  const hotel = text.match(
    /(?:prefer|want|looking|need|stay|hotel|accommodation)\s+(?:for\s+)?(?:a\s+|an\s+|the\s+)?([A-Za-z0-9][A-Za-z0-9 -]{0,80}(?:\s*star)?)(?=\s*(?:hotel\b|$))/i,
  );
  const hotelPreference = hotel?.[1]?.trim().replace(/^(?:a|an|the)\s+/i, "").replace(/\s+hotel\s*$/i, "");
  if (hotelPreference) {
    values.hotel_preference = hotelPreference.trim();
    fieldMetadata.hotel_preference = metadata("CONFIRMED", message.id, true);
  }

  const people = parsePeople(text, message.id);
  Object.assign(values, people.result);
  Object.assign(fieldMetadata, people.fieldMetadata);

  return { values, metadata: fieldMetadata, destinationCorrection };
}

function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

export function validateTravelExtraction(input: unknown): ExtractedTravelRequirements {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Extraction output must be an object");
  }
  const record = input as Record<string, unknown>;
  const unsupported = Object.keys(record).filter(
    (key) => !TRAVEL_REQUIREMENT_FIELDS.includes(key as TravelRequirementField),
  );
  if (unsupported.length)
    throw new Error(`Unsupported extraction fields: ${unsupported.join(", ")}`);

  const output = { ...EMPTY_REQUIREMENTS };
  for (const field of TRAVEL_REQUIREMENT_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null) continue;
    if (field === "adults" || field === "children") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer`);
    } else if (field === "approximate_budget") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error("approximate_budget must be numeric");
    } else if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${field} must be a non-empty string or null`);
    }
    output[field] = value as never;
  }
  if (typeof output.travel_start_date === "string" && !isValidDate(output.travel_start_date))
    throw new Error("travel_start_date must be a valid date");
  if (typeof output.travel_end_date === "string" && !isValidDate(output.travel_end_date))
    throw new Error("travel_end_date must be a valid date");
  if (
    output.travel_start_date &&
    output.travel_end_date &&
    output.travel_end_date < output.travel_start_date
  )
    throw new Error("travel_end_date cannot be before travel_start_date");
  return output;
}

export function extractTravelRequirements(messages: ConversationMessage[]): TravelExtraction {
  const inbound = messages
    .filter((message) => message.direction === "inbound" && message.body?.trim())
    .sort((a, b) => (a.message_timestamp ?? "").localeCompare(b.message_timestamp ?? ""));
  const requirements = { ...EMPTY_REQUIREMENTS };
  const fieldMetadata: Partial<Record<TravelRequirementField, ExtractionFieldMetadata>> = {};
  let destinationCorrection = false;

  for (const message of inbound) {
    const extracted = parseMessage(message);
    Object.assign(requirements, extracted.values);
    Object.assign(fieldMetadata, extracted.metadata);
    destinationCorrection ||= extracted.destinationCorrection;
  }

  const validated = validateTravelExtraction(requirements);
  const destinationStatus = validated.destination_text
    ? destinationCorrection
      ? "unresolved"
      : "unknown"
    : "unknown";
  const missingInformation = TRAVEL_REQUIREMENT_FIELDS.filter(
    (field) => validated[field] === null,
  ).map((field) => MISSING_LABELS[field]);

  return {
    requirements: validated,
    field_metadata: fieldMetadata,
    destination_resolution: {
      status: destinationStatus,
      destination_id: null,
      candidate_ids: [],
    },
    missing_information: missingInformation,
  };
}

export function resolveDestination(
  destinationText: string | null,
  destinations: Array<{ id: string; name: string }>,
): DestinationResolution {
  if (!destinationText) return { status: "unknown", destination_id: null, candidate_ids: [] };
  const target = normalise(destinationText);
  const matches = destinations.filter((destination) => {
    const name = normalise(destination.name);
    return name === target || name.includes(target) || target.includes(name);
  });
  const firstMatch = matches[0];
  if (firstMatch && matches.length === 1)
    return { status: "resolved", destination_id: firstMatch.id, candidate_ids: [firstMatch.id] };
  if (matches.length > 1)
    return {
      status: "ambiguous",
      destination_id: null,
      candidate_ids: matches.map((match) => match.id),
    };
  return { status: "unresolved", destination_id: null, candidate_ids: [] };
}
