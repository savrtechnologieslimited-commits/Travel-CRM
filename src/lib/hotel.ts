import { MEAL_PLANS, formatDate } from "@/lib/crm";

/** Meal plan vocabulary is the agency's existing one (see MEAL_PLANS in crm.ts). */
export const HOTEL_MEAL_PLANS = MEAL_PLANS;

export const ROOM_TYPES = [
  "Standard",
  "Deluxe",
  "Super Deluxe",
  "Premium",
  "Suite",
  "Villa",
  "Cottage",
  "Dormitory",
] as const;

export const HOTEL_STAR_CATEGORIES = ["Budget", "3 Star", "4 Star", "5 Star", "Luxury"] as const;

/** Nights are derived from the dates — never entered manually. Never negative. */
export function nightsBetween(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(Math.round((b - a) / 86_400_000), 0);
}

export type HotelStay = {
  hotel_name?: string | null;
  city?: string | null;
  address?: string | null;
  country?: string | null;
  star_category?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  nights?: number | null;
  rooms?: number | null;
  room_type?: string | null;
  adults?: number | null;
  children?: number | null;
  extra_beds?: number | null;
  meal_plan?: string | null;
  confirmation_number?: string | null;
  cancellation_deadline?: string | null;
  status?: string | null;
  notes?: string | null;
  suppliers?: { name?: string | null } | null;
};

/** Human-readable one-liner used in lists, vouchers and quotation documents. */
export function hotelStayLine(h: HotelStay) {
  const nights = h.nights ?? nightsBetween(h.check_in, h.check_out);
  return [
    `${formatDate(h.check_in)} → ${formatDate(h.check_out)}`,
    `${nights} ${nights === 1 ? "night" : "nights"}`,
    `${Number(h.rooms ?? 1)} ${Number(h.rooms ?? 1) === 1 ? "room" : "rooms"}${h.room_type ? ` (${h.room_type})` : ""}`,
    h.meal_plan,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Hotel title shown on the parent service line, e.g. "Taj Example — Goa". */
export function hotelTitle(hotelName: string, city?: string | null) {
  return city ? `${hotelName} — ${city}` : hotelName;
}

/** hotel_bookings arrives as a one-element array from embedded selects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hotelOf(item: any): any {
  const h = item?.hotel_bookings;
  return Array.isArray(h) ? (h[0] ?? null) : (h ?? null);
}

/**
 * Operational detail pairs used by the booking panel, quotation panel,
 * vouchers and quotation documents. Purely presentational — no pricing.
 */
export function hotelDetailPairs(h: HotelStay): Array<[string, string]> {
  const nights = h.nights ?? nightsBetween(h.check_in, h.check_out);
  const rooms = Number(h.rooms ?? 1);
  const pairs: Array<[string, string]> = [
    ["Hotel", [h.hotel_name, h.star_category].filter(Boolean).join(" · ") || "—"],
    ["City", [h.city, h.country].filter(Boolean).join(", ") || "—"],
    ["Check-in", formatDate(h.check_in)],
    ["Check-out", formatDate(h.check_out)],
    ["Nights", String(nights)],
    ["Rooms", `${rooms}${h.room_type ? ` · ${h.room_type}` : ""}`],
    [
      "Occupancy",
      `${Number(h.adults ?? 0)} adults, ${Number(h.children ?? 0)} children${Number(h.extra_beds ?? 0) > 0 ? `, ${h.extra_beds} extra bed(s)` : ""}`,
    ],
    ["Meal plan", h.meal_plan || "—"],
  ];
  if (h.suppliers?.name) pairs.push(["Supplier", h.suppliers.name]);
  if (h.confirmation_number) pairs.push(["Confirmation", h.confirmation_number]);
  if (h.cancellation_deadline) pairs.push(["Cancel by", formatDate(h.cancellation_deadline)]);
  return pairs;
}
