import type { LiveFlightOffer, LiveFlightSearchInput } from "@/lib/travel-search-types";

function parsePrice(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function timeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function normalizeAmadeusFlightOffers(payload: unknown): LiveFlightOffer[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const dictionaries = root.dictionaries && typeof root.dictionaries === "object" ? root.dictionaries as Record<string, unknown> : {};
  const carriers = dictionaries.carriers && typeof dictionaries.carriers === "object" ? dictionaries.carriers as Record<string, string> : {};
  const offers = Array.isArray(root.data) ? root.data : [];
  return offers.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const offer = raw as Record<string, unknown>;
    const itineraries = Array.isArray(offer.itineraries) ? offer.itineraries : [];
    const outbound = itineraries[0] as Record<string, unknown> | undefined;
    const inbound = itineraries[1] as Record<string, unknown> | undefined;
    const segments = Array.isArray(outbound?.segments) ? outbound.segments : [];
    const inboundSegments = Array.isArray(inbound?.segments) ? inbound.segments : [];
    const first = segments[0] as Record<string, unknown> | undefined;
    const last = segments.at(-1) as Record<string, unknown> | undefined;
    const inboundFirst = inboundSegments[0] as Record<string, unknown> | undefined;
    const inboundLast = inboundSegments.at(-1) as Record<string, unknown> | undefined;
    const departure = first?.departure as Record<string, unknown> | undefined;
    const arrival = last?.arrival as Record<string, unknown> | undefined;
    const returnDeparture = inboundFirst?.departure as Record<string, unknown> | undefined;
    const returnArrival = inboundLast?.arrival as Record<string, unknown> | undefined;
    const priceRecord = offer.price as Record<string, unknown> | undefined;
    const price = parsePrice(priceRecord?.grandTotal ?? priceRecord?.total);
    if (!first || !last || !departure || !arrival || price === null) return [];
    const carrierCode = typeof first.carrierCode === "string" ? first.carrierCode : "";
    const number = typeof first.number === "string" ? first.number : "";
    const duration = typeof outbound?.duration === "string" ? outbound.duration.replace(/^PT/, "").toLowerCase() : "";
    return [{
      id: typeof offer.id === "string" ? offer.id : `amadeus-${index}`,
      airline: carriers[carrierCode] ?? carrierCode ?? "Flight",
      flight_number: `${carrierCode}${number}`,
      from: String(departure.iataCode ?? ""),
      to: String(arrival.iataCode ?? ""),
      departure_at: timeString(departure.at),
      arrival_at: timeString(arrival.at),
      ...(returnDeparture && returnArrival ? {
        return_from: String(returnDeparture.iataCode ?? ""),
        return_to: String(returnArrival.iataCode ?? ""),
        return_departure_at: timeString(returnDeparture.at),
        return_arrival_at: timeString(returnArrival.at),
        return_flight_number: `${String(inboundFirst?.carrierCode ?? "")}${String(inboundFirst?.number ?? "")}`,
      } : {}),
      duration,
      stops: Math.max(0, segments.length - 1),
      price,
      currency: typeof priceRecord?.currency === "string" ? priceRecord.currency : "EUR",
    }];
  });
}

