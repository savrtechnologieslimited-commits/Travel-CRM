import { describe, expect, test } from "bun:test";
import {
  assertAuthorizedPackageQuotationPusher,
  buildItineraryPackageQuotation,
  buildPackageQuotationIdempotencyKey,
  validateItineraryPackageQuotationInput,
} from "./itinerary-package-quotation";

describe("itinerary package quotation mapping", () => {
  test("maps a selected package into a quotation with final customer pricing", () => {
    const result = buildItineraryPackageQuotation({
      itinerary: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Kerala Escape",
        customer_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        lead_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        enquiry_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        destination_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        travel_start_date: "2026-02-01",
        travel_end_date: "2026-02-06",
        adults: 2,
        children: 1,
        currency: "INR",
      },
      selectedPackage: {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        itinerary_id: "11111111-1111-4111-8111-111111111111",
        name: "4 Star",
        description: "Mid-range comfort",
        sequence: 2,
      },
      packageItems: [
        {
          id: "item-1",
          itinerary_day_id: "day-1",
          package_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          item_type: "ACCOMMODATION",
          title: "Hotel stay",
          description: "Stay in Cochin",
          location: "Cochin",
          hotel_city: "Cochin",
          hotel_name: "Hotel Blue Pearl",
          star_category: "4 Star",
          nights: 5,
          room_type: "Deluxe",
          rooms: 2,
          adults: 2,
          children: 1,
          sequence: 1,
        },
      ],
      packageCostLines: [
        { itinerary_id: "11111111-1111-4111-8111-111111111111", cost_category: "HOTEL", description: "Hotel stay", quantity: 1, unit: "room", unit_cost: 45000, currency: "INR", total_cost: 45000, sequence: 1 },
      ],
      customerPrice: {
        internal_cost: 45000,
        margin_amount: 9000,
        selling_price: 54000,
        tax_amount: 2700,
        final_customer_price: 56700,
        adults: 2,
        children: 1,
      },
    });

    expect(result.title).toContain("4 Star");
    expect(result.customer_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(result.lead_id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(result.enquiry_id).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(result.destination_id).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(result.travel_start).toBe("2026-02-01");
    expect(result.travel_end).toBe("2026-02-06");
    expect(result.total_cost).toBe(45000);
    expect(result.total_price).toBe(56700);
    expect(result.quotationItems[0]?.title).toBe("Hotel stay");
    expect(result.notes).toContain("source_package_id");
  });

  test("requires explicit selection when multiple packages exist", () => {
    expect(() =>
      validateItineraryPackageQuotationInput({
        itinerary: { id: "11111111-1111-4111-8111-111111111111", title: "Trip", adults: 2, children: 0, currency: "INR" },
        selectedPackage: null,
        packageOptions: [
          { id: "a", itinerary_id: "11111111-1111-4111-8111-111111111111", name: "3 Star", sequence: 1 },
          { id: "b", itinerary_id: "11111111-1111-4111-8111-111111111111", name: "5 Star", sequence: 2 },
        ],
      }),
    ).toThrow("explicitly select one package");
  });

  test("uses a stable idempotency key for duplicate protection", () => {
    const first = buildPackageQuotationIdempotencyKey({
      itineraryId: "11111111-1111-4111-8111-111111111111",
      packageId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      travelStart: "2026-02-01",
      travelEnd: "2026-02-06",
      adults: 2,
      children: 1,
      currency: "INR",
    });

    const second = buildPackageQuotationIdempotencyKey({
      itineraryId: "11111111-1111-4111-8111-111111111111",
      packageId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      travelStart: "2026-02-01",
      travelEnd: "2026-02-06",
      adults: 2,
      children: 1,
      currency: "INR",
    });

    expect(first).toBe(second);
  });

  test("rejects unauthorized package-to-quotation pushes", () => {
    expect(() => assertAuthorizedPackageQuotationPusher({ role: "read_only" })).toThrow("authorized");
    expect(() => assertAuthorizedPackageQuotationPusher({ role: "manager" })).not.toThrow();
  });
});
