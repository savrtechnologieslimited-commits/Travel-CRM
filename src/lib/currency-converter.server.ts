import { POPULAR_CURRENCIES, type CurrencyCode, type InrExchangeRates } from "./currency-converter";

type ExchangeApiResponse = {
  result?: string;
  time_last_update_utc?: string;
  rates?: Record<string, unknown>;
};

let cachedRates: InrExchangeRates | null = null;
let cachedAt = 0;
const CACHE_DURATION_MS = 15 * 60 * 1000;

export async function getLiveInrExchangeRates(): Promise<InrExchangeRates> {
  if (cachedRates && Date.now() - cachedAt < CACHE_DURATION_MS) return cachedRates;

  const response = await fetch("https://open.er-api.com/v6/latest/INR", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Live currency rates are temporarily unavailable.");

  const payload = await response.json() as ExchangeApiResponse;
  if (payload.result !== "success" || !payload.rates) throw new Error("The exchange-rate provider returned invalid data.");

  const rates: Partial<Record<CurrencyCode, number>> = { INR: 1 };
  for (const currency of POPULAR_CURRENCIES) {
    const rate = payload.rates[currency];
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) rates[currency] = rate;
  }
  if (POPULAR_CURRENCIES.some((currency) => !rates[currency])) throw new Error("Live rates are missing one or more supported currencies.");

  const providerUpdatedAt = typeof payload.time_last_update_utc === "string" ? new Date(payload.time_last_update_utc) : null;
  const updatedAt = providerUpdatedAt && Number.isFinite(providerUpdatedAt.getTime()) ? providerUpdatedAt.toISOString() : new Date().toISOString();
  cachedRates = {
    base: "INR",
    rates,
    updatedAt,
  };
  cachedAt = Date.now();
  return cachedRates;
}