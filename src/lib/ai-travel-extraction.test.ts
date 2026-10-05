import { describe, expect, test } from "bun:test";
import {
  extractTravelRequirements,
  resolveDestination,
  validateTravelExtraction,
  type ConversationMessage,
} from "./ai-travel-extraction";

function messages(...bodies: string[]): ConversationMessage[] {
  return bodies.map((body, index) => ({
    id: `message-${index + 1}`,
    direction: "inbound",
    body,
    message_timestamp: `2026-09-19T00:0${index}:00.000Z`,
  }));
}

describe("travel extraction", () => {
  test("returns missing information for a greeting", () => {
    const result = extractTravelRequirements(messages("Hi"));
    expect(result.requirements.destination_text).toBeNull();
    expect(result.missing_information).toContain("destination");
  });

  test("extracts destination and progressive requirements", () => {
    const result = extractTravelRequirements(
      messages(
        "I want Thailand in December for 4 people",
        "We are leaving from Hyderabad",
        "Budget around 2 lakh",
      ),
    );
    expect(result.requirements).toMatchObject({
      destination_text: "Thailand",
      travel_month: "December",
      adults: 4,
      departure_city: "Hyderabad",
      approximate_budget: 200000,
    });
    expect(result.requirements.children).toBeNull();
  });

  test("extracts adults and children only when stated", () => {
    const result = extractTravelRequirements(messages("Me, my wife and two kids"));
    expect(result.requirements.adults).toBe(2);
    expect(result.requirements.children).toBe(2);

    const incomplete = extractTravelRequirements(messages("Me and the kids"));
    expect(incomplete.requirements.adults).toBe(1);
    expect(incomplete.requirements.children).toBeNull();
  });

  test("marks uncertain months as inferred", () => {
    const result = extractTravelRequirements(messages("Maybe December, not sure"));
    expect(result.requirements.travel_month).toBe("December");
    expect(result.field_metadata.travel_month?.status).toBe("INFERRED");
    expect(result.requirements.travel_start_date).toBeNull();
  });

  test("does not guess an ambiguous destination", () => {
    const result = resolveDestination("Europe", [
      { id: "france", name: "Europe France" },
      { id: "italy", name: "Europe Italy" },
    ]);
    expect(result.status).toBe("ambiguous");
    expect(result.destination_id).toBeNull();
    expect(result.candidate_ids).toEqual(["france", "italy"]);
  });

  test("lets a later explicit destination correction supersede the old value", () => {
    const result = extractTravelRequirements(
      messages("I want Thailand", "Actually forget Thailand, we're thinking Bali"),
    );
    expect(result.requirements.destination_text).toBe("Bali");
    expect(result.destination_resolution.status).toBe("unresolved");
  });

  test("combines context across several messages without erasing fields", () => {
    const result = extractTravelRequirements(
      messages("I want Thailand", "December", "We are leaving from Hyderabad"),
    );
    expect(result.requirements).toMatchObject({
      destination_text: "Thailand",
      travel_month: "December",
      departure_city: "Hyderabad",
    });
  });

  test("rejects unsupported and invalid structured output", () => {
    expect(() => validateTravelExtraction({ employee_id: "must not be accepted" })).toThrow(
      "Unsupported extraction fields",
    );
    expect(() => validateTravelExtraction({ adults: -1 })).toThrow(
      "adults must be a non-negative integer",
    );
    expect(() =>
      validateTravelExtraction({ travel_start_date: "2026-12-20", travel_end_date: "2026-12-01" }),
    ).toThrow("travel_end_date cannot be before travel_start_date");
  });
});
