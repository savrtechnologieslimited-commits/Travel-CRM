import { describe, expect, test } from "bun:test";
import { convertCurrency, convertToInr, formatCurrencyAmount } from "./currency-converter";

const rates = { INR: 1, USD: 0.01, EUR: 0.009, GBP: 0.008, AED: 0.037, SGD: 0.013, AUD: 0.015, CAD: 0.014, THB: 0.35, JPY: 1.6 };

describe("currency conversion", () => {
  test("converts foreign amounts to INR and between selected currencies", () => {
    expect(convertToInr(10, "USD", rates)).toBe(1000);
    expect(convertCurrency(1000, "INR", "USD", rates)).toBe(10);
    expect(convertCurrency(10, "EUR", "USD", rates)).toBeCloseTo(11.1111, 3);
  });

  test("passes INR amounts through and returns null for invalid values", () => {
    expect(convertToInr(1200, "INR", rates)).toBe(1200);
    expect(convertToInr(Number.NaN, "USD", rates)).toBeNull();
  });

  test("formats values using their currency", () => {
    expect(formatCurrencyAmount(1250, "INR")).toContain("1,250");
  });
});