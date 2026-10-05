import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ItineraryPresentationTemplateId } from "./itinerary-preview";
import { buildPublicItineraryShareUrl, createShareToken, hashShareToken, type ItineraryShareDetail, type ShareSerializableValue } from "./itinerary-share";

export async function getPublicItineraryShareByToken(token: string): Promise<ItineraryShareDetail | null> {
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (!normalizedToken) return null;

  const tokenHash = await hashShareToken(normalizedToken);
  const { data: share, error: shareError } = await supabaseAdmin
    .from("itinerary_shares")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("is_active", true)
    .maybeSingle();

  if (shareError || !share) return null;
  if (share.revoked_at) return null;
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) return null;

  const itineraryResult = await supabaseAdmin.from("itineraries").select("*").eq("id", share.itinerary_id).maybeSingle();
  if (itineraryResult.error || !itineraryResult.data) return null;
  const itinerary = itineraryResult.data;

  const destinationResult = itinerary.destination_id
    ? await supabaseAdmin.from("destinations").select("name").eq("id", itinerary.destination_id).maybeSingle()
    : { data: null, error: null };
  let guestName: string | null = null;
  if (itinerary.customer_id) {
    const { data } = await supabaseAdmin.from("customers").select("full_name").eq("id", itinerary.customer_id).maybeSingle();
    guestName = data?.full_name ?? null;
  } else if (itinerary.lead_id) {
    const { data } = await supabaseAdmin.from("leads").select("customer_name").eq("id", itinerary.lead_id).maybeSingle();
    guestName = data?.customer_name ?? null;
  }

  const [{ data: packageOptions }, { data: days }, { data: dayItems }, { data: photos }] = await Promise.all([
    supabaseAdmin.from("itinerary_package_options").select("*").eq("itinerary_id", share.itinerary_id).order("sequence", { ascending: true }),
    supabaseAdmin.from("itinerary_days").select("*").eq("itinerary_id", share.itinerary_id).order("day_number", { ascending: true }),
    supabaseAdmin.from("itinerary_day_items").select("*").order("sequence", { ascending: true }),
    supabaseAdmin.from("itinerary_photos").select("*").eq("itinerary_id", share.itinerary_id).order("sequence", { ascending: true }),
  ]);

  const destination = destinationResult.data;

  const itineraryDays = Array.isArray(days) ? days : [];
  const itineraryItems = Array.isArray(dayItems) ? dayItems : [];
  const itineraryPhotos = Array.isArray(photos) ? photos : [];
  const itineraryPackageOptions = Array.isArray(packageOptions) ? packageOptions : [];
  const rawCustomerPricing = share.customer_pricing && typeof share.customer_pricing === "object" && !Array.isArray(share.customer_pricing)
    ? share.customer_pricing as Record<string, unknown>
    : null;
  const customerPricing = rawCustomerPricing && Number.isFinite(Number(rawCustomerPricing["total"])) && Number(rawCustomerPricing["total"]) > 0
    ? {
        total: Number(rawCustomerPricing["total"]),
        perPerson: Number.isFinite(Number(rawCustomerPricing["perPerson"])) ? Number(rawCustomerPricing["perPerson"]) : Number(rawCustomerPricing["total"]),
        tax: Number.isFinite(Number(rawCustomerPricing["tax"])) ? Number(rawCustomerPricing["tax"]) : 0,
        currency: typeof rawCustomerPricing["currency"] === "string" ? rawCustomerPricing["currency"] : "INR",
        mode: rawCustomerPricing["mode"] === "per_person" ? "per_person" as const : "total" as const,
      }
    : null;
  const displayPhotos = await Promise.all(itineraryPhotos.map(async (photo) => {
    if (!photo.storage_path) return photo;
    const { data, error } = await supabaseAdmin.storage.from("itineraries").createSignedUrl(photo.storage_path, 3600);
    if (error || !data) {
      console.warn("[Itinerary share] Could not resolve a private photo for display.", error);
      return { ...photo, url: null };
    }
    return { ...photo, url: data.signedUrl };
  }));
  const activityPlaceIds = [...new Set(itineraryItems.flatMap((item) => {
    if (item.item_type !== "ACTIVITY" && item.item_type !== "SIGHTSEEING") return [];
    const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? item.metadata as Record<string, unknown>
      : {};
    const placeId = metadata["google_place_id"];
    return typeof placeId === "string" && placeId ? [placeId] : [];
  }))];
  const { data: activityLibraryRows } = activityPlaceIds.length > 0
    ? await supabaseAdmin.from("activity_photo_library")
        .select("id,google_place_id,storage_path,caption,alt_text,display_order")
        .in("google_place_id", activityPlaceIds)
        .order("display_order", { ascending: true })
    : { data: [] };
  const displayActivityPhotos = await Promise.all((activityLibraryRows ?? []).map(async (photo) => {
    const { data, error } = await supabaseAdmin.storage.from("itineraries").createSignedUrl(photo.storage_path, 3600);
    if (error || !data) {
      console.warn("[Itinerary share] Could not resolve a saved activity photo for display.", error);
      return null;
    }
    return { ...photo, url: data.signedUrl };
  }));

  return {
    shareId: share.id,
    token: normalizedToken,
    template: (share.template as ItineraryPresentationTemplateId) ?? "classic",
    selectedPackageId: share.package_id ?? itineraryPackageOptions[0]?.id ?? null,
    customerPricing,
    packageOptions: itineraryPackageOptions.map((option) => ({
      id: option.id,
      name: option.name,
      description: option.description,
    })),
    itinerary: {
      title: itinerary.title ?? itinerary.name ?? "Itinerary",
      destination: destination?.name ?? null,
      customer_name: guestName,
      travel_start_date: itinerary.travel_start_date ?? null,
      travel_end_date: itinerary.travel_end_date ?? null,
      adults: Number(itinerary.adults ?? 0),
      children: Number(itinerary.children ?? 0),
      inclusions: Array.isArray(itinerary.inclusions) ? (itinerary.inclusions as string[]) : [],
      exclusions: Array.isArray(itinerary.exclusions) ? (itinerary.exclusions as string[]) : [],
      cancellation_info: itinerary.cancellation_info ?? "",
      terms_conditions: itinerary.terms_conditions ?? "",
      notes: itinerary.summary ?? null,
      editor_content_html: typeof itinerary.document_html === "string" ? itinerary.document_html : "",
      custom_tables: Array.isArray(itinerary.custom_tables) ? (itinerary.custom_tables as Array<Record<string, ShareSerializableValue>>) : [],
      photos: displayPhotos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        caption: photo.caption,
        alt_text: photo.alt_text,
        sequence: photo.sequence,
        day_id: photo.day_id,
        day_item_id: photo.day_item_id,
        source: photo.source,
        place_name: photo.place_name,
        attribution: photo.attribution,
      })),
      days: itineraryDays.map((day) => ({
        day_number: day.day_number,
        date: day.day_date ?? null,
        title: day.title ?? `Day ${day.day_number}`,
        description: day.description ?? "",
        notes: day.notes ?? "",
        photos: displayPhotos.filter((photo) => photo.day_id === day.id).map((photo) => ({
          id: photo.id,
          url: photo.url,
          caption: photo.caption,
          alt_text: photo.alt_text,
          sequence: photo.sequence,
          day_id: photo.day_id,
          day_item_id: photo.day_item_id,
          source: photo.source,
          place_name: photo.place_name,
          attribution: photo.attribution,
        })),
        items: itineraryItems.filter((item) => item.itinerary_day_id === day.id).map((item) => {
          const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
            ? item.metadata as Record<string, unknown>
            : {};
          const placeId = typeof metadata["google_place_id"] === "string" ? metadata["google_place_id"] : "";
          const attachedPhotos = displayPhotos.filter((photo) => photo.day_item_id === item.id);
          const attachedStoragePaths = new Set(attachedPhotos.map((photo) => photo.storage_path).filter(Boolean));
          const libraryPhotos = displayActivityPhotos.filter((photo) => photo?.google_place_id === placeId && !attachedStoragePaths.has(photo.storage_path));
          return {
          ...item,
          photos: [
            ...attachedPhotos.map((photo) => ({
              id: photo.id,
              url: photo.url,
              caption: photo.caption,
              alt_text: photo.alt_text,
              sequence: photo.sequence,
              day_id: photo.day_id,
              day_item_id: photo.day_item_id,
            })),
            ...libraryPhotos.flatMap((photo) => photo ? [{
              id: photo.id,
              url: photo.url,
              caption: photo.caption,
              alt_text: photo.alt_text,
              sequence: photo.display_order,
            }] : []),
          ],
          title: item.title,
          description: item.description ?? "",
          customer_facing_info: item.customer_facing_info,
          hotel_name: item.hotel_name,
          hotel_city: item.hotel_city,
          hotel_country: item.hotel_country,
          star_category: item.star_category,
          room_type: item.room_type,
          meal_plan: item.meal_plan,
          flight_airline: item.flight_airline,
          flight_number: item.flight_number,
          departure_city: item.departure_city,
          arrival_city: item.arrival_city,
          visa_country: item.visa_country,
          visa_type: item.visa_type,
          extra_transport_type: item.extra_transport_type,
          notes: item.notes,
          package_id: item.package_id,
          item_type: item.item_type,
          sequence: item.sequence,
        };
        }),
      })),
    },
    branding: {
      company_name: "SAVR Travels",
      header_text: "Tailor-made travel experiences",
      footer_text: "Thank you for choosing SAVR Travels.",
      signature_text: "Regards,\nThe SAVR Travels team",
    },
  };
}

