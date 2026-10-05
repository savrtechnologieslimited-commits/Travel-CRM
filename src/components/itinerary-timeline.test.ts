import { describe, expect, test } from "bun:test";
import { BedDouble } from "lucide-react";
import { getTimelineEventForDate, toTimelineEvents, type TimelineDay, type TimelineEvent } from "./itinerary-timeline";

const hotelEvent: TimelineEvent = {
  dayIndex: 0,
  itemIndex: 0,
  dayDate: "2026-09-30",
  item: {
    item_type: "ACCOMMODATION",
    title: "Hotel stay",
    sequence: 1,
  },
  startDate: "2026-09-30",
  endDate: "2026-10-02",
  startTime: "15:00",
  endTime: "11:00",
  startMinute: 900,
  endMinute: 3540,
  durationMinutes: 2640,
  allDay: false,
  durationDays: 2,
  label: "Hotel stay",
  subtitle: "Goa",
  icon: BedDouble,
  color: "#7c3aed",
};

describe("hotel timeline segments", () => {
  test("aligns check-in to the end of its date column", () => {
    const segment = getTimelineEventForDate(hotelEvent, "2026-09-30");

    expect(segment).toMatchObject({
      startMinute: 900,
      endMinute: 1440,
      startTime: "15:00",
      segmentStart: true,
      segmentEnd: false,
    });
  });

  test("shows each overnight date as a full-day segment", () => {
    const segment = getTimelineEventForDate(hotelEvent, "2026-10-01");

    expect(segment).toMatchObject({
      startMinute: 0,
      endMinute: 1440,
      startTime: "00:00",
      endTime: "23:59",
      segmentStart: false,
      segmentEnd: false,
    });
  });

  test("aligns checkout to its actual time on the checkout date", () => {
    const segment = getTimelineEventForDate(hotelEvent, "2026-10-02");

    expect(segment).toMatchObject({
      startMinute: 0,
      endMinute: 660,
      startTime: "00:00",
      endTime: "11:00",
      segmentStart: false,
      segmentEnd: true,
    });
  });

  test("shows checkout but not a new hotel check-in on the final trip day", () => {
    const days: TimelineDay[] = [
      {
        day_number: 1,
        date: "2026-09-30",
        title: "Day 1",
        items: [{
          item_type: "ACCOMMODATION",
          title: "First night",
          hotel_name: "First night",
          check_in: "2026-09-30",
          check_out: "2026-10-01",
          metadata: { check_in_time: "15:00", check_out_time: "11:00" },
          sequence: 1,
        }],
      },
      {
        day_number: 2,
        date: "2026-10-01",
        title: "Day 2",
        items: [{
          item_type: "ACCOMMODATION",
          title: "Invalid final-day check-in",
          hotel_name: "Invalid final-day check-in",
          check_in: "2026-10-01",
          check_out: "2026-10-02",
          sequence: 1,
        }],
      },
    ];

    const events = toTimelineEvents(days, "2026-10-01");

    expect(events.map(({ label }) => label)).toEqual(["First night"]);
    expect(getTimelineEventForDate(events[0]!, "2026-10-01")).toMatchObject({ segmentStart: false, segmentEnd: true });
  });
});
