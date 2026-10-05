import { describe, expect, test } from "bun:test";
import {
  buildItineraryFromPrompt,
  extractStructuredItineraryFromText,
  generateStructuredItinerary,
  validateItineraryAiOutput,
} from "./itinerary-builder.server";

describe("structured itinerary builder", () => {
  test("validates a structured itinerary payload before saving", () => {
    const valid = {
      title: "Kerala escape",
      destination: "Munnar",
      adults: 2,
      children: 1,
      summary: "Three-day Munnar getaway",
      days: [{ day_number: 1, title: "Arrival", description: "Arrival and local sightseeing", activities: ["Tea garden walk"], meals: ["Breakfast"], transport: "Airport transfer", hotel: "Green Valley Hotel", notes: "Check-in at 2 PM", photos: [] }],
      hotel_options: [{ id: "hotel-1", name: "Green Valley Hotel", city: "Munnar", star_category: "3 Star", room_type: "Double Room", meal_plan: "Breakfast", number_of_rooms: 1, adults: 2, children: 1, nights: 2, description: "Comfort stay", photos: [], source: "manual", hotel_cost: 12000 }],
      inclusions: ["Breakfast"],
      exclusions: ["Flights"],
      cancellation: ["Non-refundable"],
      notes: ["Ready for approval"],
      transport: ["Airport transfer"],
      photos: [],
      flights: [],
      status: "draft",
    };

    expect(validateItineraryAiOutput(valid)).toMatchObject({
      title: "Kerala escape",
      destination: "Munnar",
      days: [{ day_number: 1, title: "Arrival" }],
    });
  });

  test("rejects incomplete AI output before it reaches persistence", () => {
    expect(() => validateItineraryAiOutput({ title: "Broken response", destination: "Munnar" })).toThrow("at least one day");
  });

  test("builds a prompt-derived itinerary for a simple destination request", () => {
    const output = buildItineraryFromPrompt("Munnar 1 night, Thekkady 2 nights, Alleppey 1 night");
    expect(output.title).toContain("Munnar");
    expect(output.days.length).toBe(1);
    expect(output.hotel_options[0]?.hotel_cost).toBeGreaterThan(0);
  });

  test("keeps itinerary days in ascending day order", () => {
    const output = validateItineraryAiOutput({
      title: "Trip",
      destination: "Kerala",
      days: [{ day_number: 3, title: "Day 3" }, { day_number: 1, title: "Day 1" }, { day_number: 2, title: "Day 2" }],
      inclusions: [],
      exclusions: [],
      cancellation: [],
      notes: [],
      hotel_options: [],
      flights: [],
      transport: [],
      photos: [],
      status: "draft",
    });

    expect(output.days.map((day) => day.day_number)).toEqual([1, 2, 3]);
  });

  test("extracts the same structured model from pasted supplier text", async () => {
    const output = await extractStructuredItineraryFromText({
      sourceText: "Munnar 2 nights, Thekkady 1 night, breakfast included, private cab transfers",
    });

    expect(output.destination).toContain("Munnar");
    expect(output.inclusions).toContain("Accommodation");
  });

  test("generates itinerary output through the provider abstraction", async () => {
    const output = await generateStructuredItinerary({
      prompt: "Munnar 1 night, Thekkady 2 nights",
      provider: {
        generateFromPrompt: async (prompt) => ({
          title: `${prompt} itinerary`,
          destination: "Munnar",
          days: [{ day_number: 1, title: "Arrival", description: "On arrival", activities: ["Tea garden", "City walk"], meals: ["Breakfast"], transport: "Cab", hotel: "Royal Stay", notes: "Check in", photos: [] }],
          inclusions: ["Breakfast"],
          exclusions: ["Flights"],
          cancellation: ["Non-refundable"],
          notes: ["Review before saving"],
          hotel_options: [],
          flights: [],
          transport: ["Cab"],
          photos: [],
          status: "draft",
        }),
      },
    });

    expect(output.title).toContain("Munnar");
    expect(output.days[0]?.activities).toContain("Tea garden");
  });
});
