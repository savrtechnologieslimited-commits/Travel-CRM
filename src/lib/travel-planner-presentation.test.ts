import { describe, expect, test } from "bun:test";
import type { TripPlan } from "./travel-planner-engine";
import { travelPlanDayDescription, travelPlanToDocumentText } from "./travel-planner-presentation";

const plan: TripPlan = {
  understood_request: {
    destination: "Sri Lanka", cities_requested: ["Colombo"], duration_days: 2, nights: 1, start_date: "2026-10-01",
    adults: 2, children: 0, children_ages: [], departure_city: null, arrival_city: null, return_city: null,
    traveller_type: "couple", trip_purpose: null, travel_style: "relaxed", hotel_category: null, interests: ["culture"], special_requirements: [],
  },
  trip_summary: { title: "Sri Lanka Escape", destination: "Sri Lanka", duration_days: 2, nights: 1, travellers: "2 adults", travel_style: "relaxed", overview: "A relaxed cultural visit." },
  route: [{ city: "Colombo", nights: 1, arrival_day: 1, departure_day: 2, rationale: "Settle into the capital first, then keep the final morning free for departure." }],
  days: [
    { day: 1, date: "2026-10-01", city: "Colombo", title: "Explore Colombo", morning: ["Wander the old town's streets to get your first feel for the city's layered architecture and everyday rhythm."], afternoon: [], evening: ["Return to your hotel for a relaxing evening."], activity_ids: ["museum"], transfer_ids: [], overnight_city: "Colombo", hotel_category: null, why_this_day: "Ease into the trip with a relaxed introduction to Colombo before exploring further." },
    { day: 2, date: "2026-10-02", city: "Colombo", title: "Departure", morning: [], afternoon: [], evening: [], activity_ids: [], transfer_ids: [], overnight_city: null, hotel_category: null, why_this_day: "Allow time for departure." },
  ],
  hotel_stays: [{ id: "hotel-1", city: "Colombo", check_in_day: 1, check_out_day: 2, nights: 1, hotel_category: "4-star", requirement_text: "A centrally located hotel", hotel_selected: false, hotel_reference: null }],
  activities: [
    { id: "museum", name: "Old Town", city: "Colombo", day: 1, time_period: "morning", start_time: null, end_time: null, duration: null, category: "culture", reason: "The historic streets offer a gentle introduction to the city." },
    { id: "museum-extra", name: "Colombo National Museum", city: "Colombo", day: 1, time_period: "afternoon", start_time: null, end_time: null, duration: null, category: "culture", reason: "Explore exhibits that provide context for the country's history." },
  ],
  transfers: [{ id: "transfer-1", day: 1, from: "Old Town", to: "Colombo National Museum", purpose: "local", mode: "unspecified", suggested_time: null, approx_duration: "2.5 hours", fixed_service_ref: null, reason: "Continue through the city." }],
  assumptions: [], warnings: [],
};

describe("travel planner editor presentation", () => {
  test("creates an editable itinerary document without hotel research cards or hotel sections", () => {
    const documentText = travelPlanToDocumentText(plan);

    expect(documentText).toContain("ITINERARY");
    expect(documentText).toContain("DAY 1 — 2026-10-01 — Colombo");
    expect(documentText).toContain("Ease into the trip with a relaxed introduction to Colombo");
    expect(documentText).toContain("Wander the old town's streets to get your first feel");
    expect(documentText).toContain("Settle into the capital first");
    expect(documentText).toContain("An additional experience to consider: Colombo National Museum");
    expect(documentText).not.toContain("An additional experience to consider: Old Town");
    expect(documentText).not.toContain("Transfer:");
    expect(documentText).not.toContain("2.5 hours");
    expect(documentText).not.toContain("hotel");
    expect(travelPlanToDocumentText(plan, "Include hotel recommendations")).toContain("Return to your hotel");
    expect(travelPlanDayDescription(plan.days[0]!)).not.toContain("hotel");
    expect(documentText).not.toContain("HOTEL STAYS");
    expect(documentText).not.toContain("centrally located hotel");
  });
});