export function normalizeDuffelFlightOffers(payload: unknown): LiveFlightOffer[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const offers = Array.isArray(root.data) ? root.data : [];
  return offers.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const offer = raw as Record<string, unknown>;
    const itinerary = offer.itinerary && typeof offer.itinerary === "object" ? offer.itinerary as Record<string, unknown> : {};
    const slices = Array.isArray(itinerary.slices) ? itinerary.slices : [];
    const outbound = slices[0] as Record<string, unknown> | undefined;
    const inbound = slices[1] as Record<string, unknown> | undefined;
    const outboundSegments = Array.isArray(outbound?.segments) ? outbound.segments as Array<Record<string, unknown>> : [];
    const inboundSegments = Array.isArray(inbound?.segments) ? inbound.segments as Array<Record<string, unknown>> : [];
    const first = outboundSegments[0];
    const last = outboundSegments.at(-1);
    const inboundFirst = inboundSegments[0];
    const inboundLast = inboundSegments.at(-1);
    const priceCandidate = typeof offer.total_amount === "number" || typeof offer.total_amount === "string" ? offer.total_amount : ((offer.offer && typeof offer.offer === "object") ? (offer.offer as Record<string, unknown>).total_amount : null);
    const currency = typeof offer.total_currency === "string" ? offer.total_currency : (typeof offer.currency === "string" ? offer.currency : "INR");
    const price = parsePrice(priceCandidate ?? ((offer.offer && typeof offer.offer === "object") ? (offer.offer as Record<string, unknown>).amount : null));
    if (!first || !last || !first.departure || !last.arrival || price === null) return [];

    const carrierName = (first.marketing_carrier && typeof first.marketing_carrier === "object" && "name" in first.marketing_carrier)
      ? String((first.marketing_carrier as Record<string, unknown>).name ?? "Flight")
      : "Flight";
    const flightNumber = typeof first.flight_number === "string" ? first.flight_number : "";
    const origin = first.origin && typeof first.origin === "object" ? first.origin as Record<string, unknown> : {};
    const destination = last.destination && typeof last.destination === "object" ? last.destination as Record<string, unknown> : {};
    const returnFrom = inboundFirst && inboundFirst.origin && typeof inboundFirst.origin === "object" ? inboundFirst.origin as Record<string, unknown> : {};
    const returnTo = inboundLast && inboundLast.destination && typeof inboundLast.destination === "object" ? inboundLast.destination as Record<string, unknown> : {};

    return [{
      id: typeof offer.id === "string" ? offer.id : `duffel-${index}`,
      airline: carrierName,
      flight_number: flightNumber,
      from: String(origin.airport_code ?? ""),
      to: String(destination.airport_code ?? ""),
      departure_at: String(first.departure ?? ""),
      arrival_at: String(last.arrival ?? ""),
      ...(inboundFirst && inboundLast ? {
        return_from: String(returnFrom.airport_code ?? ""),
        return_to: String(returnTo.airport_code ?? ""),
        return_departure_at: String(inboundFirst.departure ?? ""),
        return_arrival_at: String(inboundLast.arrival ?? ""),
        return_flight_number: typeof inboundFirst.flight_number === "string" ? inboundFirst.flight_number : "",
      } : {}),
      duration: "",
      stops: Math.max(0, outboundSegments.length - 1),
      price,
      currency,
    }];
  });
}

export async function searchDuffelFlightOffers(input: {
  from: string; to: string; departure: string; returnDate?: string; adults: number; children: number; infants: number; cabin: string;
}): Promise<LiveFlightOffer[]> {
  throw new Error("Live flight search has been disabled. Use external provider search links instead.");
}

export async function searchAmadeusFlightOffers(input: {
  from: string; to: string; departure: string; returnDate?: string; adults: number; children: number; infants: number; cabin: string;
}): Promise<LiveFlightOffer[]> {
  return searchDuffelFlightOffers(input);
}

type SearchApiFlightSegment = {
  departure_airport?: { id?: unknown; date?: unknown; time?: unknown };
  arrival_airport?: { id?: unknown; date?: unknown; time?: unknown };
  airline?: unknown;
  flight_number?: unknown;
  travel_class?: unknown;
};

function searchApiDateTime(value: SearchApiFlightSegment["departure_airport"]): string {
  if (typeof value?.date !== "string" || typeof value.time !== "string") return "";
  return `${value.date}T${value.time}`;
}

