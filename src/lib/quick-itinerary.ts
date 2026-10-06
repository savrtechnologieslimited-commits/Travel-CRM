import { buildItineraryPresentation } from "./itinerary-preview";
import type { SupplierImportResult } from "./ai-supplier-itinerary-import.server";

export const QUICK_ITINERARY_REQUEST_EVENT = "savr:quick-itinerary-request";

export type QuickItineraryRequest = {
  sourceText?: string;
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  destinationText?: string;
};

export function createQuickItineraryPreview(
  result: SupplierImportResult,
  photos: Array<{
    dayIndex: number;
    itemIndex?: number;
    url: string;
    placeName?: string;
    caption?: string | null;
    altText?: string | null;
    googlePlaceId?: string;
    attribution?: Array<{
      displayName: string;
      uri: string | null;
      photoUri: string | null;
    }>;
  }>,
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
