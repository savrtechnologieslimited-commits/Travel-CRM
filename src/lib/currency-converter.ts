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

export async function fetchFallbackInrExchangeRates(fetcher: typeof fetch = fetch): Promise<InrExchangeRates> {
  const response = await fetcher("https://open.er-api.com/v6/latest/INR", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Live currency rates are temporarily unavailable.");

  const payload = (await response.json()) as {
    result?: string;
    time_last_update_utc?: string;
    rates?: Record<string, unknown>;
  };
  if (payload.result !== "success" || !payload.rates) {
    throw new Error("The exchange-rate provider returned invalid data.");
  }

  const rates: Partial<Record<CurrencyCode, number>> = { INR: 1 };
  for (const currency of POPULAR_CURRENCIES) {
    if (currency === "INR") continue;
    const rate = payload.rates[currency];
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) rates[currency] = rate;
  }
  if (POPULAR_CURRENCIES.some((currency) => !rates[currency])) {
    throw new Error("Live rates are missing one or more supported currencies.");
  }

  const providerUpdatedAt =
    typeof payload.time_last_update_utc === "string" ? new Date(payload.time_last_update_utc) : null;
  const updatedAt =
    providerUpdatedAt && Number.isFinite(providerUpdatedAt.getTime())
      ? providerUpdatedAt.toISOString()
      : new Date().toISOString();
  return { base: "INR", rates, updatedAt, source: "live" };
}

export const getLiveInrExchangeRatesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getLiveInrExchangeRates } = await import("./currency-converter.server");
  return getLiveInrExchangeRates();
});
