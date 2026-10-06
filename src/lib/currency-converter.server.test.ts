import { describe, expect, test } from "bun:test";
import { getLiveInrExchangeRates } from "./currency-converter.server";
import { POPULAR_CURRENCIES, type InrExchangeRates } from "./currency-converter";

describe("shared currency rate snapshots", () => {
  test("uses a fresh shared snapshot, refreshes stale rates, and falls back to saved rates", async () => {
    let now = Date.now();
    const originalRates: InrExchangeRates = {
      base: "INR",
      rates: {
        INR: 1,
        USD: 0.01,
        EUR: 0.009,
        GBP: 0.008,
        AED: 0.037,
        SGD: 0.013,
        AUD: 0.015,
        CAD: 0.014,
        THB: 0.35,
        JPY: 1.6,
      },
      updatedAt: new Date(now).toISOString(),
      source: "shared-cache",
    };
    let snapshot = { rates: originalRates, refreshedAt: new Date(now).toISOString() };
    let fetchCalls = 0;
    let writes = 0;
    const store = {
      async read() {
        return {
          ...snapshot,
          rates: { ...snapshot.rates, source: "shared-cache" as const },
        };
      },
      async write(next: typeof snapshot) {
        snapshot = next;
        writes += 1;
      },
    };
    const fetchSuccess: typeof fetch = async () => {
      fetchCalls += 1;
      const rates = Object.fromEntries(
        POPULAR_CURRENCIES.map((currency) => [currency, currency === "INR" ? 1 : 0.02]),
      );
      return new Response(
        JSON.stringify({
          result: "success",
          time_last_update_utc: new Date(now).toUTCString(),
          rates,
        }),
      );
    };

    const freshResult = await getLiveInrExchangeRates(store, fetchSuccess, () => now);
    expect(freshResult.rates.USD).toBe(0.01);
    expect(freshResult.source).toBe("shared-cache");
    expect(fetchCalls).toBe(0);
    expect(writes).toBe(0);

    now += 16 * 60 * 1000;
    const refreshedResult = await getLiveInrExchangeRates(store, fetchSuccess, () => now);
    expect(refreshedResult.rates.USD).toBe(0.02);
    expect(refreshedResult.source).toBe("live");
    expect(fetchCalls).toBe(1);
    expect(writes).toBe(1);

    now += 16 * 60 * 1000;
    const staleResult = await getLiveInrExchangeRates(
      store,
      async () => new Response("", { status: 503 }),
      () => now,
    );
    expect(staleResult.rates.USD).toBe(0.02);
    expect(staleResult.source).toBe("shared-cache");
  });
});
