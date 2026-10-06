import { createServerFn } from "@tanstack/react-start";

export const POPULAR_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "THB", "JPY"] as const;

export type CurrencyCode = (typeof POPULAR_CURRENCIES)[number];

export type InrExchangeRates = {
  base: "INR";
  rates: Partial<Record<CurrencyCode, number>>;
  updatedAt: string;
  source?: "shared-cache" | "live";
};

export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode, rates?: InrExchangeRates["rates"]): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  if (!rates) return null;
  const fromRate = from === "INR" ? 1 : rates[from];
  const toRate = to === "INR" ? 1 : rates[to];
  if (!fromRate || !toRate || !Number.isFinite(fromRate) || !Number.isFinite(toRate)) return null;
  return (amount / fromRate) * toRate;
}

export function convertToInr(amount: number, currency: CurrencyCode, rates?: InrExchangeRates["rates"]): number | null {
  return convertCurrency(amount, currency, "INR", rates);
}

export function formatCurrencyAmount(amount: number, currency: CurrencyCode, locale = "en-IN") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  }
}

export const getLiveInrExchangeRatesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getLiveInrExchangeRates } = await import("./currency-converter.server");
  return getLiveInrExchangeRates();
});
