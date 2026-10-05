export type ItineraryPackageQuotationPackage = {
  id: string;
  itinerary_id: string;
  name: string;
  description?: string | null;
  sequence: number;
  is_active?: boolean | null;
};

export type ItineraryPackageQuotationItem = {
  id?: string | null;
  itinerary_day_id?: string | null;
  package_id?: string | null;
  item_type: string;
  title: string;
  description?: string | null;
  location?: string | null;
  hotel_city?: string | null;
  hotel_name?: string | null;
  star_category?: string | null;
  nights?: number | null;
  room_type?: string | null;
  rooms?: number | null;
  adults?: number | null;
  children?: number | null;
  sequence?: number | null;
};

export type ItineraryPackageQuotationCostLine = {
  itinerary_id: string;
  package_id?: string | null;
  itinerary_item_id?: string | null;
  cost_category: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  currency: string;
  total_cost: number;
  sequence: number;
};

export type ItineraryPackageQuotationCustomerPrice = {
  internal_cost?: number | null;
  margin_amount?: number | null;
  selling_price?: number | null;
  tax_amount?: number | null;
  final_customer_price?: number | null;
  adults?: number | null;
  children?: number | null;
};

export type ItineraryPackageQuotationInput = {
  itinerary: {
    id: string;
    title?: string | null;
    customer_id?: string | null;
    lead_id?: string | null;
    enquiry_id?: string | null;
    destination_id?: string | null;
    travel_start_date?: string | null;
    travel_end_date?: string | null;
    adults?: number | null;
    children?: number | null;
    currency?: string | null;
  };
  selectedPackage: ItineraryPackageQuotationPackage | null;
  packageOptions?: ItineraryPackageQuotationPackage[];
  packageItems?: ItineraryPackageQuotationItem[];
  packageCostLines?: ItineraryPackageQuotationCostLine[];
  customerPrice?: ItineraryPackageQuotationCustomerPrice | null;
  created_by?: string | null;
};

export type ItineraryPackageQuotationResult = {
  title: string;
  customer_id: string | null;
  lead_id: string | null;
  enquiry_id: string | null;
  destination_id: string | null;
  travel_start: string | null;
  travel_end: string | null;
  adults: number;
  children: number;
  currency: string;
  total_cost: number;
  total_price: number;
  notes: string | null;
  package_id: string | null;
  quotationItems: Array<{
    title: string;
    description?: string | null;
    quantity: number;
    cost_price: number;
    sell_price: number;
    item_type: string;
  }>;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidUuid(value?: string | null) {
  if (!value) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.trim());
}

export function validateItineraryPackageQuotationInput(input: ItineraryPackageQuotationInput) {
  if (!input.itinerary.id || !isValidUuid(input.itinerary.id)) {
    throw new Error("Itinerary reference is invalid.");
  }

  const packageOptions = input.packageOptions ?? [];
  const selectedPackage = input.selectedPackage;
  if (packageOptions.length > 1 && !selectedPackage) {
    throw new Error("You must explicitly select one package before pushing to quotation.");
  }

  if (selectedPackage && !isValidUuid(selectedPackage.id)) {
    throw new Error("Selected package is invalid.");
  }

  if (selectedPackage && selectedPackage.itinerary_id !== input.itinerary.id) {
    throw new Error("Selected package must belong to the same itinerary.");
  }

  if (packageOptions.length > 0 && selectedPackage && !packageOptions.some((option) => option.id === selectedPackage.id)) {
    throw new Error("Selected package is not part of this itinerary.");
  }

  if (!input.itinerary.customer_id && !input.itinerary.lead_id && !input.itinerary.enquiry_id) {
    throw new Error("A customer, lead, or enquiry is required before pushing to quotation.");
  }

  const currency = (input.itinerary.currency ?? "INR").toString().trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency mismatch or invalid quotation currency.");
  }

  if (input.packageCostLines?.length) {
    const mismatch = input.packageCostLines.find((line) => line.currency && line.currency.toUpperCase() !== currency);
    if (mismatch) {
      throw new Error("Package cost currencies must match the quotation currency.");
    }
  }

  if (input.customerPrice && input.customerPrice.final_customer_price != null && Number(input.customerPrice.final_customer_price) < 0) {
    throw new Error("Final customer price cannot be negative.");
  }

  return {
    itinerary: input.itinerary,
    selectedPackage,
    packageOptions,
    packageItems: input.packageItems ?? [],
    packageCostLines: input.packageCostLines ?? [],
    customerPrice: input.customerPrice ?? null,
  };
}

