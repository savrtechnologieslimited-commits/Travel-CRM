import { describe, expect, test } from "bun:test";
import { buildBookedServiceContext, buildDeterministicBookedDraft, buildItineraryFromBooking } from "./ai-booking-itinerary.server";
import type { ItineraryGenerationProvider } from "./ai-itinerary-generation.server";

const booking = { id: "booking-1", travel_start: "2026-12-10", travel_end: "2026-12-12", destinations: { name: "Bali" } };
const items = [
  { id: "item-hotel", title: "Hotel service", start_date: "2026-12-10", hotel_bookings: [{ id: "hotel-1", hotel_name: "ABC Hotel", city: "Bali", check_in: "2026-12-10", check_out: "2026-12-12", nights: 2, rooms: 1, adults: 2, children: 0, extra_beds: 0, room_type: "Deluxe", meal_plan: "Breakfast" }] },
  { id: "item-transport", title: "Airport transfer", start_date: "2026-12-10", transport_services: [{ id: "transport-1", transport_type: "Airport Transfer", pickup_location: "Airport", drop_location: "Hotel", start_date: "2026-12-10", passengers: 2, vehicle_type: "Sedan", driver_name: "Driver" }] },
  { id: "item-activity", title: "Temple visit", start_date: "2026-12-11", activity_services: [{ id: "activity-1", activity_name: "Temple visit", activity_date: "2026-12-11", city: "Bali", location: "Temple", adults: 2, children: 0 }] },
];

const provider: ItineraryGenerationProvider = {
  name: "mock",
  generateItinerary: async () => ({ provider: "mock", draft: { title: "Booked trip", destination: "Bali", travel_start_date: "2026-12-10", travel_end_date: "2026-12-12", adults: 2, children: 0, customer_facing_notes: null, inclusions: [], exclusions: [], cancellation_info: null, days: [{ date: "2026-12-10", title: "Arrival", description: "", notes: null, items: [] }, { date: "2026-12-11", title: "Activity", description: "", notes: null, items: [] }, { date: "2026-12-12", title: "Departure", description: "", notes: null, items: [] }] } }),
};

describe("AI booking services itinerary", () => {
  test("normalizes hotel, transport, and activity services read-only", () => {
    const context = buildBookedServiceContext(booking, items);
    expect(context.services.map((service) => service.source_type)).toEqual(["HOTEL_BOOKING", "TRANSPORT_SERVICE", "ACTIVITY_SERVICE"]);
    expect(context.services[0]?.fields.hotel_name).toBe("ABC Hotel");
    expect(context.services[1]?.fields.pickup).toBe("Airport");
    expect(context.services[2]?.fields.activity_name).toBe("Temple visit");
  });

  test("builds deterministic dated days and source traceability", async () => {
    const result = await buildItineraryFromBooking("booking-1", { booking, items, provider, destinations: [{ id: "bali-id", name: "Bali" }] });
    expect(result.draft.days.map((day) => day.date)).toEqual(["2026-12-10", "2026-12-11", "2026-12-12"]);
    expect(result.draft.days[0]?.items.map((item) => item.item_type)).toEqual(["ACCOMMODATION", "EXTRA_TRANSPORT"]);
    expect(result.draft.days[1]?.items[0]?.title).toBe("Temple visit");
    expect(result.traceability.map((entry) => entry.source_id)).toEqual(["hotel-1", "transport-1", "activity-1"]);
    expect(result.provenance).toBe("AI_BOOKING_SERVICES");
  });

  test("source services win over AI attempts to add or alter services", () => {
    const context = buildBookedServiceContext(booking, items);
    const result = buildDeterministicBookedDraft(context, { title: "x", destination: "Bali", travel_start_date: null, travel_end_date: null, adults: null, children: null, customer_facing_notes: null, inclusions: [], exclusions: [], cancellation_info: null, days: [{ date: null, title: "Day", description: "", notes: null, items: [] }, { date: null, title: "Day", description: "", notes: null, items: [] }, { date: null, title: "Day", description: "", notes: null, items: [] }] });
    expect(result.draft.days.flatMap((day) => day.items).map((item) => item.title)).toEqual(["ABC Hotel", "Airport Transfer", "Temple visit"]);
  });

  test("unsupported booking items become safe notes", () => {
    const context = buildBookedServiceContext({ ...booking, id: "booking-2" }, [{ id: "item-unknown", title: "Unknown service", description: "Source detail" }]);
    expect(context.services[0]?.item_type).toBe("NOTE");
    expect(context.services[0]?.fields.title).toBe("Unknown service");
  });
});
