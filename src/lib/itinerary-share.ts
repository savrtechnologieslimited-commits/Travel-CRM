import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ItineraryPresentationTemplateId } from "./itinerary-preview";

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getWebCrypto(): Crypto | undefined {
  return globalThis.crypto;
}

export async function hashShareToken(token: string) {
  const normalized = typeof token === "string" ? token.trim() : "";
  if (!normalized) throw new Error("Share token is required.");

  const subtle = getWebCrypto()?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is unavailable in this environment.");
  }

  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return toHex(new Uint8Array(digest));
}

export function buildPublicItineraryShareUrl(origin: string, token: string) {
  const normalizedOrigin = (origin ?? "").replace(/\/+$/, "");
  if (!normalizedOrigin) {
    return `/itinerary-share/${encodeURIComponent(token)}`;
  }
  return `${normalizedOrigin}/itinerary-share/${encodeURIComponent(token)}`;
}

export function createShareToken() {
  const cryptoInstance = getWebCrypto();
  const bytes = new Uint8Array(32);
  if (cryptoInstance?.getRandomValues) {
    cryptoInstance.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return toHex(bytes);
}

export type ShareSerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ShareSerializableValue[]
  | { [key: string]: ShareSerializableValue };

export type ItineraryShareDetail = {
  shareId: string;
  token: string;
  template: ItineraryPresentationTemplateId;
  selectedPackageId: string | null;
  customerPricing: {
    total: number;
    perPerson: number;
    tax: number;
    currency: string;
    mode: "total" | "per_person";
  } | null;
  packageOptions: Array<{ id: string; name: string; description?: string | null }>;
  itinerary: {
    title: string;
    destination: string | null;
    customer_name: string | null;
    travel_start_date: string | null;
    travel_end_date: string | null;
    adults: number;
    children: number;
    inclusions: string[];
    exclusions: string[];
    cancellation_info: string;
    terms_conditions: string;
    notes: string | null;
    editor_content_html: string;
    custom_tables: Array<Record<string, ShareSerializableValue>>;
    photos: Array<Record<string, ShareSerializableValue>>;
    days: Array<{
      day_number: number;
      date: string | null;
      title: string;
      description: string;
      notes: string;
      photos: Array<Record<string, ShareSerializableValue>>;
      items: Array<Record<string, ShareSerializableValue>>;
    }>;
  };
  branding: {
    company_name: string;
    header_text: string;
    footer_text: string;
    signature_text: string;
  };
};

export const getPublicItineraryShareByToken = createServerOnlyFn(async (token: string): Promise<ItineraryShareDetail | null> => {
  const { getPublicItineraryShareByToken: getPublicShare } = await import("./itinerary-share.server");
  return getPublicShare(token);
});

export const createItineraryShareFn = createServerFn({ method: "POST" })
  .validator((input: { itineraryId: string; packageId?: string | null; template?: ItineraryPresentationTemplateId; expiresInDays?: number; customerPricing?: { total: number; perPerson: number; tax: number; currency: string; mode: "total" | "per_person" } | null }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { createItineraryShare } = await import("./itinerary-share.server");
    const payload: {
      itineraryId: string;
      packageId?: string | null;
      template?: ItineraryPresentationTemplateId;
      expiresInDays?: number;
      customerPricing?: { total: number; perPerson: number; tax: number; currency: string; mode: "total" | "per_person" } | null;
      context: typeof context;
    } = {
      itineraryId: data.itineraryId,
      context,
    };

    if (data.packageId !== undefined) payload.packageId = data.packageId ?? null;
    if (data.template !== undefined) payload.template = data.template;
    if (data.expiresInDays !== undefined) payload.expiresInDays = data.expiresInDays;
    if (data.customerPricing !== undefined) payload.customerPricing = data.customerPricing;

    return createItineraryShare(payload);
  });

