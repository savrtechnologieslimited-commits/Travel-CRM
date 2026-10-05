import { describe, expect, test } from "bun:test";
import {
  GeminiItineraryProvider,
  ItineraryGenerationError,
  OpenAIItineraryProvider,
  generateItinerary,
  validateItineraryDraft,
  type ItineraryGenerationInput,
} from "./ai-itinerary-generation.server";

const minimalInput: ItineraryGenerationInput = { destination: "Bali" };

const draft = {
  title: "Bali proposal",
  destination: "Bali",
  travel_start_date: null,
  travel_end_date: null,
  adults: 2,
  children: 0,
  customer_facing_notes: "Proposed itinerary; subject to confirmation.",
  inclusions: ["Accommodation"],
  exclusions: ["International flights"],
  cancellation_info: "Confirm cancellation terms before booking.",
  days: [{
    date: null,
    title: "Arrival",
    description: "Arrival and orientation.",
    notes: null,
    items: [
      { item_type: "ACTIVITY", sequence: 1, title: "City walk", location: "Ubud", duration: "2 hours" },
      { item_type: "SIGHTSEEING", sequence: 2, title: "Temple visit", location: "Ubud" },
      { item_type: "TRANSPORT", sequence: 3, title: "Transfer", pickup: "Airport", dropoff: "Hotel", departure_time: "09:00", arrival_time: "10:15", duration: "1 hour 15 minutes" },
      { item_type: "MEAL", sequence: 4, title: "Breakfast", meal_type: "BREAKFAST" },
      { item_type: "ACCOMMODATION", sequence: 5, title: "Stay", hotel_name: "Example Hotel", hotel_city: "Ubud", rooms: 1, adults: 2, children: 0, extra_beds: 0, meal_plan: "Breakfast" },
      { item_type: "FLIGHT", sequence: 6, title: "Outbound", flight_airline: "Example Air" },
      { item_type: "VISA", sequence: 7, title: "Visa information", visa_country: "Indonesia", visa_type: "Visitor" },
      { item_type: "EXTRA_TRANSPORT", sequence: 8, title: "Local transfer", extra_transport_type: "Airport Transfer", pickup: "Airport", dropoff: "Hotel", extra_transport_passengers: 2 },
      { item_type: "NOTE", sequence: 9, title: "Reminder" },
    ],
  }],
};

function mockProvider(response: unknown, failure?: Error) {
  return { responses: { create: async () => { if (failure) throw failure; return { output_text: JSON.stringify(response) }; } } };
}

