import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { generateCompleteItinerary, type CompleteItineraryPlan } from "./ai-complete-itinerary.server";

const makePlan = (days = 6, nights = 5, dateStart: string | null = null): CompleteItineraryPlan => ({
  trip_summary: {
    destination: "Ahmedabad and Gandhinagar", days, nights, start_date: dateStart,
    end_date: dateStart ? addDays(dateStart, days - 1) : null,
    adults: 2, children: 0, infants: 0, child_ages: null,
    arrival_city: "Ahmedabad", departure_city: "Ahmedabad", arrival_mode: "flight", departure_mode: "flight",
    travel_style: "Relaxed, cultural sightseeing", route: "Ahmedabad → Gandhinagar",
    assumptions: ["Hotel bookings and transfers are not confirmed."],
  },
  days: Array.from({ length: days }, (_, index) => ({
    day_number: index + 1,
    date: dateStart ? addDays(dateStart, index) : null,
    city: index > 1 ? "Gandhinagar" : "Ahmedabad",
    overnight_city: index < nights ? (index > 1 ? "Gandhinagar" : "Ahmedabad") : null,
    title: index === 0 ? "Arrival and gentle introduction" : `Day ${index + 1} plan`,
    morning: index === 0 ? [] : ["Begin the day with a relaxed visit to a cultural attraction in the named city."],
    afternoon: ["Continue with a visit to a destination-relevant cultural attraction."],
    evening: ["Enjoy a quiet evening at leisure."],
    transfers: index === 0 ? ["Arrange an airport transfer to the hotel."] : [],
    hotel_requirement: index < nights ? "Recommended 4-star accommodation in a convenient area" : null,
    meals: ["Optional local cuisine idea; no restaurant reservation"],
    free_time: [],
    notes: [],
  })),
  hotel_requirements: ["Recommended 4-star accommodation"],
  transfer_requirements: ["Arrange arrival and departure transfers"],
  unresolved_questions: ["Confirm preferred hotel area."],
});

