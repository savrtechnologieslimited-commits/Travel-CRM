import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useBookings } from "@/lib/data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Trip = {
  id: string;
  name: string;
  start: Date;
  end: Date;
  color: string;
};

function parseDate(value: string | null) {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayNumber(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function TripCalendarDialog() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const { data: bookings = [], isLoading, isError } = useBookings();

  const trips = useMemo<Trip[]>(() => {
    const sortedBookings = [...bookings]
      .filter((booking) => booking.travel_start)
      .sort((a, b) => a.id.localeCompare(b.id));

    return sortedBookings.flatMap((booking, index) => {
      const start = parseDate(booking.travel_start);
      const end = parseDate(booking.travel_end) ?? start;
      if (!start || !end || end < start) return [];

      const customer = booking.customers?.full_name;
      const destination = booking.destinations?.name;
      const name = [customer, destination].filter(Boolean).join(" · ") || "Trip";
      const hue = (index * 137.508) % 360;

      return [
        {
          id: booking.id,
          name,
          start,
          end,
          color: `hsl(${hue} 68% 42%)`,
        },
      ];
    });
  }, [bookings]);

  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const calendarStart = new Date(firstDay);
    calendarStart.setDate(firstDay.getDate() - firstDay.getDay());
    const calendarEnd = new Date(lastDay);
    calendarEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

    const weeks: { start: Date; days: Date[] }[] = [];
    for (let cursor = new Date(calendarStart); cursor <= calendarEnd;) {
      const start = new Date(cursor);
      const days = Array.from({ length: 7 }, (_, day) => {
        const date = new Date(cursor);
        date.setDate(cursor.getDate() + day);
        return date;
      });
      weeks.push({ start, days });
      cursor.setDate(cursor.getDate() + 7);
    }

    return weeks.map(({ start, days }) => {
      const weekStart = dayNumber(start);
      const weekEnd = weekStart + 6;
      const laneEnds: number[] = [];
      const segments = trips
        .filter((trip) => dayNumber(trip.start) <= weekEnd && dayNumber(trip.end) >= weekStart)
        .map((trip) => ({
          trip,
          startColumn: Math.max(0, dayNumber(trip.start) - weekStart),
          endColumn: Math.min(6, dayNumber(trip.end) - weekStart),
        }))
        .sort((a, b) => a.startColumn - b.startColumn || a.endColumn - b.endColumn);

      const positionedSegments = segments.map((segment) => {
        let lane = laneEnds.findIndex((lastColumn) => lastColumn < segment.startColumn);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = segment.endColumn;
        return { ...segment, lane };
      });

      return { days, segments: positionedSegments, laneCount: Math.max(1, laneEnds.length) };
    });
  }, [month, trips]);

  const today = new Date();
  const isToday = (date: Date) =>
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarDays />
          Calendar
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[90vh] max-h-[900px] w-[calc(100%-1rem)] max-w-6xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Trip calendar</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() =>
                setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() =>
                setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
            >
              <ChevronRight />
            </Button>
            <h2 className="ml-2 text-lg font-semibold">
              {month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <div className="flex min-h-full min-w-[640px] flex-col">
            <div className="grid shrink-0 grid-cols-7 border-b border-border bg-muted/40">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>

            {isLoading ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Loading trips…</p>
            ) : isError ? (
              <p className="p-8 text-center text-sm text-destructive">
                Unable to load trips for the calendar.
              </p>
            ) : (
              calendarWeeks.map(({ days, segments, laneCount }, weekIndex) => (
                <div
                  key={weekIndex}
                  className="grid min-h-0 flex-1 grid-cols-7 border-b border-border last:border-b-0"
                  style={{
                    gridTemplateRows: `30px repeat(${laneCount}, minmax(0, 1fr))`,
                  }}
                >
                  {days.map((date, column) => {
                    const inMonth = date.getMonth() === month.getMonth();
                    return (
                      <div
                        key={dayNumber(date)}
                        className={`border-r border-border px-1.5 py-1 text-right text-xs last:border-r-0 ${
                          inMonth ? "text-foreground" : "text-muted-foreground/50"
                        }`}
                        style={{ gridColumn: column + 1, gridRow: 1 }}
                      >
                        <span
                          className={
                            isToday(date)
                              ? "inline-grid size-6 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
                              : "inline-grid size-6 place-items-center"
                          }
                        >
                          {date.getDate()}
                        </span>
                      </div>
                    );
                  })}
                  {segments.map(({ trip, startColumn, endColumn, lane }) => (
                    <div
                      key={`${trip.id}-${weekIndex}`}
                      title={`${trip.name} · ${trip.start.toLocaleDateString("en-IN")} – ${trip.end.toLocaleDateString("en-IN")}`}
                      className="mx-0.5 truncate rounded px-1.5 text-[11px] font-medium leading-5 text-white"
                      style={{
                        gridColumn: `${startColumn + 1} / ${endColumn + 2}`,
                        gridRow: lane + 2,
                        backgroundColor: trip.color,
                      }}
                    >
                      {trip.name}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
