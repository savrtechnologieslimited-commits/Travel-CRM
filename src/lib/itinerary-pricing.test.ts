import { describe, expect, test } from "bun:test";
import { calculateItineraryCustomerPricing, validateItineraryCustomerPricingInput } from "./itinerary-pricing";

describe("itinerary customer pricing", () => {
  test("converts internal cost into selling price, then applies tax with percentage child pricing", () => {
    const result = calculateItineraryCustomerPricing({
      internal_cost: 10000,
      adults: 2,
      children: 1,
      margin_mode: "PERCENTAGE",
      margin_percentage: 20,
      tax_percentage: 5,
      child_pricing_mode: "PERCENTAGE",
      child_pricing_percentage: 50,
    });

    expect(result.internal_cost).toBe(10000);
    expect(result.margin_amount).toBe(2000);
    expect(result.selling_price).toBe(12000);
    expect(result.adult_price).toBe(4800);
    expect(result.child_price).toBe(2400);
    expect(result.tax_amount).toBe(600);
    expect(result.final_customer_price).toBe(12600);
  });

  test("supports manual child pricing without disturbing the internal cost baseline", () => {
    const result = calculateItineraryCustomerPricing({
      internal_cost: 10000,
      adults: 2,
      children: 1,
      margin_mode: "MANUAL",
      margin_amount: 3000,
      tax_percentage: 5,
      child_pricing_mode: "MANUAL",
      child_unit_price: 2000,
    });

    expect(result.margin_amount).toBe(3000);
    expect(result.selling_price).toBe(13000);
    expect(result.adult_price).toBe(5500);
    expect(result.child_price).toBe(2000);
    expect(result.tax_amount).toBe(650);
    expect(result.final_customer_price).toBe(13650);
  });

  test("rejects invalid input before it can produce a customer price", () => {
    expect(() =>
      validateItineraryCustomerPricingInput({
        internal_cost: -1,
        adults: 1,
        children: 0,
        margin_mode: "PERCENTAGE",
        margin_percentage: 10,
        tax_percentage: 5,
      }),
    ).toThrow("non-negative");
  });
});
