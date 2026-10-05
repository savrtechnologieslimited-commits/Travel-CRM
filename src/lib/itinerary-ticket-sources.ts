export type ItineraryTicketFacts = {
  kind: "flight" | "train";
  date?: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  serviceName?: string;
  serviceNumber?: string;
  pnr?: string;
  departureLocation?: string;
  arrivalLocation?: string;
  travelClass?: string;
  seat?: string;
  coach?: string;
  berth?: string;
  terminal?: string;
  platform?: string;
  fare?: string;
  currency?: string;
  notes?: string;
};

type ExistingTripItem = {
  item_type?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  pickup?: string | null;
  dropoff?: string | null;
  vehicle_details?: string | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  flight_airline?: string | null;
  flight_number?: string | null;
  departure_airport?: string | null;
  departure_city?: string | null;
  arrival_airport?: string | null;
  arrival_city?: string | null;
  flight_departure_date?: string | null;
  flight_departure_time?: string | null;
  flight_arrival_date?: string | null;
  flight_arrival_time?: string | null;
  flight_cabin?: string | null;
  flight_price?: number | null;
  flight_currency?: string | null;
  extra_transport_date?: string | null;
  extra_transport_type?: string | null;
  extra_transport_vehicle_type?: string | null;
  metadata?: Record<string, unknown>;
};

type ExistingTripDay = { items?: ExistingTripItem[] };

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function metadataTicketFacts(metadata: Record<string, unknown>) {
  const allowedKeys: Record<string, keyof ItineraryTicketFacts> = {
    pnr: "pnr",
    ticket_number: "serviceNumber",
    train_number: "serviceNumber",
    train_name: "serviceName",
    class: "travelClass",
    travel_class: "travelClass",
    coach: "coach",
    berth: "berth",
    seat: "seat",
    platform: "platform",
    terminal: "terminal",
    departure_terminal: "terminal",
    departure_date: "date",
    journey_date: "date",
    arrival_date: "arrivalDate",
    departure_time: "departureTime",
    arrival_time: "arrivalTime",
    departure_station: "departureLocation",
    arrival_station: "arrivalLocation",
    from_station: "departureLocation",
    to_station: "arrivalLocation",
    booking_reference: "pnr",
  };
  const facts: Partial<ItineraryTicketFacts> = {};
  for (const [sourceKey, rawValue] of Object.entries(metadata)) {
    const targetKey = allowedKeys[sourceKey];
    if (!targetKey) continue;
    const value = stringValue(rawValue);
    if (value && !facts[targetKey]) facts[targetKey] = value;
  }
  return facts;
}

function isTrainTicket(item: ExistingTripItem) {
  const metadata = item.metadata ?? {};
  return metadata["ticket_type"] === "TRAIN"
    || metadata["is_train_ticket"] === true
    || /\btrain\b|\brail(?:way)?\b|\birctc\b/i.test([
      item.title,
      item.description,
      item.vehicle_details,
      item.extra_transport_type,
      item.extra_transport_vehicle_type,
    ].filter(Boolean).join(" "));
}

/** Extracts ticket facts only from flight items marked saved and explicit train ticket items in current itinerary state. */
export function collectExistingItineraryTickets(days: ExistingTripDay[]): ItineraryTicketFacts[] {
  return days.flatMap(({ items = [] }) => items.flatMap((item) => {
    const metadata = item.metadata ?? {};
    if (item.item_type === "FLIGHT" && metadata["flight_saved"] === true) {
      const ticket: ItineraryTicketFacts = {
        kind: "flight",
        ...(stringValue(item.flight_departure_date) ? { date: stringValue(item.flight_departure_date) } : {}),
        ...(stringValue(item.flight_departure_time) ? { departureTime: stringValue(item.flight_departure_time) } : {}),
        ...(stringValue(item.flight_arrival_date) ? { arrivalDate: stringValue(item.flight_arrival_date) } : {}),
        ...(stringValue(item.flight_arrival_time) ? { arrivalTime: stringValue(item.flight_arrival_time) } : {}),
        ...(stringValue(item.flight_airline) ? { serviceName: stringValue(item.flight_airline) } : {}),
        ...(stringValue(item.flight_number) ? { serviceNumber: stringValue(item.flight_number) } : {}),
        ...(stringValue(item.departure_airport || item.departure_city) ? { departureLocation: stringValue(item.departure_airport || item.departure_city) } : {}),
        ...(stringValue(item.arrival_airport || item.arrival_city) ? { arrivalLocation: stringValue(item.arrival_airport || item.arrival_city) } : {}),
        ...(stringValue(item.flight_cabin) ? { travelClass: stringValue(item.flight_cabin) } : {}),
        ...(typeof item.flight_price === "number" ? { fare: String(item.flight_price) } : {}),
        ...(stringValue(item.flight_currency) ? { currency: stringValue(item.flight_currency) } : {}),
        ...(stringValue(item.notes) ? { notes: stringValue(item.notes) } : {}),
        ...metadataTicketFacts(metadata),
      };
      return [ticket];
    }

    if ((item.item_type === "TRANSPORT" || item.item_type === "EXTRA_TRANSPORT") && isTrainTicket(item)) {
      const ticket: ItineraryTicketFacts = {
        kind: "train",
        ...(stringValue(metadata["journey_date"] || metadata["departure_date"] || item.extra_transport_date) ? { date: stringValue(metadata["journey_date"] || metadata["departure_date"] || item.extra_transport_date) } : {}),
        ...(stringValue(item.departure_time || item.extra_transport_pickup_time) ? { departureTime: stringValue(item.departure_time || item.extra_transport_pickup_time) } : {}),
        ...(stringValue(item.arrival_time || item.extra_transport_drop_time) ? { arrivalTime: stringValue(item.arrival_time || item.extra_transport_drop_time) } : {}),
        ...(stringValue(item.title || item.vehicle_details) ? { serviceName: stringValue(item.title || item.vehicle_details) } : {}),
        ...(stringValue(item.pickup || metadata["departure_station"]) ? { departureLocation: stringValue(item.pickup || metadata["departure_station"]) } : {}),
        ...(stringValue(item.dropoff || metadata["arrival_station"]) ? { arrivalLocation: stringValue(item.dropoff || metadata["arrival_station"]) } : {}),
        ...(stringValue(item.notes || item.description) ? { notes: stringValue(item.notes || item.description) } : {}),
        ...metadataTicketFacts(metadata),
      };
      return [ticket];
    }
    return [];
  }));
}

