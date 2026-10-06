export const ITINERARY_COST_CATEGORIES = [
  "HOTEL",
  "TRANSPORT",
  "ACTIVITY",
  "FLIGHT",
  "VISA",
  "EXTRA_TRANSPORT",
  "OTHER",
] as const;

export type ItineraryCostCategory = (typeof ITINERARY_COST_CATEGORIES)[number];

export type ItineraryCostLine = {
  id?: string | null;
  itinerary_id: string;
  itinerary_item_id?: string | null;
  cost_category: ItineraryCostCategory;
  description: string;
  supplier_ref?: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_cost_inr?: number | null;
  currency: string;
  total_cost: number;
  total_cost_inr?: number | null;
  exchange_rate?: number | null;
  exchange_rate_updated_at?: string | null;
  notes?: string | null;
  sequence: number;
  source: "manual" | "booking" | "supplier" | "derived" | null;
  source_reference?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ItineraryCostSummary = {
  byCategory: Record<ItineraryCostCategory, number>;
  byCurrency: Record<string, number>;
  total: number;
};

export type ItineraryCostSectionSummary = {
  totalLandPackage: number;
  activitiesTransfers: number;
  totalHotels: number;
  totalVisa: number;
  transportOther: number;
  totalSupplierCost: number;
  margin: number;
  taxes: number;
  total: number;
};

export type PricingAdjustmentLine = {
  percentage: number | string;
  amount: number | string;
};

export function hasConfiguredPricingLines(lines: readonly PricingAdjustmentLine[]) {
  return lines.some(
    (line) => String(line.percentage).trim() !== "" || String(line.amount).trim() !== "",
  );
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function normalizeCurrency(value?: string | null, fallback = "INR") {
  const normalized = (value ?? "").toString().trim().toUpperCase();
  if (!normalized) return fallback;
  return normalized;
}

export function getCostLineTotal(quantity: number | string, unitCost: number | string) {
  const qty = Number(quantity ?? 0);
  const cost = Number(unitCost ?? 0);
  if (!Number.isFinite(qty) || !Number.isFinite(cost)) return 0;
  return Math.max(0, qty * cost);
}

export function createItineraryCostLine(input: Partial<ItineraryCostLine> & {
  itinerary_id: string;
  cost_category: ItineraryCostCategory;
  description?: string;
  quantity?: number | string;
  unit_cost?: number | string;
  currency?: string | null;
}): ItineraryCostLine {
  const quantity = Number(input.quantity ?? 0);
  const unitCost = Number(input.unit_cost ?? 0);
  const currency = normalizeCurrency(input.currency, "INR");
  const total = getCostLineTotal(quantity, unitCost);

  return {
    id: input.id ?? null,
    itinerary_id: input.itinerary_id,
    itinerary_item_id: input.itinerary_item_id ?? null,
    cost_category: input.cost_category,
    description: typeof input.description === "string" && input.description.trim() ? input.description.trim() : "Internal cost",
    supplier_ref: typeof input.supplier_ref === "string" ? input.supplier_ref.trim() || null : null,
    quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0,
    unit: typeof input.unit === "string" && input.unit.trim() ? input.unit.trim() : "unit",
    unit_cost: Number.isFinite(unitCost) ? Math.max(0, unitCost) : 0,
    unit_cost_inr: input.unit_cost_inr ?? null,
    currency,
    total_cost: total,
    total_cost_inr: input.total_cost_inr ?? null,
    exchange_rate: input.exchange_rate ?? null,
    exchange_rate_updated_at: input.exchange_rate_updated_at ?? null,
    notes: typeof input.notes === "string" ? input.notes.trim() || null : null,
    sequence: Number.isFinite(Number(input.sequence ?? 0)) ? Math.max(0, Number(input.sequence ?? 0)) : 0,
    source: input.source ?? "manual",
    source_reference: typeof input.source_reference === "string" ? input.source_reference.trim() || null : null,
    created_at: input.created_at ?? null,
    updated_at: input.updated_at ?? null,
  };
}

export function validateItineraryCostLine(input: Partial<ItineraryCostLine>, options?: { itineraryId?: string | null; itemItineraryId?: string | null }) {
  if (!input.itinerary_id && options?.itineraryId) {
    input.itinerary_id = options.itineraryId;
  }
  if (!input.itinerary_id || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(input.itinerary_id.trim())) {
    throw new Error("Itinerary reference is invalid.");
  }

  if (input.itinerary_item_id && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(input.itinerary_item_id.trim())) {
    throw new Error("Itinerary item reference is invalid.");
  }

  const itemItineraryId = options?.itemItineraryId ?? null;
  if (input.itinerary_item_id && itemItineraryId && itemItineraryId !== input.itinerary_id) {
    throw new Error("Cost lines cannot reference an item from another itinerary.");
  }

  const category = input.cost_category ?? "OTHER";
  if (!ITINERARY_COST_CATEGORIES.includes(category as ItineraryCostCategory)) {
    throw new Error("Cost category is invalid.");
  }

  if (!input.description || !input.description.trim()) {
    throw new Error("Cost description is required.");
  }

  const quantity = Number(input.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative number.");
  }

  const unitCost = Number(input.unit_cost ?? 0);
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error("Unit cost must be a non-negative number.");
  }

  const currency = normalizeCurrency(input.currency, "INR");
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new Error("Currency must be a valid 3-letter ISO code.");
  }

  const total = getCostLineTotal(quantity, unitCost);
  const line: ItineraryCostLine = createItineraryCostLine({
    ...input,
    itinerary_id: input.itinerary_id,
    cost_category: category as ItineraryCostCategory,
    quantity,
    unit_cost: unitCost,
    currency,
    total_cost: total,
    description: input.description,
    unit: input.unit ?? "unit",
    sequence: input.sequence ?? 0,
  });

  if (Math.abs(line.total_cost - total) > 0.01) {
    throw new Error("Cost total does not match quantity × unit cost.");
  }

  return line;
}

