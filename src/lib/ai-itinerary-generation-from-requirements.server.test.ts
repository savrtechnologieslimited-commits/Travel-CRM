import { describe, expect, test } from "bun:test";
import {
  generateItineraryFromRequirements,
  loadItineraryRequirements,
  type ItineraryRequirementsRecord,
} from "./ai-itinerary-generation-from-requirements.server";
import { ItineraryGenerationError, type ItineraryGenerationProvider } from "./ai-itinerary-generation.server";

const requirements: ItineraryRequirementsRecord = {
  destination: "Bali",
  destination_text: "Bali",
  travel_start_date: "2026-12-10",
  travel_end_date: "2026-12-14",
  travel_month: "December",
  adults: 2,
  children: 1,
  departure_city: "Hyderabad",
  approximate_budget: 100000,
  hotel_preference: "4 Star",
  special_requirements: "Vegetarian meals",
  trip_type: "family",
  city_nights: [{ city: "Ubud", nights: 2 }, { city: "Seminyak", nights: 3 }],
  lead_id: "lead-1",
  enquiry_id: "enquiry-1",
  customer_id: "customer-1",
  assigned_to: "employee-1",
};

const provider: ItineraryGenerationProvider = {
  name: "mock",
  generateItinerary: async (input) => ({
    provider: "mock",
    draft: {
      title: `${input.destination} proposal`,
      destination: input.destination,
      travel_start_date: input.travel_start_date ?? null,
      travel_end_date: input.travel_end_date ?? null,
      adults: input.adults ?? null,
      children: input.children ?? null,
      customer_facing_notes: "Proposal only; confirm all details before booking.",
      inclusions: [],
      exclusions: [],
      cancellation_info: null,
      days: Array.from({ length: 5 }, (_, index) => ({ date: null, title: `Day ${index + 1}`, description: "", notes: null, items: [] })),
    },
  }),
};

describe("AI itinerary generation from requirements", () => {
  test("resolves an exact destination and applies every supplied calendar date", async () => {
    const result = await generateItineraryFromRequirements(requirements, {
      provider,
      destinations: [{ id: "destination-bali", name: "Bali", is_active: true }],
    });
    expect(result.destination_resolution).toEqual({ status: "resolved", destination_id: "destination-bali", candidate_ids: ["destination-bali"] });
    expect(result.draft.days.map((day) => day.date)).toEqual(["2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14"]);
    expect(result.provenance).toBe("AI_REQUIREMENTS");
    expect(result.requirements.lead_id).toBe("lead-1");
    expect(result.requirements.city_nights).toEqual([{ city: "Ubud", nights: 2 }, { city: "Seminyak", nights: 3 }]);
  });

  test("rejects unresolved and ambiguous destinations without calling AI", async () => {
    let calls = 0;
    const countingProvider = { ...provider, generateItinerary: async () => { calls += 1; return provider.generateItinerary(requirements); } };
    await expect(generateItineraryFromRequirements(requirements, { provider: countingProvider, destinations: [] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(generateItineraryFromRequirements(requirements, { provider: countingProvider, destinations: [{ id: "1", name: "Bali" }, { id: "2", name: "Bali South" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(calls).toBe(0);
  });

  test("does not fabricate exact dates for month-only requirements", async () => {
    const monthOnly = { ...requirements, travel_start_date: null, travel_end_date: null, travel_month: "December" };
    const result = await generateItineraryFromRequirements(monthOnly, { provider, destinations: [{ id: "destination-bali", name: "Bali" }] });
    expect(result.draft.days.every((day) => day.date === null)).toBe(true);
    expect(result.draft.travel_start_date).toBeNull();
  });

  test("rejects invalid requirements before provider execution", async () => {
    await expect(generateItineraryFromRequirements({ ...requirements, destination_text: "", destination: "" }, { provider, destinations: [{ id: "1", name: "Bali" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(generateItineraryFromRequirements({ ...requirements, adults: -1 }, { provider, destinations: [{ id: "1", name: "Bali" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(generateItineraryFromRequirements({ ...requirements, travel_start_date: "2026-12-15", travel_end_date: "2026-12-10" }, { provider, destinations: [{ id: "1", name: "Bali" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  test("rejects a provider draft with the wrong number of dated days", async () => {
    const badProvider = { ...provider, generateItinerary: async () => ({ ...await provider.generateItinerary(requirements), draft: { ...(await provider.generateItinerary(requirements)).draft, days: [] } }) };
    await expect(generateItineraryFromRequirements(requirements, { provider: badProvider, destinations: [{ id: "1", name: "Bali" }] })).rejects.toMatchObject({ code: "SCHEMA_VIOLATION" });
  });

  test("preserves provider failures as safe application errors", async () => {
    const failedProvider = { ...provider, generateItinerary: async () => { throw new ItineraryGenerationError("PROVIDER_FAILURE", "Provider unavailable."); } };
    await expect(generateItineraryFromRequirements(requirements, { provider: failedProvider, destinations: [{ id: "1", name: "Bali" }] })).rejects.toMatchObject({ code: "PROVIDER_FAILURE", message: "Provider unavailable." });
  });
});
