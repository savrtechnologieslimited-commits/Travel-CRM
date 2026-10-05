import { useMemo, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, BedDouble, Bus, CalendarDays, Clock3, Coffee, FileText, MapPin, Plane, Ticket, Train, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDurationMinutes } from "@/lib/transfer-time";

export type TimelineItem = {
  id?: string;
  item_type: string;
  title: string;
  description?: string | null;
  location?: string | null;
  duration?: string | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  flight_departure_date?: string | null;
  flight_departure_time?: string | null;
  flight_arrival_date?: string | null;
  flight_arrival_time?: string | null;
  flight_duration?: string | null;
  hotel_option_label?: string | null;
  extra_transport_date?: string | null;
  extra_transport_pickup_time?: string | null;
  extra_transport_drop_time?: string | null;
  extra_transport_type?: string | null;
  pickup?: string | null;
  dropoff?: string | null;
  flight_airline?: string | null;
  flight_number?: string | null;
  departure_city?: string | null;
  arrival_city?: string | null;
  hotel_name?: string | null;
  hotel_city?: string | null;
  meal_type?: string | null;
  metadata?: Record<string, unknown>;
  sequence: number;
};

export type TimelineDay = {
  day_number: number;
  date: string;
  title: string;
  items: TimelineItem[];
};

export type TimelineEvent = {
  dayIndex: number;
  itemIndex: number;
  dayDate: string;
  item: TimelineItem;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  allDay: boolean;
  durationDays: number;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
};

export type ScheduleChange = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

type ViewMode = "day" | "week" | "trip";
const TIMELINE_OPTIONS = ["Option 1", "Option 2", "Option 3"] as const;

const HOUR_HEIGHT = 56;
const SNAP_MINUTES = 15;
const MS_PER_DAY = 86_400_000;

function validDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftDate(value: string, days: number) {
  if (!validDate(value)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(start: string, end: string) {
  if (!validDate(start) || !validDate(end)) return 1;
  return Math.max(1, Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / MS_PER_DAY));
}

function minutes(value: string | null | undefined) {
  const match = typeof value === "string" ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function timeFromMinutes(value: number) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function dateTimeFromOffset(date: string, time: string, offsetMinutes: number) {
  const initial = minutes(time) ?? 0;
  const absolute = initial + offsetMinutes;
  const dayOffset = Math.floor(absolute / 1440);
  return { date: shiftDate(date, dayOffset), time: timeFromMinutes(absolute) };
}

function formatTime(value: string) {
  const total = minutes(value);
  if (total === null) return "";
  const hour = Math.floor(total / 60);
  return `${hour % 12 || 12}:${String(total % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function formatShortDate(value: string) {
  if (!validDate(value)) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function getEventStyle(item: TimelineItem): { icon: LucideIcon; color: string } {
  const itemType = item.item_type;
  const searchable = `${item.title} ${item.extra_transport_type ?? ""} ${item.pickup ?? ""} ${item.dropoff ?? ""}`.toLowerCase();
  if (itemType === "TRANSPORT" && /train|railway|rail\b/.test(searchable)) return { icon: Train, color: "#0f766e" };
  if (/ticket/.test(searchable)) return { icon: Ticket, color: "#be123c" };
  switch (itemType) {
    case "FLIGHT": return { icon: Plane, color: "#2563eb" };
    case "ACCOMMODATION": return { icon: BedDouble, color: "#7c3aed" };
    case "TRANSPORT":
    case "EXTRA_TRANSPORT": return { icon: Bus, color: "#0f766e" };
    case "ACTIVITY":
    case "SIGHTSEEING": return { icon: Activity, color: "#ea580c" };
    case "MEAL": return { icon: Coffee, color: "#c2410c" };
    case "VISA": return { icon: Ticket, color: "#be123c" };
    case "NOTE": return { icon: FileText, color: "#475569" };
    default: return { icon: MapPin, color: "#475569" };
  }
}

export function toTimelineEvents(days: TimelineDay[], travelEndDate: string): TimelineEvent[] {
  const finalTripDate = validDate(travelEndDate) ? travelEndDate : days.at(-1)?.date ?? "";
  return days.flatMap((day, dayIndex) => day.items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item }) => item.item_type !== "VISA" && !(item.item_type === "ACCOMMODATION"
      && finalTripDate
      && (validDate(item.check_in) ? item.check_in : day.date) >= finalTripDate))
    .map(({ item, itemIndex }) => {
    const metadata = item.metadata ?? {};
    const activityDate = typeof metadata["activity_date"] === "string" ? metadata["activity_date"] : "";
    const hotelStart = validDate(item.check_in) ? item.check_in : day.date;
    const hotelEnd = validDate(item.check_out) ? item.check_out : shiftDate(day.date, 1);
    const flightStartDate = validDate(item.flight_departure_date) ? item.flight_departure_date : day.date;
    const flightEndDate = validDate(item.flight_arrival_date) ? item.flight_arrival_date : flightStartDate;
    const checkInTime = typeof metadata["check_in_time"] === "string" && metadata["check_in_time"] ? metadata["check_in_time"] : "15:00";
    const checkOutTime = typeof metadata["check_out_time"] === "string" && metadata["check_out_time"] ? metadata["check_out_time"] : "11:00";
    const startDate = item.item_type === "ACCOMMODATION" ? hotelStart
      : item.item_type === "FLIGHT" ? flightStartDate
        : item.item_type === "EXTRA_TRANSPORT" && validDate(item.extra_transport_date) ? item.extra_transport_date
          : (item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING") && validDate(activityDate) ? activityDate
            : day.date;
    let endDate = item.item_type === "ACCOMMODATION" ? (hotelEnd > hotelStart ? hotelEnd : shiftDate(hotelStart, 1))
      : item.item_type === "FLIGHT" ? (flightEndDate < flightStartDate ? flightStartDate : flightEndDate)
        : startDate;
    const startTime = item.item_type === "ACCOMMODATION" ? checkInTime
      : item.item_type === "FLIGHT" ? item.flight_departure_time ?? ""
        : item.item_type === "EXTRA_TRANSPORT" ? item.extra_transport_pickup_time ?? ""
          : item.departure_time ?? "";
    let endTime = item.item_type === "ACCOMMODATION" ? checkOutTime
      : item.item_type === "FLIGHT" ? item.flight_arrival_time ?? ""
        : item.item_type === "EXTRA_TRANSPORT" ? item.extra_transport_drop_time ?? ""
          : item.arrival_time ?? "";
    const startMinute = minutes(startTime) ?? 0;
    let explicitEnd = minutes(endTime);
    const parsedDuration = parseDurationMinutes(item.item_type === "FLIGHT" ? item.flight_duration ?? item.duration : item.duration);
    if (explicitEnd !== null && endDate === startDate && explicitEnd < startMinute) endDate = shiftDate(startDate, 1);
    if (startTime && explicitEnd === null && parsedDuration !== null) {
      const calculatedEnd = dateTimeFromOffset(startDate, startTime, parsedDuration);
      endDate = calculatedEnd.date;
      endTime = calculatedEnd.time;
      explicitEnd = minutes(endTime);
    }
    const durationMinutes = explicitEnd !== null
      ? Math.max(30, explicitEnd + (endDate > startDate ? dayDifference(startDate, endDate) * 1440 : 0) - startMinute)
      : parsedDuration !== null ? Math.max(30, parsedDuration) : 60;
    const endMinute = startMinute + durationMinutes;
    const allDay = startTime === "";
    const style = getEventStyle(item);
    let label = item.title || item.item_type.replaceAll("_", " ").toLowerCase();
    let subtitle = item.description || item.location || "";
    if (item.item_type === "FLIGHT") {
      label = `${item.flight_airline || "Flight"}${item.flight_number ? ` ${item.flight_number}` : ""}`;
      subtitle = `${item.departure_city || item.location || "Departure"} → ${item.arrival_city || "Arrival"}`;
    } else if (item.item_type === "ACCOMMODATION") {
      label = item.hotel_name || item.title || "Hotel stay";
      subtitle = item.hotel_city || "Hotel stay";
    } else if (item.item_type === "TRANSPORT" || item.item_type === "EXTRA_TRANSPORT") {
      subtitle = `${item.pickup || "Pickup"} → ${item.dropoff || "Drop-off"}`;
      label = item.extra_transport_type || item.title || "Transfer";
    } else if (item.item_type === "MEAL") {
      label = item.meal_type || item.title || "Meal";
    }
    return {
      dayIndex,
      itemIndex,
      dayDate: day.date,
      item,
      startDate,
      endDate,
      startTime,
      endTime,
      startMinute,
      endMinute: Math.max(endMinute, startMinute + 30),
      durationMinutes,
      allDay,
      durationDays: Math.max(1, dayDifference(startDate, endDate)),
      label,
      subtitle,
      ...style,
    };
  }));
}

function weekStart(date: string) {
  if (!validDate(date)) return date;
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}

function buildDateRange(start: string, count: number) {
  return Array.from({ length: Math.max(1, count) }, (_, index) => shiftDate(start, index));
}

export function getTimelineEventForDate(event: TimelineEvent, date: string) {
  if (event.item.item_type === "ACCOMMODATION") {
    const isCheckInDay = date === event.startDate;
    const isCheckOutDay = date === event.endDate;
    const isOvernight = !isCheckInDay && !isCheckOutDay && event.startDate < event.endDate;
    return {
      ...event,
      startMinute: isCheckInDay ? Math.max(0, minutes(event.startTime) ?? 0) : 0,
      endMinute: isCheckOutDay
        ? Math.max(minutes(event.endTime) ?? 0, 30)
        : isCheckInDay || isOvernight
          ? 1440
          : Math.max(minutes(event.endTime) ?? 0, 30),
      startTime: isCheckInDay ? event.startTime : "00:00",
      endTime: isCheckOutDay ? event.endTime : isOvernight ? "23:59" : event.endTime,
      segmentStart: isCheckInDay,
      segmentEnd: isCheckOutDay,
    };
  }
  if (date > event.startDate) return { ...event, startMinute: 0, endMinute: minutes(event.endTime) ?? 60, startTime: "00:00", segmentStart: false, segmentEnd: true };
  if (event.endDate > event.startDate) return { ...event, endMinute: Math.min(1440, event.endMinute), segmentStart: true, segmentEnd: false };
  return { ...event, segmentStart: true, segmentEnd: true };
}

export function ItineraryTimeline({
  days,
  travelStartDate,
  travelEndDate,
  onOpenEvent,
  onScheduleChange,
}: {
  days: TimelineDay[];
  travelStartDate: string;
  travelEndDate: string;
  onOpenEvent: (event: TimelineEvent) => void;
  onScheduleChange: (event: TimelineEvent, change: ScheduleChange) => void;
}) {
  const [view, setView] = useState<ViewMode>("trip");
  const [selectedHotelOption, setSelectedHotelOption] = useState<(typeof TIMELINE_OPTIONS)[number]>("Option 1");
  const [selectedFlightOption, setSelectedFlightOption] = useState<(typeof TIMELINE_OPTIONS)[number]>("Option 1");
  const [selectedDate, setSelectedDate] = useState(travelStartDate || days[0]?.date || new Date().toISOString().slice(0, 10));
  const events = useMemo(() => toTimelineEvents(days, travelEndDate), [days, travelEndDate]);
  const visibleEvents = useMemo(() => events.filter(({ item }) => {
    if (item.item_type === "FLIGHT") return (typeof item.metadata?.["flight_option"] === "string" ? item.metadata["flight_option"] : "Option 1") === selectedFlightOption;
    if (item.item_type === "ACCOMMODATION") return (item.hotel_option_label || "Option 1") === selectedHotelOption;
    return true;
  }), [events, selectedFlightOption, selectedHotelOption]);
  const dateList = useMemo(() => {
    if (view === "day") return [selectedDate];
    if (view === "week") return buildDateRange(weekStart(selectedDate), 7);
    const start = validDate(travelStartDate) ? travelStartDate : days[0]?.date || selectedDate;
    const end = validDate(travelEndDate) ? travelEndDate : days.at(-1)?.date || start;
    return buildDateRange(start, Math.min(366, dayDifference(start, end) + 1));
  }, [days, selectedDate, travelEndDate, travelStartDate, view]);
  const dayByDate = useMemo(() => new Map(days.map((day, index) => [day.date, { day, index }])), [days]);

  function navigate(direction: -1 | 1) {
    if (view === "trip") {
      const start = validDate(travelStartDate) ? travelStartDate : days[0]?.date || selectedDate;
      const end = validDate(travelEndDate) ? travelEndDate : days.at(-1)?.date || start;
      setSelectedDate(direction < 0 ? start : end);
      setView("day");
      return;
    }
    setSelectedDate((current) => shiftDate(current, direction * (view === "week" ? 7 : 1)));
  }

  function displayEvents(date: string) {
    return visibleEvents.filter((event) => date >= event.startDate && date <= event.endDate);
  }

  function commitDrop(event: TimelineEvent, date: string, minute: number, allDayTarget = false) {
    if (!validDate(date)) return;
    const remainsAllDay = event.allDay && allDayTarget;
    const durationMinutes = remainsAllDay ? event.durationDays * 1440 : Math.max(30, event.durationMinutes);
    const startTime = remainsAllDay
      ? ""
      : event.item.item_type === "ACCOMMODATION" && allDayTarget
        ? event.startTime
        : timeFromMinutes(Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES);
    const start = dateTimeFromOffset(date, startTime || "00:00", 0);
    const end = remainsAllDay
      ? { date: shiftDate(date, event.durationDays), time: "" }
      : dateTimeFromOffset(start.date, start.time, durationMinutes);
    onScheduleChange(event, { startDate: start.date, endDate: end.date, startTime, endTime: remainsAllDay ? "" : end.time, durationMinutes });
  }

  function beginResize(event: TimelineEvent, pointerEvent: React.PointerEvent<HTMLButtonElement>, date: string) {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const startY = pointerEvent.clientY;
    const startX = pointerEvent.clientX;
    const resizeHandle = pointerEvent.currentTarget;
    const initialDuration = Math.max(30, event.durationMinutes);
    const isHotel = event.item.item_type === "ACCOMMODATION";
    const initialDurationDays = event.durationDays;
    const column = pointerEvent.currentTarget.closest("[data-timeline-column]");
    const columnWidth = column?.getBoundingClientRect().width || 160;
    const onMove = (moveEvent: PointerEvent) => {
      if (event.allDay || isHotel) return;
      const delta = Math.round(((moveEvent.clientY - startY) / HOUR_HEIGHT * 60) / SNAP_MINUTES) * SNAP_MINUTES;
      resizeHandle.style.setProperty("--preview-duration", `${Math.max(30, initialDuration + delta) / 60 * HOUR_HEIGHT}px`);
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (event.allDay || isHotel) {
        const deltaDays = Math.round((upEvent.clientX - startX) / columnWidth);
        const durationDays = Math.max(1, initialDurationDays + deltaDays);
        const endDate = shiftDate(event.startDate, durationDays);
        const startTime = isHotel ? event.startTime : "";
        const endTime = isHotel ? event.endTime : "";
        const startMinute = minutes(startTime) ?? 0;
        const endMinute = minutes(endTime) ?? 0;
        const durationMinutes = isHotel ? durationDays * 1440 + endMinute - startMinute : durationDays * 1440;
        onScheduleChange(event, { startDate: event.startDate, endDate, startTime, endTime, durationMinutes });
        return;
      }
      const delta = Math.round(((upEvent.clientY - startY) / HOUR_HEIGHT * 60) / SNAP_MINUTES) * SNAP_MINUTES;
      const durationMinutes = Math.max(30, initialDuration + delta);
      const end = dateTimeFromOffset(event.startDate, event.startTime, durationMinutes);
      resizeHandle.style.removeProperty("--preview-duration");
      onScheduleChange(event, { startDate: event.startDate, endDate: end.date, startTime: event.startTime, endTime: end.time, durationMinutes });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  const currentRangeLabel = view === "trip"
    ? `${dateList[0] || travelStartDate} – ${dateList.at(-1) || travelEndDate}`
    : view === "week"
      ? `${dateList[0]} – ${dateList.at(-1)}`
      : selectedDate;

  return (
    <section className="flex min-h-[38rem] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900" aria-label="Itinerary timeline">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-slate-600" />
          <div><h2 className="font-semibold">Trip timeline</h2><p className="text-xs text-slate-500">{currentRangeLabel}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Hotel option" className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
              <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Hotels</span>
              {TIMELINE_OPTIONS.map((option) => (
                <Button key={option} type="button" variant={selectedHotelOption === option ? "default" : "ghost"} size="sm" className="h-8 px-2 text-xs" aria-pressed={selectedHotelOption === option} onClick={() => setSelectedHotelOption(option)}>{option}</Button>
              ))}
            </div>
            <div role="group" aria-label="Flight option" className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
              <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Flights</span>
              {TIMELINE_OPTIONS.map((option) => (
                <Button key={option} type="button" variant={selectedFlightOption === option ? "default" : "ghost"} size="sm" className="h-8 px-2 text-xs" aria-pressed={selectedFlightOption === option} onClick={() => setSelectedFlightOption(option)}>{option}</Button>
              ))}
            </div>
          </div>
          <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
            {(["day", "week", "trip"] as const).map((mode) => (
              <Button key={mode} type="button" variant={view === mode ? "default" : "ghost"} size="sm" className="h-8 capitalize" onClick={() => setView(mode)}>{mode === "trip" ? "Entire Trip" : mode}</Button>
            ))}
          </div>
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Previous date range" onClick={() => navigate(-1)}><ArrowLeft className="size-4" /></Button>
          <Input aria-label="Choose timeline date" type="date" value={selectedDate} min={travelStartDate || undefined} max={travelEndDate || undefined} onChange={(event) => { if (event.target.value) { setSelectedDate(event.target.value); if (view === "trip") setView("day"); } }} className="h-8 w-36" />
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Next date range" onClick={() => navigate(1)}><ArrowRight className="size-4" /></Button>
        </div>
      </header>

      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <div className="overflow-x-auto">
          <div className="min-w-max" style={{ minWidth: `${56 + dateList.length * 180}px` }}>
            <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: `56px repeat(${dateList.length}, minmax(180px, 1fr))` }}>
              <div className="border-r border-slate-200" />
              {dateList.map((date) => {
                const day = dayByDate.get(date)?.day;
                return <div key={date} data-timeline-column={date} className="border-r border-slate-200 px-3 py-2 text-center last:border-r-0"><p className="text-[11px] uppercase tracking-wide text-slate-500">{day?.title || "Trip day"}</p><p className="text-sm font-semibold">{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}</p></div>;
              })}
            </div>
            <div className="grid border-b border-slate-200 bg-slate-50/70" style={{ gridTemplateColumns: `56px repeat(${dateList.length}, minmax(180px, 1fr))` }}>
              <div className="border-r border-slate-200 px-1 py-2 text-[10px] font-medium uppercase text-slate-500">All day</div>
              {dateList.map((date) => {
                const allDayEvents = displayEvents(date).filter((event) => event.allDay).map((event) => getTimelineEventForDate(event, date));
                return (
                  <div key={date} data-timeline-column={date} className="min-h-12 space-y-1 border-r border-slate-200 p-1.5 last:border-r-0" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                    event.preventDefault();
                    const data = event.dataTransfer.getData("text/plain").split(":");
                    const source = events.find((entry) => entry.dayIndex === Number(data[0]) && entry.itemIndex === Number(data[1]));
                    if (source) commitDrop(source, date, 0, true);
                  }}>
                    {allDayEvents.map((event) => <TimelineEventCard key={`${event.dayIndex}-${event.itemIndex}-${date}`} event={event} date={date} onOpen={() => onOpenEvent(event)} onResize={(pointerEvent) => beginResize(event, pointerEvent, date)} />)}
                  </div>
                );
              })}
            </div>
            <div className="max-h-[62vh] overflow-y-auto">
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(${dateList.length}, minmax(180px, 1fr))` }}>
                <div className="relative border-r border-slate-200 bg-white" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
                  {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-500" style={{ top: `${hour * HOUR_HEIGHT}px` }}>{`${String(hour).padStart(2, "0")}:00`}</div>)}
                </div>
                {dateList.map((date) => {
                  const timed = displayEvents(date).filter((event) => !event.allDay).map((event) => getTimelineEventForDate(event, date));
                  const placed: Array<{ event: TimelineEvent; lane: number; laneCount: number }> = [];
                  let laneEnds: number[] = [];
                  let group: Array<{ event: TimelineEvent; lane: number }> = [];
                  let groupEnd = -1;
                  const finishGroup = () => {
                    const laneCount = Math.max(1, laneEnds.length);
                    group.forEach((entry) => placed.push({ ...entry, laneCount }));
                    group = [];
                    laneEnds = [];
                    groupEnd = -1;
                  };
                  [...timed].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute).forEach((event) => {
                    if (group.length > 0 && event.startMinute >= groupEnd) finishGroup();
                    let lane = laneEnds.findIndex((end) => end <= event.startMinute);
                    if (lane < 0) lane = laneEnds.length;
                    laneEnds[lane] = event.endMinute;
                    groupEnd = Math.max(groupEnd, event.endMinute);
                    group.push({ event, lane });
                  });
                  if (group.length > 0) finishGroup();
                  return (
                    <div key={date} data-timeline-column={date} className="relative border-r border-slate-200 last:border-r-0" style={{ height: `${24 * HOUR_HEIGHT}px`, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, #e2e8f0 ${HOUR_HEIGHT - 1}px, #e2e8f0 ${HOUR_HEIGHT}px)` }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                      event.preventDefault();
                      const data = event.dataTransfer.getData("text/plain").split(":");
                      const source = events.find((entry) => entry.dayIndex === Number(data[0]) && entry.itemIndex === Number(data[1]));
                      if (!source) return;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const minute = Math.max(0, Math.min(1439, ((event.clientY - bounds.top) / HOUR_HEIGHT) * 60));
                      commitDrop(source, date, minute);
                    }}>
                      {placed.map(({ event, lane, laneCount }) => <TimelineEventCard key={`${event.dayIndex}-${event.itemIndex}-${date}`} event={event} date={date} onOpen={() => onOpenEvent(event)} onResize={(pointerEvent) => beginResize(event, pointerEvent, date)} lane={lane} laneCount={laneCount} />)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 md:hidden">
        {dateList.map((date) => {
          const dayEvents = displayEvents(date).map((event) => getTimelineEventForDate(event, date)).sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.startMinute - b.startMinute || a.item.sequence - b.item.sequence);
          return <section key={date} className="space-y-2"><h3 className="sticky top-0 z-10 rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}</h3>
            {!dayEvents.length && <p className="px-3 py-4 text-sm text-slate-500">No itinerary items for this day.</p>}
            {dayEvents.map((event) => {
              const isHotel = event.item.item_type === "ACCOMMODATION";
              const hotelPhase = event.segmentStart && event.segmentEnd ? "Check-in & check-out" : event.segmentStart ? "Check-in" : event.segmentEnd ? "Check-out" : "Overnight stay";
              const hotelSchedule = event.segmentStart && event.segmentEnd
                ? `${formatShortDate(event.startDate)} check-in ${formatTime(event.startTime)} · ${formatShortDate(event.endDate)} check-out ${formatTime(event.endTime)}`
                : event.segmentStart
                  ? `${formatShortDate(event.startDate)} check-in at ${formatTime(event.startTime)}`
                  : event.segmentEnd
                    ? `${formatShortDate(event.endDate)} check-out at ${formatTime(event.endTime)}`
                    : `Stay continues through ${formatShortDate(event.endDate)}`;
              return <button key={`${event.dayIndex}-${event.itemIndex}`} type="button" onClick={() => onOpenEvent(event)} className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm"><span className="mt-0.5 rounded-md p-2 text-white" style={{ backgroundColor: event.color }}><event.icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block font-medium">{event.label}{isHotel && ` · ${hotelPhase}`}</span><span className="block text-xs text-slate-600">{isHotel ? hotelSchedule : event.allDay ? "All day" : `${formatTime(event.startTime)}${event.endTime ? ` – ${formatTime(event.endTime)}` : ""}`}</span>{!isHotel && event.subtitle && <span className="mt-1 block truncate text-xs text-slate-500">{event.subtitle}</span>}</span></button>;
            })}
          </section>;
        })}
      </div>
      <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600">
        {[[Plane, "Flights", "#2563eb"], [BedDouble, "Hotels", "#7c3aed"], [Bus, "Transport", "#0f766e"], [Activity, "Activities", "#ea580c"], [Train, "Other travel", "#475569"]].map(([Icon, label, color]) => {
          const LegendIcon = Icon as LucideIcon;
          return <span key={String(label)} className="inline-flex items-center gap-1.5"><LegendIcon className="size-3.5" style={{ color: String(color) }} />{String(label)}</span>;
        })}
        <span className="ml-auto inline-flex items-center gap-1"><Clock3 className="size-3.5" />Drag events to reschedule; drag the lower handle to resize.</span>
      </footer>
    </section>
  );
}

function TimelineEventCard({ event, date, onOpen, onResize, lane = 0, laneCount = 1 }: {
  event: TimelineEvent & { segmentStart?: boolean; segmentEnd?: boolean };
  date: string;
  onOpen: () => void;
  onResize: (event: React.PointerEvent<HTMLButtonElement>) => void;
  lane?: number;
  laneCount?: number;
}) {
  const isHotel = event.item.item_type === "ACCOMMODATION";
  const isAllDay = event.allDay;
  const beginsHere = event.startDate === date;
  const localStart = beginsHere ? event.startMinute : 0;
  const spanEnd = event.endDate === date ? event.endMinute : 1440;
  const height = Math.max(30, Math.min(24 * HOUR_HEIGHT, ((spanEnd - localStart) / 60) * HOUR_HEIGHT));
  const Icon = event.icon;
  const timeLabel = isHotel
    ? event.segmentStart && event.segmentEnd
      ? `${formatShortDate(event.startDate)} check-in ${formatTime(event.startTime)} · ${formatShortDate(event.endDate)} check-out ${formatTime(event.endTime)}`
      : event.segmentStart
        ? `${formatShortDate(event.startDate)} check-in ${formatTime(event.startTime)}`
        : event.segmentEnd
          ? `${formatShortDate(event.endDate)} check-out ${formatTime(event.endTime)}`
          : `Stay continues through ${formatShortDate(event.endDate)}`
    : event.startTime ? `${formatTime(event.startTime)}${event.endTime ? `–${formatTime(event.endTime)}` : ""}` : "All day";
  const common = `group flex w-full flex-col overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left shadow-sm transition hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${isAllDay ? "relative min-h-8 border border-slate-200" : "absolute z-[2]"}`;
  const style = isAllDay ? { borderLeftColor: event.color, backgroundColor: `${event.color}16`, color: "#0f172a" } : {
    top: `${localStart / 60 * HOUR_HEIGHT}px`,
    height: `var(--preview-duration, ${height}px)`,
    left: `calc(${lane / laneCount * 100}% + 2px)`,
    width: `calc(${100 / laneCount}% - 4px)`,
    borderLeftColor: event.color,
    backgroundColor: `${event.color}1c`,
    color: "#0f172a",
  };
  return (
    <div className={common} style={style} draggable onDragStart={(dragEvent) => dragEvent.dataTransfer.setData("text/plain", `${event.dayIndex}:${event.itemIndex}`)}>
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={onOpen} title={`${event.label} · ${timeLabel}`}>
        <span className="flex items-center gap-1 truncate text-[11px] font-semibold"><Icon className="size-3.5 shrink-0" />{isHotel && event.segmentStart ? `Check-in · ${event.label}` : isHotel && event.segmentEnd ? `Check-out · ${event.label}` : isHotel ? `Stay · ${event.label}` : event.label}</span>
        {(isHotel || !isAllDay) && <span className="truncate text-[10px]">{timeLabel}</span>}
        {event.subtitle && <span className="truncate text-[10px] opacity-80">{event.subtitle}</span>}
      </button>
      {(isHotel ? event.segmentEnd : !isAllDay) && <button type="button" aria-label={isHotel ? "Resize hotel stay" : "Resize event duration"} title="Drag to resize" onPointerDown={onResize} className={isHotel ? "absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize touch-none rounded-r-md bg-slate-900/10 opacity-0 hover:opacity-100" : "absolute bottom-0 left-1/2 h-2 w-10 -translate-x-1/2 cursor-ns-resize touch-none rounded-t bg-slate-700/30 opacity-0 hover:opacity-100"} />}
    </div>
  );
}
