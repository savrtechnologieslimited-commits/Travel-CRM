import { describe, expect, test } from "bun:test";
import { calculateItineraryCustomerQuote, normalizeItineraryCustomerQuotes, pushItineraryCustomerQuote } from "./itinerary-customer-quote";

describe("itinerary customer quote inputs", () => {
  test("calculates total and per-person package costing", () => {
    const option = { mode: "per_person" as const, pushed: false, lines: [{ id: "a", amount: 1000, currency: "INR" }, { id: "b", amount: 250, currency: "INR" }] };
    expect(calculateItineraryCustomerQuote(option, 3)).toEqual({ unitTotal: 1250, total: 3750, currency: "INR", travellerCount: 3 });
    expect(calculateItineraryCustomerQuote({ ...option, mode: "total" }, 3).total).toBe(1250);
  });

  test("pushes additional cost, supplier costs, margin, and GST as a durable quote breakdown", () => {
    const pushed = pushItineraryCustomerQuote({ mode: "per_person", pushed: false, lines: [{ id: "extra", amount: 500, currency: "INR" }] }, 2, {
      supplierCost: 10000,
      margin: 1500,
      gst: 600,
    });
    expect(pushed.breakdown).toEqual({
      supplier_cost: 10000,
      additional_costs: 1000,
      margin: 1500,
      gst: 600,
      total: 13100,
      per_person: 6550,
      currency: "INR",
    });
  });

  test("requires a valid positive quote before push and prevents mixed currencies", () => {
    expect(() => pushItineraryCustomerQuote({ mode: "total", pushed: false, lines: [] }, 2)).toThrow("greater than zero");
    expect(() => pushItineraryCustomerQuote({ mode: "total", pushed: false, lines: [
      { id: "inr", amount: 100, currency: "INR" }, { id: "usd", amount: 20, currency: "USD" },
    ] }, 2)).toThrow("same currency");
  });

  test("normalizes stored quotes without accepting invalid values", () => {
    const quotes = normalizeItineraryCustomerQuotes({ Option1: { mode: "per_person", pushed: true, lines: [
      { id: "valid", amount: 250, currency: "inr" }, { id: "invalid", amount: -2, currency: "INR" },
    ] } });
    expect(quotes["Option1"]?.mode).toBe("per_person");
    expect(quotes["Option1"]?.lines).toEqual([{ id: "valid", amount: 250, currency: "INR" }]);
    expect(quotes["Option1"]?.pushed).toBe(true);
  });
});
