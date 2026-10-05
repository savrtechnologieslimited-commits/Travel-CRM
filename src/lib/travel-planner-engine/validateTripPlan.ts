import { addDays, dateOnly, diffDays, timeOnly, toMinutes } from "./dates";
import type { PlanActivity, TripPlan } from "./schema";
import type { HotelFact, TransportFact } from "./types";

export type Severity = "error" | "warning";
export interface ValidationIssue { code: string; severity: Severity; message: string }
export interface ValidationResult { valid: boolean; issues: ValidationIssue[] }
export interface ValidationContext {
  expectedDays?: number | null; expectedNights?: number | null; startDate?: string | null; transport?: TransportFact[];
  hotels?: HotelFact[]; servicesConfirmed?: boolean; travelStyle?: string | null;
}
export const BUFFERS = { arrival: 90, departureFlight: 240, departureTrain: 150, intercityBefore: 120, intercityAfter: 60 };
const PERIOD_START = { morning: 540, afternoon: 780, evening: 1050 } as const;
const norm = (s: string) => s.trim().toLowerCase();
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function windowOf(a: PlanActivity): { start: number; end: number } {
  const s = toMinutes(a.start_time); const e = toMinutes(a.end_time); const start = s ?? PERIOD_START[a.time_period]; return { start, end: e ?? start + 60 };
}
function collectText(node: unknown, out: string[] = [], key = ""): string[] {
  if (typeof node === "string") { if (key !== "id" && !key.endsWith("_id") && !key.endsWith("_ids") && key !== "fixed_service_ref") out.push(node); }
  else if (Array.isArray(node)) node.forEach((n) => collectText(n, out, key));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) collectText(v, out, k);
  return out;
}
const CURRENCY = /(₹|\$|€|£|\b(?:INR|USD|AED|EUR|GBP|Rs\.?)\s?\d|\d[\d,.]*\s?(?:INR|USD|AED|EUR|GBP|rupees|dirhams|dollars)\b)/i;
const FINANCE_WORDS = /\b(markup|mark-up|margin|supplier cost|selling price|net rate|commission)\b/i;
const SOFT_FINANCE = /\b(price[sd]?|pricing|costs?)\b/i;
const CONFIRM_WORDS = /\b(booked|confirmed|confirmation|reserved|guaranteed)\b/i;
const INTERNAL_WORDS = /(planned activity|hotel requirement|not booked|transfer requirement)/i;
const TICKET_REF = /\b(?:[Ff]light|[Tt]rain)\s+(?:no\.?\s*|number\s*|#)?((?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4}|\d{4,5})\b/g;

export function validateTripPlan(plan: TripPlan, ctx: ValidationContext = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (code: string, severity: Severity, message: string) => issues.push({ code, severity, message });
  const err = (c: string, m: string) => add(c, "error", m); const warn = (c: string, m: string) => add(c, "warning", m);
  const days = [...plan.days].sort((a, b) => a.day - b.day); const total = days.length;
  if (total === 0) err("NO_DAYS", "The plan contains no days.");
  if (ctx.expectedDays != null && total !== ctx.expectedDays) err("DAY_COUNT_MISMATCH", `Plan has ${total} days but ${ctx.expectedDays} were requested.`);
  days.forEach((d, i) => { if (d.day !== i + 1) err("DAY_SEQUENCE", `Day numbers must run 1..${total} without gaps; found day ${d.day} at position ${i + 1}.`); });
  if (plan.trip_summary.duration_days !== total) err("SUMMARY_MISMATCH", `trip_summary.duration_days is ${plan.trip_summary.duration_days} but the plan has ${total} days.`);
  const nightsActual = days.filter((d) => d.overnight_city).length;
  const nightsExpected = ctx.expectedNights ?? (ctx.expectedDays != null ? Math.max(ctx.expectedDays - 1, 0) : Math.max(total - 1, 0));
  if (nightsActual !== nightsExpected) err("NIGHT_COUNT_MISMATCH", `Plan has ${nightsActual} overnight stays but ${nightsExpected} nights are expected.`);
  if (plan.trip_summary.nights !== nightsExpected) err("SUMMARY_MISMATCH", `trip_summary.nights is ${plan.trip_summary.nights} but ${nightsExpected} nights are expected.`);
  days.forEach((d, i) => { if (i < nightsExpected && !d.overnight_city) err("MISSING_OVERNIGHT_CITY", `Day ${d.day} has no overnight city.`); if (i >= nightsExpected && d.overnight_city) err("LAST_DAY_HAS_OVERNIGHT", `Day ${d.day} is a departure day but has overnight city "${d.overnight_city}".`); });
  const dated = days.filter((d) => d.date);
  for (let i = 1; i < dated.length; i++) if (diffDays(dated[i - 1].date!, dated[i].date!) !== dated[i].day - dated[i - 1].day) err("DATE_SEQUENCE", `Dates are not consecutive around day ${dated[i].day}.`);
  if (!ctx.startDate && dated.length) warn("DATE_INVENTED", "Dates were provided although no start date was supplied.");
  if (ctx.startDate) days.forEach((d, i) => { if (d.date !== addDays(ctx.startDate!, i)) err("DATE_MISMATCH", `Day ${d.day} should be ${addDays(ctx.startDate!, i)}.`); });
  const runs: { city: string; firstNight: number; nights: number }[] = [];
  for (const d of days) { if (!d.overnight_city) continue; const last = runs[runs.length - 1]; if (last && norm(last.city) === norm(d.overnight_city) && last.firstNight + last.nights === d.day) last.nights++; else runs.push({ city: d.overnight_city, firstNight: d.day, nights: 1 }); }
  const routeSum = plan.route.reduce((s, r) => s + r.nights, 0);
  if (routeSum !== nightsExpected) err("ROUTE_NIGHTS_MISMATCH", `Route nights add up to ${routeSum}, expected ${nightsExpected}.`);
  const routeOk = plan.route.length === runs.length && plan.route.every((r, i) => norm(r.city) === norm(runs[i].city) && r.nights === runs[i].nights && r.arrival_day === runs[i].firstNight);
  if (!routeOk) err("ROUTE_INCONSISTENT", "Route does not match the overnight cities of the days.");
  const stays = [...plan.hotel_stays].sort((a, b) => a.check_in_day - b.check_in_day); const before = issues.length;
  for (let i = 0; i < stays.length; i++) { const s = stays[i]; if (s.nights !== s.check_out_day - s.check_in_day) err("HOTEL_NIGHTS_MISMATCH", `Hotel stay in ${s.city} claims ${s.nights} nights but check-in day ${s.check_in_day} to check-out day ${s.check_out_day} is ${s.check_out_day - s.check_in_day}.`); const nx = stays[i + 1]; if (!nx) continue; if (nx.check_in_day < s.check_out_day) err("HOTEL_DATE_OVERLAP", `Hotel stays in ${s.city} and ${nx.city} overlap.`); else if (nx.check_in_day > s.check_out_day) err("HOTEL_GAP", `No hotel stay covers days ${s.check_out_day} to ${nx.check_in_day}.`); if (norm(s.city) === norm(nx.city) && nx.check_in_day === s.check_out_day) err("HOTEL_NOT_CONSOLIDATED", `Consecutive nights in ${s.city} must be one hotel stay, not two.`); }
  if (issues.length === before) { const ok = stays.length === runs.length && stays.every((s, i) => norm(s.city) === norm(runs[i].city) && s.check_in_day === runs[i].firstNight && s.check_out_day === runs[i].firstNight + runs[i].nights); if (!ok) err("HOTEL_STAY_MISMATCH", "Hotel stays do not match the overnight city of each day (check-in/check-out days or cities differ)."); }
  const suppliedRefs = new Set((ctx.hotels ?? []).map((h) => h.reference));
  for (const s of plan.hotel_stays) { if (s.hotel_selected && (!s.hotel_reference || !suppliedRefs.has(s.hotel_reference))) err("HOTEL_FABRICATED", `Hotel stay in ${s.city} is marked as selected but no supplied hotel matches its reference.`); if (!s.hotel_selected && s.hotel_reference) warn("HOTEL_REFERENCE_UNSELECTED", `Hotel stay in ${s.city} has a reference but hotel_selected is false.`); }
  const actById = new Map(plan.activities.map((a) => [a.id, a])); const trById = new Map(plan.transfers.map((t) => [t.id, t]));
  if (actById.size !== plan.activities.length) err("DUPLICATE_ID", "Activity ids are not unique.");
  for (const d of days) { for (const id of d.activity_ids) { const a = actById.get(id); if (!a) err("REFERENCE_ERROR", `Day ${d.day} references unknown activity "${id}".`); else if (a.day !== d.day) err("REFERENCE_ERROR", `Activity "${a.name}" is listed on day ${d.day} but belongs to day ${a.day}.`); } for (const id of d.transfer_ids) { const t = trById.get(id); if (!t) err("REFERENCE_ERROR", `Day ${d.day} references unknown transfer "${id}".`); else if (t.day !== d.day) err("REFERENCE_ERROR", `Transfer "${t.id}" is listed on day ${d.day} but belongs to day ${t.day}.`); } }
  for (const a of plan.activities) { if (a.day < 1 || a.day > total) err("ACTIVITY_DAY_INVALID", `Activity "${a.name}" is on day ${a.day}, outside the trip.`); else if (!days[a.day - 1].activity_ids.includes(a.id)) err("REFERENCE_ERROR", `Activity "${a.name}" is not listed on day ${a.day}.`); }
  for (const a of plan.activities) { const bad = (a.start_time && toMinutes(a.start_time) === null) || (a.end_time && toMinutes(a.end_time) === null); if (bad) err("ACTIVITY_TIME_INVALID", `Activity "${a.name}" has an invalid time (expected HH:MM).`); const s = toMinutes(a.start_time), e = toMinutes(a.end_time); if (s !== null && e !== null && e <= s) err("ACTIVITY_TIME_INVALID", `Activity "${a.name}" ends (${a.end_time}) before it starts (${a.start_time}).`); }
  for (let day = 1; day <= total; day++) { const list = plan.activities.filter((a) => a.day === day && toMinutes(a.start_time) !== null && toMinutes(a.end_time) !== null).sort((x, y) => toMinutes(x.start_time)! - toMinutes(y.start_time)!); for (let i = 1; i < list.length; i++) if (toMinutes(list[i].start_time)! < toMinutes(list[i - 1].end_time)!) err("ACTIVITY_OVERLAP", `Day ${day}: "${list[i - 1].name}" (${list[i - 1].start_time}-${list[i - 1].end_time}) overlaps "${list[i].name}" (${list[i].start_time}-${list[i].end_time}).`); }
  const seen = new Set<string>(); for (const a of plan.activities) { const k = norm(a.name); if (seen.has(k)) warn("DUPLICATE_ACTIVITY", `"${a.name}" appears more than once.`); seen.add(k); }
  if (/relax|leisure|slow|senior|easy/i.test(ctx.travelStyle ?? plan.trip_summary.travel_style ?? "")) for (let day = 1; day <= total; day++) { const n = plan.activities.filter((a) => a.day === day).length; if (n > 3) warn("PACING_TOO_DENSE", `Day ${day} has ${n} activities for a relaxed trip.`); }
  const transport = ctx.transport ?? [];
  if (transport.length && !ctx.startDate) warn("FIXED_SERVICES_UNCHECKED", "Flight/train times could not be checked against the plan because the trip start date is unknown.");
  if (ctx.startDate) for (const t of transport) {
    const arrDay = diffDays(ctx.startDate, dateOnly(t.arrival)) + 1; const depDay = diffDays(ctx.startDate, dateOnly(t.departure)) + 1; const role = t.role ?? (arrDay <= 1 ? "arrival" : depDay >= total ? "departure" : "intercity"); const label = `${t.mode} ${t.number ?? t.id}`;
    if (role === "arrival") { const arrMin = toMinutes(timeOnly(t.arrival)); if (arrMin === null) continue; const earliest = arrMin + BUFFERS.arrival; for (const a of plan.activities.filter((x) => x.day === arrDay)) if (windowOf(a).start < earliest) err("ACTIVITY_BEFORE_ARRIVAL", `Day ${arrDay}: "${a.name}" starts too early. ${label} arrives ${timeOnly(t.arrival)}, so the earliest realistic start is ${hhmm(earliest)}.`); for (const a of plan.activities.filter((x) => x.day < arrDay)) err("ACTIVITY_BEFORE_ARRIVAL", `"${a.name}" is on day ${a.day}, before arrival on day ${arrDay}.`); if (arrMin >= 12 * 60 && plan.activities.filter((x) => x.day === arrDay).length > 2) warn("ARRIVAL_DAY_TOO_FULL", `Day ${arrDay} has a late arrival but more than two activities.`); }
    else if (role === "departure") { const depMin = toMinutes(timeOnly(t.departure)); if (depMin === null) continue; const cutoff = depMin - (t.mode === "flight" ? BUFFERS.departureFlight : BUFFERS.departureTrain); for (const a of plan.activities.filter((x) => x.day === depDay)) if (windowOf(a).end > cutoff) err("ACTIVITY_AFTER_DEPARTURE_CUTOFF", `Day ${depDay}: "${a.name}" runs past ${hhmm(cutoff)}. ${label} departs ${timeOnly(t.departure)}, so sightseeing must finish by then.`); for (const a of plan.activities.filter((x) => x.day > depDay)) err("ACTIVITY_AFTER_DEPARTURE_CUTOFF", `"${a.name}" is on day ${a.day}, after departure on day ${depDay}.`); if (depDay < total) err("DEPARTURE_BEFORE_TRIP_END", `${label} departs on day ${depDay} but the plan runs to day ${total}.`); }
    else if (dateOnly(t.departure) === dateOnly(t.arrival)) { const dep = toMinutes(timeOnly(t.departure)), arr = toMinutes(timeOnly(t.arrival)); if (dep === null || arr === null) continue; for (const a of plan.activities.filter((x) => x.day === depDay)) { const w = windowOf(a); if (w.end > dep - BUFFERS.intercityBefore && w.start < arr + BUFFERS.intercityAfter) err("TRANSPORT_CONFLICT", `Day ${depDay}: "${a.name}" clashes with ${label} (${timeOnly(t.departure)}-${timeOnly(t.arrival)}).`); } }
  }
  const all = collectText({ ...plan, understood_request: undefined }).join("\n");
  if (CURRENCY.test(all) || FINANCE_WORDS.test(all)) err("PRICE_LEAK", "Plan text contains prices, costs or commercial terms. These must never appear."); else if (SOFT_FINANCE.test(all)) warn("PRICE_WORDING", 'Plan text mentions "price" or "cost"; check it does not expose commercial information.');
  if (!ctx.servicesConfirmed && CONFIRM_WORDS.test(all)) warn("CONFIRMATION_LANGUAGE", "Plan text implies a service is booked or confirmed, but none was stated as confirmed.");
  if (INTERNAL_WORDS.test(all)) warn("INTERNAL_LANGUAGE", "Plan text contains internal wording that should not be customer-facing.");
  const supplied = new Set(transport.map((t) => (t.number ?? "").replace(/\s+/g, "").toUpperCase()).filter(Boolean));
  for (const m of all.matchAll(TICKET_REF)) { const ref = m[1].replace(/\s+/g, "").toUpperCase(); if (!supplied.has(ref)) err("TICKET_FACT_MISMATCH", `Plan mentions "${m[0]}", which is not a supplied flight/train number.`); }
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}
