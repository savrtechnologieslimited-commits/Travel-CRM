import { describe, expect, test } from "bun:test";
import { validateItineraryDraftState } from "./itinerary-validation";

describe("itinerary draft validation", () => {
  const activityDraft = {
    title: "Activity itinerary",
    days: [
      {
        day_number: 1,
        title: "Day 1",
        items: [
          {
            sequence: 1,
            item_type: "TRANSPORT",
            title: "Airport transfer",
            pickup: "Hotel",
            dropoff: "Airport",
            departure_time: "09:00",
            arrival_time: "10:00",
          },
        ],
      },
    ],
  };

  test("requires a destination for a complete itinerary save", () => {
    const result = validateItineraryDraftState(activityDraft);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.path === "destination_id")).toBe(true);
  });

  test("allows saving an activity or transfer draft before choosing a destination", () => {
    const result = validateItineraryDraftState(activityDraft, { allowMissingDestination: true });
    expect(result.valid).toBe(true);
  });

  test("does not skip other required-field validation when destination is optional", () => {
    const result = validateItineraryDraftState(
      { ...activityDraft, title: "" },
      { allowMissingDestination: true },
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.path === "title")).toBe(true);
  });

  test("requires start and end times for every scheduled item type", () => {
    const timedItems = [
      "ACTIVITY",
      "SIGHTSEEING",
      "TRANSPORT",
      "MEAL",
      "ACCOMMODATION",
      "FLIGHT",
      "VISA",
      "EXTRA_TRANSPORT",
      "NOTE",
    ].map((item_type, sequence) => ({
      sequence: sequence + 1,
      item_type,
      title: "Scheduled item",
      pickup: "Hotel",
      dropoff: "Airport",
      hotel_name: "Example Hotel",
      rooms: 1,
    }));
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        travel_start_date: "2026-09-30",
        travel_end_date: "2026-09-30",
        days: [{ day_number: 1, date: "2026-09-30", title: "Day 1", items: timedItems }],
      },
      { allowMissingDestination: true },
    );

    expect(result.valid).toBe(false);
    expect(
      result.errors.filter(
        (issue) => issue.message.includes("must include a") && issue.message.includes("time"),
      ),
    ).toHaveLength(18);
  });

  test("allows draft saves with missing schedule times and reports warnings", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        status: "DRAFT",
        days: [
          {
            day_number: 1,
            title: "Day 1",
            items: [
              {
                sequence: 1,
                item_type: "TRANSPORT",
                title: "Airport transfer",
                pickup: "Hotel",
                dropoff: "Airport",
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true, allowMissingScheduledTimes: true },
    );

    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toEqual([
      "MISSING_SCHEDULE_TIME",
      "MISSING_SCHEDULE_TIME",
    ]);
  });

  test("keeps missing schedule times blocking for READY itineraries", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        status: "READY",
        days: [
          {
            day_number: 1,
            title: "Day 1",
            items: [
              {
                sequence: 1,
                item_type: "TRANSPORT",
                title: "Airport transfer",
                pickup: "Hotel",
                dropoff: "Airport",
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.message)).toEqual([
      "Day 1 transport must include a start time.",
      "Day 1 transport must include a end time.",
    ]);
  });

  test("allows assigned saves to persist incomplete itinerary fields as warnings", () => {
    const result = validateItineraryDraftState(
      {
        title: "Pilgrimage itinerary",
        status: "READY",
        days: [
          {
            day_number: 1,
            title: "",
            items: [
              { sequence: 1, item_type: "FLIGHT", title: "Flight" },
              { sequence: 2, item_type: "VISA", title: "Visa" },
              { sequence: 3, item_type: "EXTRA_TRANSPORT", title: "Transfer" },
            ],
          },
        ],
      },
      { allowMissingScheduledTimes: true, allowIncomplete: true },
    );

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.message)).toContain(
      "Day 1 flight must include an airline.",
    );
    expect(result.warnings.map((issue) => issue.message)).toContain(
      "Day 1 flight must include a departure time.",
    );
    expect(result.warnings.map((issue) => issue.message)).toContain("Day 1 title is required.");
    expect(result.warnings.map((issue) => issue.message)).toContain(
      "Visa item 2 must include a country.",
    );
    expect(result.warnings.map((issue) => issue.message)).toContain(
      "Visa item 2 must include a type.",
    );
    expect(result.warnings.map((issue) => issue.message)).toContain(
      "Transport item 3 must include a transport type.",
    );
  });

  test("accepts start and end times on hotels and timed itinerary items", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        travel_start_date: "2026-09-30",
        travel_end_date: "2026-10-01",
        days: [
          {
            day_number: 1,
            date: "2026-09-30",
            title: "Day 1",
            items: [
              {
                sequence: 1,
                item_type: "ACCOMMODATION",
                title: "Hotel",
                hotel_name: "Example Hotel",
                check_in: "2026-09-30",
                check_out: "2026-10-01",
                check_in_time: "15:00",
                check_out_time: "11:00",
                rooms: 1,
              },
              {
                sequence: 2,
                item_type: "FLIGHT",
                title: "Flight",
                flight_airline: "Test Air",
                flight_departure_date: "2026-09-30",
                flight_departure_time: "09:00",
                flight_arrival_date: "2026-09-30",
                flight_arrival_time: "10:00",
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true },
    );

    expect(result.errors).toEqual([]);
  });

  test("allows hotel checkout on the final trip date", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        travel_start_date: "2026-10-01",
        travel_end_date: "2026-10-02",
        days: [
          {
            day_number: 1,
            date: "2026-10-01",
            title: "Day 1",
            items: [
              {
                sequence: 1,
                item_type: "ACCOMMODATION",
                title: "Hotel",
                hotel_name: "Example Hotel",
                check_in: "2026-10-01",
                check_out: "2026-10-02",
                check_in_time: "22:00",
                check_out_time: "11:15",
                nights: 1,
                rooms: 1,
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true },
    );

    expect(result.errors).toEqual([]);
  });

  test("rejects a hotel check-in on the final trip date", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        travel_start_date: "2026-09-30",
        travel_end_date: "2026-10-01",
        days: [
          {
            day_number: 2,
            date: "2026-10-01",
            title: "Day 2",
            items: [
              {
                sequence: 1,
                item_type: "ACCOMMODATION",
                title: "Hotel",
                hotel_name: "Example Hotel",
                check_in: "2026-10-01",
                check_out: "2026-10-02",
                check_in_time: "22:00",
                check_out_time: "11:15",
                nights: 1,
                rooms: 1,
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true },
    );

    expect(result.errors.some((issue) => issue.code === "HOTEL_CHECKIN_ON_FINAL_DAY")).toBe(true);
  });

  test("rejects hotel stay dates outside the trip dates", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        travel_start_date: "2026-09-30",
        travel_end_date: "2026-10-02",
        days: [
          {
            day_number: 1,
            date: "2026-09-30",
            title: "Day 1",
            items: [
              {
                sequence: 1,
                item_type: "ACCOMMODATION",
                title: "Hotel",
                hotel_name: "Example Hotel",
                check_in: "2026-09-29",
                check_out: "2026-10-03",
                check_in_time: "15:00",
                check_out_time: "11:00",
                rooms: 1,
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "OUTSIDE_TRAVEL_RANGE")).toBe(true);
  });

  test("rejects activity dates and extra transport dates outside the trip", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        travel_start_date: "2026-09-30",
        travel_end_date: "2026-10-02",
        days: [
          {
            day_number: 1,
            date: "2026-09-30",
            title: "Day 1",
            items: [
              {
                sequence: 1,
                item_type: "ACTIVITY",
                title: "Tour",
                activity_date: "2026-10-03",
                departure_time: "09:00",
                arrival_time: "10:00",
              },
              {
                sequence: 2,
                item_type: "EXTRA_TRANSPORT",
                title: "Transfer",
                extra_transport_type: "Airport Transfer",
                pickup: "Airport",
                dropoff: "Hotel",
                extra_transport_date: "2026-09-29",
                extra_transport_pickup_time: "09:00",
                extra_transport_drop_time: "10:00",
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.filter((issue) => issue.code === "OUTSIDE_TRAVEL_RANGE")).toHaveLength(2);
  });

  test("rejects an overnight transfer that would arrive after the trip ends", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        travel_start_date: "2026-09-30",
        travel_end_date: "2026-10-01",
        days: [
          {
            day_number: 2,
            date: "2026-10-01",
            title: "Day 2",
            items: [
              {
                sequence: 1,
                item_type: "TRANSPORT",
                title: "Transfer",
                pickup: "Hotel",
                dropoff: "Airport",
                departure_time: "23:30",
                arrival_time: "00:30",
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "OUTSIDE_TRAVEL_RANGE")).toBe(true);
  });

  test("rejects an activity duration that continues past the trip end date", () => {
    const result = validateItineraryDraftState(
      {
        ...activityDraft,
        travel_start_date: "2026-09-30",
        travel_end_date: "2026-10-01",
        days: [
          {
            day_number: 2,
            date: "2026-10-01",
            title: "Day 2",
            items: [
              {
                sequence: 1,
                item_type: "ACTIVITY",
                title: "Night tour",
                activity_date: "2026-10-01",
                departure_time: "23:00",
                arrival_time: "23:30",
                duration: "2 hours",
              },
            ],
          },
        ],
      },
      { allowMissingDestination: true },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "OUTSIDE_TRAVEL_RANGE")).toBe(true);
  });
});
