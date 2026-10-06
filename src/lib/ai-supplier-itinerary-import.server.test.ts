import { describe, expect, test } from "bun:test";
import {
  extractItineraryFromSupplierDocument,
  extractSupplierDocumentText,
} from "./ai-supplier-itinerary-import.server";
import type { ItineraryGenerationProvider } from "./ai-itinerary-generation.server";

const supplierText = `Destination: Bali\nDay 1: Arrive Bali and transfer to hotel.\nHotel: ABC Hotel, Deluxe Room, Breakfast.\nInclusions: airport transfer, breakfast\nExclusions: flights\nCancellation: 7 days before arrival.`;

const provider: ItineraryGenerationProvider = {
  name: "mock",
  generateItinerary: async (input) => ({
    provider: "mock",
    draft: {
      title: "Bali supplier itinerary",
      destination: input.destination,
      travel_start_date: null,
      travel_end_date: null,
      adults: null,
      children: null,
      customer_facing_notes: "Imported supplier proposal.",
      inclusions: ["airport transfer", "breakfast"],
      exclusions: ["flights"],
      cancellation_info: "7 days before arrival.",
      days: [{
        date: null,
        title: "Arrive Bali",
        description: "Arrive Bali and transfer to hotel.",
        notes: null,
        items: [
          { item_type: "EXTRA_TRANSPORT", sequence: 1, title: "Airport transfer", pickup: "Airport", dropoff: "Hotel", extra_transport_type: "Airport Transfer", extra_transport_passengers: 0 },
          { item_type: "ACCOMMODATION", sequence: 2, title: "ABC Hotel", hotel_name: "ABC Hotel", hotel_city: "Bali", room_type: "Deluxe", meal_plan: "Breakfast", rooms: 1, adults: 0, children: 0, extra_beds: 0 },
        ],
      }],
    },
  }),
};