function addDays(value: string, count: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function mockClient(plan: CompleteItineraryPlan, capture?: (args: Record<string, unknown>) => void) {
  return { responses: { create: async (args: Record<string, unknown>) => {
    capture?.(args);
    return { output_text: JSON.stringify(plan) };
  } } };
}

describe("complete AI itinerary planner", () => {
  test("generates a complete six-day plan using only the prompt and sanitized confirmed ticket facts", async () => {
    let request: Record<string, unknown> | undefined;
    const plan = makePlan(6, 5, "2026-09-30");
    const result = await generateCompleteItinerary({
      requirements: "5 nights 6 days Ahmedabad and Gandhinagar for 2 adults. Interested in sightseeing, culture and food. Comfortable 4-star hotels.",
      tickets: [{ kind: "flight", serviceName: "Air India", serviceNumber: "AI-6742", date: "2026-09-30", departureTime: "10:00", arrivalDate: "2026-09-30", arrivalTime: "12:30", departureLocation: "HYDERABAD", arrivalLocation: "AHMEDABAD", travelClass: "ECONOMY", fare: "25000", currency: "INR", pnr: "SECRET-PNR", notes: "internal notes" }],
    }, { apiKey: "test", model: "test-model", client: mockClient(plan, (args) => { request = args; }) });

    expect(result.days).toHaveLength(6);
    expect(result.trip_summary.days).toBe(6);
    expect(result.trip_summary.nights).toBe(5);
    expect(result.trip_summary.arrival_city).toBe("AHMEDABAD");
    expect(result.trip_summary.arrival_mode).toBe("flight");
    expect(result.days[0]?.morning).toEqual([]);
    expect(result.days[0]?.afternoon.length).toBeGreaterThan(0);
    const messages = request?.["input"] as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain("experienced travel consultant");
    expect(messages[0]?.content).toContain("customer-ready itinerary");
    const payload = JSON.parse(messages[1]!.content) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["confirmedTickets", "derivedDuration", "explicitDateRange", "hotelRecommendations", "refinement", "requirements", "savedServices", "tripContext"]);
    expect(JSON.stringify(payload)).not.toMatch(/25000|INR|SECRET-PNR|internal notes/i);
    expect(JSON.stringify(payload["confirmedTickets"])).toContain("AI-6742");
    expect(JSON.stringify(result)).not.toMatch(/25000|INR|SECRET-PNR|internal notes|\b(?:cost|price|fare)\b/i);
  });

  test("preserves saved hotel, activity, and transfer facts while excluding private financial details", async () => {
    const plan = makePlan(3, 2, "2026-10-01");
    let request: Record<string, unknown> | undefined;
    const result = await generateCompleteItinerary({
      requirements: "3 days in Bangalore and Mysore for 3 adults, relaxed.",
      tickets: [],
      savedServices: [
        { day_number: 1, date: "", item_type: "ACCOMMODATION", title: "Hotel Cedar", details: ["Check-in: 2026-10-01", "Room price: INR 9000"] },
        { day_number: 1, date: "", item_type: "ACTIVITY", title: "Bangalore Palace", details: ["Date: 2026-10-01", "Location: Vasanth Nagar"] },
        { day_number: 2, date: "", item_type: "TRANSPORT", title: "Bangalore to Mysore transfer", details: ["Route: Bangalore → Mysore", "Pickup time: 09:30 AM"] },
      ],
      tripContext: { startDate: "2026-10-01", endDate: "2026-10-03", adults: 3, children: 0 },
    }, { apiKey: "test", model: "test", client: mockClient(Object.assign(plan, { days: plan.days.map((day, index) => index === 1 ? { ...day, transfers: ["Depart for Mysore at 09:30 AM."] } : day) }), (args) => { request = args; }) });

    const payload = JSON.parse((request?.["input"] as Array<{ role: string; content: string }>)[1]!.content) as Record<string, unknown>;
    expect(payload["tripContext"]).toEqual({ startDate: "2026-10-01", endDate: "2026-10-03", adults: 3, children: 0 });
    expect(payload["savedServices"]).toHaveLength(3);
    expect(JSON.stringify(payload["savedServices"])).not.toMatch(/9000|INR|price/i);
    expect(result.trip_summary.adults).toBe(3);
    expect(result.days[0]?.saved_services?.map((service) => service.title)).toEqual(["Hotel Cedar", "Bangalore Palace"]);
    expect(result.days[1]?.saved_services?.[0]?.title).toBe("Bangalore to Mysore transfer");
  });

  test("uses an existing saved-service date to anchor undated itinerary days", async () => {
    const plan = makePlan(3, 2, "2026-10-01");
    const result = await generateCompleteItinerary({
      requirements: "3 days in Bangalore for 2 adults, relaxed.",
      tickets: [],
      savedServices: [{ day_number: 2, date: "2026-10-02", item_type: "ACTIVITY", title: "Bangalore Palace", details: ["Visit at the requested time"] }],
    }, { apiKey: "test", model: "test", client: mockClient(plan) });

    expect(result.trip_summary.start_date).toBe("2026-10-01");
    expect(result.days.map((day) => day.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(result.days[1]?.saved_services?.[0]?.title).toBe("Bangalore Palace");
  });

  test("derives three nights when the user supplies only four days", async () => {
    const plan = makePlan(4, 3);
    const result = await generateCompleteItinerary({ requirements: "4 days in Jaipur for a couple.", tickets: [] }, {
      apiKey: "test", model: "test", client: mockClient(plan),
    });
    expect(result.trip_summary.days).toBe(4);
    expect(result.trip_summary.nights).toBe(3);
    expect(result.trip_summary.assumptions.length).toBeGreaterThan(0);
  });

  test("accepts the minimal Bangalore-Mysore three-day relaxed-trip requirement", async () => {
    const plan = makePlan(3, 2);
    plan.trip_summary.destination = "Bangalore and Mysore";
    plan.trip_summary.route = "Bangalore → Mysore";
    plan.trip_summary.travel_style = "Relaxed";
    plan.days = plan.days.map((day, index) => ({
      ...day,
      city: index < 2 ? "Bangalore" : "Mysore",
      overnight_city: index < 2 ? (index === 0 ? "Bangalore" : "Mysore") : null,
      title: ["Arrival and an easy introduction to Bangalore", "Bangalore highlights at a comfortable pace", "Journey to Mysore and explore the city"][index]!,
      morning: index === 0 ? [] : [index === 1 ? "Visit Cubbon Park and Vidhana Soudha." : "Travel from Bangalore to Mysore and settle in."],
      afternoon: [index === 2 ? "Explore Mysore Palace and the historic city centre." : "Visit a major city attraction, with time to pause between visits."],
      evening: ["Enjoy the evening at leisure."],
      hotel_requirement: index === 0 ? "Recommended stay in central Bangalore" : index === 1 ? "Recommended stay in Mysore" : null,
    }));
    const result = await generateCompleteItinerary({
      requirements: "3 adults, Bangalore and Mysore, 3 days / 2 nights, relaxed trip",
      tickets: [],
    }, { apiKey: "test", model: "test", client: mockClient(plan) });

    expect(result.trip_summary.days).toBe(3);
    expect(result.trip_summary.nights).toBe(2);
    expect(result.days.map((day) => day.city)).toEqual(["Bangalore", "Bangalore", "Mysore"]);
    expect(result.days[2]?.morning[0]).toContain("Bangalore to Mysore");
    expect(result.days.every((day) => !day.hotel_requirement?.match(/booked|confirmed/i))).toBe(true);
  });

  test("omits generated hotel recommendations when the user selects without hotels", async () => {
    const plan = makePlan(3, 2);
    let request: Record<string, unknown> | undefined;
    const result = await generateCompleteItinerary({
      requirements: "3 days in Jaipur for 2 adults.",
      tickets: [],
      includeHotelRecommendations: false,
    }, { apiKey: "test", model: "test", client: mockClient(plan, (args) => { request = args; }) });

    const payload = JSON.parse((request?.["input"] as Array<{ role: string; content: string }>)[1]!.content) as Record<string, unknown>;
    expect(payload["hotelRecommendations"]).toContain("Do not include hotel requirements");
    expect(result.hotel_requirements).toEqual([]);
    expect(result.days.every((day) => day.hotel_requirement === null)).toBe(true);
  });

  test("preserves an explicit travel date range and fills each day with its actual date", async () => {
    const plan = makePlan(6, 5, "2026-09-30");
    const result = await generateCompleteItinerary({ requirements: "6 days / 5 nights Ahmedabad 2026-09-30 to 2026-10-05", tickets: [] }, {
      apiKey: "test", model: "test", client: mockClient(plan),
    });
    expect(result.trip_summary.start_date).toBe("2026-09-30");
    expect(result.trip_summary.end_date).toBe("2026-10-05");
    expect(result.days.map((day) => day.date)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
  });

  test("rejects a day count that does not match the user's duration", async () => {
    await expect(generateCompleteItinerary({ requirements: "4 days in Jaipur", tickets: [] }, {
      apiKey: "test", model: "test", client: mockClient(makePlan(3, 2)),
    })).rejects.toMatchObject({ code: "VALIDATION_FAILURE" });
  });

  test("rejects activities scheduled before a confirmed afternoon arrival", async () => {
    const plan = makePlan(6, 5, "2026-09-30");
    plan.days[0]!.morning = ["Visit a museum"];
    await expect(generateCompleteItinerary({
      requirements: "6 days / 5 nights Ahmedabad 2026-09-30 to 2026-10-05",
      tickets: [{ kind: "flight", date: "2026-09-30", arrivalDate: "2026-09-30", arrivalTime: "12:30" }],
    }, { apiKey: "test", model: "test", client: mockClient(plan) })).rejects.toMatchObject({ code: "VALIDATION_FAILURE" });
  });

  test("respects a confirmed train arrival and blocks sightseeing before it", async () => {
    const plan = makePlan(3, 2, "2026-10-01");
    plan.days[0]!.morning = ["Visit the city palace."];
    await expect(generateCompleteItinerary({
      requirements: "3 days in Jaipur, 2026-10-01 to 2026-10-03.",
      tickets: [{ kind: "train", serviceName: "Shatabdi Express", serviceNumber: "12015", date: "2026-10-01", arrivalDate: "2026-10-01", arrivalTime: "14:00", departureLocation: "Delhi", arrivalLocation: "Jaipur" }],
    }, { apiKey: "test", model: "test", client: mockClient(plan) })).rejects.toMatchObject({ code: "VALIDATION_FAILURE" });
  });

  test("rejects exact activity times that are not in the prompt or confirmed tickets", async () => {
    const plan = makePlan(3, 2);
    plan.days[0]!.afternoon = ["Visit the city museum at 2:00 PM."];
    await expect(generateCompleteItinerary({ requirements: "3 days in Jaipur", tickets: [] }, {
      apiKey: "test", model: "test", client: mockClient(plan),
    })).rejects.toMatchObject({ code: "VALIDATION_FAILURE" });
  });

  test("removes unrequested shopping themes and unsupported availability claims", async () => {
    const plan = makePlan(3, 2);
    plan.days[0]!.evening = ["Explore the local markets."];
    plan.days[0]!.meals = ["Dinner at a local restaurant."];
    const result = await generateCompleteItinerary({ requirements: "3 days in Jaipur for sightseeing", tickets: [] }, {
      apiKey: "test", model: "test", client: mockClient(plan),
    });
    expect(result.days[0]?.evening).toEqual([]);
    expect(result.days[0]?.meals).toEqual([]);

    const availabilityPlan = makePlan(3, 2);
    availabilityPlan.days[0]!.notes = ["Visit the museum if available."];
    const availabilityResult = await generateCompleteItinerary({ requirements: "3 days in Jaipur for sightseeing", tickets: [] }, {
      apiKey: "test", model: "test", client: mockClient(availabilityPlan),
    });
    expect(availabilityResult.days[0]?.notes).toEqual([]);
  });

  test("blocks monetary content and fake booking confirmations in model output", async () => {
    const pricePlan = makePlan(3, 2);
    pricePlan.days[0]!.afternoon = ["Visit the attraction for ₹500."];
    await expect(generateCompleteItinerary({ requirements: "3 days in Ahmedabad", tickets: [] }, {
      apiKey: "test", model: "test", client: mockClient(pricePlan),
    })).rejects.toMatchObject({ code: "VALIDATION_FAILURE" });

    const bookingPlan = makePlan(3, 2);
    bookingPlan.days[0]!.hotel_requirement = "Your hotel is booked and confirmed.";
    await expect(generateCompleteItinerary({ requirements: "3 days in Ahmedabad", tickets: [] }, {
      apiKey: "test", model: "test", client: mockClient(bookingPlan),
    })).rejects.toMatchObject({ code: "VALIDATION_FAILURE" });
  });

  test("returns a clear server configuration error when OpenAI is not configured", async () => {
    await expect(generateCompleteItinerary({ requirements: "3 days in Jaipur", tickets: [] }, {
      apiKey: "", model: "test", client: mockClient(makePlan(3, 2)),
    })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  test("the complete itinerary UI uses the authenticated travel planner server route", () => {
    const routeSource = readFileSync(new URL("../routes/_authenticated/itinerary-builder.tsx", import.meta.url), "utf8");
    const panelSource = readFileSync(new URL("../components/travel-planner-panel.tsx", import.meta.url), "utf8");
    const serverFunction = readFileSync(new URL("./travel-planner.ts", import.meta.url), "utf8");
    const serverSource = readFileSync(new URL("./travel-planner-engine/openaiClient.ts", import.meta.url), "utf8");
    expect(routeSource).toContain("onAcceptTravelPlannerPlan={acceptTravelPlannerPlan}");
    expect(routeSource).toContain('setActiveSection("day")');
    expect(routeSource).toContain("travelPlanToDocumentText(plan, requirements)");
    expect(routeSource).toContain("formOverride?: Partial<TripForm>, allowMissingDestination = false");
    expect(routeSource).toContain("plannerFormOverride, true");
    expect(routeSource).toContain("customer_id: (formOverride?.customer_id ?? form.customer_id) || null");
    expect(routeSource).toContain("lead_id: (formOverride?.lead_id ?? form.lead_id) || null");
    expect(routeSource).toContain("...(!allowMissingDestination ? { customer_quotes: form.customer_quotes } : {})");
    expect(routeSource).toContain("savedItemKind || allowMissingDestination ? {} : { document_html:");
    expect(routeSource).toContain("<TravelPlannerPanel");
    expect(routeSource).toContain('DialogTitle>Assign itinerary to a client</DialogTitle>');
    expect(routeSource).toContain('aria-label="Search leads and customers"');
    expect(panelSource).toContain("buildTravelPlannerRequest(requirements)");
    expect(panelSource).toContain("Create itinerary in editor");
    expect(panelSource).toContain("onAccept(generated.plan, requirements.trim())");
    expect(panelSource).not.toContain("Research and select hotels");
    expect(panelSource).not.toContain("Search hotels in");
    expect(panelSource).not.toContain("tripContext, tickets");
    expect(panelSource).not.toContain("savedServices");
    expect(serverFunction).toContain("requireSupabaseAuth");
    expect(serverFunction).toContain("await planTrip(data, {");
    expect(serverFunction).toContain("useWebSearch: false");
    expect(serverFunction).toContain("process.env[\"OPENAI_TRAVEL_PLANNER_MODEL\"]");
    expect(serverSource).toContain("process.env[\"OPENAI_API_KEY\"]");
  });
});
