export type ImportedHotelPrice = {
  amount: number;
  currency: string;
  basis: "per_night" | "stay_total";
};

const CURRENCY_MARKERS: Array<[RegExp, string]> = [
  [/₹|\bINR\b|\bRs\.?|\brupees?\b/i, "INR"],
  [/\bUSD\b|US\$|\$/i, "USD"],
  [/\bEUR\b|€/i, "EUR"],
  [/\bGBP\b|£/i, "GBP"],
  [/\bAED\b/i, "AED"],
  [/\bSGD\b/i, "SGD"],
  [/\bAUD\b/i, "AUD"],
  [/\bCAD\b/i, "CAD"],
  [/\bTHB\b|฿/i, "THB"],
  [/\bJPY\b|¥/i, "JPY"],
];

function parsePrice(text: string): ImportedHotelPrice | null {
  if (!/(?:₹|\$|€|£|฿|¥|\b(?:INR|USD|EUR|GBP|AED|SGD|AUD|CAD|THB|JPY|Rs\.?|rupees?)\b|\b(?:price|cost|rate|tariff|per\s+night|nightly|stay\s+total)\b)/i.test(text)) return null;
  const match = /(?:₹|\$|€|£|฿|¥|\b(?:INR|USD|EUR|GBP|AED|SGD|AUD|CAD|THB|JPY|Rs\.?|rupees?)\b\s*)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:\b(?:INR|USD|EUR|GBP|AED|SGD|AUD|CAD|THB|JPY|Rs\.?|rupees?)\b)/i.exec(text);
  const keywordAmount = /\b(?:price|cost|rate|tariff|per\s+night|nightly|stay\s+total)\b[^\d]{0,20}([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  const rawAmount = match?.[1] ?? match?.[2] ?? keywordAmount?.[1];
  if (!rawAmount) return null;
  const amount = Number(rawAmount.replaceAll(",", ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currency = CURRENCY_MARKERS.find(([pattern]) => pattern.test(text))?.[1] ?? "INR";
  const basis = /\b(?:per\s*night|each\s*night|nightly|\/\s*night|per\s*room\s*per\s*night)\b/i.test(text)
    ? "per_night"
    : "stay_total";
  return { amount, currency, basis };
}

/** Finds an explicitly stated rate near a known hotel name in supplier text. */
export function findImportedHotelPrice(sourceText: string, hotelName: string): ImportedHotelPrice | null {
  const target = hotelName.trim().toLocaleLowerCase();
  if (!target) return null;
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]?.toLocaleLowerCase().includes(target)) continue;
    for (let offset = 0; offset <= 3 && index + offset < lines.length; offset += 1) {
      const line = lines[index + offset]?.trim() ?? "";
      if (offset > 0 && /^(?:day\s*\d+|hotel\s*[:#]|accommodation\s*[:#]|flight\s*[:#])/i.test(line)) break;
      if (offset > 0 && /\b(?:hotel|resort|lodge|inn|hostel|guesthouse|motel)\b/i.test(line)) break;
      const matchIndex = sourceText.toLocaleLowerCase().indexOf(target, lines.slice(0, index).join("\n").length);
      const nearbyContext = sourceText.slice(Math.max(0, matchIndex - 350), Math.min(sourceText.length, matchIndex + 350));
      if (/\bper\s+(?:adult|person|pax)\s+price\b|\b(?:single|double|triple|sngl|dbl|trpl)\s+(?:room|sharing)\b/i.test(nearbyContext)) break;
      const price = parsePrice(line);
      if (price) return price;
    }
  }

  return null;
}

export function applyImportedHotelPrices<T extends {
  items: Array<{
    item_type: string;
    hotel_name?: string | null | undefined;
    room_type?: string | null | undefined;
    adults?: number | null | undefined;
    children?: number | null | undefined;
    nights?: number | null | undefined;
    check_in?: string | null | undefined;
    check_out?: string | null | undefined;
    hotel_option_label?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }>;
}>(days: T[], sourceText: string): T[] {
  return days.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      if (item.item_type !== "ACCOMMODATION" || !item.hotel_name?.trim()) return item;
      const price = findImportedHotelPrice(sourceText, item.hotel_name);
      const roomDetails = Array.isArray(item.metadata?.["room_details"])
        ? item.metadata["room_details"] as Array<Record<string, unknown>>
        : [];
      const room = roomDetails[0] ?? {
        id: crypto.randomUUID(),
        room_type: item.room_type ?? "Room Type",
        adults: Number(item.adults ?? 0),
        kids: Number(item.children ?? 0),
        breakfast: false,
        lunch: false,
        dinner: false,
        free_cancellation_date: "",
      };
      const dateNights = item.check_in && item.check_out
        ? Math.round((Date.parse(`${item.check_out}T00:00:00Z`) - Date.parse(`${item.check_in}T00:00:00Z`)) / 86_400_000)
        : 0;
      const nights = Number(item.nights) || (dateNights > 0 ? dateNights : 1);
      const nightlyRate = price ? price.basis === "stay_total" ? price.amount / nights : price.amount : null;

      return {
        ...item,
        hotel_option_label: item.hotel_option_label || "Option 1",
        metadata: {
          ...(item.metadata ?? {}),
          ...(price ? {
            room_details: [{
              ...room,
              room_rate_per_night: nightlyRate,
              currency: price.currency,
              imported_price_basis: price.basis,
              imported_price_amount: price.amount,
            }],
          } : {}),
          hotel_search_query: item.hotel_name,
          auto_select_google_hotel: true,
          supplier_imported_hotel: true,
        },
      };
    }),
  })) as unknown as T[];
}
