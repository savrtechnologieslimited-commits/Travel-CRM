import type { FlightDetailsDraft } from "./travel-search-types";

const MONTHS = new Map([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12],
]);

const AIRLINE_NAMES = [
  "Air India Express",
  "AirAsia India",
  "Air India",
  "IndiGo",
  "SpiceJet",
  "Vistara",
  "Akasa Air",
  "Alliance Air",
  "Star Air",
  "Fly91",
  "Emirates",
  "Qatar Airways",
  "Etihad Airways",
  "Singapore Airlines",
  "British Airways",
  "Lufthansa",
  "Turkish Airlines",
  "Thai Airways",
  "Malaysia Airlines",
  "Cathay Pacific",
  "Air France",
  "KLM",
  "Japan Airlines",
  "All Nippon Airways",
  "United Airlines",
  "American Airlines",
  "Delta Air Lines",
  "Air Arabia",
];

const AIRLINE_BY_CODE: Record<string, string> = {
  AI: "Air India",
  IX: "Air India Express",
  "6E": "IndiGo",
  SG: "SpiceJet",
  UK: "Vistara",
  QP: "Akasa Air",
  "9I": "Alliance Air",
  S5: "Star Air",
  EK: "Emirates",
  QR: "Qatar Airways",
  EY: "Etihad Airways",
  SQ: "Singapore Airlines",
  BA: "British Airways",
  LH: "Lufthansa",
  TK: "Turkish Airlines",
  TG: "Thai Airways",
  MH: "Malaysia Airlines",
  CX: "Cathay Pacific",
  AF: "Air France",
  KL: "KLM",
  JL: "Japan Airlines",
  NH: "All Nippon Airways",
  UA: "United Airlines",
  AA: "American Airlines",
  DL: "Delta Air Lines",
  G9: "Air Arabia",
};

const TIME_PATTERN =
  /\b(\d{1,2})(?::([0-5]\d))?\s*([AP]\.?M\.?)\b|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi;
const FLIGHT_NUMBER_PATTERN = /\b([A-Z0-9]{2})\s*[- ]?\s*(\d{1,4}[A-Z]?)\b/gi;

type ParseOptions = {
  departureDate?: string;
  returnDate?: string;
  currency?: string;
  from?: string;
  to?: string;
};

type FlightSection = { text: string; isReturn: boolean };

function sectionsFrom(text: string): FlightSection[] {
  const markers = [...text.matchAll(/\b(departing|outbound|return(?:ing)?|inbound)\s+flight\b/gi)];
  if (!markers.length) return [{ text, isReturn: false }];
  return markers.map((marker, index) => {
    const start = marker.index ?? 0;
    const end = markers[index + 1]?.index ?? text.length;
    return {
      text: text.slice(start, end),
      isReturn: /return|inbound/i.test(marker[1] ?? ""),
    };
  });
}

function validDate(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateCandidates(text: string): string[] {
  const candidates: Array<{ index: number; value: string }> = [];
  for (const match of text.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const value = validDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (value) candidates.push({ index: match.index ?? 0, value });
  }
  for (const match of text.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/g)) {
    const month = MONTHS.get((match[1] ?? "").toLowerCase());
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month && year) {
      const value = validDate(year, month, day);
      if (value) candidates.push({ index: match.index ?? 0, value });
    }
  }
  for (const match of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})(?:,?\s+(20\d{2}))?\b/g)) {
    const day = Number(match[1]);
    const month = MONTHS.get((match[2] ?? "").toLowerCase());
    const year = Number(match[3]);
    if (month && year) {
      const value = validDate(year, month, day);
      if (value) candidates.push({ index: match.index ?? 0, value });
    }
  }
  return candidates.sort((left, right) => left.index - right.index).map(({ value }) => value);
}

function parseDate(text: string, expectedDate?: string): string | null {
  const explicit = dateCandidates(text)[0];
  if (explicit) return explicit;
  const numericDate = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (numericDate) {
    const first = Number(numericDate[1]);
    const second = Number(numericDate[2]);
    const year = Number(numericDate[3]);
    const dayFirst = validDate(year, second, first);
    const monthFirst = validDate(year, first, second);
    const possibleDates = [
      ...new Set([dayFirst, monthFirst].filter((date): date is string => Boolean(date))),
    ];
    if (expectedDate && possibleDates.includes(expectedDate)) return expectedDate;
    if (possibleDates.length === 1) return possibleDates[0]!;
    return null;
  }
  const monthFirst = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})\b/i);
  const dayFirst = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\b/i);
  if (monthFirst || dayFirst) {
    const month = MONTHS.get((monthFirst?.[1] ?? dayFirst?.[2] ?? "").toLowerCase());
    const day = Number(monthFirst?.[2] ?? dayFirst?.[1]);
    if (month && day && expectedDate && /^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) {
      const expected = new Date(`${expectedDate}T00:00:00Z`);
      const year = expected.getUTCFullYear();
      let candidate = validDate(year, month, day);
      if (candidate && candidate < expectedDate) candidate = validDate(year + 1, month, day);
      return candidate;
    }
  }
  return expectedDate && /^\d{4}-\d{2}-\d{2}$/.test(expectedDate) ? expectedDate : null;
}