export function itineraryTextToSafeHtml(text: string): string {
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]!);
  return text.split(/\r?\n/).map((line) => {
    const safeLine = escapeHtml(line.trim());
    if (!safeLine) return "<p><br></p>";
    if (/^(DAY\s+\d+\b|DAY\s+[—-]|ARRIVAL\b|DEPARTURE\b)/i.test(line.trim())) return `<h2>${safeLine}</h2>`;
    const labelMatch = /^([A-Za-z][A-Za-z /-]{1,30}:)(.*)$/.exec(line.trim());
    return labelMatch ? `<p><strong>${escapeHtml(labelMatch[1])}</strong>${escapeHtml(labelMatch[2])}</p>` : `<p>${safeLine}</p>`;
  }).join("");
}

const ALLOWED_EDITOR_TAGS = new Set(["P", "BR", "H1", "H2", "H3", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI", "BLOCKQUOTE", "DIV", "SPAN", "A", "IMG"]);
const DROP_EDITOR_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "SVG", "MATH"]);

export function sanitizeItineraryEditorHtml(value: string): string {
  if (typeof DOMParser === "undefined") return "";
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const output = document.createElement("div");

  function appendSafe(parent: Node, child: Node) {
    if (child.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(child.textContent ?? ""));
      return;
    }
    if (!(child instanceof Element)) return;
    if (DROP_EDITOR_TAGS.has(child.tagName)) return;
    if (!ALLOWED_EDITOR_TAGS.has(child.tagName)) {
      child.childNodes.forEach((nested) => appendSafe(parent, nested));
      return;
    }

    const element = document.createElement(child.tagName.toLowerCase());
    if (child.tagName === "A") {
      const href = child.getAttribute("href") ?? "";
      try {
        const url = new URL(href, window.location.origin);
        if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
          element.setAttribute("href", href);
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noopener noreferrer");
        }
      } catch { /* Drop invalid links. */ }
    }
    if (child.tagName === "IMG") {
      const src = child.getAttribute("src") ?? "";
      if (/^https:\/\//i.test(src) || /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)) element.setAttribute("src", src);
      const alt = child.getAttribute("alt");
      if (alt) element.setAttribute("alt", alt.slice(0, 500));
    }
    if (child.tagName === "SPAN") {
      const style = (child as HTMLElement).style;
      const safeStyles: string[] = [];
      if (/^(?:#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(style.color)) safeStyles.push(`color:${style.color}`);
      if (/^\d{1,3}(?:\.\d+)?(?:px|pt|em|rem)$/i.test(style.fontSize)) safeStyles.push(`font-size:${style.fontSize}`);
      if (["left", "center", "right", "justify"].includes(style.textAlign)) safeStyles.push(`text-align:${style.textAlign}`);
      if (safeStyles.length) element.setAttribute("style", safeStyles.join(";"));
    }
    child.childNodes.forEach((nested) => appendSafe(element, nested));
    parent.appendChild(element);
  }

  parsed.body.childNodes.forEach((child) => appendSafe(output, child));
  return output.innerHTML;
}
