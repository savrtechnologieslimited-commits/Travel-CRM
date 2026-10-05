import { describe, expect, test } from "bun:test";
import {
  ITINERARY_COST_CATEGORIES,
  calculateItineraryCostTotals,
  createItineraryCostLine,
  deleteItineraryCostLine,
  ensureCostLineItemScope,
  summarizeItineraryCostSections,
  updateItineraryCostLine,
  validateItineraryCostLine,
} from "./itinerary-costing";

const itineraryId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

describe("itinerary internal costing", () => {
  test("supports the required cost categories", () => {
    expect(ITINERARY_COST_CATEGORIES).toEqual([
      "HOTEL",
      "TRANSPORT",
      "ACTIVITY",
      "FLIGHT",
      "VISA",
      "EXTRA_TRANSPORT",
      "OTHER",
    ]);
  });

  test("creates a line and calculates quantity × unit cost deterministically", () => {
    const line = createItineraryCostLine({
      itinerary_id: itineraryId,
      itinerary_item_id: itemId,
      cost_category: "HOTEL",
      description: "2 rooms for 3 nights",
      quantity: 2,
      unit: "room",
      unit_cost: 5000,
      currency: "INR",
      sequence: 1,
    });

    expect(line.total_cost).toBe(10000);
    expect(line.currency).toBe("INR");
  });

  test("edits a line without changing the itinerary scope", () => {
    const line = createItineraryCostLine({
      itinerary_id: itineraryId,
      cost_category: "TRANSPORT",
      description: "Airport transfer",
      quantity: 3,
      unit: "day",
      unit_cost: 3000,
      currency: "INR",
      sequence: 2,
    });

    const updated = updateItineraryCostLine(line, { quantity: 4, unit_cost: 3500 });
    expect(updated.quantity).toBe(4);
    expect(updated.total_cost).toBe(14000);
  });

  test("deletes a cost line by id", () => {
    const lines = [
      createItineraryCostLine({ itinerary_id: itineraryId, cost_category: "ACTIVITY", description: "Guide", quantity: 1, unit: "guide", unit_cost: 1500, currency: "INR", sequence: 1, id: "cost-1" }),
      createItineraryCostLine({ itinerary_id: itineraryId, cost_category: "ACTIVITY", description: "Tickets", quantity: 1, unit: "ticket", unit_cost: 2000, currency: "INR", sequence: 2, id: "cost-2" }),
    ];

    expect(deleteItineraryCostLine(lines, "cost-1")).toHaveLength(1);
  });

  test("sums category totals and overall internal total", () => {
    const summary = calculateItineraryCostTotals([
      { itinerary_id: itineraryId, cost_category: "HOTEL", description: "Hotel", quantity: 2, unit_cost: 5000, currency: "INR" },
      { itinerary_id: itineraryId, cost_category: "TRANSPORT", description: "Transfer", quantity: 3, unit_cost: 3000, currency: "INR" },
      { itinerary_id: itineraryId, cost_category: "FLIGHT", description: "Flight", quantity: 1, unit_cost: 12000, currency: "INR" },
    ]);

    expect(summary.byCategory.HOTEL).toBe(10000);
    expect(summary.byCategory.TRANSPORT).toBe(9000);
    expect(summary.byCategory.FLIGHT).toBe(12000);
    expect(summary.total).toBe(31000);
  });

  test("supports multiple cost lines for one itinerary item", () => {
    const summary = calculateItineraryCostTotals([
      { itinerary_id: itineraryId, itinerary_item_id: itemId, cost_category: "ACTIVITY", description: "Vehicle", quantity: 1, unit: "vehicle", unit_cost: 4000, currency: "INR" },
      { itinerary_id: itineraryId, itinerary_item_id: itemId, cost_category: "ACTIVITY", description: "Entry tickets", quantity: 4, unit: "ticket", unit_cost: 500, currency: "INR" },
      { itinerary_id: itineraryId, itinerary_item_id: itemId, cost_category: "ACTIVITY", description: "Guide", quantity: 1, unit: "guide", unit_cost: 1500, currency: "INR" },
    ]);

    expect(summary.byCategory.ACTIVITY).toBe(4000 + 2000 + 1500);
  });

  test("keeps currencies separate instead of inventing FX conversion", () => {
    const summary = calculateItineraryCostTotals([
      { itinerary_id: itineraryId, cost_category: "HOTEL", description: "Hotel INR", quantity: 1, unit_cost: 5000, currency: "INR" },
      { itinerary_id: itineraryId, cost_category: "VISA", description: "Visa USD", quantity: 2, unit_cost: 40, currency: "USD" },
    ]);

    expect(summary.byCurrency.INR).toBe(5000);
    expect(summary.byCurrency.USD).toBe(80);
    expect(summary.total).toBe(5080);
  });

  test("rejects invalid quantity, unit cost and malformed currency", () => {
    expect(() => validateItineraryCostLine({ itinerary_id: itineraryId, cost_category: "OTHER", description: "Bad", quantity: -1, unit_cost: 10, currency: "INR" })).toThrow("Quantity");
    expect(() => validateItineraryCostLine({ itinerary_id: itineraryId, cost_category: "OTHER", description: "Bad", quantity: 1, unit_cost: -1, currency: "INR" })).toThrow("Unit cost");
    expect(() => validateItineraryCostLine({ itinerary_id: itineraryId, cost_category: "OTHER", description: "Bad", quantity: 1, unit_cost: 10, currency: "US" })).toThrow("valid 3-letter");
  });

  test("validates itinerary item scope and blocks cross-itinerary references", () => {
    expect(() => validateItineraryCostLine({ itinerary_id: itineraryId, itinerary_item_id: "not-a-uuid", cost_category: "OTHER", description: "Bad item", quantity: 1, unit_cost: 10, currency: "INR" })).toThrow("item reference");
    expect(() => ensureCostLineItemScope(itineraryId, { itinerary_item_id: itemId }, "other-itinerary")).toThrow("another itinerary");
  });

  test("treats missing internal costs as zero rather than inventing a value", () => {
    const summary = calculateItineraryCostTotals([]);
    expect(summary.total).toBe(0);
    expect(summary.byCategory.HOTEL).toBe(0);
  });

  test("groups cost rows into travel section totals for the itinerary builder", () => {
    const summary = summarizeItineraryCostSections([
      { itinerary_id: itineraryId, cost_category: "HOTEL", description: "Hotel", quantity: 2, unit_cost: 5000, currency: "INR" },
      { itinerary_id: itineraryId, cost_category: "TRANSPORT", description: "Transfer", quantity: 1, unit_cost: 1800, currency: "INR" },
      { itinerary_id: itineraryId, cost_category: "ACTIVITY", description: "Activity", quantity: 2, unit_cost: 1500, currency: "INR" },
      { itinerary_id: itineraryId, cost_category: "VISA", description: "Visa", quantity: 1, unit_cost: 1000, currency: "INR" },
    ]);

    expect(summary.totalHotels).toBe(10000);
    expect(summary.activitiesTransfers).toBe(3000);
    expect(summary.totalVisa).toBe(1000);
    expect(summary.transportOther).toBe(1800);
    expect(summary.totalSupplierCost).toBe(15800);
    expect(summary.totalLandPackage).toBe(15800);
  });

  test("allows a source cost to be reused without mutating the original booking/service record", () => {
    const line = validateItineraryCostLine({
      itinerary_id: itineraryId,
      itinerary_item_id: itemId,
      cost_category: "HOTEL",
      description: "Source hotel cost",
      quantity: 2,
      unit_cost: 6700,
      currency: "INR",
      source: "booking",
      source_reference: "booking-service-123",
    });

    expect(line.source).toBe("booking");
    expect(line.total_cost).toBe(13400);
  });
});
