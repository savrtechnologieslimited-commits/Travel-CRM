import { formatDate } from "@/lib/crm";

/**
 * Transport service vocabulary. Kept in code and mirrored by CHECK constraints
 * on public.transport_services so the database stays authoritative.
 */
export const TRANSPORT_TYPES = [
  "Airport Transfer",
  "Railway Transfer",
  "Point to Point Transfer",
  "Intercity Transfer",
  "Local Sightseeing",
  "Multi-day Vehicle",
  "Other",
] as const;

export const VEHICLE_TYPES = [
  "Sedan",
  "SUV",
  "MUV",
  "Tempo Traveller",
  "Mini Bus",
  "Bus",
  "Coach",
  "Train",
  "Other",
] as const;

export type TransportService = {
  transport_type?: string | null;
  pickup_location?: string | null;
  drop_location?: string | null;
  route_notes?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  pickup_time?: string | null;
  drop_time?: string | null;
  vehicle_type?: string | null;
  vehicle_registration?: string | null;
  vehicle_capacity?: number | null;
  is_ac?: boolean | null;
  vehicle_notes?: string | null;
  passengers?: number | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_reference?: string | null;
  driver_notes?: string | null;
  confirmation_number?: string | null;
  status?: string | null;
  notes?: string | null;
  suppliers?: { name?: string | null } | null;
};

/** transport_services arrives as a one-element array from embedded selects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transportOf(item: any): any {
  const t = item?.transport_services;
  return Array.isArray(t) ? (t[0] ?? null) : (t ?? null);
}

/** "Hyderabad Airport → Hotel" — blank when neither end is known. */
export function transportRoute(t: TransportService) {
  const legs = [t.pickup_location, t.drop_location].filter(Boolean);
  return legs.length ? legs.join(" → ") : "";
}

/** Service-line title, e.g. "Airport Transfer — Hyderabad Airport → Hotel". */
export function transportTitle(transportType: string, t: TransportService) {
  const route = transportRoute(t);
  return route ? `${transportType} — ${route}` : transportType;
}

/** One-liner used in lists, quotation documents and vouchers. */
export function transportLine(t: TransportService) {
  const sameDay = !t.end_date || t.end_date === t.start_date;
  const dates = sameDay
    ? formatDate(t.start_date)
    : `${formatDate(t.start_date)} → ${formatDate(t.end_date)}`;
  return [
    dates,
    t.pickup_time ? `Pickup ${t.pickup_time}` : null,
    t.drop_time ? `Drop ${t.drop_time}` : null,
    t.vehicle_type ? `${t.vehicle_type}${t.is_ac === false ? " (Non-AC)" : " (AC)"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Days a vehicle is engaged; 1 for a single-day transfer. */
export function transportDays(t: TransportService) {
  if (!t.start_date) return 1;
  if (!t.end_date || t.end_date === t.start_date) return 1;
  const a = new Date(t.start_date).getTime();
  const b = new Date(t.end_date).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(Math.round((b - a) / 86_400_000) + 1, 1);
}

/**
 * Operational detail pairs used by the booking panel, quotation panel,
 * vouchers and quotation documents. Purely presentational — no pricing.
 */
export function transportDetailPairs(t: TransportService): Array<[string, string]> {
  const days = transportDays(t);
  const pairs: Array<[string, string]> = [
    ["Service", t.transport_type || "—"],
    ["Route", transportRoute(t) || "—"],
    [
      "Dates",
      days > 1
        ? `${formatDate(t.start_date)} → ${formatDate(t.end_date)} (${days} days)`
        : formatDate(t.start_date),
    ],
  ];
  if (t.pickup_time) pairs.push(["Pickup time", t.pickup_time]);
  if (t.drop_time) pairs.push(["Drop time", t.drop_time]);
  if (t.vehicle_type)
    pairs.push([
      "Vehicle",
      `${t.vehicle_type}${t.is_ac === false ? " · Non-AC" : " · AC"}${
        t.vehicle_capacity ? ` · ${t.vehicle_capacity} seater` : ""
      }`,
    ]);
  if (t.vehicle_registration) pairs.push(["Registration", t.vehicle_registration]);
  if (Number(t.passengers ?? 0) > 0) pairs.push(["Passengers", String(t.passengers)]);
  if (t.driver_name)
    pairs.push(["Driver", `${t.driver_name}${t.driver_phone ? ` · ${t.driver_phone}` : ""}`]);
  else if (t.driver_phone) pairs.push(["Driver phone", t.driver_phone]);
  if (t.suppliers?.name) pairs.push(["Supplier", t.suppliers.name]);
  if (t.confirmation_number) pairs.push(["Confirmation", t.confirmation_number]);
  if (t.route_notes) pairs.push(["Route notes", t.route_notes]);
  return pairs;
}
