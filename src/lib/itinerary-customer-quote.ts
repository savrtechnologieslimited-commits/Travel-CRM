export type ItineraryCustomerQuoteMode = "total" | "per_person";

export type ItineraryCustomerQuoteLine = {
  id: string;
  amount: number | string;
  currency: string;
  amount_inr?: number | null;
  exchange_rate?: number | null;
  exchange_rate_updated_at?: string | null;
};

export type ItineraryCustomerQuoteBreakdown = {
  supplier_cost: number;
  additional_costs: number;
  margin: number;
  gst: number;
  total: number;
  per_person: number;
  currency: string;
};

export type ItineraryCustomerQuoteOption = {
  mode: ItineraryCustomerQuoteMode;
  lines: ItineraryCustomerQuoteLine[];
  pushed: boolean;
  breakdown?: ItineraryCustomerQuoteBreakdown;
};

export type ItineraryCustomerQuotes = Record<string, ItineraryCustomerQuoteOption>;

export function normalizeItineraryCustomerQuotes(value: unknown): ItineraryCustomerQuotes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ItineraryCustomerQuotes = {};
  for (const [option, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const mode: ItineraryCustomerQuoteMode = record["mode"] === "per_person" ? "per_person" : "total";
    const lines = Array.isArray(record["lines"]) ? record["lines"].flatMap((line, index) => {
      if (!line || typeof line !== "object" || Array.isArray(line)) return [];
      const item = line as Record<string, unknown>;
      const amount = Number(item["amount"]);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      const currency = typeof item["currency"] === "string" && /^[A-Z]{3}$/i.test(item["currency"])
        ? item["currency"].toUpperCase()
        : "INR";
      const amountInr = Number(item["amount_inr"]);
      const exchangeRate = Number(item["exchange_rate"]);
      return [{
        id: typeof item["id"] === "string" ? item["id"] : `${option}-${index}`,
        amount,
        currency,
        ...(Number.isFinite(amountInr) ? { amount_inr: amountInr } : {}),
        ...(Number.isFinite(exchangeRate) ? { exchange_rate: exchangeRate } : {}),
        ...(typeof item["exchange_rate_updated_at"] === "string" ? { exchange_rate_updated_at: item["exchange_rate_updated_at"] } : {}),
      }];
    }) : [];
    const rawBreakdown = record["breakdown"] && typeof record["breakdown"] === "object" && !Array.isArray(record["breakdown"])
      ? record["breakdown"] as Record<string, unknown>
      : null;
    const breakdown = rawBreakdown && ["supplier_cost", "additional_costs", "margin", "gst", "total", "per_person"].every((key) => Number.isFinite(Number(rawBreakdown[key])))
      ? {
          supplier_cost: Number(rawBreakdown["supplier_cost"]),
          additional_costs: Number(rawBreakdown["additional_costs"]),
          margin: Number(rawBreakdown["margin"]),
          gst: Number(rawBreakdown["gst"]),
          total: Number(rawBreakdown["total"]),
          per_person: Number(rawBreakdown["per_person"]),
          currency: typeof rawBreakdown["currency"] === "string" ? rawBreakdown["currency"] : "INR",
        }
      : undefined;
    result[option] = { mode, lines, pushed: record["pushed"] === true, ...(breakdown ? { breakdown } : {}) };
  }
  return result;
}

export function calculateItineraryCustomerQuote(option: ItineraryCustomerQuoteOption, travellerCount: number) {
  const lines = option.lines.map((line) => ({
    amount: Number(line.amount),
    currency: line.currency.trim().toUpperCase(),
  })).filter((line) => Number.isFinite(line.amount) && line.amount > 0);
  const currencies = [...new Set(lines.map((line) => line.currency))];
  const unitTotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const count = Math.max(0, Math.floor(Number(travellerCount) || 0));
  const total = option.mode === "per_person" ? unitTotal * count : unitTotal;
  return { unitTotal, total, currency: currencies[0] ?? "INR", travellerCount: count };
}

export function pushItineraryCustomerQuote(option: ItineraryCustomerQuoteOption, travellerCount: number, components?: { supplierCost: number; margin: number; gst: number }) {
  const totals = calculateItineraryCustomerQuote(option, travellerCount);
  if (new Set(option.lines.filter((line) => Number(line.amount) > 0).map((line) => line.currency.trim().toUpperCase())).size > 1) {
    throw new Error("All quote lines for a package option must use the same currency.");
  }
  if (!/^[A-Z]{3}$/.test(totals.currency)) throw new Error("Quote currency must be a 3-letter ISO code.");
  if (option.mode === "per_person" && totals.travellerCount === 0) throw new Error("Add at least one traveller before using per-person costing.");
  if (!components) {
    if (totals.total <= 0) throw new Error("Enter a quote amount greater than zero before pushing it to the itinerary.");
    return { ...option, pushed: true };
  }
  const supplierCost = Math.max(0, Number(components.supplierCost) || 0);
  const margin = Math.max(0, Number(components.margin) || 0);
  const gst = Math.max(0, Number(components.gst) || 0);
  const total = supplierCost + totals.total + margin + gst;
  if (!Number.isFinite(total) || total <= 0) throw new Error("The complete quote total must be greater than zero.");
  const currency = totals.unitTotal > 0 ? totals.currency : "INR";
  if (currency !== "INR" && (supplierCost > 0 || margin > 0 || gst > 0)) {
    throw new Error("Additional costing must use INR to combine with the itinerary supplier costs, margin, and GST.");
  }
  return {
    ...option,
    pushed: true,
    breakdown: {
      supplier_cost: supplierCost,
      additional_costs: totals.total,
      margin,
      gst,
      total,
      per_person: totals.travellerCount > 0 ? total / totals.travellerCount : total,
      currency,
    },
  };
}
