import { describe, expect, test } from "bun:test";
import { buildSavedServicesForAi } from "./itinerary-ai-services";

const days = [{
  day_number: 1,
  date: "2026-09-30",
  items: [
    {
      item_type: "ACTIVITY",
      title: "Temple visit",
      location: "Sabarimala",
      departure_time: "09:30",
      duration: "2 hours",
      metadata: { activity_saved: true },
    },
    {
      item_type: "TRANSPORT",
      title: "Hotel to Airport",
      pickup: "Hotel",
      dropoff: "Airport",
      departure_time: "06:00",
      arrival_time: "07:15",
      duration: "1 hour 15 minutes",
      metadata: { transfer_saved: true },
    },
    {
      item_type: "ACTIVITY",
      title: "Unfinished activity",
      metadata: {},
    },
  ],
}];

describe("AI itinerary saved services context", () => {
  test("includes only saved activities and transfers when the itinerary toggle is enabled", () => {
    const result = buildSavedServicesForAi(days, true);
    expect(result.entries).toHaveLength(2);
    expect(result.prompt).toContain("Temple visit");
    expect(result.prompt).toContain("6:00 AM");
    expect(result.prompt).toContain("1 hour 15 minutes");
    expect(result.editableText).toContain("SAVED ACTIVITIES AND TRANSFERS (EDIT THESE DETAILS AS NEEDED)");
    expect(result.editableText).toContain("Day 1 (2026-09-30) — Temple visit [ACTIVITY]");
    expect(result.editableText).toContain("Travel duration: 1 hour 15 minutes");
    expect(result.prompt).not.toContain("Unfinished activity");
  });

  test("does not send activities or transfers when the itinerary toggle is disabled", () => {
    expect(buildSavedServicesForAi(days, false)).toEqual({ entries: [], prompt: "", editableText: "" });
  });

  test("uses entered custom route endpoints in transfer instructions", () => {
    const result = buildSavedServicesForAi([{
      day_number: 1,
      date: "2026-09-30",
      items: [{
        item_type: "TRANSPORT",
        title: "Custom transfer",
        pickup: "Custom",
        dropoff: "Custom",
        metadata: { transfer_saved: true, transfer_custom_from: "Rail station", transfer_custom_to: "Hill resort" },
      }],
    }], true);
    expect(result.prompt).toContain("Rail station");
    expect(result.prompt).toContain("Hill resort");
  });

  test("reflects rescheduled activities, transfers, and hotel times in the itinerary builder text", () => {
    const result = buildSavedServicesForAi([{
      day_number: 2,
      date: "2026-10-01",
      items: [
        { item_type: "ACTIVITY", title: "Museum visit", departure_time: "14:15", arrival_time: "16:00", metadata: { activity_saved: true, activity_date: "2026-10-01" } },
        { item_type: "TRANSPORT", title: "Hotel transfer", pickup: "Airport", dropoff: "Hotel", departure_time: "12:00", arrival_time: "12:45", metadata: { transfer_saved: true } },
        { item_type: "ACCOMMODATION", title: "Stay", hotel_name: "City Hotel", check_in: "2026-10-01", check_out: "2026-10-03", metadata: { check_in_time: "15:00", check_out_time: "11:00", room_details: [] } },
      ],
    }], true, true);

    expect(result.editableText).toContain("Day 2 (2026-10-01) — Museum visit [ACTIVITY]");
    expect(result.editableText).toContain("Date: 2026-10-01");
    expect(result.editableText).toContain("Start time: 2:15 PM");
    expect(result.editableText).toContain("End time: 4:00 PM");
    expect(result.editableText).toContain("Arrival time: 12:45 PM");
    expect(result.editableText).toContain("Hotel: City Hotel");
    expect(result.editableText).toContain("Check-in time: 3:00 PM");
    expect(result.editableText).toContain("Check-out time: 11:00 AM");
  });

  test("excludes pricing and internal IDs from the customer-facing AI plan text", () => {
    const result = buildSavedServicesForAi([{
      day_number: 1,
      date: "2026-09-30",
      items: [
        {
          item_type: "ACTIVITY",
          title: "Sabarmati Riverfront",
          location: "Ahmedabad",
          departure_time: "14:30",
          arrival_time: "15:00",
          description: "A scenic promenade.",
          metadata: {
            activity_saved: true,
            activity_date: "2026-09-30",
            activity_cost_total: "1800",
            google_place_id: "ChIJ_test",
            internal_service_id: "svc-123",
          },
        },
      ],
    }], true);

    expect(result.editableText).toContain("Sabarmati Riverfront");
    expect(result.editableText).not.toContain("Cost");
    expect(result.editableText).not.toContain("₹");
    expect(result.editableText).not.toContain("google_place_id");
    expect(result.editableText).not.toContain("Google Place ID");
    expect(result.editableText).not.toContain("internal_service_id");
    expect(result.prompt).not.toContain("activity_cost_total");
  });

});