function dateForArrival(
  date: string | null,
  departureTime: string | null,
  arrivalTime: string | null,
) {
  if (!date || !departureTime || !arrivalTime || arrivalTime >= departureTime) return date;
  const nextDay = new Date(`${date}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.toISOString().slice(0, 10);
}

function parseTimes(text: string): string[] {
  return [...text.matchAll(TIME_PATTERN)].map((match) => {
    if (match[3]) {
      let hours = Number(match[1]) % 12;
      if (match[3].toUpperCase().startsWith("P")) hours += 12;
      return `${String(hours).padStart(2, "0")}:${match[2] ?? "00"}`;
    }
    return `${String(Number(match[4])).padStart(2, "0")}:${match[5]}`;
  });
}

function routeCandidates(text: string) {
  const routes = [...text.matchAll(/\b([A-Z]{3})\s*(?:→|➜|->|–>|to)\s*([A-Z]{3})\b/gi)].map(
    (match) => [match[1]!.toUpperCase(), match[2]!.toUpperCase()] as const,
  );
  const labeledAirportRoute = text.match(
    /\b(?:leaves|departs?\s+from)\s+([A-Z]{3})\s+at\b[\s\S]{0,100}?\barrives?(?:\s+at)?\s+([A-Z]{3})\b/i,
  );
  const parenthesizedAirportRoute = text.match(
    /\b(?:leaves|departs?\s+from)\b[\s\S]{0,80}?\(([A-Z]{3})\)[\s\S]{0,100}?\barrives?(?:\s+at)?\b[\s\S]{0,80}?\(([A-Z]{3})\)/i,
  );
  const labeled = labeledAirportRoute ?? parenthesizedAirportRoute;
  if (labeled) routes.unshift([labeled[1]!.toUpperCase(), labeled[2]!.toUpperCase()]);
  const labeledRoute = text.match(/\bfrom\s+([A-Z]{3})\b[\s\S]{0,80}?\bto\s+([A-Z]{3})\b/i);
  if (labeledRoute)
    routes.unshift([labeledRoute[1]!.toUpperCase(), labeledRoute[2]!.toUpperCase()]);
  if (!routes.length) {
    const codes = [...text.matchAll(/\(([A-Z]{3})\)/g)].map((match) => match[1]!.toUpperCase());
    if (codes.length >= 2) routes.push([codes[0]!, codes[codes.length - 1]!]);
  }
  return routes.filter(
    ([from, to], index) =>
      routes.findIndex(
        ([candidateFrom, candidateTo]) => candidateFrom === from && candidateTo === to,
      ) === index,
  );
}

function flightNumbers(text: string): string[] {
  return [...text.matchAll(FLIGHT_NUMBER_PATTERN)]
    .map((match) => `${match[1]}${match[2]}`.toUpperCase())
    .filter((value, index, all) => all.indexOf(value) === index);
}

function airlines(text: string): string[] {
  const names = AIRLINE_NAMES.filter((name) =>
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text),
  );
  const byCode = flightNumbers(text)
    .map((number) => AIRLINE_BY_CODE[number.match(/^[A-Z0-9]+/)?.[0] ?? ""])
    .filter((name): name is string => Boolean(name));
  return [...new Set([...names, ...byCode])];
}

function durationValues(text: string): string[] {
  return [
    ...text.matchAll(
      /\b(\d+)\s*(?:hours?|hrs?|h)(?:\s*(\d+)\s*(?:minutes?|mins?|m))?|\b(\d+)\s*(?:minutes?|mins?|m)\b/gi,
    ),
  ].map((match) => {
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2] ?? match[3] ?? 0);
    return `${hours ? `${hours}h` : ""}${minutes ? ` ${minutes}m` : ""}`.trim();
  });
}

function stopCount(text: string): number | null {
  if (/\bnon[\s-]?stop\b|\bdirect(?: flight)?\b/i.test(text)) return 0;
  const match = text.match(/\b(\d+)\s+stops?\b/i);
  return match ? Number(match[1]) : null;
}

function baggageInformation(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const baggageLines = lines.filter((line) =>
    /\b(?:baggage|checked bag|cabin bag|carry[\s-]?on(?: bag)?|personal item)\b/i.test(line),
  );
  return baggageLines.length ? baggageLines.slice(0, 2).join(" · ").slice(0, 200) : null;
}

function parsePrice(text: string, defaultCurrency?: string) {
  const currencySymbols: Record<string, string> = {
    "₹": "INR",
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "د.إ": "AED",
  };
  const currencyCodes = [
    "INR",
    "USD",
    "AED",
    "EUR",
    "GBP",
    "CAD",
    "AUD",
    "SGD",
    "THB",
    "JPY",
    "SAR",
    "QAR",
  ];
  const currencyPattern = new RegExp(
    `(?:(${currencyCodes.join("|")})\\s*([\\d,]+(?:\\.\\d{1,2})?)|([\\d,]+(?:\\.\\d{1,2})?)\\s*(${currencyCodes.join("|")}))`,
    "i",
  );
  const codeMatch = text.match(currencyPattern);
  if (codeMatch) {
    const currency = (codeMatch[1] ?? codeMatch[4] ?? defaultCurrency ?? "").toUpperCase();
    const amount = codeMatch[2] ?? codeMatch[3];
    return {
      price: amount ? Number(amount.replaceAll(",", "")) : null,
      currency: currency || null,
    };
  }
  for (const [symbol, currency] of Object.entries(currencySymbols)) {
    const match = text.match(
      new RegExp(`${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*([\\d,]+(?:\\.\\d{1,2})?)`),
    );
    if (match) return { price: Number(match[1]!.replaceAll(",", "")), currency };
  }
  const amountLine = text.split(/\r?\n/).find((line) => /total|fare|price/i.test(line));
  const amount = amountLine?.match(/\b([\d,]+(?:\.\d{1,2})?)\b/)?.[1];
  return {
    price: amount ? Number(amount.replaceAll(",", "")) : null,
    currency: defaultCurrency?.toUpperCase() ?? null,
  };
}

function legData(text: string, expectedDate?: string, timeOffset = 0) {
  const times = parseTimes(text);
  const departureTime = times[timeOffset] ?? null;
  const arrivalTime = times[timeOffset + 1] ?? null;
  const departureDate = parseDate(text, expectedDate);
  const arrivalDate = dateForArrival(departureDate, departureTime, arrivalTime);
  return {
    departure_at: departureDate && departureTime ? `${departureDate}T${departureTime}` : null,
    arrival_at: arrivalDate && arrivalTime ? `${arrivalDate}T${arrivalTime}` : null,
  };
}

export function parseFlightDetailsFromText(
  sourceText: string,
  options: ParseOptions = {},
): FlightDetailsDraft {
  const text = sourceText.trim();
  const sections = sectionsFrom(text);
  const outboundSection = sections.find((section) => !section.isReturn)?.text ?? text;
  const returnSection = sections.find((section) => section.isReturn)?.text;
  const routes = routeCandidates(text);
  const numbers = flightNumbers(text);
  const carriers = airlines(text);
  const durations = durationValues(text);
  const outbound = legData(outboundSection, options.departureDate);
  const hasReturn = Boolean(returnSection || /\bround[\s-]?trip\b/i.test(text));
  const returnData = hasReturn
    ? legData(returnSection ?? text, options.returnDate, returnSection ? 0 : 2)
    : { departure_at: null, arrival_at: null };
  const price = parsePrice(text, options.currency);
  const cabinMatch = text.match(/\b(premium economy|economy|business|first(?: class)?)\b/i);
  const cabin = cabinMatch?.[1]
    ? cabinMatch[1].replace(/\b\w/g, (character) => character.toUpperCase())
    : null;
  const outboundRoute =
    routes[0] ??
    (options.from && options.to
      ? ([options.from.toUpperCase(), options.to.toUpperCase()] as const)
      : null);
  const returnRoute =
    routes[1] ?? (outboundRoute ? ([outboundRoute[1], outboundRoute[0]] as const) : null);
  const returnCarrier = returnSection
    ? (airlines(returnSection)[0] ?? null)
    : (carriers[1] ?? carriers[0] ?? null);
  const returnNumber = (returnSection ? flightNumbers(returnSection)[0] : numbers[1]) ?? null;
  const returnDuration = (returnSection ? durationValues(returnSection)[0] : durations[1]) ?? null;
  const returnStops = returnSection ? stopCount(returnSection) : hasReturn ? stopCount(text) : null;

  return {
    has_return: hasReturn,
    airline: carriers[0] ?? null,
    flight_number: flightNumbers(outboundSection)[0] ?? numbers[0] ?? null,
    from: outboundRoute?.[0] ?? null,
    to: outboundRoute?.[1] ?? null,
    departure_at: outbound.departure_at,
    arrival_at: outbound.arrival_at,
    duration: durationValues(outboundSection)[0] ?? durations[0] ?? null,
    stops: stopCount(outboundSection),
    price: Number.isFinite(price.price) ? price.price : null,
    currency: price.currency,
    cabin,
    return_airline: hasReturn ? returnCarrier : null,
    return_flight_number: hasReturn ? returnNumber : null,
    return_from: hasReturn ? (returnRoute?.[0] ?? null) : null,
    return_to: hasReturn ? (returnRoute?.[1] ?? null) : null,
    return_departure_at: returnData.departure_at,
    return_arrival_at: returnData.arrival_at,
    return_duration: hasReturn ? returnDuration : null,
    return_stops: hasReturn ? returnStops : null,
    baggage_information: baggageInformation(outboundSection),
    return_baggage_information: returnSection ? baggageInformation(returnSection) : null,
  };
}
