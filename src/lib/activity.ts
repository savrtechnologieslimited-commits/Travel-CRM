import { formatDate } from "@/lib/crm";

/**
 * Activity / sightseeing vocabulary. Kept small and operational, and mirrored
 * by CHECK constraints on public.activity_services so the database stays
 * authoritative.
 */
export const ACTIVITY_TYPES = [
  "Sightseeing",
  "Attraction",
  "Guided Tour",
  "Adventure",
  "Water Activity",
  "Cultural Experience",
  "Entertainment",
  "Excursion",
  "Other",
] as const;

export type ActivityService = {
  activity_name?: string | null;
  activity_type?: string | null;
  location?: string | null;
  city?: string | null;
  activity_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_hours?: number | null;
  adults?: number | null;
  children?: number | null;
  meeting_point?: string | null;
  confirmation_number?: string | null;
  status?: string | null;
  notes?: string | null;
  suppliers?: { name?: string | null } | null;
};

/** activity_services arrives as a one-element array from embedded selects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function activityOf(item: any): any {
  const a = item?.activity_services;
  return Array.isArray(a) ? (a[0] ?? null) : (a ?? null);
}

/** Service-line title, e.g. "Kerala Backwater Tour — Alleppey". */
export function activityTitle(a: ActivityService) {
  const name = a.activity_name || a.activity_type || "Activity";
  return a.location ? `${name} — ${a.location}` : name;
}

/** Participants summary, e.g. "2 adults, 1 child". */
export function activityParticipants(a: ActivityService) {
  const adults = Number(a.adults ?? 0);
  const children = Number(a.children ?? 0);
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} adult${adults === 1 ? "" : "s"}`);
  if (children > 0) parts.push(`${children} child${children === 1 ? "" : "ren"}`);
  return parts.join(", ");
}

/** One-liner used in lists, quotation documents and vouchers. */
export function activityLine(a: ActivityService) {
  const time =
    a.start_time && a.end_time
      ? `${a.start_time} – ${a.end_time}`
      : a.start_time
        ? `From ${a.start_time}`
        : null;
  return [
    formatDate(a.activity_date),
    time,
    a.duration_hours ? `${Number(a.duration_hours)} hrs` : null,
    activityParticipants(a) || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Operational detail pairs used by the booking panel, quotation panel,
 * vouchers and quotation documents. Purely presentational — no pricing.
 */
export function activityDetailPairs(a: ActivityService): Array<[string, string]> {
  const pairs: Array<[string, string]> = [
    ["Activity", a.activity_name || "—"],
    ["Type", a.activity_type || "—"],
  ];
  if (a.location) pairs.push(["Location", a.location]);
  if (a.city) pairs.push(["City", a.city]);
  pairs.push(["Date", formatDate(a.activity_date)]);
  if (a.start_time) pairs.push(["Start time", a.start_time]);
  if (a.end_time) pairs.push(["End time", a.end_time]);
  if (a.duration_hours) pairs.push(["Duration", `${Number(a.duration_hours)} hrs`]);
  const participants = activityParticipants(a);
  if (participants) pairs.push(["Participants", participants]);
  if (a.meeting_point) pairs.push(["Meeting point", a.meeting_point]);
  if (a.suppliers?.name) pairs.push(["Supplier", a.suppliers.name]);
  if (a.confirmation_number) pairs.push(["Confirmation", a.confirmation_number]);
  return pairs;
}
