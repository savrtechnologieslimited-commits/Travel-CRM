import type { LiveFlightOffer } from "@/lib/travel-search-types";

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
