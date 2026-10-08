export type TravelSearchKind = "hotel" | "flight";

export type FlightSearchParams = {
  from: string;
  to: string;
  departure: string;
  returnDate?: string;
  adults: number;
  children?: number;
  infants?: number;
  cabin?: string;
  tripType?: string;
  currency?: string;
  directFlight?: boolean;
};

export type TrainSearchParams = {
  from: TrainStation;
  to: TrainStation;
  departure: string;
  travelClass?: string;
  adults?: number;
  currency?: string;
};

export type TrainStation = {
  name: string;
  code: string;
  city: string;
};

export interface SearchProvider {
  name: string;
  buildFlightUrl?: (params: FlightSearchParams) => string;
  buildTrainUrl?: (params: TrainSearchParams) => string;
}

export abstract class TravelSearchProvider {
  constructor(public readonly kind: TravelSearchKind, public readonly label: string, public readonly url: string) {}

  buildSearchUrl(values: TravelSearchValues): string | null {
    if (!this.url) return null;

    const target = new URL(this.url);
    const isGoibiboProvider = /^https?:\/\/(www\.)?goibibo\.com\//i.test(this.url.trim());
    if (isGoibiboProvider) {
      if (this.kind === "flight") return buildGoibiboFlightSearchUrl(this.url, values) ?? target.toString();
      return target.toString();
    }

    const query = this.kind === "hotel" ? generateHotelSearchQuery(values) : generateFlightSearchQuery(values);
    const paramName = target.searchParams.has("query") ? "query" : "q";
    target.searchParams.set(paramName, query);
    return target.toString();
  }
}

export class HotelSearchProvider extends TravelSearchProvider {
  constructor(url: string) {
    super("hotel", "Hotel search", url);
  }
}

export class FlightSearchProvider extends TravelSearchProvider {
  constructor(url: string) {
    super("flight", "Flight search", url);
  }
}

export type TravelSearchProviderConfig = {
  kind: TravelSearchKind;
  label: string;
  url: string;
};

export type TravelSearchValues = Partial<{
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: string | number;
  children: string | number;
  rooms: string | number;
  from: string;
  to: string;
  departure: string;
  returnDate: string;
  infants: string | number;
  cabin: string;
  tripType: string;
  query: string;
}>;

export type TravelSearchConfigInput = Partial<Record<TravelSearchKind, string>>;

const GOIBIBO_AIRPORTS: Record<string, { code: string; country: "IN" | "AE" }> = {
  bengaluru: { code: "BLR", country: "IN" },
  bangalore: { code: "BLR", country: "IN" },
  delhi: { code: "DEL", country: "IN" },
  hyderabad: { code: "HYD", country: "IN" },
  kolkata: { code: "CCU", country: "IN" },
  chennai: { code: "MAA", country: "IN" },
  mumbai: { code: "BOM", country: "IN" },
  pune: { code: "PNQ", country: "IN" },
  goa: { code: "GOI", country: "IN" },
  kerala: { code: "COK", country: "IN" },
  kochi: { code: "COK", country: "IN" },
  dubai: { code: "DXB", country: "AE" },
};

export const travelSearchConfig: TravelSearchConfigInput = {
  hotel: typeof import.meta !== "undefined" && import.meta.env ? String(import.meta.env.VITE_TRAVEL_HOTEL_SEARCH_URL ?? "https://www.goibibo.com/hotels/") : "https://www.goibibo.com/hotels/",
  flight: typeof import.meta !== "undefined" && import.meta.env ? String(import.meta.env.VITE_TRAVEL_FLIGHT_SEARCH_URL ?? "https://www.goibibo.com/flights/") : "https://www.goibibo.com/flights/",
};

export function formatTravelDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

export function normalizeNumber(value: string | number | null | undefined, fallback = 0): number {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function generateHotelSearchQuery(values: TravelSearchValues): string {
  const destination = values.destination?.trim() || "destination";
  const checkIn = values.checkIn ? formatTravelDate(values.checkIn) : "check-in";
  const checkOut = values.checkOut ? formatTravelDate(values.checkOut) : "check-out";
  const adults = normalizeNumber(values.adults, 0);
  const children = normalizeNumber(values.children, 0);
  const rooms = Math.max(1, normalizeNumber(values.rooms, 1));

  const parts = [`${destination} hotels ${checkIn} - ${checkOut}`];
  if (adults > 0) parts.push(`${adults} adults`);
  if (children > 0) parts.push(`${children} children`);
  parts.push(`${rooms} room${rooms === 1 ? "" : "s"}`);

  return parts.join(", ");
}

export function generateFlightSearchQuery(values: TravelSearchValues): string {
  const from = values.from?.trim() || "origin";
  const to = values.to?.trim() || "destination";
  const departure = values.departure ? formatTravelDate(values.departure) : "departure";
  const adults = normalizeNumber(values.adults, 0);
  const children = normalizeNumber(values.children, 0);
  const infants = normalizeNumber(values.infants, 0);
  const cabin = (values.cabin || "Economy").trim();

  let query = `${from} to ${to} flights ${departure}`;
  if (values.returnDate) query += `, return ${formatTravelDate(values.returnDate)}`;
  if (adults > 0) query += `, ${adults} adults`;
  if (children > 0) query += `, ${children} children`;
  if (infants > 0) query += `, ${infants} infants`;
  if (cabin) query += `, ${cabin.toLowerCase()}`;

  return query;
}

function resolveGoibiboAirport(value: string | undefined): { code: string; country: "IN" | "AE" } | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (/^[a-z]{3}$/i.test(normalized)) {
    return Object.values(GOIBIBO_AIRPORTS).find((airport) => airport.code === normalized.toUpperCase()) ?? null;
  }
  return GOIBIBO_AIRPORTS[normalized] ?? null;
}

function formatGoibiboFlightDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function getGoibiboCabinClass(value: string | undefined): string {
  const cabin = value?.trim().toLowerCase();
  if (cabin === "business") return "B";
  if (cabin === "first" || cabin === "first class") return "F";
  return "E";
}

function normalizeFlightCode(value: string): string {
  return value.trim().toUpperCase();
}

export function buildGoibiboFlightSearchUrl(baseUrl: string, values: TravelSearchValues): string | null {
  const from = resolveGoibiboAirport(values.from);
  const to = resolveGoibiboAirport(values.to);
  const departure = formatGoibiboFlightDate(values.departure);
  const returnDate = formatGoibiboFlightDate(values.returnDate);
  const isRoundTrip = Boolean(returnDate) && values.tripType?.trim().toLowerCase() !== "one way";
  if (!from || !to || !departure || (isRoundTrip && !returnDate)) return null;

  const itinerary = isRoundTrip && returnDate
    ? `${from.code}-${to.code}-${departure}_${to.code}-${from.code}-${returnDate}`
    : `${from.code}-${to.code}-${departure}`;
  const target = new URL(baseUrl);
  target.pathname = "/flight/search";
  target.search = new URLSearchParams({
    itinerary,
    tripType: isRoundTrip ? "R" : "O",
    paxType: `A-${Math.max(1, normalizeNumber(values.adults, 1))}_C-${normalizeNumber(values.children, 0)}_I-${normalizeNumber(values.infants, 0)}`,
    intl: String(from.country !== to.country),
    cabinClass: getGoibiboCabinClass(values.cabin),
    lang: "eng",
  }).toString();
  return target.toString();
}

export function buildFlightSearchLink(provider: SearchProvider, params: FlightSearchParams): string {
  if (provider.name === "Goibibo") {
    const url = new URL("https://www.goibibo.com/flight/search");
    const roundTrip = params.tripType?.toLowerCase() === "round trip" || params.tripType?.toLowerCase() === "round-trip" || params.tripType?.toLowerCase() === "r";
    const departure = formatGoibiboFlightDate(params.departure) ?? "";
    const returnValue = params.returnDate ? formatGoibiboFlightDate(params.returnDate) ?? "" : "";
    const itinerary = roundTrip && returnValue ? `${normalizeFlightCode(params.from)}-${normalizeFlightCode(params.to)}-${departure}_${normalizeFlightCode(params.to)}-${normalizeFlightCode(params.from)}-${returnValue}` : `${normalizeFlightCode(params.from)}-${normalizeFlightCode(params.to)}-${departure}`;
    url.search = new URLSearchParams({
      itinerary,
      tripType: roundTrip ? "R" : "O",
      paxType: `A-${Math.max(1, params.adults || 1)}_C-${params.children ?? 0}_I-${params.infants ?? 0}`,
      intl: String(false),
      cabinClass: getGoibiboCabinClass(params.cabin),
      lang: "eng",
    }).toString();
    return url.toString();
  }

  if (provider.name === "MakeMyTrip") {
    const url = new URL("https://www.makemytrip.com/flight/search");
    const roundTrip = params.tripType?.toLowerCase() === "round trip" || params.tripType?.toLowerCase() === "round-trip" || params.tripType?.toLowerCase() === "r";
    const departure = formatGoibiboFlightDate(params.departure) ?? "";
    const returnValue = params.returnDate ? formatGoibiboFlightDate(params.returnDate) ?? "" : "";
    const itinerary = roundTrip && returnValue ? `${normalizeFlightCode(params.from)}-${normalizeFlightCode(params.to)}-${departure}_${normalizeFlightCode(params.to)}-${normalizeFlightCode(params.from)}-${returnValue}` : `${normalizeFlightCode(params.from)}-${normalizeFlightCode(params.to)}-${departure}`;
    url.search = new URLSearchParams({
      itinerary,
      tripType: roundTrip ? "R" : "O",
      paxType: `A-${Math.max(1, params.adults || 1)}_C-${params.children ?? 0}_I-${params.infants ?? 0}`,
      intl: String(false),
      cabinClass: getGoibiboCabinClass(params.cabin),
      lang: "eng",
    }).toString();
    return url.toString();
  }

  const google = new URL("https://www.google.com/travel/flights");
  google.searchParams.set("hl", "en");
  if (params.currency) google.searchParams.set("curr", params.currency);
  const isRoundTrip = params.tripType?.toLowerCase() === "round trip"
    || params.tripType?.toLowerCase() === "round-trip"
    || params.tripType?.toLowerCase() === "r";
  const query = [
    `Flights from ${params.from.trim()} to ${params.to.trim()} on ${params.departure}`,
    isRoundTrip && params.returnDate ? `return ${params.returnDate}` : "one way",
    `${Math.max(1, params.adults || 1)} adults`,
    (params.children ?? 0) > 0 && `${params.children} children`,
    (params.infants ?? 0) > 0 && `${params.infants} infants`,
    params.cabin?.toLowerCase() ?? "economy",
    params.directFlight && "nonstop",
  ].filter(Boolean).join(" ");
  google.searchParams.set("q", query);
  return google.toString();
}

