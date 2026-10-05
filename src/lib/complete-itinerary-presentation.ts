import type { CompleteItineraryPlan } from "./ai-complete-itinerary.server";
import type { ItineraryTicketFacts } from "./itinerary-ticket-sources";

export function sanitizeCompletePlanForPreferences(plan: CompleteItineraryPlan, requirements: string): CompleteItineraryPlan {
  const request = requirements.toLocaleLowerCase();
  const result = structuredClone(plan);
  const restricted: Array<[RegExp, RegExp]> = [
    [/\b(?:shopping|shops?|bazaar|marketplace|local\s+markets?|street\s+markets?)\b/i, /\b(?:shopping|shop|bazaar|market)\b/i],
    [/\b(?:restaurant|caf[eé]|dining|food|culinary|local\s+cuisine|street\s+food)\b/i, /\b(?:food|cuisine|culinary|restaurant|dining|eat|gastronom)\b/i],
    [/\b(?:nightlife|nightclubs?|night clubs?|pub crawl|bar hopping)\b/i, /\b(?:nightlife|nightclubs?|night clubs?|pub|bar)\b/i],
    [/\b(?:zoo|wildlife|safari|animal park)\b/i, /\b(?:wildlife|zoo|animal|nature)\b/i],
    [/\b(?:beach|snorkel|scuba|water sports?)\b/i, /\b(?:beach|snorkel|scuba|water sports?)\b/i],
    [/\b(?:adventure|trek(?:king)?|rafting|paragliding|zip[- ]?line)\b/i, /\b(?:adventure|trek|rafting|paragliding|zip[- ]?line)\b/i],
    [/\b(?:spa|wellness retreat)\b/i, /\b(?:spa|wellness|relaxation)\b/i],
  ];
  const unsupported = (text: string) => restricted.some(([generated, requested]) => generated.test(text) && !requested.test(request))
    || /\bif available\b|\bsubject to availability\b/i.test(text);
  for (const day of result.days) {
    day.morning = day.morning.filter((entry) => !unsupported(entry));
    day.afternoon = day.afternoon.filter((entry) => !unsupported(entry));
    day.evening = day.evening.filter((entry) => !unsupported(entry));
    day.meals = day.meals.filter((entry) => !unsupported(entry));
    day.free_time = day.free_time.filter((entry) => !unsupported(entry));
    day.notes = day.notes.filter((entry) => !unsupported(entry));
  }
  if (!/\b(?:food|cuisine|culinary|restaurant|dining|eat|gastronom|breakfast|lunch|dinner|meal plan)\b/i.test(request)) {
    for (const day of result.days) day.meals = [];
  }
  result.hotel_requirements = result.hotel_requirements.filter((entry) => !unsupported(entry));
  result.transfer_requirements = result.transfer_requirements.filter((entry) => !unsupported(entry));
  return result;
}

function safeTicketLine(ticket: ItineraryTicketFacts): string[] {
  const fields: Array<[string, string | undefined]> = ticket.kind === "flight"
    ? [
        ["Airline", ticket.serviceName], ["Flight number", ticket.serviceNumber], ["Departure date", ticket.date],
        ["Departure time", ticket.departureTime], ["From", ticket.departureLocation], ["Arrival date", ticket.arrivalDate],
        ["Arrival time", ticket.arrivalTime], ["To", ticket.arrivalLocation], ["Class", ticket.travelClass],
      ]
    : [
        ["Train", ticket.serviceName], ["Train number", ticket.serviceNumber], ["Departure date", ticket.date],
        ["Departure time", ticket.departureTime], ["From station", ticket.departureLocation], ["Arrival date", ticket.arrivalDate],
        ["Arrival time", ticket.arrivalTime], ["To station", ticket.arrivalLocation], ["Class", ticket.travelClass],
      ];
  return fields.flatMap(([label, value]) => value ? [`${label}: ${value}`] : []);
}

