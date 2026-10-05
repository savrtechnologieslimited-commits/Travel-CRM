import { describe, expect, test } from "bun:test";
import { completeItineraryPlanToText, sanitizeCompletePlanForPreferences } from "./complete-itinerary-presentation";
import type { CompleteItineraryPlan } from "./ai-complete-itinerary.server";

const plan: CompleteItineraryPlan = {
  trip_summary: { destination: "Jaipur", days: 2, nights: 1, start_date: null, end_date: null, adults: 2, children: 0, infants: 0, child_ages: null, arrival_city: null, departure_city: null, arrival_mode: null, departure_mode: null, travel_style: "Moderate", route: "Jaipur", assumptions: [] },
  days: [{ day_number: 1, date: null, city: "Jaipur", overnight_city: null, title: "Arrival", morning: [], afternoon: ["Visit a palace"], evening: ["Explore local markets", "Dinner at a restaurant"], transfers: [], hotel_requirement: "4-star hotel", meals: ["Breakfast", "Lunch at a local cafe"], free_time: ["Relax or go shopping"], notes: ["Visit the zoo if available"] }],
  hotel_requirements: [], transfer_requirements: [], unresolved_questions: [],
};

describe("complete itinerary presentation safety", () => {
  test("removes unrequested shopping, dining, and availability suggestions before review", () => {
    const result = sanitizeCompletePlanForPreferences(plan, "2 days in Jaipur for sightseeing and culture.");
    expect(result.days[0]?.afternoon).toEqual(["Visit a palace"]);
    expect(result.days[0]?.evening).toEqual([]);
    expect(result.days[0]?.meals).toEqual([]);
    expect(result.days[0]?.free_time).toEqual([]);
    expect(result.days[0]?.notes).toEqual([]);
  });

  test("preserves requested food and shopping preferences", () => {
    const result = sanitizeCompletePlanForPreferences(plan, "2 days in Jaipur with local food and shopping.");
    expect(result.days[0]?.evening).toHaveLength(2);
    expect(result.days[0]?.meals).toHaveLength(2);
  });

  test("formats a concise customer-facing narrative and preserves saved arrangement details", () => {
    const customerPlan = structuredClone(plan);
    customerPlan.trip_summary.assumptions = [];
    customerPlan.trip_summary.destination = "Bangalore";
    customerPlan.trip_summary.route = "Bangalore";
    customerPlan.days[0]!.city = "Bangalore";
    customerPlan.days[0]!.title = "A gentle introduction to Bangalore";
    customerPlan.days[0]!.morning = ["Arrive in Bangalore and settle into your hotel."];
    customerPlan.days[0]!.afternoon = ["Visit Lalbagh Botanical Garden, then explore the nearby city centre."];
    customerPlan.days[0]!.hotel_requirement = "A comfortable hotel in central Bangalore";
    customerPlan.days[0]!.saved_services = [{ day_number: 1, date: "", item_type: "ACCOMMODATION", title: "Hotel Cedar", details: ["Check-in: 2026-10-01"] }];
    const safePlan = sanitizeCompletePlanForPreferences(customerPlan, "2 days in Bangalore for sightseeing.");
    const text = completeItineraryPlanToText(safePlan, []);

    expect(text).toContain("TRIP SUMMARY");
    expect(text).toContain("DAY 1 — Bangalore");
    expect(text).toContain("Morning: Arrive in Bangalore and settle into your hotel.");
    expect(text).toContain("Stay: Hotel Cedar (2026-10-01)");
    expect(text).not.toMatch(/AI-GENERATED PLAN|Morning — Planned|Not booked|Saved service|source record|day_number|booking_item_id|\b(?:₹|\$\s?\d|\bprice\b|\bcost\b)/i);
  });

  test("keeps hotel recommendations out of the itinerary copy when handled in the Hotels editor", () => {
    const text = completeItineraryPlanToText(plan, [], { includeHotelRecommendations: false });
    expect(text).not.toMatch(/Recommended stay|ACCOMMODATION RECOMMENDATIONS|4-star hotel/i);
    expect(text).toContain("Visit a palace");
  });
});
