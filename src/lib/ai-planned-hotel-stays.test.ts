import { describe, expect, test } from "bun:test";
import { buildPlannedHotelStays } from "./ai-planned-hotel-stays";
import type { CompleteItineraryPlan } from "./ai-complete-itinerary.server";

const makePlan = (): CompleteItineraryPlan => ({
  trip_summary: { destination: "Ahmedabad", days: 6, nights: 5, start_date: "2026-09-30", end_date: "2026-10-05", adults: 2, children: 1, infants: 0, child_ages: "8", arrival_city: null, departure_city: null, arrival_mode: null, departure_mode: null, travel_style: "Moderate", route: "Ahmedabad", assumptions: [] },
  days: ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((date, index) => ({
    day_number: index + 1, date, city: index < 3 ? "Ahmedabad" : "Gandhinagar", title: `Day ${index + 1}`,
    overnight_city: index < 5 ? (index < 3 ? "Ahmedabad" : "Gandhinagar") : null,
    morning: [], afternoon: [], evening: [], transfers: [],
    hotel_requirement: index === 5 ? null : index < 3 ? "4-star hotel near central Ahmedabad" : "4-star hotel in Gandhinagar",
    meals: [], free_time: [], notes: [],
  })),
  hotel_requirements: ["4-star hotels"], transfer_requirements: [], unresolved_questions: [],
});

describe("AI planned hotel stays", () => {
  test("segments dated city stays at the first day in the next overnight city", () => {
    const plan = makePlan();
    plan.trip_summary = { ...plan.trip_summary, destination: "Bangalore and Mysore", days: 5, nights: 4, start_date: "2026-09-30", end_date: "2026-10-04", route: "Bangalore → Mysore" };
    plan.days = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((date, index) => ({
      ...plan.days[index % plan.days.length]!,
      day_number: index + 1,
      date,
      city: index < 2 ? "Bangalore" : "Mysore",
      overnight_city: index < 4 ? (index < 2 ? "Bangalore" : "Mysore") : null,
      hotel_requirement: index === 4 ? null : index < 2 ? "4-star hotel in Bangalore" : "4-star hotel in Mysore",
    }));

    const stays = buildPlannedHotelStays(plan, "Bangalore and Mysore, 4 nights, 3 adults, 4-star hotels");

    expect(stays.map(({ day_number, city, check_in, check_out, nights }) => ({ day_number, city, check_in, check_out, nights }))).toEqual([
      { day_number: 1, city: "Bangalore", check_in: "2026-09-30", check_out: "2026-10-02", nights: 2 },
      { day_number: 3, city: "Mysore", check_in: "2026-10-02", check_out: "2026-10-04", nights: 2 },
    ]);
  });

  test("preserves overnight city when daytime city differs on a transfer day", () => {
    const plan = makePlan();
    plan.trip_summary = { ...plan.trip_summary, days: 3, nights: 2, start_date: "2026-09-30", end_date: "2026-10-02", route: "Bangalore → Mysore" };
    plan.days = [
      { ...plan.days[0]!, day_number: 1, date: "2026-09-30", city: "Bangalore", overnight_city: "Bangalore", hotel_requirement: "4-star hotel in Bangalore" },
      { ...plan.days[1]!, day_number: 2, date: "2026-10-01", city: "Bangalore → Mysore", overnight_city: "Mysore", hotel_requirement: "4-star hotel in Mysore" },
      { ...plan.days[2]!, day_number: 3, date: "2026-10-02", city: "Mysore", overnight_city: null, hotel_requirement: null },
    ];

    const stays = buildPlannedHotelStays(plan, "Bangalore to Mysore, 3 days / 2 nights, 3 adults, 4-star hotels");

    expect(stays.map(({ city, check_in, check_out, nights }) => ({ city, check_in, check_out, nights }))).toEqual([
      { city: "Bangalore", check_in: "2026-09-30", check_out: "2026-10-01", nights: 1 },
      { city: "Mysore", check_in: "2026-10-01", check_out: "2026-10-02", nights: 1 },
    ]);
  });

  test("groups nights into editable stays, applies room preferences, and excludes checkout day", () => {
    const stays = buildPlannedHotelStays(makePlan(), "Ahmedabad 5 nights, 2 adults, 1 child age 8, 4-star hotels, 2 rooms, breakfast");
    expect(stays).toHaveLength(2);
    expect(stays[0]).toMatchObject({ day_number: 1, city: "Ahmedabad", check_in: "2026-09-30", check_out: "2026-10-03", nights: 3, star_category: "4 Star", rooms: 2, adults: 2, children: 1, meal_plan: "Breakfast" });
    expect(stays[1]).toMatchObject({ day_number: 4, city: "Gandhinagar", check_in: "2026-10-03", check_out: "2026-10-05", nights: 2 });
    expect(stays[0]?.room_details).toHaveLength(2);
    expect(stays[0]?.room_details.reduce((total, room) => total + room.adults, 0)).toBe(2);
    expect(stays[0]?.room_details.reduce((total, room) => total + room.kids, 0)).toBe(1);
  });

  test("does not duplicate a hotel already present on that check-in date", () => {
    const existing = new Map([["2026-09-30", [{ item_type: "ACCOMMODATION", check_in: "2026-09-30", check_out: "2026-10-03" }]]]);
    const stays = buildPlannedHotelStays(makePlan(), "Ahmedabad 5 nights, 2 adults, 4-star hotels", existing);
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({ day_number: 4, city: "Gandhinagar", check_in: "2026-10-03", check_out: "2026-10-05", nights: 2 });
  });

  test("keeps city/night requirements without inventing calendar dates", () => {
    const plan = makePlan();
    plan.days = plan.days.map((day) => ({ ...day, date: null }));
    const stays = buildPlannedHotelStays(plan, "Ahmedabad 5 nights, 2 adults, 4-star hotels");
    expect(stays).toHaveLength(2);
    expect(stays.map((stay) => [stay.city, stay.nights, stay.check_in, stay.check_out])).toEqual([
      ["Ahmedabad", 3, "", ""],
      ["Gandhinagar", 2, "", ""],
    ]);

    plan.days = plan.days.map((day) => ({ ...day, hotel_requirement: null }));
    expect(buildPlannedHotelStays(plan, "Ahmedabad 5 nights, 2 adults, 4-star hotels")).toEqual([]);
  });

  test("does not duplicate a date-pending hotel already attached to a city segment", () => {
    const plan = makePlan();
    plan.days = plan.days.map((day) => ({ ...day, date: null }));
    const existing = new Map([["day:1", [{ item_type: "ACCOMMODATION", check_in: "", check_out: "" }]]]);

    const stays = buildPlannedHotelStays(plan, "Ahmedabad 5 nights, 2 adults, 4-star hotels", existing);

    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({ day_number: 4, city: "Gandhinagar", nights: 2, check_in: "", check_out: "" });
  });
});