export function buildTrainSearchLink(provider: SearchProvider, params: TrainSearchParams): string {
  const parsedDate = new Date(`${params.departure}T00:00:00.000Z`);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.departure)
    && !Number.isNaN(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === params.departure
    ? params.departure.replaceAll("-", "")
    : "";
  const validStation = (station: TrainStation) => Boolean(station.name.trim() && station.city.trim() && /^[A-Z0-9]{2,6}$/.test(station.code));
  if (!date || !validStation(params.from) || !validStation(params.to) || params.from.code === params.to.code) return "";

  if (provider.name === "Goibibo") {
    return `https://www.goibibo.com/trains/dsrp/${encodeURIComponent(params.from.code)}/${encodeURIComponent(params.to.code)}/${date}/`;
  }

  if (provider.name === "MakeMyTrip") {
    const query = [
      `date=${date}`,
      `srcStn=${encodeURIComponent(params.from.code)}`,
      `srcCity=${encodeURIComponent(params.from.city)}`,
      `destStn=${encodeURIComponent(params.to.code)}`,
      `destCity=${encodeURIComponent(params.to.city)}`,
      "classCode=",
    ].join("&");
    return `https://www.makemytrip.com/railways/listing?${query}`;
  }

  return "";
}

export function getTrainSearchValidationError(from: TrainStation | null, to: TrainStation | null, departure: string): string | null {
  if (!from) return "Select a valid From Station.";
  if (!to) return "Select a valid To Station.";
  if (from.code === to.code) return "From and To stations must be different.";
  const parsedDate = new Date(`${departure}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departure) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== departure) {
    return "Select a valid Journey Date.";
  }
  if (!/^[A-Z0-9]{2,6}$/.test(from.code) || !/^[A-Z0-9]{2,6}$/.test(to.code)) {
    return "The selected station is missing a valid station code.";
  }
  return null;
}

export const flightSearchProviders: SearchProvider[] = [
  { name: "Goibibo", buildFlightUrl: (params) => buildFlightSearchLink({ name: "Goibibo" }, params) },
  { name: "MakeMyTrip", buildFlightUrl: (params) => buildFlightSearchLink({ name: "MakeMyTrip" }, params) },
  { name: "Google Flights", buildFlightUrl: (params) => buildFlightSearchLink({ name: "Google Flights" }, params) },
];

export const trainSearchProviders: SearchProvider[] = [
  { name: "Goibibo", buildTrainUrl: (params) => buildTrainSearchLink({ name: "Goibibo" }, params) },
  { name: "MakeMyTrip", buildTrainUrl: (params) => buildTrainSearchLink({ name: "MakeMyTrip" }, params) },
];

export function resolveTravelSearchProvider(kind: TravelSearchKind, overrides: TravelSearchConfigInput = travelSearchConfig): TravelSearchProviderConfig | null {
  const url = (overrides[kind] ?? "").trim();
  if (!url) return null;

  return {
    kind,
    label: kind === "hotel" ? "Hotel search" : "Flight search",
    url,
  };
}

export function buildTravelSearchProvider(kind: TravelSearchKind, url: string): TravelSearchProvider | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return kind === "hotel" ? new HotelSearchProvider(trimmed) : new FlightSearchProvider(trimmed);
}

export function buildTravelSearchUrl(kind: TravelSearchKind, values: TravelSearchValues, overrides: TravelSearchConfigInput = travelSearchConfig): string | null {
  const provider = resolveTravelSearchProvider(kind, overrides);
  if (!provider) return null;

  const instance = buildTravelSearchProvider(kind, provider.url);
  return instance ? instance.buildSearchUrl(values) : null;
}

export function getTravelSearchConfigMessage(kind: TravelSearchKind): string {
  const providerName = kind === "hotel" ? "hotel" : "flight";
  return `No ${providerName} search provider is configured. Set VITE_TRAVEL_${providerName.toUpperCase()}_SEARCH_URL or enter the selected details manually.`;
}