export async function createItineraryShare(input: { itineraryId: string; packageId?: string | null; template?: ItineraryPresentationTemplateId; expiresInDays?: number; customerPricing?: { total: number; perPerson: number; tax: number; currency: string; mode: "total" | "per_person" } | null; context: any }) {
  const itineraryId = typeof input.itineraryId === "string" ? input.itineraryId.trim() : "";
  if (!itineraryId) throw new Error("An itinerary is required to create a share link.");

  const { data: itinerary, error: itineraryError } = await input.context.supabase
    .from("itineraries")
    .select("id")
    .eq("id", itineraryId)
    .maybeSingle();

  if (itineraryError || !itinerary) {
    throw new Error("Itinerary could not be loaded for sharing.");
  }

  const token = createShareToken();
  const tokenHash = await hashShareToken(token);
  const expiresAt = typeof input.expiresInDays === "number" && input.expiresInDays > 0
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const quoteTotal = Number(input.customerPricing?.total ?? 0);
  const quotePerPerson = Number(input.customerPricing?.perPerson ?? 0);
  const quoteTax = Number(input.customerPricing?.tax ?? 0);
  const quoteCurrency = (input.customerPricing?.currency ?? "INR").trim().toUpperCase();
  const customerPricing = Number.isFinite(quoteTotal) && quoteTotal > 0 && Number.isFinite(quotePerPerson) && quotePerPerson >= 0 && Number.isFinite(quoteTax) && quoteTax >= 0 && quoteTax <= quoteTotal && /^[A-Z]{3}$/.test(quoteCurrency)
    ? { total: quoteTotal, perPerson: quotePerPerson, tax: quoteTax, currency: quoteCurrency, mode: input.customerPricing?.mode === "per_person" ? "per_person" as const : "total" as const }
    : null;

  const { data: share, error: shareError } = await supabaseAdmin
    .from("itinerary_shares")
    .insert({
      itinerary_id: itineraryId,
      package_id: input.packageId ?? null,
      template: input.template ?? "classic",
      customer_pricing: customerPricing,
      token_hash: tokenHash,
      created_by: input.context.userId,
      expires_at: expiresAt,
      is_active: true,
    })
    .select("id")
    .single();

  if (shareError || !share) {
    throw new Error(shareError?.message ?? "The itinerary share link could not be created.");
  }

  return {
    id: share.id,
    token,
    url: buildPublicItineraryShareUrl(process.env["APP_URL"] ?? "http://localhost:3000", token),
    expiresAt,
  };
}

export const createItineraryShareFn = createServerFn({ method: "POST" })
  .validator((input: { itineraryId: string; packageId?: string | null; template?: ItineraryPresentationTemplateId; expiresInDays?: number; customerPricing?: { total: number; perPerson: number; tax: number; currency: string; mode: "total" | "per_person" } | null }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
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
