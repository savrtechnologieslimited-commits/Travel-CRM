import { describe, expect, test } from "bun:test";
import { sortItineraryServicesChronologically } from "./itinerary-service-order";

describe("itinerary activity and transfer ordering", () => {
  test("sorts activities and transfers together by their scheduled time", () => {
    const ordered = sortItineraryServicesChronologically([
      { day: { date: "2026-09-30" }, itemIndex: 0, item: { item_type: "TRANSPORT", departure_time: "13:00", sequence: 1 } },
      { day: { date: "2026-09-30" }, itemIndex: 1, item: { item_type: "ACTIVITY", departure_time: "09:30", sequence: 2 } },
      { day: { date: "2026-09-30" }, itemIndex: 2, item: { item_type: "SIGHTSEEING", departure_time: "11:00", sequence: 3 } },
    ]);

    expect(ordered.map(({ item }) => item.departure_time)).toEqual(["09:30", "11:00", "13:00"]);
  });

  test("uses an activity's rescheduled date and keeps unscheduled entries after timed entries", () => {
    const ordered = sortItineraryServicesChronologically([
      { day: { date: "2026-09-30" }, itemIndex: 0, item: { item_type: "ACTIVITY", departure_time: "08:00", metadata: { activity_date: "2026-10-01" } } },
      { day: { date: "2026-09-30" }, itemIndex: 1, item: { item_type: "TRANSPORT", departure_time: "10:00" } },
      { day: { date: "2026-09-30" }, itemIndex: 2, item: { item_type: "ACTIVITY", departure_time: "" } },
    ]);

    expect(ordered.map(({ item }) => item.item_type)).toEqual(["TRANSPORT", "ACTIVITY", "ACTIVITY"]);
  });

  test("preserves itinerary sequence when two items have the same scheduled time", () => {
    const ordered = sortItineraryServicesChronologically([
      { day: { date: "2026-09-30" }, itemIndex: 1, item: { item_type: "TRANSPORT", departure_time: "10:00", sequence: 2 } },
      { day: { date: "2026-09-30" }, itemIndex: 0, item: { item_type: "ACTIVITY", departure_time: "10:00", sequence: 1 } },
    ]);

    expect(ordered.map(({ item }) => item.item_type)).toEqual(["ACTIVITY", "TRANSPORT"]);
  });
});