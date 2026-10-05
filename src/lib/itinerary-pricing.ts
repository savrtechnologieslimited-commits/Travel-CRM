export type ItineraryCustomerPricingMarginMode = "PERCENTAGE" | "MANUAL";
export type ItineraryCustomerPricingChildMode = "PERCENTAGE" | "MANUAL";

export type ItineraryCustomerPricingInput = {
  internal_cost?: number | string | null;
  adults?: number | string | null;
  children?: number | string | null;
  margin_mode?: ItineraryCustomerPricingMarginMode | null;
  margin_percentage?: number | string | null;
  margin_amount?: number | string | null;
  tax_percentage?: number | string | null;
  child_pricing_mode?: ItineraryCustomerPricingChildMode | null;
  child_pricing_percentage?: number | string | null;
  child_unit_price?: number | string | null;
};

export type ItineraryCustomerPricingResult = {
  internal_cost: number;
  adults: number;
  children: number;
  margin_mode: ItineraryCustomerPricingMarginMode;
  margin_percentage: number;
  margin_amount: number;
  selling_price: number;
  tax_percentage: number;
  tax_amount: number;
  final_customer_price: number;
  adult_price: number;
  child_price: number;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercentage(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

export function validateItineraryCustomerPricingInput(input: ItineraryCustomerPricingInput = {}) {
  const internalCost = toNumber(input.internal_cost, 0);
  if (internalCost < 0) {
    throw new Error("Internal cost must be non-negative.");
  }

  const adults = Math.max(0, Math.floor(toNumber(input.adults, 0)));
  const children = Math.max(0, Math.floor(toNumber(input.children, 0)));
  if (toNumber(input.adults, 0) < 0 || toNumber(input.children, 0) < 0) {
    throw new Error("Adults and children must be non-negative.");
  }

  const marginMode = input.margin_mode ?? "PERCENTAGE";
  if (marginMode !== "PERCENTAGE" && marginMode !== "MANUAL") {
    throw new Error("Margin mode must be PERCENTAGE or MANUAL.");
  }

  const marginPercentage = clampPercentage(toNumber(input.margin_percentage, 0), "Margin percentage");
  const marginAmount = toNumber(input.margin_amount, 0);
  if (marginMode === "MANUAL" && marginAmount < 0) {
    throw new Error("Margin amount must be non-negative.");
  }

  const taxPercentage = clampPercentage(toNumber(input.tax_percentage, 0), "Tax percentage");

  const childMode = input.child_pricing_mode ?? "PERCENTAGE";
  if (childMode !== "PERCENTAGE" && childMode !== "MANUAL") {
    throw new Error("Child pricing mode must be PERCENTAGE or MANUAL.");
  }

  const childPricingPercentage = clampPercentage(toNumber(input.child_pricing_percentage, 0), "Child price percentage");
  if (childPricingPercentage > 100) {
    throw new Error("Child price percentage cannot exceed 100%.");
  }

  const childUnitPrice = toNumber(input.child_unit_price, 0);
  if (childMode === "MANUAL" && childUnitPrice < 0) {
    throw new Error("Child price must be non-negative.");
  }

  return {
    internal_cost: internalCost,
    adults,
    children,
    margin_mode: marginMode,
    margin_percentage: marginPercentage,
    margin_amount: marginAmount,
    tax_percentage: taxPercentage,
    child_pricing_mode: childMode,
    child_pricing_percentage: childPricingPercentage,
    child_unit_price: childUnitPrice,
  } satisfies ItineraryCustomerPricingInput;
}

export function calculateItineraryCustomerPricing(input: ItineraryCustomerPricingInput): ItineraryCustomerPricingResult {
  const normalized = validateItineraryCustomerPricingInput(input);
  const internalCost = normalized.internal_cost;
  const adults = normalized.adults;
  const children = normalized.children;

  const marginMode = normalized.margin_mode;
  const marginPercentage = normalized.margin_percentage;
  const marginAmount = marginMode === "PERCENTAGE"
    ? internalCost * (marginPercentage / 100)
    : Math.max(0, normalized.margin_amount);

  const sellingPrice = internalCost + marginAmount;
  const taxPercentage = normalized.tax_percentage;
  const taxAmount = sellingPrice * (taxPercentage / 100);
  const finalCustomerPrice = sellingPrice + taxAmount;

  let adultPrice = 0;
  let childPrice = 0;

  if (normalized.child_pricing_mode === "PERCENTAGE") {
    const childRatio = normalized.child_pricing_percentage / 100;
    const totalTravellers = adults + children * childRatio;
    if (totalTravellers > 0) {
      adultPrice = sellingPrice / totalTravellers;
      childPrice = adultPrice * childRatio;
    }
  } else {
    childPrice = normalized.child_unit_price;
    const remainingSellingPrice = sellingPrice - children * childPrice;
    adultPrice = adults > 0 ? remainingSellingPrice / adults : 0;
  }

  return {
    internal_cost: internalCost,
    adults,
    children,
    margin_mode: marginMode,
    margin_percentage: marginPercentage,
    margin_amount: marginAmount,
    selling_price: sellingPrice,
    tax_percentage: taxPercentage,
    tax_amount: taxAmount,
    final_customer_price: finalCustomerPrice,
    adult_price: adultPrice,
    child_price: childPrice,
  };
}