describe("AI itinerary generation contract", () => {
  test("validates minimal and full requirements", () => {
    expect(validateItineraryDraft({ ...draft, adults: null, children: null }).destination).toBe("Bali");
    expect(validateItineraryDraft(draft).days[0]?.items).toHaveLength(9);
  });

  test("supports every existing itinerary content type", () => {
    expect(validateItineraryDraft(draft).days[0]?.items.map((item) => item.item_type)).toEqual([
      "ACTIVITY", "SIGHTSEEING", "TRANSPORT", "MEAL", "ACCOMMODATION", "FLIGHT", "VISA", "EXTRA_TRANSPORT", "NOTE",
    ]);
  });

  test("preserves transfer pickup time, arrival time, and travel duration", () => {
    expect(validateItineraryDraft(draft).days[0]?.items[2]).toMatchObject({
      departure_time: "09:00",
      arrival_time: "10:15",
      duration: "1 hour 15 minutes",
    });
  });

  test("rejects invalid dates, sequences, numeric values, and unsupported types", () => {
    expect(() => validateItineraryDraft({ ...draft, travel_end_date: "2026-01-01", travel_start_date: "2026-02-01" })).toThrow("before");
    expect(() => validateItineraryDraft({ ...draft, days: [{ ...draft.days[0], items: [{ ...draft.days[0]!.items[0], sequence: 2 }] }] })).toThrow("sequence");
    expect(() => validateItineraryDraft({ ...draft, days: [{ ...draft.days[0], items: [{ ...draft.days[0]!.items[0], item_type: "UNKNOWN" }] }] })).toThrow("unsupported");
    expect(() => validateItineraryDraft({ ...draft, adults: -1 })).toThrow("non-negative");
  });

  test("rejects database IDs and unknown fields", () => {
    expect(() => validateItineraryDraft({ ...draft, destination_id: "db-id" })).toThrow("destination_id");
    expect(() => validateItineraryDraft({ ...draft, days: [{ ...draft.days[0], items: [{ ...draft.days[0]!.items[0], id: "db-id" }] }] })).toThrow("id");
    expect(() => validateItineraryDraft({ ...draft, made_up: true })).toThrow("not supported");
  });

  test("validates accommodation, flight, visa, and transport rules", () => {
    expect(() => validateItineraryDraft({ ...draft, days: [{ ...draft.days[0], items: [{ ...draft.days[0]!.items[4], hotel_name: "", item_type: "ACCOMMODATION" }] }] })).toThrow("Hotel name");
    expect(() => validateItineraryDraft({ ...draft, days: [{ ...draft.days[0], items: [{ ...draft.days[0]!.items[5], item_type: "FLIGHT", flight_airline: "Air", flight_price: 10, flight_currency: "US" }] }] })).toThrow("currency");
    expect(() => validateItineraryDraft({ ...draft, days: [{ ...draft.days[0], items: [{ ...draft.days[0]!.items[6], item_type: "VISA", visa_country: "" }] }] })).toThrow("country");
    expect(() => validateItineraryDraft({ ...draft, days: [{ ...draft.days[0], items: [{ ...draft.days[0]!.items[7], item_type: "EXTRA_TRANSPORT", dropoff: "" }] }] })).toThrow("pickup and drop");
  });

  test("provider abstraction returns validated drafts", async () => {
    const provider = new OpenAIItineraryProvider({ apiKey: "test", model: "test-model", client: mockProvider(draft) });
    const result = await generateItinerary(minimalInput, provider);
    expect(result.provider).toBe("openai");
    expect(result.draft.destination).toBe("Bali");
  });

  test("sends supplier text to OpenAI with rewrite instructions", async () => {
    let request: Record<string, unknown> | null = null;
    const provider = new OpenAIItineraryProvider({
      apiKey: "test",
      model: "test-model",
      client: { responses: { create: async (args) => { request = args; return { output_text: JSON.stringify(draft) }; } } },
    });
    const supplierText = "Day 1 – Arrival in Baku. Meet and greet followed by a private hotel transfer.";

    await provider.generateItinerary({ destination: "Baku", supplier_content: supplierText });

    const messages = request?.["input"] as Array<{ role: string; content: string }>;
    const userMessage = messages.find((message) => message.role === "user")?.content ?? "";
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";
    expect(JSON.parse(userMessage)).toMatchObject({ destination: "Baku", supplier_content: supplierText });
    expect(systemMessage).toContain("do not blindly copy the source");
    expect(systemMessage).toContain("Build inclusions and exclusions as two distinct lists");
    expect(systemMessage).toContain("Do not prefix titles with");
    expect(systemMessage).toContain("polished, customer-ready day-by-day itinerary");
  });

  test("normalizes cross-type accommodation location only for supplier imports", async () => {
    const supplierDraft = {
      ...draft,
      days: [{
        ...draft.days[0]!,
        items: [{
          item_type: "ACCOMMODATION",
          sequence: 1,
          title: "Baku Marriott",
          hotel_name: "Baku Marriott",
          location: "Baku",
        }],
      }],
    };
    const supplierProvider = new OpenAIItineraryProvider({
      apiKey: "test",
      model: "test-model",
      client: mockProvider(supplierDraft),
    });

    const result = await supplierProvider.generateItinerary({
      ...minimalInput,
      supplier_content: "Day 1 – Arrival in Baku",
    });

    expect(result.draft.days[0]?.items[0]).toMatchObject({ hotel_name: "Baku Marriott", hotel_city: "Baku" });
    expect(result.draft.days[0]?.items[0]).not.toHaveProperty("location");
    const regularProvider = new OpenAIItineraryProvider({ apiKey: "test", model: "test-model", client: mockProvider(supplierDraft) });
    await expect(regularProvider.generateItinerary(minimalInput)).rejects.toThrow("location is not supported");
  });

  test("normalizes supplier meal labels to supported meal enums", async () => {
    const supplierDraft = {
      ...draft,
      days: [{
        ...draft.days[0]!,
        items: [{ item_type: "MEAL", sequence: 1, title: "Breakfast at hotel", meal_type: "Breakfast at hotel" }],
      }],
    };
    const provider = new OpenAIItineraryProvider({ apiKey: "test", model: "test-model", client: mockProvider(supplierDraft) });
    const result = await provider.generateItinerary({ ...minimalInput, supplier_content: "Breakfast at hotel" });
    expect(result.draft.days[0]?.items[0]?.meal_type).toBe("BREAKFAST");
  });

  test("passes the requested city and night sequence to the generation provider", async () => {
    let received: ItineraryGenerationInput | null = null;
    const provider = {
      name: "mock" as const,
      generateItinerary: async (input: ItineraryGenerationInput) => {
        received = input;
        return { provider: "mock" as const, draft: validateItineraryDraft(draft) };
      },
    };

    await generateItinerary({ ...minimalInput, city_nights: [{ city: "Vadodara", nights: 2 }, { city: "Ahmedabad", nights: 3 }] }, provider);

    expect(received?.city_nights).toEqual([{ city: "Vadodara", nights: 2 }, { city: "Ahmedabad", nights: 3 }]);
  });

  test("rejects invalid city-night requirements", async () => {
    await expect(generateItinerary({ ...minimalInput, city_nights: [{ city: "Ahmedabad", nights: 0 }] }, {
      name: "mock",
      generateItinerary: async () => ({ provider: "mock", draft: validateItineraryDraft(draft) }),
    })).rejects.toMatchObject({ code: "SCHEMA_VIOLATION" });
  });

  test("handles malformed and failed provider responses", async () => {
    const malformed = new OpenAIItineraryProvider({ apiKey: "test", model: "test", client: { responses: { create: async () => ({ output_text: "not-json" }) } } });
    await expect(malformed.generateItinerary(minimalInput)).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    const failed = new OpenAIItineraryProvider({ apiKey: "test", model: "test", client: mockProvider(null, new Error("rate limited")) });
    await expect(failed.generateItinerary(minimalInput)).rejects.toMatchObject({ code: "PROVIDER_FAILURE" });
  });

  test("requires server configuration and keeps Gemini unconfigured", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.OPENAI_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    await expect(new OpenAIItineraryProvider().generateItinerary(minimalInput)).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
    process.env.OPENAI_API_KEY = originalKey;
    process.env.OPENAI_MODEL = originalModel;
    await expect(new GeminiItineraryProvider().generateItinerary(minimalInput)).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
  });

  test("wraps unexpected provider failures", async () => {
    const provider = { name: "mock" as const, generateItinerary: async () => { throw new Error("unexpected"); } };
    await expect(generateItinerary(minimalInput, provider)).rejects.toBeInstanceOf(ItineraryGenerationError);
  });
});
