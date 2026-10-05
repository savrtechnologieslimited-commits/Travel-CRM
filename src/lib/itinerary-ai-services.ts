import { formatTimeAmPm } from "./transfer-time";

export type AiServiceItem = {
  item_type: string;
  title: string;
  description?: string | null;
  hotel_name?: string | null;
  hotel_city?: string | null;
  hotel_address?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  location?: string | null;
  duration?: string | null;
  notes?: string | null;
  pickup?: string | null;
  dropoff?: string | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  vehicle_details?: string | null;
  extra_transport_type?: string | null;
  metadata?: Record<string, unknown>;
};

export type AiServiceDay = {
  day_number: number;
  date: string;
  items: AiServiceItem[];
};

export type AiSavedService = {
  day_number: number;
  date: string;
  item_type: string;
  title: string;
  details: string[];
};

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function buildSavedServicesForAi(days: AiServiceDay[], activitiesEnabled: boolean, hotelsEnabled = false) {
  if (!activitiesEnabled && !hotelsEnabled) return { entries: [] as AiSavedService[], prompt: "", editableText: "" };

  const entries = days.flatMap((day) => {
    const orderedItems = [...day.items].sort((left, right) => {
      const leftIsHotel = left.item_type === "ACCOMMODATION";
      const rightIsHotel = right.item_type === "ACCOMMODATION";
      return Number(leftIsHotel) - Number(rightIsHotel);
    });

    return orderedItems.flatMap((item) => {
    const isTransfer = item.item_type === "TRANSPORT" && item.metadata?.["transfer_saved"] === true;
    const isActivity = (item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING") && item.metadata?.["activity_saved"] === true;
    const isHotel = hotelsEnabled && item.item_type === "ACCOMMODATION" && Boolean(item.hotel_name?.trim());
    if (!(activitiesEnabled && (isTransfer || isActivity)) && !isHotel) return [];

    const metadata = item.metadata ?? {};
    const details = isHotel
      ? [
          text(item.hotel_name) ? `Hotel: ${text(item.hotel_name)}` : "",
          text(item.hotel_city) ? `City: ${text(item.hotel_city)}` : "",
          text(item.hotel_address) ? `Address: ${text(item.hotel_address)}` : "",
          text(item.check_in) ? `Check-in: ${text(item.check_in)}` : "",
          text(metadata["check_in_time"]) ? `Check-in time: ${formatTimeAmPm(text(metadata["check_in_time"])) || text(metadata["check_in_time"])}` : "",
          text(item.check_out) ? `Check-out: ${text(item.check_out)}` : "",
          text(metadata["check_out_time"]) ? `Check-out time: ${formatTimeAmPm(text(metadata["check_out_time"])) || text(metadata["check_out_time"])}` : "",
          Array.isArray(metadata["room_details"]) && metadata["room_details"].length ? `Rooms: ${(metadata["room_details"] as Array<Record<string, unknown>>).map((room) => `${text(room["room_type"]) || "Room"} (${text(room["adults"])} adults${text(room["kids"]) ? `, ${text(room["kids"])} kids` : ""})`).join("; ")}` : "",
          text(item.description) ? `Description: ${text(item.description)}` : "",
          text(item.notes) ? `Notes: ${text(item.notes)}` : "",
        ].filter(Boolean)
      : isTransfer
      ? [
          `Date: ${text(day.date)}`,
          `Route: ${item.pickup === "Custom" ? text(metadata["transfer_custom_from"]) || "Custom" : text(item.pickup)}`,
          `Destination: ${item.dropoff === "Custom" ? text(metadata["transfer_custom_to"]) || "Custom" : text(item.dropoff)}`,
          `Transfer type: ${item.extra_transport_type === "Custom" ? text(metadata["transfer_custom_type"]) || "Custom" : text(item.extra_transport_type)}`,
          text(item.departure_time) ? `Pickup time: ${formatTimeAmPm(text(item.departure_time)) || text(item.departure_time)}` : "",
          text(item.arrival_time) ? `Arrival time: ${formatTimeAmPm(text(item.arrival_time)) || text(item.arrival_time)}` : "",
          text(item.duration) ? `Travel duration: ${text(item.duration)}` : "",
          text(item.notes) ? `Notes: ${text(item.notes)}` : "",
        ].filter(Boolean)
      : [
          `Date: ${text(metadata["activity_date"]) || text(day.date)}`,
          text(item.location) ? `Location: ${text(item.location)}` : "",
          text(item.description) ? `Description: ${text(item.description)}` : "",
          text(item.departure_time) ? `Start time: ${formatTimeAmPm(text(item.departure_time)) || text(item.departure_time)}` : "",
          text(item.arrival_time) ? `End time: ${formatTimeAmPm(text(item.arrival_time)) || text(item.arrival_time)}` : "",
          text(item.duration) ? `Duration: ${text(item.duration)}` : "",
          text(metadata["activity_type"]) ? `Activity type: ${text(metadata["activity_type"])}` : "",
          text(item.notes) ? `Notes: ${text(item.notes)}` : "",
        ].filter(Boolean);

    return [{ day_number: day.day_number, date: day.date, item_type: item.item_type, title: isHotel ? item.hotel_name || item.title : item.title, details }];
    });
  });

  return {
    entries,
    editableText: entries.length
      ? [entries.some((entry) => entry.item_type === "ACCOMMODATION") ? "SAVED ACTIVITIES, TRANSFERS AND HOTELS (EDIT THESE DETAILS AS NEEDED)" : "SAVED ACTIVITIES AND TRANSFERS (EDIT THESE DETAILS AS NEEDED)", ...entries.map((entry) => [
          `Day ${entry.day_number} (${entry.date}) — ${entry.title} [${entry.item_type}]`,
          ...entry.details.map((detail) => `  - ${detail}`),
        ].join("\n"))].join("\n\n")
      : "",
    prompt: entries.length
      ? `Use these saved activities, transfers and hotels as fixed trip requirements. Keep their names, dates, routes, stay details, room details, start/end times, travel durations, and supplied notes accurate. Do not omit, replace, reschedule, or invent details for these services. Organize the surrounding itinerary around them.\n${JSON.stringify(entries)}`
      : "",
  };
}
