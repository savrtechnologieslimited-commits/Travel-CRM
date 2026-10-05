import { describe, expect, test } from "bun:test";
import OpenAI from "openai";
import { planTrip } from "./travel-planner-engine";
import type { TripPlan } from "./travel-planner-engine/schema";
import { validateTripPlan } from "./travel-planner-engine/validateTripPlan";

function invalidFourDayPlan(): TripPlan {
  return {
    understood_request: {
      destination: "London and Paris", cities_requested: ["London", "Paris"], duration_days: 4, nights: 3,
      start_date: "2026-10-01", adults: 2, children: 0, children_ages: [], departure_city: null, arrival_city: null,
      return_city: null, traveller_type: "", trip_purpose: null, travel_style: "", hotel_category: "4 star", interests: [], special_requirements: [],
    },
    trip_summary: { title: "London and Paris", destination: "London and Paris", duration_days: 4, nights: 4, travellers: "2 adults", travel_style: "sightseeing", overview: "A city break." },
    route: [{ city: "London", nights: 4, arrival_day: 1, departure_day: 5, rationale: "Original route" }],
    days: [
      { day: 1, date: "2026-10-01", city: "London", title: "Arrival", morning: [], afternoon: [], evening: [], activity_ids: [], transfer_ids: [], overnight_city: "London", hotel_category: "4 star", why_this_day: "Arrive." },
      { day: 2, date: "2026-10-02", city: "London", title: "London", morning: [], afternoon: [], evening: [], activity_ids: [], transfer_ids: [], overnight_city: "London", hotel_category: "4 star", why_this_day: "Explore." },
      { day: 3, date: "2026-10-03", city: "Paris", title: "Paris", morning: [], afternoon: [], evening: [], activity_ids: [], transfer_ids: [], overnight_city: "Paris", hotel_category: "4 star", why_this_day: "Transfer." },
      { day: 4, date: "2026-10-04", city: "Paris", title: "Departure", morning: [], afternoon: [], evening: [], activity_ids: [], transfer_ids: [], overnight_city: "undefined", hotel_category: null, why_this_day: "Depart." },
    ],
    hotel_stays: [{ id: "bad", city: "Paris", check_in_day: 1, check_out_day: 5, nights: 4, hotel_category: null, requirement_text: "Hotel", hotel_selected: false, hotel_reference: null }],
    activities: [], transfers: [], assumptions: [], warnings: [],
  };
}

describe("OpenAI travel planner", () => {
  test("calls Responses API and returns its structured plan unchanged for validation", async () => {
    const modelPlan: TripPlan = {
      ...invalidFourDayPlan(),
      trip_summary: { ...invalidFourDayPlan().trip_summary, nights: 3 },
    };
    const response = {
      id: "resp_unit_test_model_response",
      model: "configured-test-model",
      status: "completed",
      output_text: JSON.stringify(modelPlan),
      output: [],
    } as unknown as OpenAI.Responses.Response;
    const apiCalls: Array<Record<string, unknown>> = [];
    const fakeClient = {
      responses: {
        create: async (params: Record<string, unknown>) => {
          apiCalls.push(params);
          return response;
        },
      },
    } as unknown as OpenAI;

    const result = await planTrip({
      request: "4 days 3 nights London 2 nights, Paris 1 night",
      requirements: { days: 4, nights: 3, startDate: "2026-10-01" },
    }, { client: fakeClient, model: "configured-test-model", maxRepairAttempts: 0 });

    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]?.["model"]).toBe("configured-test-model");
    expect(apiCalls[0]?.["text"]).toMatchObject({ format: { type: "json_schema", name: "trip_plan", strict: true } });
    expect(apiCalls[0]?.["store"]).toBe(false);
    expect(result.meta.responseId).toBe("resp_unit_test_model_response");
    expect(result.plan).toEqual(modelPlan);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues.map((issue) => issue.code)).toContain("NIGHT_COUNT_MISMATCH");
  });

  test("does not replace invalid model output with a locally repaired itinerary", () => {
    const plan = invalidFourDayPlan();
    const before = structuredClone(plan);
    const validation = validateTripPlan(plan, { expectedDays: 4, expectedNights: 3, startDate: "2026-10-01" });

    expect(plan).toEqual(before);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain("NIGHT_COUNT_MISMATCH");
    expect(validation.issues.map((issue) => issue.code)).toContain("LAST_DAY_HAS_OVERNIGHT");
    expect(validation.issues.map((issue) => issue.code)).toContain("ROUTE_INCONSISTENT");
    expect(validation.issues.map((issue) => issue.code)).toContain("HOTEL_STAY_MISMATCH");
  });
});