describe("AI supplier itinerary import", () => {
  test("accepts pasted supplier text and preserves extracted structure", async () => {
    expect(await extractSupplierDocumentText({ sourceText: supplierText })).toContain("ABC Hotel");
    const result = await extractItineraryFromSupplierDocument({ sourceText: supplierText }, { provider, destinations: [{ id: "bali-id", name: "Bali" }] });
    expect(result.provenance).toBe("AI_SUPPLIER_IMPORT");
    expect(result.extracted_text).toBe(supplierText);
    expect(result.destination_resolution.destination_id).toBe("bali-id");
    expect(result.draft.days[0]?.items.map((item) => item.item_type)).toEqual(["EXTRA_TRANSPORT", "ACCOMMODATION"]);
    expect(result.draft.inclusions).toContain("breakfast");
  });

  test("returns imported supplier tables with their headers and rows in source order", async () => {
    const result = await extractItineraryFromSupplierDocument({
      sourceText: `Destination: Bali
TABLE: Package rates
| Room | Inclusions | Exclusions |
| --- | --- | --- |
| Deluxe | Breakfast | Flights |
| Suite | Breakfast and dinner | Personal expenses |`,
    }, { provider, destinations: [{ id: "bali-id", name: "Bali" }] });

    expect(result.tables).toEqual([{
      title: "Package rates",
      columns: ["Room", "Inclusions", "Exclusions"],
      rows: [["Deluxe", "Breakfast", "Flights"], ["Suite", "Breakfast and dinner", "Personal expenses"]],
    }]);
  });

  test("does not duplicate a pure inclusions/exclusions matrix in generic tables", async () => {
    const result = await extractItineraryFromSupplierDocument({
      sourceText: `Destination: Bali
TABLE: Package terms
| Inclusions | Exclusions |
| --- | --- |
| Breakfast | Flights |`,
    }, { provider, destinations: [{ id: "bali-id", name: "Bali" }] });

    expect(result.tables).toEqual([]);
  });

  test("rejects empty and unsupported documents", async () => {
    await expect(extractSupplierDocumentText({ sourceText: " " })).rejects.toThrow("Paste supplier text");
    await expect(extractSupplierDocumentText({ fileName: "supplier.xlsx", mimeType: "application/vnd.ms-excel", fileBase64: Buffer.from("data").toString("base64") })).rejects.toThrow("text-readable");
  });

  test("keeps day-only supplier plans undated", async () => {
    const result = await extractItineraryFromSupplierDocument({ sourceText: "Destination: Bali\nDay 1: Arrival\nDay 2: Sightseeing" }, { provider, destinations: [{ id: "bali-id", name: "Bali" }] });
    expect(result.draft.days.every((day) => day.date === null)).toBe(true);
    expect(result.draft.travel_start_date).toBeNull();
  });

  test("clears model-invented or non-ISO dates when the supplier text has no exact dates", async () => {
    const result = await extractItineraryFromSupplierDocument({
      sourceText: "Destination: Bali\nDay 1: Arrival in Bali",
    }, {
      destinations: [{ id: "bali-id", name: "Bali" }],
      provider: {
        ...provider,
        generateItinerary: async (input) => {
          const generated = await provider.generateItinerary(input);
          return {
            ...generated,
            draft: {
              ...generated.draft,
            travel_start_date: "8 Nov",
            travel_end_date: "15 Nov",
              days: generated.draft.days.map((day, index) => index === 0 ? { ...day, date: "Day 1" } : day),
            },
          };
        },
      },
    });

    expect(result.draft.travel_start_date).toBeNull();
    expect(result.draft.travel_end_date).toBeNull();
    expect(result.draft.days[0]?.date).toBeNull();
  });

  test("infers the destination from the first day when no destination label is provided", async () => {
    let providerDestination = "";
    const result = await extractItineraryFromSupplierDocument({
      sourceText: "Day 1 – Baku City Tour\nCheck-in and rest. Overnight stay in Baku.\nDay 2 – Baku City Tour",
    }, {
      provider: {
        ...provider,
        generateItinerary: async (input) => {
          providerDestination = input.destination;
          const generated = await provider.generateItinerary(input);
          return {
            ...generated,
            draft: {
              ...generated.draft,
              days: generated.draft.days.map((day) => ({
                ...day,
                items: day.items.map((item) => item.item_type === "ACCOMMODATION" ? { ...item, hotel_city: undefined, location: "Baku" } : item),
              })),
            },
          };
        },
      },
      destinations: [{ id: "baku-id", name: "Baku" }],
    });

    expect(providerDestination).toBe("Baku");
    expect(result.destination_resolution.destination_id).toBe("baku-id");
    expect(result.draft.days[0]?.items.find((item) => item.item_type === "ACCOMMODATION")).toMatchObject({ hotel_city: "Baku" });
  });

  test("generates drafts when destinations are uncatalogued or ambiguous", async () => {
    let calls = 0;
    const countingProvider = { ...provider, generateItinerary: async () => { calls += 1; return provider.generateItinerary({ destination: "Bali" }); } };
    const uncatalogued = await extractItineraryFromSupplierDocument({ sourceText: supplierText }, { provider: countingProvider, destinations: [] });
    expect(uncatalogued.destination_resolution.status).toBe("unresolved");
    expect(uncatalogued.destination_resolution.destination_id).toBeNull();
    expect(uncatalogued.draft.destination).toBe("Bali");
    const ambiguous = await extractItineraryFromSupplierDocument(
      { sourceText: supplierText },
      { provider: countingProvider, destinations: [{ id: "1", name: "Bali" }, { id: "2", name: "Bali South" }] },
    );
    expect(ambiguous.destination_resolution.status).toBe("ambiguous");
    expect(ambiguous.destination_resolution.destination_id).toBeNull();
    expect(ambiguous.draft.destination).toBe("Bali");
    expect(calls).toBe(2);
  });

  test("accepts a base64 text document without persisting it", async () => {
    const result = await extractItineraryFromSupplierDocument({ fileName: "supplier.txt", mimeType: "text/plain", fileBase64: Buffer.from(supplierText).toString("base64") }, { provider, destinations: [{ id: "bali-id", name: "Bali" }] });
    expect(result.extracted_text_length).toBeGreaterThan(20);
  });
});
