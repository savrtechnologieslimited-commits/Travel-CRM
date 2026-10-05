export const LEAD_STATUSES = [
  "new",
  "contacted",
  "requirement_collected",
  "itinerary_preparing",
  "quotation_sent",
  "negotiation",
  "follow_up",
  "confirmed",
  "lost",
  "cancelled",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ENQUIRY_PIPELINE_STAGES = [
  "new",
  "in_progress",
  "proposal_sent",
  "booked",
  "trip_completed",
  "lost",
] as const;
export type EnquiryPipelineStage = (typeof ENQUIRY_PIPELINE_STAGES)[number];

export const KANBAN_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "requirement_collected",
  "itinerary_preparing",
  "quotation_sent",
  "negotiation",
  "confirmed",
  "lost",
];

export const LEAD_SOURCES = [
  "website",
  "whatsapp",
  "instagram",
  "facebook",
  "google",
  "referral",
  "walk_in",
  "phone",
  "existing_customer",
  "travel_portal",
  "corporate",
  "other",
] as const;

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TRIP_TYPES = [
  "honeymoon",
  "family",
  "couple",
  "solo",
  "group",
  "corporate",
  "religious",
  "adventure",
  "leisure",
  "luxury",
  "backpacking",
] as const;
export const HOTEL_CATEGORIES = ["Budget", "3 Star", "4 Star", "5 Star", "Luxury"] as const;
export const MEAL_PLANS = ["Room Only", "Breakfast", "MAP", "AP", "All Inclusive"] as const;
export const QUOTATION_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "negotiation",
  "accepted",
  "rejected",
  "expired",
] as const;
export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "partially_confirmed",
  "fully_confirmed",
  "cancelled",
  "completed",
] as const;
export const PAYMENT_STATUSES = [
  "unpaid",
  "partially_paid",
  "paid",
  "refund_pending",
  "refunded",
] as const;
export const PAYMENT_METHODS = [
  "upi",
  "bank_transfer",
  "credit_card",
  "debit_card",
  "cash",
  "payment_gateway",
  "cheque",
] as const;
export const CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SGD",
  "AUD",
  "CAD",
  "THB",
  "JPY",
] as const;
export const VISA_STATUSES = [
  "not_required",
  "required",
  "documents_pending",
  "documents_submitted",
  "appointment_scheduled",
  "under_processing",
  "approved",
  "rejected",
  "expired",
] as const;
export const TASK_STATUSES = ["pending", "in_progress", "completed", "overdue"] as const;
export const SUPPLIER_CATEGORIES = [
  "hotel",
  "airline",
  "dmc",
  "transport",
  "visa",
  "activity",
  "tour_operator",
  "guide",
  "insurance",
] as const;

/** Canonical partner capabilities a supplier record can hold (a supplier may have several). */
export const SUPPLIER_TYPES = [
  "dmc",
  "hotel",
  "transport",
  "activity",
  "airline",
  "tour_operator",
  "local_agent",
  "visa",
  "insurance",
  "guide",
  "other",
] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

export const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  dmc: "DMC / Destination Partner",
  hotel: "Hotel",
  transport: "Transport Provider",
  activity: "Activity Provider",
  airline: "Airline",
  tour_operator: "Tour Operator",
  local_agent: "Local Agent",
  visa: "Visa Partner",
  insurance: "Insurance",
  guide: "Guide",
  other: "Other",
};

export function supplierTypeLabel(value?: string | null) {
  if (!value) return "—";
  return SUPPLIER_TYPE_LABELS[value] ?? titleize(value);
}

/** How a service line is fulfilled: in-house/direct, or through a supplier/partner. */
export const FULFILMENT_MODES = ["direct", "supplier"] as const;
export type FulfilmentMode = (typeof FULFILMENT_MODES)[number];

export const FULFILMENT_LABELS: Record<string, string> = {
  direct: "Direct",
  supplier: "Through partner",
};

/** Human label for a service line's fulfilment, e.g. "Kerala Holidays DMC" or "Direct". */
export function fulfilmentLabel(
  mode?: string | null,
  supplier?: {
    name?: string | null;
    supplier_types?: string[] | null;
    category?: string | null;
  } | null,
) {
  if (mode === "supplier" && supplier?.name) {
    const type = supplier.supplier_types?.[0] ?? supplier.category;
    return type ? `${supplier.name} · ${supplierTypeLabel(type)}` : supplier.name;
  }
  if (supplier?.name) return supplier.name;
  return "Direct";
}

