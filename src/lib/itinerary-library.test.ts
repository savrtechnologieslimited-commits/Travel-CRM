import { describe, expect, test } from "bun:test";
import {
  validateDocumentMetadata,
  validateItineraryInput,
  type ItineraryRecordInput,
} from "./itinerary-library";

describe("itinerary library validation", () => {
  const validInput: ItineraryRecordInput = {
    name: "Kerala Family Escape",
    destination_id: "8dd27058-359d-4f02-8147-0ff0f5269f10",
    duration_nights: 5,
    duration_days: 6,
    price: 24999,
    currency: "INR",
    hotel_category: "4 Star",
    trip_type: "family",
    description: "Family holiday package",
    valid_from: "2026-01-10",
    valid_until: "2026-02-10",
    is_active: true,
  };

  test("creates a valid itinerary record", () => {
    expect(validateItineraryInput(validInput)).toEqual({
      valid: true,
      errors: {},
    });
  });

  test("rejects invalid duration values", () => {
    const outcome = validateItineraryInput({
      ...validInput,
      duration_nights: -1,
      duration_days: 2,
    });

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.duration_nights).toMatch(/non-negative/i);
  });

  test("rejects invalid price values", () => {
    const outcome = validateItineraryInput({
      ...validInput,
      price: -1,
    });

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.price).toMatch(/non-negative/i);
  });

  test("rejects invalid validity dates", () => {
    const outcome = validateItineraryInput({
      ...validInput,
      valid_from: "2026-03-10",
      valid_until: "2026-02-10",
    });

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.valid_until).toMatch(/before/i);
  });

  test("validates pdf document metadata", () => {
    expect(
      validateDocumentMetadata({
        document_name: "itinerary.pdf",
        document_mime_type: "application/pdf",
        document_size: 2_000_000,
      }),
    ).toEqual({ valid: true, errors: {} });

    expect(
      validateDocumentMetadata({
        document_name: "itinerary.docx",
        document_mime_type: "application/pdf",
        document_size: 2_000_000,
      }).valid,
    ).toBe(false);

    expect(
      validateDocumentMetadata({
        document_name: "itinerary.pdf",
        document_mime_type: "image/png",
        document_size: 2_000_000,
      }).valid,
    ).toBe(false);
  });

  test("supports activation and deactivation state changes", () => {
    const active = validateItineraryInput({ ...validInput, is_active: true });
    const inactive = validateItineraryInput({ ...validInput, is_active: false });

    expect(active.valid).toBe(true);
    expect(inactive.valid).toBe(true);
    expect(active.errors).toEqual({});
    expect(inactive.errors).toEqual({});
  });

  test("validates trip itinerary creation for customer, dates and travellers", async () => {
    const { validateTripItineraryInput } = await import("./itinerary-library");
    const outcome = validateTripItineraryInput({
      title: "Family Kerala Holiday",
      customer_id: "11111111-1111-1111-1111-111111111111",
      lead_id: "22222222-2222-2222-2222-222222222222",
      enquiry_id: "33333333-3333-3333-3333-333333333333",
      destination_id: "44444444-4444-4444-4444-444444444444",
      travel_start_date: "2026-02-10",
      travel_end_date: "2026-02-16",
      adults: 2,
      children: 1,
      status: "DRAFT",
      assigned_to: "55555555-5555-5555-5555-555555555555",
    });

    expect(outcome.valid).toBe(true);
    expect(outcome.errors).toEqual({});
  });

  test("rejects invalid trip date ranges and traveller counts", async () => {
    const { validateTripItineraryInput } = await import("./itinerary-library");
    const outcome = validateTripItineraryInput({
      title: "Broken dates",
      customer_id: "11111111-1111-1111-1111-111111111111",
      destination_id: "44444444-4444-4444-4444-444444444444",
      travel_start_date: "2026-02-18",
      travel_end_date: "2026-02-16",
      adults: -1,
      children: -2,
      status: "READY",
    });

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.travel_end_date).toMatch(/before/i);
    expect(outcome.errors.adults).toMatch(/non-negative/i);
    expect(outcome.errors.children).toMatch(/non-negative/i);
  });

  test("checks itinerary day inputs and deterministic ordering", async () => {
    const { validateTripItineraryDayInput, reorderTripItineraryDays } = await import("./itinerary-library");
    const validDay = validateTripItineraryDayInput({
      itinerary_id: "abcdef01-0000-0000-0000-000000000000",
      day_number: 2,
      date: "2026-02-11",
      title: "Munnar day",
      description: "Tea gardens and local lunch.",
      notes: "Keep flexible timings.",
    });

    expect(validDay.valid).toBe(true);
    expect(reorderTripItineraryDays([
      { id: "a", day_number: 2 },
      { id: "b", day_number: 1 },
      { id: "c", day_number: 3 },
    ]).map((entry) => entry.id)).toEqual(["b", "a", "c"]);
  });

  test("limits itinerary status to the supported lifecycle", async () => {
    const { validateTripItineraryInput } = await import("./itinerary-library");
    const outcome = validateTripItineraryInput({
      title: "Invalid status",
      destination_id: "44444444-4444-4444-4444-444444444444",
      status: "BOOKED" as never,
      adults: 1,
      children: 0,
    });

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.status).toMatch(/DRAFT|READY/i);
  });
});
