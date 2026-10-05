import { describe, expect, test } from "bun:test";
import {
  createOpenAITravelClient,
  extractTravelRequirementsWithOpenAI,
  getOpenAITravelProviderConfig,
} from "./openai-travel-provider.server";
import { validateTravelExtraction } from "./ai-travel-extraction";

describe("OpenAI travel extraction provider", () => {
  test("successful structured extraction", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: "Bali",
            travel_start_date: null,
            travel_end_date: null,
            travel_month: "December",
            adults: 4,
            children: 2,
            departure_city: "Hyderabad",
            approximate_budget: 200000,
            hotel_preference: "4 star",
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [
        { id: "1", direction: "inbound", body: "Hi, I want Bali in December for 4 adults and 2 children. We are travelling from Hyderabad. Budget around 2 lakh. We prefer a 4 star hotel.", message_timestamp: "2026-09-19T10:00:00.000Z" },
      ],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.destination_text).toBe("Bali");
    expect(result.requirements.travel_month).toBe("December");
    expect(result.requirements.adults).toBe(4);
    expect(result.requirements.children).toBe(2);
    expect(result.requirements.departure_city).toBe("Hyderabad");
    expect(result.requirements.approximate_budget).toBe(200000);
    expect(result.requirements.hotel_preference).toBe("4 star");
  });

  test("destination extraction is preserved in the travel_text field", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: "Thailand",
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: null,
            children: null,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: null,
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [{ id: "1", direction: "inbound", body: "I want Thailand", message_timestamp: "2026-09-19T10:00:00.000Z" }],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.destination_text).toBe("Thailand");
  });

  test("dates extraction works", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: null,
            travel_start_date: "2026-12-10",
            travel_end_date: "2026-12-18",
            travel_month: "December",
            adults: null,
            children: null,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: null,
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [{ id: "1", direction: "inbound", body: "Travel 2026-12-10 to 2026-12-18", message_timestamp: "2026-09-19T10:00:00.000Z" }],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.travel_start_date).toBe("2026-12-10");
    expect(result.requirements.travel_end_date).toBe("2026-12-18");
  });

  test("adults and children extraction works", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: null,
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: 3,
            children: 2,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: null,
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [{ id: "1", direction: "inbound", body: "3 adults and 2 children", message_timestamp: "2026-09-19T10:00:00.000Z" }],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.adults).toBe(3);
    expect(result.requirements.children).toBe(2);
  });

  test("budget extraction works", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: null,
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: null,
            children: null,
            departure_city: null,
            approximate_budget: 150000,
            hotel_preference: null,
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [{ id: "1", direction: "inbound", body: "Budget around 1.5 lakh", message_timestamp: "2026-09-19T10:00:00.000Z" }],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.approximate_budget).toBe(150000);
  });

  test("hotel preference extraction works", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: null,
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: null,
            children: null,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: "4 star",
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [{ id: "1", direction: "inbound", body: "prefer a 4 star hotel", message_timestamp: "2026-09-19T10:00:00.000Z" }],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.hotel_preference).toBe("4 star");
  });

  test("special requirements extraction works", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: null,
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: null,
            children: null,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: null,
            special_requirements: "vegetarian food, late check-in",
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [{ id: "1", direction: "inbound", body: "vegetarian food and late check-in", message_timestamp: "2026-09-19T10:00:00.000Z" }],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.special_requirements).toBe("vegetarian food, late check-in");
  });

  test("missing information returns null", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: null,
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: null,
            children: null,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: null,
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [{ id: "1", direction: "inbound", body: "Hi", message_timestamp: "2026-09-19T10:00:00.000Z" }],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.destination_text).toBeNull();
    expect(result.requirements.travel_month).toBeNull();
  });

  test("ambiguous information is not guessed", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: "Europe",
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: null,
            children: null,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: null,
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    const result = await extractTravelRequirementsWithOpenAI({
      messages: [{ id: "1", direction: "inbound", body: "Europe", message_timestamp: "2026-09-19T10:00:00.000Z" }],
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      client: mockClient,
    });

    expect(result.requirements.destination_text).toBe("Europe");
  });

  test("invalid structured data is rejected by deterministic validation", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: null,
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: -1,
            children: null,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: null,
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    await expect(
      extractTravelRequirementsWithOpenAI({
        messages: [{ id: "1", direction: "inbound", body: "Hi", message_timestamp: "2026-09-19T10:00:00.000Z" }],
        model: "gpt-4.1-mini",
        apiKey: "test-key",
        client: mockClient,
      }),
    ).rejects.toThrow("adults must be a non-negative integer");
  });

  test("AI cannot output employee_id or destination_id", async () => {
    const mockClient = {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            destination_text: "Bali",
            destination_id: "db-id",
            employee_id: "emp-id",
            travel_start_date: null,
            travel_end_date: null,
            travel_month: null,
            adults: 2,
            children: null,
            departure_city: null,
            approximate_budget: null,
            hotel_preference: null,
            special_requirements: null,
            trip_type: null,
          }),
        }),
      },
    };

    await expect(
      extractTravelRequirementsWithOpenAI({
        messages: [{ id: "1", direction: "inbound", body: "I want Bali", message_timestamp: "2026-09-19T10:00:00.000Z" }],
        model: "gpt-4.1-mini",
        apiKey: "test-key",
        client: mockClient,
      }),
    ).rejects.toThrow("Unsupported extraction fields");
  });

  test("missing OPENAI_API_KEY fails safely", () => {
    expect(() =>
      getOpenAITravelProviderConfig({ model: "gpt-4.1-mini" }, { OPENAI_API_KEY: "", OPENAI_MODEL: "gpt-4.1-mini" }),
    ).toThrow("OPENAI_API_KEY");
  });

  test("missing OPENAI_MODEL fails safely", () => {
    expect(() =>
      getOpenAITravelProviderConfig({ apiKey: "test-key" }, { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "" }),
    ).toThrow("OPENAI_MODEL");
  });

  test("OpenAI client factory is available", () => {
    expect(() => createOpenAITravelClient("test-key")).not.toThrow();
  });

  test("validateTravelExtraction accepts null fields", () => {
    expect(() =>
      validateTravelExtraction({
        destination_text: null,
        travel_start_date: null,
        travel_end_date: null,
        travel_month: null,
        adults: null,
        children: null,
        departure_city: null,
        approximate_budget: null,
        hotel_preference: null,
        special_requirements: null,
        trip_type: null,
      }),
    ).not.toThrow();
  });
});