export function buildPackageQuotationIdempotencyKey(input: {
  itineraryId: string;
  packageId: string;
  customerId?: string | null;
  leadId?: string | null;
  enquiryId?: string | null;
  travelStart?: string | null;
  travelEnd?: string | null;
  adults?: number | null;
  children?: number | null;
  currency?: string | null;
}) {
  const parts = [
    input.itineraryId,
    input.packageId,
    input.customerId ?? "",
    input.leadId ?? "",
    input.enquiryId ?? "",
    input.travelStart ?? "",
    input.travelEnd ?? "",
    String(input.adults ?? 0),
    String(input.children ?? 0),
    (input.currency ?? "INR").toUpperCase(),
  ];
  return parts.join("::");
}

export function assertAuthorizedPackageQuotationPusher(input: { role?: string | null }) {
  const role = (input.role ?? "").toLowerCase();
  if (role === "read_only" || role === "" || role === "viewer") {
    throw new Error("User is not authorized to push an itinerary package to quotation.");
  }
  return true;
}

export function buildItineraryPackageQuotation(input: ItineraryPackageQuotationInput): ItineraryPackageQuotationResult {
  const validated = validateItineraryPackageQuotationInput(input);
  const selectedPackage = validated.selectedPackage ?? validated.packageOptions?.[0] ?? null;
  if (!selectedPackage && validated.packageOptions?.length === 0) {
    throw new Error("Selected package is required before quoting.");
  }

  const packageItems = validated.packageItems ?? [];
  const packageCostLines = validated.packageCostLines ?? [];
  const customerPrice = validated.customerPrice ?? null;
  const currency = (validated.itinerary.currency ?? "INR").toString().trim().toUpperCase();
  const totalCost = packageCostLines.reduce((sum, line) => sum + toNumber(line.total_cost, 0), 0);
  const totalPrice = toNumber(customerPrice?.final_customer_price, 0) || toNumber(customerPrice?.selling_price, 0) || totalCost;

  const quotationItems = packageItems.map((item) => ({
    title: item.title || selectedPackage?.name || "Package item",
    description: item.description ?? selectedPackage?.description ?? null,
    quantity: item.rooms && item.rooms > 0 ? item.rooms : 1,
    cost_price: Math.max(0, totalCost / Math.max(packageItems.length || 1, 1)),
    sell_price: Math.max(0, totalPrice / Math.max(packageItems.length || 1, 1)),
    item_type: item.item_type || "OTHER",
  }));

  const notes = [
    `source_itinerary_id=${validated.itinerary.id}`,
    `source_package_id=${selectedPackage?.id ?? ""}`,
    `source_package_name=${selectedPackage?.name ?? ""}`,
  ].join("; ");

  return {
    title: `${validated.itinerary.title ?? "Trip"} — ${selectedPackage?.name ?? "Package"}`,
    customer_id: validated.itinerary.customer_id ?? null,
    lead_id: validated.itinerary.lead_id ?? null,
    enquiry_id: validated.itinerary.enquiry_id ?? null,
    destination_id: validated.itinerary.destination_id ?? null,
    travel_start: validated.itinerary.travel_start_date ?? null,
    travel_end: validated.itinerary.travel_end_date ?? null,
    adults: Math.max(0, Number(validated.itinerary.adults ?? 0)),
    children: Math.max(0, Number(validated.itinerary.children ?? 0)),
    currency,
    total_cost: totalCost,
    total_price: totalPrice,
    notes,
    package_id: selectedPackage?.id ?? null,
    quotationItems,
  };
}
