export type TripDayDateRecord = {
  day_number: number;
  date: string;
  title: string;
  description?: string;
  notes?: string;
  items?: unknown[];
};

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function totalCityStayNights(nights: string[]): number | null {
  if (nights.length === 0 || nights.some((value) => !/^\d+$/.test(value) || Number(value) < 1)) return null;
  return nights.reduce((total, value) => total + Number(value), 0);
}

export function shiftIsoDate(value: string, dayOffset: number): string {
  const date = parseIsoDate(value);
  if (!date || !Number.isInteger(dayOffset)) return "";
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export function buildTripDaysFromDateRange<T extends TripDayDateRecord>(
  startDate: string,
  endDate: string,
  existingDays: T[],
): T[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return existingDays;

  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (dayCount > 366) return existingDays;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    const existing = existingDays[index];
    return {
      ...(existing ?? ({} as T)),
      day_number: index + 1,
      date,
      title: existing?.title || `Day ${index + 1}`,
      description: existing?.description ?? "",
      notes: existing?.notes ?? "",
      items: existing?.items ?? [],
    } as T;
  });
}

export function formatTripDayDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return "Date pending";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
