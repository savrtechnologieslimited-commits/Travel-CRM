import { POPULAR_CURRENCIES, type CurrencyCode, type InrExchangeRates } from "./currency-converter";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

type ExchangeApiResponse = {
  result?: string;
  time_last_update_utc?: string;
  rates?: Record<string, unknown>;
};

type RateSnapshot = {
  rates: InrExchangeRates;
  refreshedAt: string;
};

type RateSnapshotStore = {
  read: () => Promise<RateSnapshot | null>;
  write: (snapshot: RateSnapshot) => Promise<void>;
};

const rateSnapshotStore: RateSnapshotStore = {
  async read() {
    const { data, error } = await supabaseAdmin
      .from("currency_rate_snapshots")
      .select("rates,provider_updated_at,refreshed_at")
      .eq("base_currency", "INR")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const rates = parseRates(data.rates, data.provider_updated_at);
    return rates ? { rates, refreshedAt: data.refreshed_at } : null;
  },
  async write(snapshot) {
    const { error } = await supabaseAdmin.from("currency_rate_snapshots").upsert({
      base_currency: "INR",
      rates: snapshot.rates.rates as Json,
      provider_updated_at: snapshot.rates.updatedAt,
      refreshed_at: snapshot.refreshedAt,
    });
    if (error) throw error;
  },
};

let cachedRates: InrExchangeRates | null = null;
let cachedAt = 0;
const CACHE_DURATION_MS = 15 * 60 * 1000;

function parseRates(value: unknown, updatedAt: string): InrExchangeRates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawRates = value as Record<string, unknown>;
  const rates: Partial<Record<CurrencyCode, number>> = { INR: 1 };
  for (const currency of POPULAR_CURRENCIES) {
    if (currency === "INR") continue;
    const rate = rawRates[currency];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
    rates[currency] = rate;
  }
  return { base: "INR", rates, updatedAt, source: "shared-cache" };
}

export async function getLiveInrExchangeRates(
  store: RateSnapshotStore = rateSnapshotStore,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<InrExchangeRates> {
  if (cachedRates && now() - cachedAt < CACHE_DURATION_MS) return cachedRates;

  let savedSnapshot: RateSnapshot | null = null;
  try {
    savedSnapshot = await store.read();
    if (savedSnapshot && now() - Date.parse(savedSnapshot.refreshedAt) < CACHE_DURATION_MS) {
      cachedRates = savedSnapshot.rates;
      cachedAt = now();
      return savedSnapshot.rates;
    }
  } catch (cause) {
    console.warn("[Currency converter] Could not read shared rate snapshot.", cause);
  }

  try {
    const response = await fetcher("https://open.er-api.com/v6/latest/INR", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Live currency rates are temporarily unavailable.");

    const payload = (await response.json()) as ExchangeApiResponse;
    if (payload.result !== "success" || !payload.rates)
      throw new Error("The exchange-rate provider returned invalid data.");

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
      typeof payload.time_last_update_utc === "string"
        ? new Date(payload.time_last_update_utc)
        : null;
    const updatedAt =
      providerUpdatedAt && Number.isFinite(providerUpdatedAt.getTime())
        ? providerUpdatedAt.toISOString()
        : new Date(now()).toISOString();
    const latest = { base: "INR" as const, rates, updatedAt, source: "live" as const };
    cachedRates = latest;
    cachedAt = now();

    try {
      await store.write({ rates: latest, refreshedAt: new Date(now()).toISOString() });
    } catch (cause) {
      console.warn("[Currency converter] Could not save shared rate snapshot.", cause);
    }
    return latest;
  } catch (cause) {
    if (savedSnapshot) {
      console.warn(
        "[Currency converter] Live refresh failed; using the saved shared rate snapshot.",
        cause,
      );
      cachedRates = savedSnapshot.rates;
      cachedAt = now();
      return savedSnapshot.rates;
    }
    throw cause;
  }
}