function normalizeSearchApiFlight(raw: unknown, id: string): LiveFlightOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const offer = raw as Record<string, unknown>;
  const segments = Array.isArray(offer["flights"]) ? offer["flights"] as SearchApiFlightSegment[] : [];
  const first = segments[0];
  const last = segments.at(-1);
  if (!first || !last) return null;
  const departure = first.departure_airport;
  const arrival = last.arrival_airport;
  const from = typeof departure?.id === "string" ? departure.id : "";
  const to = typeof arrival?.id === "string" ? arrival.id : "";
  const departureAt = searchApiDateTime(departure);
  const arrivalAt = searchApiDateTime(arrival);
  const price = parsePrice(offer["price"]);
  if (!from || !to || !departureAt || !arrivalAt || price === null) return null;

  const durationMinutes = typeof offer["total_duration"] === "number" && Number.isFinite(offer["total_duration"])
    ? offer["total_duration"]
    : null;
  const duration = durationMinutes === null
    ? ""
    : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ""}`;
  const stops = Array.isArray(offer["layovers"]) ? offer["layovers"].length : Math.max(0, segments.length - 1);

  return {
    id,
    airline: typeof first.airline === "string" ? first.airline : "Airline not listed",
    flight_number: typeof first.flight_number === "string" ? first.flight_number : "",
    from,
    to,
    departure_at: departureAt,
    arrival_at: arrivalAt,
    duration,
    stops,
    price,
    currency: typeof offer["currency"] === "string" ? offer["currency"] : "",
    ...(typeof first.travel_class === "string" ? { cabin: first.travel_class } : {}),
  };
}

export function normalizeSearchApiFlightOffers(payload: unknown, currency = ""): LiveFlightOffer[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const offers = [
    ...(Array.isArray(root["best_flights"]) ? root["best_flights"] : []),
    ...(Array.isArray(root["other_flights"]) ? root["other_flights"] : []),
  ];
  return offers.map((offer, index) => {
    const normalized = normalizeSearchApiFlight(offer, `searchapi-${index}`);
    return normalized && !normalized.currency ? { ...normalized, currency } : normalized;
  }).filter((offer): offer is LiveFlightOffer => offer !== null).slice(0, 30);
}

function validateSearchApiFlightInput(input: LiveFlightSearchInput) {
  if (!input || typeof input !== "object") throw new Error("Flight search details are required.");
  if (!/^[A-Z]{3}$/.test(input.from) || !/^[A-Z]{3}$/.test(input.to)) {
    throw new Error("Enter valid three-letter IATA airport codes for origin and destination.");
  }
  if (input.from === input.to) throw new Error("Origin and destination must be different airports.");
  const departureDate = new Date(`${input.departure}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.departure)
    || Number.isNaN(departureDate.getTime())
    || departureDate.toISOString().slice(0, 10) !== input.departure) {
    throw new Error("Departure date must be a valid date.");
  }
  if (![input.adults, input.children, input.infants].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error("Passenger counts must be non-negative whole numbers.");
  }
  if (input.adults < 1 || input.adults + input.children + input.infants > 9) {
    throw new Error("SearchApi supports 1 to 9 passengers, including at least one adult.");
  }
  if (input.infants > input.adults) throw new Error("There cannot be more infants than adults.");
  if (!["Economy", "Premium Economy", "Business", "First"].includes(input.cabin)) {
    throw new Error("Choose a supported cabin class.");
  }
  if (!["INR", "USD", "AED"].includes(input.currency)) {
    throw new Error("Choose a supported currency.");
  }
  if (typeof input.directFlight !== "boolean") throw new Error("Flight stop preference is invalid.");
}

export async function searchSearchApiFlightOffers(
  input: LiveFlightSearchInput,
  apiKey = process.env["SEARCHAPI_API_KEY"],
  fetcher: typeof fetch = fetch,
): Promise<LiveFlightOffer[]> {
  validateSearchApiFlightInput(input);
  if (!apiKey?.trim()) throw new Error("Live flight search is not configured. Add SEARCHAPI_API_KEY to the server environment.");

  const params = new URLSearchParams({
    engine: "google_flights",
    api_key: apiKey,
    flight_type: "one_way",
    departure_id: input.from,
    arrival_id: input.to,
    outbound_date: input.departure,
    adults: String(input.adults),
    children: String(input.children),
    infants_on_lap: String(input.infants),
    travel_class: input.cabin === "First" ? "first_class" : input.cabin.toLowerCase().replaceAll(" ", "_"),
    currency: input.currency,
    stops: input.directFlight ? "nonstop" : "any",
    no_cache: "true",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(`https://www.searchapi.io/api/v1/search?${params}`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("SearchApi rejected its API key. Check SEARCHAPI_API_KEY in the server environment.");
      }
      if (response.status === 429) throw new Error("SearchApi request limit reached. Check your SearchApi plan.");
      throw new Error(`SearchApi could not complete this search (HTTP ${response.status}).`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("SearchApi returned an invalid response. Please try again.");
    }
    if (payload && typeof payload === "object" && "error" in payload) {
      throw new Error("SearchApi could not complete this search. Check the search details and try again.");
    }
    return normalizeSearchApiFlightOffers(payload, input.currency);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Flight search timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
