import { buildItineraryPresentation } from "./itinerary-preview";
import { itineraryTextToSafeHtml } from "./itinerary-ticket-sources";
import type { SupplierImportResult } from "./ai-supplier-itinerary-import.server";

export const QUICK_ITINERARY_REQUEST_EVENT = "savr:quick-itinerary-request";

export type QuickItineraryRequest = {
  sourceText?: string;
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  destinationText?: string;
};

export type QuickItineraryPhoto = {
  dayIndex: number;
  itemIndex?: number;
  url: string;
  storagePath?: string;
  placeName?: string;
  caption?: string | null;
  altText?: string | null;
  googlePlaceId?: string;
  attribution?: Array<{
    displayName: string;
    uri: string | null;
    photoUri: string | null;
  }>;
};

function quickItineraryDraftToDocumentText(result: SupplierImportResult) {
  const textValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return result.draft.days
    .map((day, index) =>
      [
        `Day ${index + 1} – ${day.title.replace(/^day\s*\d+\s*[:.\-–—)]\s*/i, "").trim()}`,
        textValue(day.description),
        ...day.items.flatMap((item) => {
          const title = textValue(item.title);
          const details = [item.description, item["customer_facing_info"], item.notes]
            .map(textValue)
            .filter(Boolean)
            .join(" — ");
          return title || details ? [`• ${[title, details].filter(Boolean).join(": ")}`] : [];
        }),
        textValue(day.notes),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function createQuickItineraryDraftSnapshot(
  result: SupplierImportResult,
  photos: QuickItineraryPhoto[],
  sourceText: string,
) {
  const hasHotels = result.draft.days.some((day) =>
    day.items.some((item) => item.item_type === "ACCOMMODATION"),
  );
  const days = result.draft.days.map((day, dayIndex) => ({
    id: crypto.randomUUID(),
    day_number: dayIndex + 1,
    date: day.date ?? "",
    title: day.title,
    description: day.description ?? "",
    notes: day.notes ?? "",
    items: day.items.map((item, itemIndex) => {
      const metadata =
        item["metadata"] && typeof item["metadata"] === "object" && !Array.isArray(item["metadata"])
          ? (item["metadata"] as Record<string, unknown>)
          : {};
      return {
        ...item,
        id: crypto.randomUUID(),
        description: item.description ?? "",
        sequence: item.sequence ?? itemIndex + 1,
        ...(item.item_type === "ACCOMMODATION"
          ? { metadata: { ...metadata, overall_hotel_booking: true } }
          : {}),
      };
    }),
  }));
  const savedPhotos = photos.flatMap((photo, index) => {
    const day = days[photo.dayIndex];
    if (!day || !photo.storagePath) return [];
    const item = photo.itemIndex === undefined ? undefined : day.items[photo.itemIndex];
    if (photo.itemIndex !== undefined && !item) return [];
    return [
      {
        id: crypto.randomUUID(),
        day_id: day.id,
        day_item_id: item?.id ?? null,
        url: "",
        storage_path: photo.storagePath,
        caption: photo.caption ?? "",
        alt_text: photo.altText ?? "",
        sequence: index + 1,
        source: photo.googlePlaceId ? "GOOGLE_PLACES" : "SUPPLIER_DOCUMENT",
        google_place_id: photo.googlePlaceId ?? null,
        place_name: photo.placeName ?? null,
        attribution: photo.attribution ?? null,
      },
    ];
  });

  return {
    form: {
      title: result.draft.title || result.draft.destination || "Quick itinerary",
      customer_id: "",
      lead_id: "",
      enquiry_id: "",
      destination_id: result.destination_resolution.destination_id ?? "",
      travel_start_date: result.draft.travel_start_date ?? "",
      travel_end_date: result.draft.travel_end_date ?? "",
      adults: String(result.draft.adults ?? 2),
      children: String(result.draft.children ?? 0),
      assigned_to: "",
      status: "DRAFT" as const,
      inclusions: result.draft.inclusions,
      exclusions: result.draft.exclusions,
      cancellation_info: result.draft.cancellation_info ?? "",
      terms_conditions: "",
      custom_tables: result.tables,
      customer_quotes: {},
      document_html: itineraryTextToSafeHtml(quickItineraryDraftToDocumentText(result)),
      photos: savedPhotos,
      provenance: result.provenance,
    },
    days,
    supplierDetails: sourceText,
    costLines: [],
    previewPackageOptions: [],
    selectedPreviewPackageId: null,
    copyMetadata: {},
    marginLines: [],
    taxLines: [],
    activitiesTransfersEnabled: true,
    hotelsEnabled: hasHotels,
    hotelBookingMode: "overall" as const,
    itineraryId: null,
  };
}

export function createQuickItineraryPreview(
  result: SupplierImportResult,
  photos: QuickItineraryPhoto[],
) {
  return buildItineraryPresentation({
    itinerary: {
      title: result.draft.title,
      destination: result.draft.destination,
      ...(result.draft.travel_start_date !== undefined
        ? { travel_start_date: result.draft.travel_start_date }
        : {}),
      ...(result.draft.travel_end_date !== undefined
        ? { travel_end_date: result.draft.travel_end_date }
        : {}),
      ...(result.draft.adults !== undefined ? { adults: result.draft.adults } : {}),
      ...(result.draft.children !== undefined ? { children: result.draft.children } : {}),
      inclusions: result.draft.inclusions,
      exclusions: result.draft.exclusions,
      ...(result.draft.cancellation_info !== undefined
        ? { cancellation_info: result.draft.cancellation_info }
        : {}),
      custom_tables: result.tables,
      days: result.draft.days.map((day, dayIndex) => ({
        day_number: dayIndex + 1,
        date: day.date ?? null,
        title: day.title,
        description: day.description ?? "",
        notes: day.notes ?? "",
        photos: photos
          .filter((photo) => photo.dayIndex === dayIndex && photo.itemIndex === undefined)
          .map((photo) => ({
            url: photo.url,
            ...(photo.caption ? { caption: photo.caption } : {}),
            ...(photo.altText ? { alt_text: photo.altText } : {}),
            ...(photo.placeName ? { place_name: photo.placeName } : {}),
            ...(photo.googlePlaceId ? { source: "GOOGLE_PLACES" } : {}),
            ...(photo.attribution ? { attribution: photo.attribution } : {}),
          })),
        items: day.items.map((item, itemIndex) => ({
          ...item,
          metadata: (() => {
            const metadata =
              item["metadata"] &&
              typeof item["metadata"] === "object" &&
              !Array.isArray(item["metadata"])
                ? (item["metadata"] as Record<string, unknown>)
                : {};
            return item.item_type === "ACCOMMODATION"
              ? { ...metadata, overall_hotel_booking: true }
              : metadata;
          })(),
          photos: photos
            .filter((photo) => photo.dayIndex === dayIndex && photo.itemIndex === itemIndex)
            .map((photo) => ({
              url: photo.url,
              ...(photo.caption ? { caption: photo.caption } : {}),
              ...(photo.altText ? { alt_text: photo.altText } : {}),
              ...(photo.placeName ? { place_name: photo.placeName } : {}),
              ...(photo.googlePlaceId ? { source: "GOOGLE_PLACES" } : {}),
              ...(photo.attribution ? { attribution: photo.attribution } : {}),
            })),
        })),
      })),
    },
    template: "package",
    branding: {
      company_name: "SAVR Travels",
      header_text: "Tailor-made travel experiences",
      footer_text: "Thank you for choosing SAVR Travels.",
    },
  });
}