export function updateItineraryCostLine(current: ItineraryCostLine, edits: Partial<ItineraryCostLine>): ItineraryCostLine {
  return createItineraryCostLine({
    ...current,
    ...edits,
    itinerary_id: current.itinerary_id,
    cost_category: edits.cost_category ?? current.cost_category,
    description: edits.description ?? current.description,
    quantity: edits.quantity ?? current.quantity,
    unit: edits.unit ?? current.unit,
    unit_cost: edits.unit_cost ?? current.unit_cost,
    currency: edits.currency ?? current.currency,
    sequence: edits.sequence ?? current.sequence,
  });
}

export function deleteItineraryCostLine(lines: ItineraryCostLine[], id?: string | null) {
  return lines.filter((line) => line.id !== id);
}

export function calculateItineraryCostTotals(lines: Array<Partial<ItineraryCostLine>>): ItineraryCostSummary {
  const byCategory = {
    HOTEL: 0,
    TRANSPORT: 0,
    ACTIVITY: 0,
    FLIGHT: 0,
    VISA: 0,
    EXTRA_TRANSPORT: 0,
    OTHER: 0,
  } as Record<ItineraryCostCategory, number>;

  const byCurrency: Record<string, number> = {};
  let total = 0;

  for (const line of lines) {
    const validated = validateItineraryCostLine(line);
    const category = validated.cost_category;
    const amount = validated.total_cost;
    byCategory[category] += amount;
    byCurrency[validated.currency] = (byCurrency[validated.currency] ?? 0) + amount;
    total += amount;
  }

  return { byCategory, byCurrency, total };
}

export function getItineraryCostStatus(lines: Array<Partial<ItineraryCostLine>>) {
  const summary = calculateItineraryCostTotals(lines);
  return {
    hasCosts: summary.total > 0,
    missingCosts: summary.total === 0,
    summary,
  };
}

export function summarizeItineraryCostSections(lines: Array<Partial<ItineraryCostLine>>): ItineraryCostSectionSummary {
  const summary = calculateItineraryCostTotals(lines);
  const totalHotels = summary.byCategory.HOTEL;
  const activitiesTransfers = (summary.byCategory.ACTIVITY ?? 0) + (summary.byCategory.EXTRA_TRANSPORT ?? 0);
  const totalVisa = summary.byCategory.VISA;
  const transportOther = (summary.byCategory.TRANSPORT ?? 0) + (summary.byCategory.OTHER ?? 0);
  const totalSupplierCost = summary.total;
  const totalLandPackage = totalHotels + activitiesTransfers + totalVisa + transportOther;

  return {
    totalLandPackage,
    activitiesTransfers,
    totalHotels,
    totalVisa,
    transportOther,
    totalSupplierCost,
    margin: 0,
    taxes: 0,
    total: totalSupplierCost,
  };
}

export function ensureCostLineItemScope(itineraryId: string, line: { itinerary_item_id?: string | null }, itemItineraryId?: string | null) {
  if (line.itinerary_item_id && itemItineraryId && itemItineraryId !== itineraryId) {
    throw new Error("Cost lines cannot reference an item from another itinerary.");
  }
}
