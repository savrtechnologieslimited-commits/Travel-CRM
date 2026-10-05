import type { DayPlan, TripPlan } from "@/lib/travel-planner-engine";

const clean = (value: string | null | undefined) => value?.trim() ?? "";
const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const LODGING_TERMS = /\b(?:hotels?|accommodations?|lodges?|hostels?|resorts?|check[ -]in|check[ -]out)\b/i;

function customerCopy(value: string | null | undefined, lodgingRequested: boolean) {
  const text = clean(value);
  return !lodgingRequested && LODGING_TERMS.test(text) ? "" : text;
}

export function travelPlanDayDescription(day: DayPlan, lodgingRequested = false): string {
  const blocks: string[] = [];
  const morning = day.morning.map((entry) => customerCopy(entry, lodgingRequested)).filter(Boolean);
  const afternoon = day.afternoon.map((entry) => customerCopy(entry, lodgingRequested)).filter(Boolean);
  const evening = day.evening.map((entry) => customerCopy(entry, lodgingRequested)).filter(Boolean);
  if (morning.length) blocks.push(`Morning: ${morning.join(" ")}`);
  if (afternoon.length) blocks.push(`Afternoon: ${afternoon.join(" ")}`);
  if (evening.length) blocks.push(`Evening: ${evening.join(" ")}`);
  return blocks.join("\n\n") || customerCopy(day.title, lodgingRequested);
}

export function travelPlanToDocumentText(plan: TripPlan, requirements = ""): string {
  const lodgingRequested = LODGING_TERMS.test(requirements);
  const summary = plan.trip_summary;
  const lines = [
    "YOUR TRIP AT A GLANCE",
    `Destination: ${summary.destination}`,
    `Duration: ${summary.duration_days} days / ${summary.nights} nights`,
    summary.travellers ? `Travellers: ${summary.travellers}` : "",
    customerCopy(summary.overview, lodgingRequested),
    "",
    "YOUR ROUTE",
    ...plan.route.map((leg) => customerCopy(`${leg.city} — ${leg.nights} ${leg.nights === 1 ? "night" : "nights"} (Days ${leg.arrival_day}–${leg.departure_day}). ${leg.rationale}`, lodgingRequested)),
    "",
    "DAY-BY-DAY ITINERARY",
  ].filter((line) => line !== "");
  for (const day of plan.days) {
    const routeCity = plan.route.find((leg) => day.day >= leg.arrival_day && day.day <= leg.departure_day)?.city;
    const city = clean(day.city) || routeCity || "Travel day";
    lines.push(`DAY ${day.day}${day.date ? ` — ${day.date}` : ""} — ${city}`, customerCopy(day.title, lodgingRequested));
    const dayIntro = customerCopy(day.why_this_day, lodgingRequested);
    if (dayIntro && normalize(dayIntro) !== normalize(day.title)) lines.push(dayIntro);
    const morning = day.morning.map((entry) => customerCopy(entry, lodgingRequested)).filter(Boolean);
    const afternoon = day.afternoon.map((entry) => customerCopy(entry, lodgingRequested)).filter(Boolean);
    const evening = day.evening.map((entry) => customerCopy(entry, lodgingRequested)).filter(Boolean);
    if (morning.length) lines.push("Morning", ...morning);
    if (afternoon.length) lines.push("Afternoon", ...afternoon);
    if (evening.length) lines.push("Evening", ...evening);
    const dayNarrative = normalize([
      ...morning,
      ...afternoon,
      ...evening,
    ].join(" "));
    const activities = plan.activities.filter((activity) => activity.day === day.day);
    for (const activity of activities) {
      const activityName = normalize(activity.name);
      if (activityName && dayNarrative.includes(activityName)) continue;
      const time = activity.start_time && activity.end_time ? ` (${activity.start_time}–${activity.end_time})` : "";
      const duration = activity.duration ? ` (${activity.duration})` : "";
      const additionalExperience = customerCopy(`An additional experience to consider: ${activity.name}${time}${duration}. ${activity.reason}`, lodgingRequested);
      if (additionalExperience) lines.push(additionalExperience);
    }
    const transfers = plan.transfers.filter((transfer) => transfer.day === day.day);
    for (const transfer of transfers) {
      const from = normalize(transfer.from);
      const to = normalize(transfer.to);
      const mentionsFrom = Boolean(from) && dayNarrative.includes(from);
      const mentionsTo = Boolean(to) && dayNarrative.includes(to);
      if (mentionsFrom && mentionsTo) continue;
      lines.push(`Continue onward from ${transfer.from} to ${transfer.to}; confirm the transport mode and timing before travel.`);
    }
    lines.push("");
  }
  const assumptions = plan.assumptions.map((entry) => customerCopy(entry, lodgingRequested)).filter(Boolean);
  const warnings = plan.warnings.map((entry) => customerCopy(entry, lodgingRequested)).filter(Boolean);
  if (assumptions.length) lines.push("PLANNING NOTES", ...assumptions, "");
  if (warnings.length) lines.push("TRAVEL NOTES", ...warnings, "");
  return lines.map(clean).join("\n").trim();
}
