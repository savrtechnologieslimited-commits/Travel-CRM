import { describe, expect, test } from "bun:test";
import {
  determineNextQuestion,
  evaluateNextQuestionWithOpenAI,
  type ExtractedTravelRequirementsLike,
} from "./ai-next-question.server";
import { extractTravelRequirements } from "./ai-travel-extraction";

const emptyRequirements: ExtractedTravelRequirementsLike = {
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
};

describe("AI next-question engine", () => {
  test("empty conversation asks the highest priority useful question", () => {
    const result = determineNextQuestion(emptyRequirements);
    expect(result.action).toBe("ASK");
    expect(result.field).toBe("destination_text");
    expect(result.question?.toLowerCase()).toContain("destination");
  });

  test("destination already known does not ask destination again", () => {
    const result = determineNextQuestion({
      ...emptyRequirements,
      destination_text: "Bali",
      travel_month: "December",
      adults: 4,
      children: 2,
      departure_city: null,
    });

    expect(result.action).toBe("ASK");
    expect(result.field).toBe("departure_city");
    expect(result.question?.toLowerCase()).toContain("city");
  });

  test("month known does not force exact dates", () => {
    const result = determineNextQuestion({
      ...emptyRequirements,
      destination_text: "Bali",
      travel_month: "December",
      adults: 4,
      children: 2,
    });

    expect(result.action).toBe("ASK");
    expect(result.field).toBe("departure_city");
    expect(result.field).not.toBe("travel_start_date");
    expect(result.field).not.toBe("travel_end_date");
  });

  test("departure city already known does not ask again", () => {
    const result = determineNextQuestion({
      ...emptyRequirements,
      destination_text: "Bali",
      travel_month: "December",
      adults: 4,
      children: 2,
      departure_city: "Hyderabad",
      approximate_budget: null,
    });

    expect(result.action).toBe("ASK");
    expect(result.field).toBe("approximate_budget");
  });

  test("budget already known does not ask again", () => {
    const result = determineNextQuestion({
      ...emptyRequirements,
      destination_text: "Bali",
      travel_month: "December",
      adults: 4,
      children: 2,
      departure_city: "Hyderabad",
      approximate_budget: 200000,
      hotel_preference: null,
    });

    expect(result.action).toBe("ASK");
    expect(result.field).toBe("hotel_preference");
  });

  test("ambiguous destination produces clarify", () => {
    const result = determineNextQuestion({
      ...emptyRequirements,
      destination_text: "Bali or Phuket",
    });

    expect(result.action).toBe("CLARIFY");
    expect(result.field).toBe("destination_text");
    expect(result.question?.toLowerCase()).toContain("bali");
    expect(result.question?.toLowerCase()).toContain("phuket");
  });

  test("ready state when sufficient core information exists", () => {
    const result = determineNextQuestion({
      ...emptyRequirements,
      destination_text: "Bali",
      travel_month: "December",
      adults: 4,
      children: 2,
      departure_city: "Hyderabad",
      approximate_budget: 200000,
      hotel_preference: "4 star hotel",
    });

    expect(result.action).toBe("READY");
    expect(result.field).toBeNull();
    expect(result.question).toBeNull();
  });

  test("HUMAN_ACTIVE prevents AI question generation", () => {
    const result = determineNextQuestion(
      {
        ...emptyRequirements,
        destination_text: "Bali",
        travel_month: "December",
        adults: 4,
        children: 2,
      },
      { conversationMode: "HUMAN_ACTIVE" },
    );

    expect(result.status).toBe("HUMAN_ACTIVE");
    expect(result.action).toBe("READY");
    expect(result.field).toBeNull();
  });

  test("AI_ACTIVE permits processing", () => {
    const result = determineNextQuestion(
      {
        ...emptyRequirements,
        destination_text: "Bali",
        travel_month: "December",
        adults: 4,
        children: 2,
      },
      { conversationMode: "AI_ACTIVE" },
    );

    expect(result.status).toBe("AI_ACTIVE");
    expect(result.action).toBe("ASK");
    expect(result.field).toBe("departure_city");
  });

  test("OpenAI phrasing output respects deterministic field choice", async () => {
    const result = await evaluateNextQuestionWithOpenAI({
      messages: [{ id: "m1", direction: "inbound", body: "Hi, I want Bali in December for 4 adults and 2 children." }],
      requirements: {
        ...emptyRequirements,
        destination_text: "Bali",
        travel_month: "December",
        adults: 4,
        children: 2,
      },
      model: "gpt-4o-mini",
      apiKey: "test-key",
      client: {
        responses: {
          create: async () => ({
            output_text: JSON.stringify({
              action: "ASK",
              field: "departure_city",
              question: "Which city will you be travelling from?",
            }),
          }),
        },
      },
    });

    expect(result.action).toBe("ASK");
    expect(result.field).toBe("departure_city");
    expect(result.question).toBe("Which city will you be travelling from?");
  });

  test("scenario 1: all trip details in one message", () => {
    const result = extractTravelRequirements([
      {
        id: "m1",
        direction: "inbound",
        body: "Hi, I want Bali in December for 4 adults and 2 children from Hyderabad. Budget around 2 lakh and we want a good 4 star hotel.",
      },
    ]);

    expect(result.requirements.destination_text).toBe("Bali");
    expect(result.requirements.travel_month).toBe("December");
    expect(result.requirements.adults).toBe(4);
    expect(result.requirements.children).toBe(2);
    expect(result.requirements.departure_city).toBe("Hyderabad");
    expect(result.requirements.approximate_budget).toBe(200000);
    expect(result.requirements.hotel_preference).toBe("good 4 star");

    const next = determineNextQuestion(result.requirements);
    expect(next.action).toBe("READY");
  });

  test("scenario 2: information over multiple messages is remembered", () => {
    const result = extractTravelRequirements([
      { id: "m1", direction: "inbound", body: "I want to go to Bali." },
      { id: "m2", direction: "inbound", body: "December." },
      { id: "m3", direction: "inbound", body: "We are 4 adults and 2 kids." },
      { id: "m4", direction: "inbound", body: "From Hyderabad." },
    ]);

    expect(result.requirements.destination_text).toBe("Bali");
    expect(result.requirements.travel_month).toBe("December");
    expect(result.requirements.adults).toBe(4);
    expect(result.requirements.children).toBe(2);
    expect(result.requirements.departure_city).toBe("Hyderabad");

    const next = determineNextQuestion(result.requirements);
    expect(next.action).toBe("ASK");
    expect(next.field).toBe("approximate_budget");
  });

  test("scenario 3: later correction replaces older value", () => {
    const result = extractTravelRequirements([
      { id: "m1", direction: "inbound", body: "We are 4 adults." },
      { id: "m2", direction: "inbound", body: "Actually we are 5 adults." },
    ]);

    expect(result.requirements.adults).toBe(5);
  });

  test("scenario 4: month known without exact dates stays month-only", () => {
    const result = extractTravelRequirements([
      { id: "m1", direction: "inbound", body: "We want Bali in December." },
    ]);

    expect(result.requirements.destination_text).toBe("Bali");
    expect(result.requirements.travel_month).toBe("December");
    expect(result.requirements.travel_start_date).toBeNull();
    expect(result.requirements.travel_end_date).toBeNull();
  });

  test("scenario 5: ambiguous destination produces clarify", () => {
    const result = determineNextQuestion({
      ...emptyRequirements,
      destination_text: "Bali or Phuket",
    });

    expect(result.action).toBe("CLARIFY");
    expect(result.field).toBe("destination_text");
  });

  test("scenario 6: casual WhatsApp shorthand is still understood", () => {
    const result = extractTravelRequirements([
      { id: "m1", direction: "inbound", body: "Need bali dec 4 ppl 2 kids from hyd budget 2L" },
    ]);

    expect(result.requirements.destination_text).toBe("bali");
    expect(result.requirements.travel_month).toBe("December");
    expect(result.requirements.adults).toBe(4);
    expect(result.requirements.children).toBe(2);
    expect(result.requirements.departure_city).toBe("hyd");
    expect(result.requirements.approximate_budget).toBe(200000);
  });

  test("scenario 7: pricing question does not count as supplied trip details", () => {
    const result = extractTravelRequirements([
      { id: "m1", direction: "inbound", body: "Hi, how much will a Bali trip cost?" },
    ]);

    expect(result.requirements.destination_text).toBe("Bali");
    expect(result.requirements.travel_month).toBeNull();
    expect(result.requirements.adults).toBeNull();
    expect(result.requirements.departure_city).toBeNull();
    const next = determineNextQuestion(result.requirements);
    expect(next.field).toBe("travel_month");
  });

  test("scenario 8: human request pauses AI questioning", async () => {
    const result = await evaluateNextQuestionWithOpenAI({
      messages: [{ id: "m1", direction: "inbound", body: "I want to talk to someone." }],
      requirements: emptyRequirements,
      model: "gpt-4o-mini",
      apiKey: "test-key",
      client: {
        responses: {
          create: async () => ({
            output_text: JSON.stringify({ action: "ASK", field: "destination_text", question: "Which destination are you looking for?" }),
          }),
        },
      },
    });

    expect(result.action).toBe("READY");
    expect(result.field).toBeNull();
    expect(result.question).toBeNull();
  });

  test("scenario 9: answered departure city is not asked again", () => {
    const result = determineNextQuestion({
      ...emptyRequirements,
      destination_text: "Bali",
      travel_month: "December",
      adults: 4,
      children: 2,
      departure_city: "Hyderabad",
      approximate_budget: 200000,
    });

    expect(result.action).toBe("ASK");
    expect(result.field).toBe("hotel_preference");
  });

  test("scenario 10: unrelated discount message is ignored as a requirement", () => {
    const result = extractTravelRequirements([
      { id: "m1", direction: "inbound", body: "I want Bali in December." },
      { id: "m2", direction: "inbound", body: "Do you have any discounts?" },
    ]);

    expect(result.requirements.destination_text).toBe("Bali");
    expect(result.requirements.travel_month).toBe("December");
    expect(result.requirements.approximate_budget).toBeNull();
    const next = determineNextQuestion(result.requirements);
    expect(next.field).toBe("adults");
  });
});
