export type TwelveHourTimeParts = { hour: string; minute: string; period: "AM" | "PM" };

export function timeToTwelveHour(value: string | null | undefined): TwelveHourTimeParts {
  const match = typeof value === "string" ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
  if (!match) return { hour: "", minute: "", period: "AM" };
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 > 23 || minute > 59) return { hour: "", minute: "", period: "AM" };
  return {
    hour: String(hour24 % 12 || 12),
    minute: match[2]!,
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

export function twelveHourToTime(hour: string, minute: string, period: string): string | null {
  if (!hour.trim() && !minute.trim()) return null;
  const hour12 = Number(hour);
  const minuteValue = Number(minute);
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12 || !Number.isInteger(minuteValue) || minuteValue < 0 || minuteValue > 59) return null;
  if (period !== "AM" && period !== "PM") return null;
  const hour24 = (hour12 % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minuteValue).padStart(2, "0")}`;
}

export function formatTimeAmPm(value: string | null | undefined) {
  const parts = timeToTwelveHour(value);
  return parts.hour ? `${parts.hour}:${parts.minute} ${parts.period}` : "";
}

export function parseDurationMinutes(value: string | null | undefined): number | null {
  const clean = value?.trim().toLowerCase();
  if (!clean) return null;
  const clock = /^(\d{1,3}):(\d{1,2})$/.exec(clean);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    return minutes < 60 ? hours * 60 + minutes : null;
  }

  const hours = /([0-9]+(?:\.[0-9]+)?)\s*(?:hours?|hrs?|h)\b/.exec(clean);
  const minutes = /([0-9]+(?:\.[0-9]+)?)\s*(?:minutes?|mins?|m)\b/.exec(clean);
  if (hours || minutes) {
    const total = Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0);
    return Number.isFinite(total) && total >= 0 ? Math.round(total) : null;
  }

  if (/^\d+$/.test(clean)) return Number(clean);
  return null;
}

export function durationToParts(value: string | null | undefined) {
  const totalMinutes = parseDurationMinutes(value);
  if (totalMinutes === null) return { hours: "", minutes: "" };
  return { hours: String(Math.floor(totalMinutes / 60)), minutes: String(totalMinutes % 60) };
}

export function durationFromParts(hours: string, minutes: string): string | null {
  if (!hours.trim() && !minutes.trim()) return null;
  const hourValue = hours.trim() ? Number(hours) : 0;
  const minuteValue = minutes.trim() ? Number(minutes) : 0;
  if (!Number.isInteger(hourValue) || hourValue < 0 || !Number.isInteger(minuteValue) || minuteValue < 0 || minuteValue > 59) return null;
  if (hourValue === 0 && minuteValue === 0) return "0 min";
  return [hourValue ? `${hourValue} hr` : "", minuteValue ? `${minuteValue} min` : ""].filter(Boolean).join(" ");
}

export function durationBetweenTimes(startTime: string | null | undefined, endTime: string | null | undefined): string | null {
  const start = typeof startTime === "string" ? /^(\d{1,2}):(\d{2})$/.exec(startTime) : null;
  const end = typeof endTime === "string" ? /^(\d{1,2}):(\d{2})$/.exec(endTime) : null;
  if (!start || !end) return null;
  const startHour = Number(start[1]);
  const startMinute = Number(start[2]);
  const endHour = Number(end[1]);
  const endMinute = Number(end[2]);
  if ([startHour, endHour].some((hour) => hour > 23) || [startMinute, endMinute].some((minute) => minute > 59)) return null;
  const startTotal = startHour * 60 + startMinute;
  let elapsed = endHour * 60 + endMinute - startTotal;
  if (elapsed < 0) elapsed += 24 * 60;
  return durationFromParts(String(Math.floor(elapsed / 60)), String(elapsed % 60));
}

export function addDurationToTime(startTime: string | null | undefined, duration: string | null | undefined): string | null {
  const match = typeof startTime === "string" ? /^(\d{1,2}):(\d{2})$/.exec(startTime) : null;
  const durationMinutes = parseDurationMinutes(duration);
  if (!match || durationMinutes === null) return null;
  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  if (startHour > 23 || startMinute > 59) return null;
  const totalMinutes = (startHour * 60 + startMinute + durationMinutes) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}