export function completeItineraryPlanToText(
  plan: CompleteItineraryPlan,
  tickets: ItineraryTicketFacts[],
  options: { includeHotelRecommendations?: boolean } = {},
): string {
  const includeHotelRecommendations = options.includeHotelRecommendations ?? true;
  const summary = plan.trip_summary;
  const lines = [
    "TRIP SUMMARY",
    `Destination: ${summary.destination}`,
    `Duration: ${summary.days} days / ${summary.nights} nights`,
    summary.start_date && summary.end_date ? `Travel dates: ${summary.start_date} – ${summary.end_date}` : "",
    `Travellers: ${[
      summary.adults == null ? "" : `${summary.adults} adults`,
      summary.children == null ? "" : `${summary.children} children`,
      summary.infants == null ? "" : `${summary.infants} infants`,
    ].filter(Boolean).join(", ") || "Not specified"}`,
    summary.route ? `Route: ${summary.route}` : "",
    summary.travel_style ? `Travel style: ${summary.travel_style}` : "",
  ].filter(Boolean);
  if (summary.child_ages) lines.push(`Children's ages: ${summary.child_ages}`);
  if (summary.assumptions.length) lines.push("Planning notes", ...summary.assumptions);
  const confirmedTickets = tickets.filter((ticket) => ticket.kind === "flight" || ticket.kind === "train");
  if (confirmedTickets.length) {
    lines.push("TRAVEL DETAILS");
    confirmedTickets.forEach((ticket) => lines.push(ticket.kind === "flight" ? "Flight" : "Train", ...safeTicketLine(ticket)));
  }
  lines.push("ITINERARY");
  const dayHotelDetails: string[] = [];
  const dayTransferDetails: string[] = [];
  for (const day of plan.days) {
    lines.push(`DAY ${day.day_number}${day.date ? ` — ${day.date}` : ""} — ${day.city}`, day.title);
    if (day.morning.length) lines.push(`Morning: ${day.morning.join(" ")}`);
    if (day.afternoon.length) lines.push(`Afternoon: ${day.afternoon.join(" ")}`);
    if (day.evening.length) lines.push(`Evening: ${day.evening.join(" ")}`);
    if (day.saved_services?.length) {
      for (const service of day.saved_services) {
        const detail = service.details.map((entry) => entry.replace(/^(?:Hotel|City|Address|Check-in|Check-out|Date|Location|Description|Route|Destination|Transfer type|Pickup time|Arrival time|Start time|End time|Travel duration):\s*/i, "")).filter(Boolean).join(" · ");
        const line = service.item_type === "ACCOMMODATION" ? `Stay: ${service.title}${detail ? ` (${detail})` : ""}` : `${service.title}${detail ? ` — ${detail}` : ""}`;
        lines.push(service.item_type === "ACCOMMODATION" ? line : `Included: ${line}`);
      }
    }
    if (day.transfers.length) {
      dayTransferDetails.push(...day.transfers);
      lines.push(`Suggested transport: ${day.transfers.join(" ")}`);
    }
    if (day.hotel_requirement && includeHotelRecommendations) {
      dayHotelDetails.push(day.hotel_requirement);
      if (!day.saved_services?.some((service) => service.item_type === "ACCOMMODATION")) lines.push(`Recommended stay: ${day.hotel_requirement}`);
    }
    if (day.meals.length) lines.push(`Meal suggestions: ${day.meals.join(" ")}`);
    if (day.free_time.length) lines.push(`Leisure: ${day.free_time.join(" ")}`);
    if (day.notes.length) lines.push(...day.notes);
  }
  const uniqueHotels = includeHotelRecommendations
    ? plan.hotel_requirements.filter((item) => !dayHotelDetails.some((dayItem) => dayItem.toLocaleLowerCase() === item.toLocaleLowerCase()))
    : [];
  if (uniqueHotels.length) lines.push("ACCOMMODATION RECOMMENDATIONS", ...uniqueHotels.map((item) => `Recommended: ${item}`));
  const uniqueTransfers = plan.transfer_requirements.filter((item) => !dayTransferDetails.some((dayItem) => dayItem.toLocaleLowerCase() === item.toLocaleLowerCase()));
  if (uniqueTransfers.length) lines.push("SUGGESTED TRANSPORT", ...uniqueTransfers.map((item) => `Suggested: ${item}`));
  if (plan.unresolved_questions.length) lines.push("TO CONFIRM", ...plan.unresolved_questions);
  return lines.join("\n");
}