export const DOC_TYPES = [
  "passport",
  "visa",
  "pan",
  "aadhaar",
  "flight_ticket",
  "hotel_voucher",
  "activity_voucher",
  "transport_voucher",
  "train_ticket",
  "insurance",
  "booking_confirmation",
  "payment_receipt",
  "invoice",
  "itinerary",
  "visa_application",
  "other",
] as const;
export const ITEM_TYPES = [
  "flight",
  "hotel",
  "transfer",
  "sightseeing",
  "visa",
  "insurance",
  "activity",
  "other",
] as const;
export const CHANNELS = ["call", "whatsapp", "email", "sms", "note"] as const;
export const ROLES = ["admin", "manager", "operations", "read_only"] as const;

export const PIPELINE = [
  "Lead",
  "Enquiry",
  "Itinerary",
  "Quotation",
  "Negotiation",
  "Booking",
  "Payments",
  "Documents",
  "Travel",
  "Completed",
  "Feedback",
] as const;

export function titleize(value?: string | null) {
  if (!value) return "—";
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatMoney(amount?: number | null, currency = "INR") {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-IN")}`;
  }
}

export function compactMoney(amount?: number | null) {
  const value = Number(amount ?? 0);
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function statusTone(status?: string | null) {
  switch (status) {
    case "confirmed":
    case "fully_confirmed":
    case "accepted":
    case "paid":
    case "completed":
    case "approved":
    case "verified":
    case "booked":
    case "trip_completed":
      return "success";
    case "lost":
    case "cancelled":
    case "rejected":
    case "unpaid":
    case "overdue":
    case "expired":
      return "destructive";
    case "negotiation":
    case "partially_paid":
    case "partially_confirmed":
    case "pending":
    case "under_processing":
    case "documents_pending":
      return "warning";
    case "new":
    case "sent":
    case "quotation_sent":
    case "proposal_sent":
    case "in_progress":
      return "info";
    default:
      return "muted";
  }
}

export function validateTravelDateRange(startDate?: string | null, endDate?: string | null) {
  if (!startDate && !endDate) return null;
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return "Trip end date cannot be before trip start date.";
  return null;
}

export function validateTravellerCounts(
  adults?: number | string | null,
  children?: number | string | null,
) {
  const adultCount = Number(adults ?? 0);
  const childCount = Number(children ?? 0);
  if (!Number.isFinite(adultCount) || !Number.isFinite(childCount)) {
    return "Adults and children must be valid numbers.";
  }
  if (adultCount < 0 || childCount < 0) return "Adults and children must be zero or greater.";
  return null;
}

/** ---- Indian tax logic for tour packages (GST on gross tour package value). ---- */
export const GST_RATES = { domestic: 5, international: 5 } as const;

export function gstRateFor(scope?: string | null, override?: number | null) {
  if (typeof override === "number") return override;
  return scope === "international" ? GST_RATES.international : GST_RATES.domestic;
}

export type PriceLine = {
  cost_price?: number | null;
  sell_price?: number | null;
  quantity?: number | null;
};

export function computeTotals(
  items: PriceLine[],
  opts: { markup?: number; serviceCharge?: number; discount?: number; gstRate?: number },
) {
  const cost = items.reduce((s, i) => s + Number(i.cost_price ?? 0) * Number(i.quantity ?? 1), 0);
  const sell = items.reduce((s, i) => s + Number(i.sell_price ?? 0) * Number(i.quantity ?? 1), 0);
  const markup = Number(opts.markup ?? 0);
  const serviceCharge = Number(opts.serviceCharge ?? 0);
  const discount = Number(opts.discount ?? 0);
  const taxable = Math.max(sell + markup + serviceCharge - discount, 0);
  const rate = Number(opts.gstRate ?? 5);
  const tax = Math.round((taxable * rate) / 100);
  const total = taxable + tax;
  return {
    cost,
    sell,
    markup,
    serviceCharge,
    discount,
    taxable,
    rate,
    tax,
    total,
    margin: taxable - cost,
  };
}

/** Download an array of records as a CSV file (Excel-friendly). */
export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
