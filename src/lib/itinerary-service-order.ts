type SchedulableItineraryItem = {
  item_type: string;
  departure_time?: string | null;
  sequence?: number | null;
  metadata?: Record<string, unknown>;
};

type SchedulableItineraryRecord<T extends SchedulableItineraryItem> = {
  item: T;
  itemIndex: number;
  day: { date: string };
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function scheduleTimestamp<T extends SchedulableItineraryItem>(record: SchedulableItineraryRecord<T>) {
  const activityDate = record.item.item_type === "ACTIVITY" || record.item.item_type === "SIGHTSEEING"
    ? record.item.metadata?.["activity_date"]
    : null;
  const date = typeof activityDate === "string" && validDate(activityDate) ? activityDate : record.day.date;
  const parsedDate = validDate(date) ? date : "9999-12-31";
  const time = record.item.departure_time ?? "";
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const minutes = match && Number(match[1]) < 24 && Number(match[2]) < 60
    ? Number(match[1]) * 60 + Number(match[2])
    : 24 * 60;
  return Date.parse(`${parsedDate}T00:00:00.000Z`) + minutes * 60_000;
}

/** Sorts activities and transfers by scheduled date/time, keeping unscheduled ties stable. */
export function sortItineraryServicesChronologically<T extends SchedulableItineraryItem>(
  records: SchedulableItineraryRecord<T>[],
) {
  return [...records].sort((left, right) => {
    const scheduleDifference = scheduleTimestamp(left) - scheduleTimestamp(right);
    if (scheduleDifference !== 0) return scheduleDifference;
    const sequenceDifference = Number(left.item.sequence ?? left.itemIndex) - Number(right.item.sequence ?? right.itemIndex);
    return sequenceDifference || left.itemIndex - right.itemIndex;
  });
}