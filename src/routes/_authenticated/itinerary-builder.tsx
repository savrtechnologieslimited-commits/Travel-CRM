import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BedDouble,
  Bold,
  Copy,
  Eye,
  ExternalLink,
  FileUp,
  FolderOpen,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  Pencil,
  Plus,
  Quote,
  Redo2,
  RefreshCw,
  Search,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Trash2,
  Underline,
  Undo2,
  Upload,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ItineraryActivityEditor } from "@/components/itinerary-activity-editor";
import {
  ItineraryTimeline,
  type ScheduleChange,
  type TimelineEvent,
} from "@/components/itinerary-timeline";
import { LiveTravelSearch } from "@/components/live-travel-search";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  useAppSettings,
  useCustomers,
  useDestinations,
  useLead,
  useLeads,
  useProfiles,
  useSuppliers,
} from "@/lib/data";
import { extractItineraryFromSupplierDocumentFn } from "@/lib/ai-supplier-itinerary-import";
import { extractSupplierDocumentTextFn } from "@/lib/ai-supplier-itinerary-import";
import { formatItineraryFromSourcesFn } from "@/lib/ai-itinerary-formatter";
import { generateCompleteItineraryFn } from "@/lib/ai-complete-itinerary";
import type {
  CompleteItineraryPlan,
  CompleteItinerarySavedService,
} from "@/lib/ai-complete-itinerary.server";
import {
  completeItineraryPlanToText,
  sanitizeCompletePlanForPreferences,
} from "@/lib/complete-itinerary-presentation";
import { buildPlannedHotelStays } from "@/lib/ai-planned-hotel-stays";
import { HOTEL_MEAL_PLANS, HOTEL_STAR_CATEGORIES, ROOM_TYPES, nightsBetween } from "@/lib/hotel";
import { applyImportedHotelPrices } from "@/lib/hotel-price-import";
import { TRANSPORT_TYPES, VEHICLE_TYPES } from "@/lib/transport";
import {
  ITINERARY_CONTENT_ITEM_TYPES,
  normalizeItineraryItem,
  normalizeItineraryPhoto,
  reorderItineraryItems,
  reorderItineraryPhotos,
  validateItineraryDayItem,
  validateItineraryPhoto,
  validateItineraryTable,
} from "@/lib/itinerary-content";
import {
  reorderTripItineraryDays,
  validateTripItineraryDayInput,
  validateTripItineraryInput,
} from "@/lib/itinerary-library";
import {
  ITINERARY_COST_CATEGORIES,
  createItineraryCostLine,
  deleteItineraryCostLine,
  hasConfiguredPricingLines,
  summarizeItineraryCostSections,
  updateItineraryCostLine,
  validateItineraryCostLine,
  type ItineraryCostLine,
} from "@/lib/itinerary-costing";
import {
  buildItineraryPresentation,
  type ItineraryPresentationTemplateId,
  type ItineraryPreviewPackageOption,
} from "@/lib/itinerary-preview";
import {
  calculateItineraryCustomerQuote,
  normalizeItineraryCustomerQuotes,
  pushItineraryCustomerQuote,
  type ItineraryCustomerQuoteOption,
  type ItineraryCustomerQuotes,
} from "@/lib/itinerary-customer-quote";
import { buildItineraryPdfHtml } from "@/lib/itinerary-pdf";
import {
  insertInlineItineraryDayPhotos,
  removeInlineItineraryDayPhotos,
} from "@/lib/itinerary-inline-day-photos";
import { buildTripDaysFromDateRange, formatTripDayDate } from "@/lib/itinerary-day-dates";
import { shiftIsoDate } from "@/lib/itinerary-day-dates";
import { sortItineraryServicesChronologically } from "@/lib/itinerary-service-order";
import { buildSavedServicesForAi, type AiSavedService } from "@/lib/itinerary-ai-services";
import {
  collectExistingItineraryTickets,
  itineraryTextToSafeHtml,
  sanitizeItineraryEditorHtml,
  type ItineraryTicketFacts,
} from "@/lib/itinerary-ticket-sources";
import {
  createItineraryPhotoDisplayUrl,
  listActivityLibraryPhotos,
} from "@/lib/activity-photo-library";
import {
  lookupGoogleActivityPlacesFn,
  type GoogleActivityPhoto,
  type GoogleActivityPlace,
} from "@/lib/google-places-activities";
import { firstGoogleHotelMatch } from "@/lib/google-hotel-match";
import {
  addDurationToTime,
  durationBetweenTimes,
  durationFromParts,
  durationToParts,
  formatTimeAmPm,
  timeToTwelveHour,
  twelveHourToTime,
} from "@/lib/transfer-time";
import {
  buildItineraryCopyTitle,
  buildItineraryLibrarySaveFields,
  buildItineraryTermsSnapshot,
  hasPendingItineraryGeneration,
  itineraryBuilderUrl,
  itineraryDayTitleWithoutPrefix,
  itineraryDraftLatestKey,
  itineraryDraftStorageScope,
  itineraryTermsSnapshotsEqual,
} from "@/lib/itinerary-builder-state";
import {
  itineraryTermHtmlToText,
  sanitizeItineraryTermHtml,
} from "@/lib/itinerary-terms-rich-text";
import { convertToInr, POPULAR_CURRENCIES, type CurrencyCode } from "@/lib/currency-converter";
import {
  buildSupplierItineraryTerms,
  DEFAULT_ITINERARY_TERMS,
  extractItineraryTermsFromText,
  type ExtractedItineraryTerms,
} from "@/lib/itinerary-terms-extractor";
import { extractDocumentCandidate, isBrowserRuntime } from "@/lib/document-ocr";
import { TravelPlannerPanel } from "@/components/travel-planner-panel";
import type { TripPlan } from "@/lib/travel-planner-engine";
import {
  travelPlanDayDescription,
  travelPlanToDocumentText,
} from "@/lib/travel-planner-presentation";
import { matchItineraryDestinationId } from "@/lib/itinerary-destination";
import { sanitizeListValues } from "@/lib/itinerary-list-editor";
import { buildPublicItineraryShareUrl, createItineraryShareFn } from "@/lib/itinerary-share";
import { addImagesToItineraryFn } from "@/lib/itinerary-images";
import { validateItineraryDraftState, type ValidationSummary } from "@/lib/itinerary-validation";
import {
  buildTravelSearchUrl,
  generateFlightSearchQuery,
  generateHotelSearchQuery,
  getTravelSearchConfigMessage,
  resolveTravelSearchProvider,
  travelSearchConfig,
  type TravelSearchValues,
} from "@/lib/travel-search-providers";
import type { LiveFlightOffer } from "@/lib/travel-search-types";

type TripDayItemState = {
  id?: string | undefined;
  itinerary_day_id?: string | undefined;
  package_id?: string | null | undefined;
  item_type: (typeof ITINERARY_CONTENT_ITEM_TYPES)[number];
  title: string;
  description: string;
  location?: string | null | undefined;
  duration?: string | null | undefined;
  notes?: string | null | undefined;
  pickup?: string | null | undefined;
  dropoff?: string | null | undefined;
  departure_time?: string | null | undefined;
  arrival_time?: string | null | undefined;
  vehicle_details?: string | null | undefined;
  meal_type?: "BREAKFAST" | "LUNCH" | "DINNER" | null | undefined;
  hotel_name?: string | null | undefined;
  hotel_city?: string | null | undefined;
  check_in?: string | null | undefined;
  check_out?: string | null | undefined;
  room_details?: string | null | undefined;
  hotel_address?: string | null | undefined;
  hotel_country?: string | null | undefined;
  star_category?: string | null | undefined;
  nights?: number | null | undefined;
  room_type?: string | null | undefined;
  rooms?: number | null | undefined;
  adults?: number | null | undefined;
  children?: number | null | undefined;
  extra_beds?: number | null | undefined;
  meal_plan?: string | null | undefined;
  hotel_description?: string | null | undefined;
  customer_facing_info?: string | null | undefined;
  hotel_option_group?: string | null | undefined;
  hotel_option_label?: string | null | undefined;
  hotel_option_sequence?: number | null | undefined;
  flight_airline?: string | null | undefined;
  flight_number?: string | null | undefined;
  departure_airport?: string | null | undefined;
  departure_city?: string | null | undefined;
  arrival_airport?: string | null | undefined;
  arrival_city?: string | null | undefined;
  flight_departure_date?: string | null | undefined;
  flight_departure_time?: string | null | undefined;
  flight_arrival_date?: string | null | undefined;
  flight_arrival_time?: string | null | undefined;
  flight_cabin?: string | null | undefined;
  baggage_information?: string | null | undefined;
  flight_duration?: string | null | undefined;
  flight_price?: number | null | undefined;
  flight_currency?: string | null | undefined;
  visa_country?: string | null | undefined;
  visa_type?: string | null | undefined;
  visa_validity?: string | null | undefined;
  visa_processing_time?: string | null | undefined;
  visa_required_documents?: string | null | undefined;
  visa_entry_exit_information?: string | null | undefined;
  visa_customer_information?: string | null | undefined;
  extra_transport_type?: string | null | undefined;
  extra_transport_date?: string | null | undefined;
  extra_transport_pickup_time?: string | null | undefined;
  extra_transport_drop_time?: string | null | undefined;
  extra_transport_vehicle_type?: string | null | undefined;
  extra_transport_vehicle_details?: string | null | undefined;
  extra_transport_driver_details?: string | null | undefined;
  extra_transport_passengers?: number | null | undefined;
  extra_transport_customer_notes?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  sequence: number;
};

type TripDay = {
  id?: string;
  day_number: number;
  date: string;
  title: string;
  description: string;
  notes: string;
  items: TripDayItemState[];
};

type HotelBookingMode = "daywise" | "overall";

type TripPhotoState = {
  id?: string;
  day_id?: string | null;
  day_item_id?: string | null;
  url: string;
  storage_path?: string | null;
  caption: string;
  alt_text: string;
  sequence: number;
  source?: string | null;
  selection_type?: string | null;
  is_primary?: boolean;
  google_place_id?: string | null;
  place_name?: string | null;
  google_photo_reference?: string | null;
  attribution?: Database["public"]["Tables"]["itinerary_photos"]["Row"]["attribution"];
};

type GeneratedPhotoAttachment = {
  day_index: number;
  item_index: number;
  storage_path: string;
  caption: string | null;
  alt_text: string | null;
  sequence: number;
};

function generatedPhotosForDays(
  attachments: GeneratedPhotoAttachment[] | undefined,
  generatedDays: TripDay[],
): TripPhotoState[] {
  return (attachments ?? []).flatMap((photo) => {
    const item = generatedDays[photo.day_index]?.items[photo.item_index];
    if (!item?.id) return [];
    return [
      {
        id: crypto.randomUUID(),
        day_item_id: item.id,
        url: "",
        storage_path: photo.storage_path,
        caption: photo.caption ?? "",
        alt_text: photo.alt_text ?? "",
        sequence: photo.sequence,
      },
    ];
  });
}

function supplierDraftToDocumentText(draft: {
  days: Array<{
    title: string;
    description?: string;
    notes?: string | null;
    items: Array<Record<string, unknown>>;
  }>;
}) {
  const textValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const sections = draft.days.map((day, index) =>
    [
      `Day ${index + 1} – ${itineraryDayTitleWithoutPrefix(day.title)}`,
      textValue(day.description),
      ...day.items.flatMap((item) => {
        const title = textValue(item["title"]);
        const details = [item["description"], item["customer_facing_info"], item["notes"]]
          .map(textValue)
          .filter(Boolean)
          .join(" — ");
        return title || details ? [`• ${[title, details].filter(Boolean).join(": ")}`] : [];
      }),
      textValue(day.notes),
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return sections.join("\n\n");
}

type TripForm = {
  title: string;
  customer_id: string;
  lead_id: string;
  enquiry_id: string;
  destination_id: string;
  travel_start_date: string;
  travel_end_date: string;
  adults: string;
  children: string;
  assigned_to: string;
  status: "DRAFT" | "READY";
  inclusions: string[];
  exclusions: string[];
  cancellation_info: string;
  terms_conditions: string;
  custom_tables: Array<{ id?: string; title: string; columns: string[]; rows: string[][] }>;
  customer_quotes: ItineraryCustomerQuotes;
  document_html: string;
  photos: TripPhotoState[];
  provenance?: "AI_REQUIREMENTS" | "AI_SUPPLIER_IMPORT" | "AI_BOOKING_SERVICES" | undefined;
};

type ItineraryDraftSnapshot = {
  form: TripForm;
  days: TripDay[];
  quickPrompt?: string;
  supplierDetails?: string;
  costLines: ItineraryCostLine[];
  previewPackageOptions?: ItineraryPreviewPackageOption[];
  selectedPreviewPackageId?: string | null;
  copyMetadata?: ItineraryCopyMetadata;
  marginLines?: MarginLine[];
  taxLines?: TaxLine[];
  activitiesTransfersEnabled: boolean;
  hotelsEnabled: boolean;
  hotelBookingMode?: HotelBookingMode;
  itineraryId: string | null;
};

type ItineraryCopyMetadata = Partial<
  Pick<
    Database["public"]["Tables"]["itineraries"]["Row"],
    | "currency"
    | "description"
    | "exchange_rate"
    | "exchange_rate_updated_at"
    | "hotel_category"
    | "package_id"
    | "price"
    | "price_inr"
    | "summary"
    | "trip_type"
    | "valid_from"
    | "valid_until"
  >
>;

type HotelRoomDetail = {
  id: string;
  room_type: string;
  adults: number;
  kids: number;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  room_rate_per_night: number;
  currency?: string;
  room_rate_per_night_inr?: number | null;
  exchange_rate?: number | null;
  exchange_rate_updated_at?: string | null;
  free_cancellation_date: string;
};

type MarginLine = {
  id: string;
  detail: string;
  percentage: number | string;
  amount: number | string;
};

type TaxLine = {
  id: string;
  detail: string;
  percentage: number | string;
  amount: number | string;
};

function getAccommodationRoomDetails(item: TripDayItemState): HotelRoomDetail[] {
  const existing = Array.isArray(item.metadata?.room_details)
    ? (item.metadata.room_details as HotelRoomDetail[])
    : [];
  if (existing.length > 0) return existing;

  return [
    {
      id: crypto.randomUUID(),
      room_type: item.room_type ?? "Room Type",
      adults: Number(item.adults ?? 0),
      kids: Number(item.children ?? 0),
      breakfast: Boolean(item.meal_plan?.toLowerCase().includes("breakfast")),
      lunch: false,
      dinner: false,
      room_rate_per_night: 0,
      currency: "INR",
      free_cancellation_date: "",
    },
  ];
}

const EMPTY_FORM: TripForm = {
  title: "",
  customer_id: "",
  lead_id: "",
  enquiry_id: "",
  destination_id: "",
  travel_start_date: "",
  travel_end_date: "",
  adults: "2",
  children: "0",
  assigned_to: "",
  status: "DRAFT",
  inclusions: ["Accommodation", "Breakfast"],
  exclusions: ["Flights"],
  cancellation_info:
    "Free cancellation up to 7 days before travel.\nCancellation within 7 days may incur supplier charges.\nNo-show and same-day cancellation charges are non-refundable.",
  terms_conditions: "",
  custom_tables: [
    {
      title: "Client notes",
      columns: ["Key", "Value"],
      rows: [["Pickup location", "Airport terminal 2"]],
    },
  ],
  customer_quotes: {},
  document_html: "",
  photos: [],
  provenance: undefined,
};

const EMPTY_DAY: TripDay = {
  day_number: 1,
  date: "",
  title: "Day 1",
  description: "",
  notes: "",
  items: [],
};

function saveErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const details = error as Record<string, unknown>;
    const message = typeof details["message"] === "string" ? details["message"] : "";
    const detail = typeof details["details"] === "string" ? details["details"] : "";
    const hint = typeof details["hint"] === "string" ? details["hint"] : "";
    const code = typeof details["code"] === "string" ? details["code"] : "";
    const description = [message, detail, hint && `Hint: ${hint}`, code && `Code: ${code}`]
      .filter(Boolean)
      .join("\n");
    if (description) return description;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return "Unable to save itinerary: the server returned an unrecognized error.";
}

function getFlightTimeZone(item: TripDayItemState, key: "departure" | "arrival") {
  const value = item.metadata?.[`${key}_timezone`];
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_DOMESTIC_TIME_ZONE;
}

function validateFlightTimeOrder(item: TripDayItemState) {
  const departureZone = getFlightTimeZone(item, "departure");
  const arrivalZone = getFlightTimeZone(item, "arrival");
  if (!departureZone || !arrivalZone || departureZone.toLowerCase() !== arrivalZone.toLowerCase())
    return null;
  if (
    !item.flight_departure_date ||
    !item.flight_departure_time ||
    !item.flight_arrival_date ||
    !item.flight_arrival_time
  )
    return null;
  const departure = new Date(`${item.flight_departure_date}T${item.flight_departure_time}`);
  const arrival = new Date(`${item.flight_arrival_date}T${item.flight_arrival_time}`);
  return arrival < departure
    ? `Arrival cannot be before departure when both flights use ${departureZone}.`
    : null;
}

const defaultItemForType = (
  itemType: (typeof ITINERARY_CONTENT_ITEM_TYPES)[number],
  sequence: number,
): TripDayItemState => {
  const common = {
    id: crypto.randomUUID(),
    sequence,
    title:
      itemType === "MEAL" ? "Breakfast" : itemType === "TRANSPORT" ? "Airport pickup" : "New item",
    description: "",
    notes: "",
  };

  switch (itemType) {
    case "ACTIVITY":
    case "SIGHTSEEING":
      return {
        ...common,
        item_type: itemType,
        title: itemType === "ACTIVITY" ? "Activity" : "Sightseeing",
        location: "",
        departure_time: "09:00",
        arrival_time: "10:00",
        duration: "1 hour",
        notes: "",
      };
    case "TRANSPORT":
      return {
        ...common,
        item_type: "TRANSPORT",
        title: "Transfer",
        pickup: "",
        dropoff: "",
        departure_time: "09:00",
        arrival_time: "10:00",
        duration: "1 hour",
        vehicle_details: "",
        notes: "",
      };
    case "MEAL":
      return {
        ...common,
        item_type: "MEAL",
        title: "Breakfast",
        meal_type: "BREAKFAST",
        departure_time: "08:00",
        arrival_time: "09:00",
        notes: "",
      };
    case "ACCOMMODATION":
      return {
        ...common,
        item_type: "ACCOMMODATION",
        title: "Accommodation",
        hotel_name: "",
        hotel_city: "",
        hotel_address: "",
        hotel_country: "",
        star_category: "3 Star",
        check_in: "",
        check_out: "",
        nights: 0,
        room_type: "Standard",
        rooms: 1,
        adults: 2,
        children: 0,
        extra_beds: 0,
        meal_plan: "Breakfast",
        hotel_description: "",
        customer_facing_info: "",
        hotel_option_group: "",
        hotel_option_label: "Option 1",
        hotel_option_sequence: 0,
        room_details: "",
        metadata: { check_in_time: "15:00", check_out_time: "11:00" },
        notes: "",
      };
    case "FLIGHT":
      return {
        ...common,
        item_type: "FLIGHT",
        title: "Flight",
        flight_airline: "",
        flight_number: "",
        departure_airport: "",
        departure_city: "",
        arrival_airport: "",
        arrival_city: "",
        flight_departure_date: "",
        flight_departure_time: "",
        flight_arrival_date: "",
        flight_arrival_time: "",
        flight_cabin: "Economy",
        baggage_information: "",
        flight_duration: "",
        flight_price: null,
        flight_currency: "",
        notes: "",
      };
    case "VISA":
      return {
        ...common,
        item_type: "VISA",
        title: "Visa",
        visa_country: "",
        visa_type: "",
        visa_validity: "",
        visa_processing_time: "",
        visa_required_documents: "",
        visa_entry_exit_information: "",
        visa_customer_information: "",
        departure_time: "09:00",
        arrival_time: "10:00",
        notes: "",
      };
    case "EXTRA_TRANSPORT":
      return {
        ...common,
        item_type: "EXTRA_TRANSPORT",
        title: "Extra transport",
        extra_transport_type: "Airport Transfer",
        pickup: "",
        dropoff: "",
        extra_transport_date: "",
        extra_transport_pickup_time: "09:00",
        extra_transport_drop_time: "10:00",
        extra_transport_vehicle_type: "Sedan",
        extra_transport_vehicle_details: "",
        extra_transport_driver_details: "",
        extra_transport_passengers: 0,
        extra_transport_customer_notes: "",
        notes: "",
      };
    case "NOTE":
    default:
      return {
        ...common,
        item_type: "NOTE",
        title: "Important note",
        description: "",
        departure_time: "09:00",
        arrival_time: "09:30",
      };
  }
};

function hotelDatesForDay(dayDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) return { checkIn: "", checkOut: "" };
  const checkOut = new Date(`${dayDate}T00:00:00.000Z`);
  checkOut.setUTCDate(checkOut.getUTCDate() + 1);
  return { checkIn: dayDate, checkOut: checkOut.toISOString().slice(0, 10) };
}

function hotelCheckInAllowed(
  day: TripDay,
  dayIndex: number,
  days: TripDay[],
  travelEndDate: string,
) {
  const finalDate =
    travelEndDate ||
    days
      .map((entry) => entry.date)
      .filter(Boolean)
      .sort()
      .at(-1) ||
    "";
  if (day.date && finalDate) return day.date < finalDate;
  return dayIndex < days.length - 1;
}

function replaceHotelRecommendationInHtml(html: string, city: string, hotelName: string): string {
  if (!html || !hotelName.trim() || typeof DOMParser === "undefined") return html;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const recommendation = [...parsed.body.querySelectorAll("p")].find((paragraph) => {
    const text = paragraph.textContent?.trim() ?? "";
    return (
      /^Recommended stay:/i.test(text) &&
      (!city || text.toLocaleLowerCase().includes(city.toLocaleLowerCase()))
    );
  });
  if (!recommendation) return html;
  recommendation.textContent = `Stay: ${hotelName.trim()}`;
  return parsed.body.innerHTML;
}

async function prepareCustomHotelImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The hotel image could not be loaded."));
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The hotel image could not be prepared.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export const Route = createFileRoute("/_authenticated/itinerary-builder")({
  head: () => ({
    meta: [
      { title: "Itinerary Builder — SAVR Travels CRM" },
      {
        name: "description",
        content: "Internal structured itinerary editor for trip planning and day-by-day editing.",
      },
    ],
  }),
  component: ItineraryBuilderPage,
});

const SAVED_SERVICES_TEXT_HEADER = "SAVED ACTIVITIES AND TRANSFERS (EDIT THESE DETAILS AS NEEDED)";

function CompleteItineraryPanel({
  tickets,
  savedServices,
  tripContext,
  initialRequirements,
  disabled,
  onAccept,
}: {
  tickets: ItineraryTicketFacts[];
  savedServices: AiSavedService[];
  tripContext: { startDate: string; endDate: string; adults: number; children: number } | null;
  initialRequirements?: string;
  disabled: boolean;
  onAccept: (
    plan: CompleteItineraryPlan,
    text: string,
    requirements: string,
    includeHotels: boolean,
  ) => Promise<boolean>;
}) {
  const generateComplete = useServerFn(generateCompleteItineraryFn);
  const [requirements, setRequirements] = useState("");
  const [refinement, setRefinement] = useState("");
  const [hotelChoiceOpen, setHotelChoiceOpen] = useState(false);
  const [includeHotelRecommendations, setIncludeHotelRecommendations] = useState(true);
  const [plan, setPlan] = useState<CompleteItineraryPlan | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editableText, setEditableText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRequirements) setRequirements(initialRequirements);
  }, [initialRequirements]);

  async function generate(
    refine: boolean,
    refinementOverride?: string,
    includeHotels = includeHotelRecommendations,
  ) {
    if (!requirements.trim()) {
      setError("Describe the trip destination and any requirements to generate a plan.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const generated = await generateComplete({
        data: {
          requirements: requirements.trim(),
          ...(refine && (refinementOverride ?? refinement).trim()
            ? { refinement: (refinementOverride ?? refinement).trim() }
            : {}),
          tickets,
          savedServices: savedServices as CompleteItinerarySavedService[],
          includeHotelRecommendations: includeHotels,
          ...(tripContext ? { tripContext } : {}),
        },
      });
      const result = sanitizeCompletePlanForPreferences(generated, requirements);
      setPlan(result);
      setEditableText(
        completeItineraryPlanToText(result, tickets, {
          includeHotelRecommendations: !includeHotels,
        }),
      );
      setEditing(false);
      setRefinement("");
      setReviewOpen(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to generate a complete itinerary plan.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function accept() {
    if (!plan) return;
    const accepted = await onAccept(
      plan,
      editableText || completeItineraryPlanToText(plan, tickets),
      requirements,
      includeHotelRecommendations,
    );
    if (accepted) setReviewOpen(false);
  }

  function renderDaySections(title: string, entries: string[]) {
    if (!entries.length) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <p className="text-sm leading-6 text-slate-700">{entries.join(" ")}</p>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Generate Complete Itinerary with AI</p>
        <p className="mt-1 text-xs text-slate-600">
          Describe the destination, dates, travellers, pace and interests. Existing itinerary
          arrangements and ticket details will be kept accurate.
        </p>
      </div>
      <Textarea
        value={requirements}
        onChange={(event) => setRequirements(event.target.value)}
        placeholder={
          "e.g. “6 days / 5 nights in Kerala for 2 adults. Kochi to Trivandrum, relaxed pace, nature and culture, 4-star hotels.”"
        }
        className="min-h-28 resize-y rounded-xl border-slate-200 bg-white text-sm"
        aria-label="Travel requirements for a complete AI itinerary"
        maxLength={4000}
        disabled={disabled || generating}
      />
      {(tickets.length > 0 || savedServices.length > 0) && (
        <p className="text-xs text-emerald-800">
          Using{" "}
          {[
            tickets.length
              ? `${tickets.length} saved flight/train ticket${tickets.length === 1 ? "" : "s"}`
              : "",
            savedServices.length
              ? `${savedServices.length} existing itinerary arrangement${savedServices.length === 1 ? "" : "s"}`
              : "",
          ]
            .filter(Boolean)
            .join(" and ")}{" "}
          as factual trip details.
        </p>
      )}
      <Button
        type="button"
        className="h-11 w-full rounded-xl bg-violet-700 text-sm font-semibold text-white hover:bg-violet-800"
        disabled={disabled || generating || !requirements.trim()}
        onClick={() => setHotelChoiceOpen(true)}
      >
        <Sparkles className={`mr-2 size-4 ${generating ? "animate-pulse" : ""}`} />
        {generating ? "Planning your itinerary…" : "Generate Itinerary"}
      </Button>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800"
        >
          {error}
        </p>
      )}

      <Dialog open={hotelChoiceOpen} onOpenChange={setHotelChoiceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate itinerary using AI</DialogTitle>
            <DialogDescription>
              Choose whether to include hotel details in this generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={!includeHotelRecommendations}
                onChange={() => setIncludeHotelRecommendations(false)}
                className="mt-0.5 size-5 accent-slate-900"
              />
              <span className="font-medium text-slate-900">Generate itinerary without hotels</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={includeHotelRecommendations}
                onChange={() => setIncludeHotelRecommendations(true)}
                className="mt-0.5 size-5 accent-slate-900"
              />
              <span>
                <span className="block font-medium text-slate-900">
                  Generate itinerary with hotels
                </span>
                <span className="mt-2 block text-sm text-red-600">
                  Ensure that the hotels are included in either the uploaded file or the entered
                  prompt.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={generating}
              onClick={() => setHotelChoiceOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#151515] text-white hover:bg-black"
              disabled={generating}
              onClick={() => {
                setHotelChoiceOpen(false);
                void generate(false, undefined, includeHotelRecommendations);
              }}
            >
              {generating ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-5 pr-12">
            <DialogHeader>
              <DialogTitle>Review AI Itinerary Plan</DialogTitle>
              <DialogDescription>
                Review and refine this customer-ready draft. Existing itinerary details remain
                unchanged; suggested stays and transfers are recommendations. Accept adds the plan
                to this itinerary.
              </DialogDescription>
            </DialogHeader>
          </div>
          {plan && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
                  Trip Summary
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  {plan.trip_summary.destination}
                </h2>
                <p className="mt-1 text-sm text-slate-700">
                  {plan.trip_summary.days} days / {plan.trip_summary.nights} nights ·{" "}
                  {plan.trip_summary.route} · {plan.trip_summary.travel_style}
                </p>
                {plan.trip_summary.start_date && plan.trip_summary.end_date && (
                  <p className="mt-1 text-sm text-slate-600">
                    Travel dates: {plan.trip_summary.start_date} – {plan.trip_summary.end_date}
                  </p>
                )}
                <p className="mt-1 text-sm text-slate-600">
                  {[
                    plan.trip_summary.adults == null ? "" : `${plan.trip_summary.adults} adults`,
                    plan.trip_summary.children == null
                      ? ""
                      : `${plan.trip_summary.children} children`,
                    plan.trip_summary.infants == null ? "" : `${plan.trip_summary.infants} infants`,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Traveller count not specified"}
                </p>
                {(plan.trip_summary.child_ages ||
                  plan.trip_summary.arrival_mode ||
                  plan.trip_summary.departure_mode) && (
                  <p className="mt-1 text-sm text-slate-600">
                    {[
                      plan.trip_summary.child_ages
                        ? `Children's ages: ${plan.trip_summary.child_ages}`
                        : "",
                      plan.trip_summary.arrival_mode
                        ? `Arrive ${plan.trip_summary.arrival_mode}${plan.trip_summary.arrival_city ? ` in ${plan.trip_summary.arrival_city}` : ""}`
                        : "",
                      plan.trip_summary.departure_mode
                        ? `Depart ${plan.trip_summary.departure_mode}${plan.trip_summary.departure_city ? ` from ${plan.trip_summary.departure_city}` : ""}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {plan.trip_summary.assumptions.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold uppercase text-amber-900">Assumptions</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
                      {plan.trip_summary.assumptions.map((assumption, index) => (
                        <li key={index}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
              {tickets.length > 0 && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                    Confirmed ticket facts
                  </p>
                  <div className="mt-2 space-y-3">
                    {tickets.map((ticket, index) => (
                      <div key={`${ticket.kind}-${index}`} className="text-sm text-emerald-950">
                        <p className="font-semibold">Confirmed {ticket.kind}</p>
                        <p>
                          {[
                            ticket.serviceName,
                            ticket.serviceNumber,
                            ticket.date
                              ? `Departure ${ticket.date}${ticket.departureTime ? ` ${ticket.departureTime}` : ""}`
                              : "",
                            ticket.departureLocation ? `from ${ticket.departureLocation}` : "",
                            ticket.arrivalDate
                              ? `Arrival ${ticket.arrivalDate}${ticket.arrivalTime ? ` ${ticket.arrivalTime}` : ""}`
                              : "",
                            ticket.arrivalLocation ? `to ${ticket.arrivalLocation}` : "",
                            ticket.travelClass,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-emerald-900">
                    Ticket facts are authoritative; fares and internal fields are excluded.
                  </p>
                </section>
              )}
              {!editing ? (
                <div className="space-y-3">
                  {plan.days.map((day) => (
                    <article
                      key={day.day_number}
                      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                          Day {day.day_number}
                          {day.date ? ` · ${day.date}` : ""} · {day.city}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">{day.title}</h3>
                      </div>
                      {renderDaySections("Morning", day.morning)}
                      {renderDaySections("Afternoon", day.afternoon)}
                      {renderDaySections("Evening", day.evening)}
                      {day.saved_services?.length ? (
                        <section className="space-y-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
                          <p className="font-semibold">Included arrangements</p>
                          {day.saved_services.map((service, index) => (
                            <div key={`${service.item_type}-${service.day_number}-${index}`}>
                              <p className="font-medium">{service.title}</p>
                              {service.details.length > 0 && (
                                <p className="text-emerald-900">{service.details.join(" · ")}</p>
                              )}
                            </div>
                          ))}
                        </section>
                      ) : null}
                      {day.transfers.length > 0 &&
                        renderDaySections("Suggested transport", day.transfers)}
                      {renderDaySections("Meal suggestions", day.meals)}
                      {renderDaySections("Leisure", day.free_time)}
                      {renderDaySections("Additional details", day.notes)}
                    </article>
                  ))}
                </div>
              ) : (
                <Textarea
                  aria-label="Edit complete itinerary draft"
                  value={editableText}
                  onChange={(event) => setEditableText(event.target.value)}
                  className="min-h-[45vh] resize-y font-mono text-sm"
                />
              )}
              {plan.transfer_requirements.length > 0 &&
                !plan.days.some((day) => day.transfers.length > 0) && (
                  <section className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                    <h3 className="text-sm font-semibold text-sky-950">Suggested transport</h3>
                    <p className="mt-2 text-sm text-sky-900">
                      {plan.transfer_requirements.join(" ")}
                    </p>
                  </section>
                )}
              {plan.unresolved_questions.length > 0 && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold text-amber-950">To confirm</h3>
                  <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                    {plan.unresolved_questions.map((entry, index) => (
                      <li key={index}>{entry}</li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="space-y-2 rounded-xl border border-slate-200 p-4">
                <Label htmlFor="complete-itinerary-refinement" className="text-sm font-semibold">
                  Regenerate with instructions
                </Label>
                <Textarea
                  id="complete-itinerary-refinement"
                  value={refinement}
                  onChange={(event) => setRefinement(event.target.value)}
                  placeholder={"e.g. “Make Day 3 more relaxed and add more cultural activities.”"}
                  maxLength={1000}
                  className="min-h-20"
                  disabled={generating}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={generating}
                    onClick={() => {
                      setRefinement("");
                      void generate(true, "", includeHotelRecommendations);
                    }}
                  >
                    {generating ? "Regenerating…" : "Regenerate"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={generating || !refinement.trim()}
                    onClick={() => void generate(true, refinement, includeHotelRecommendations)}
                  >
                    Regenerate with instructions
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing((current) => !current)}
                  >
                    {editing ? "Preview Draft" : "Edit Draft"}
                  </Button>
                </div>
              </section>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewOpen(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-violet-700 text-white hover:bg-violet-800"
              onClick={() => void accept()}
              disabled={!plan || generating}
            >
              Accept &amp; Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AiDayPlanPanel({
  onGenerate,
  onExtract,
  onImport,
  onAddImages,
  onTermsTextChange,
  addingImages,
  canAddImages,
  imageResults,
  imageError,
  destination,
  disabled,
  message,
  savedServices,
  savedHotelServices,
  savedServicesText,
  tickets,
  tripContext,
  onAcceptTravelPlannerPlan,
  initialPrompt,
  initialDetails,
}: {
  onGenerate: (
    savedServices: AiSavedService[],
    tickets: ItineraryTicketFacts[],
    sourceText?: string,
  ) => Promise<void>;
  onTermsTextChange: (text: string) => void;
  onExtract: (input: {
    sourceText?: string;
    destinationText?: string;
    fileName?: string;
    mimeType?: string;
    fileBase64?: string;
  }) => Promise<string | null>;
  onImport: (sourceText: string) => Promise<void>;
  onAddImages: () => Promise<void>;
  addingImages: boolean;
  canAddImages: boolean;
  imageResults: Array<{
    dayNumber: number;
    status: "added" | "existing" | "not_found" | "failed";
    placeName?: string;
    message?: string;
  }> | null;
  imageError: string | null;
  tripContext: { startDate: string; endDate: string; adults: number; children: number } | null;
  initialPrompt?: string;
  onAcceptTravelPlannerPlan: (plan: TripPlan, requirements: string) => Promise<boolean>;
  destination: string;
  disabled: boolean;
  message: string | null;
  initialDetails?: string;
  savedServices: AiSavedService[];
  savedHotelServices: AiSavedService[];
  savedServicesText: string;
  tickets: ItineraryTicketFacts[];
}) {
  const [mode, setMode] = useState<"saved" | "complete">(initialPrompt ? "complete" : "saved");
  const [details, setDetails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hasExtractedFile, setHasExtractedFile] = useState(false);
  useEffect(() => {
    if (initialPrompt) setMode("complete");
  }, [initialPrompt]);
  useEffect(() => {
    if (!initialDetails?.trim()) return;
    setDetails((current) => {
      const savedServicesHeader =
        /SAVED ACTIVITIES(?: AND TRANSFERS|, TRANSFERS AND HOTELS) \(EDIT THESE DETAILS AS NEEDED\)/;
      const headerMatch = current.match(savedServicesHeader);
      const existingUserDetails = (
        headerMatch?.index != null ? current.slice(0, headerMatch.index) : current
      ).trim();
      const savedServices =
        headerMatch?.index != null ? current.slice(headerMatch.index).trim() : "";
      const extractedDetails = initialDetails.trim();
      const userDetails =
        existingUserDetails && !existingUserDetails.includes(extractedDetails)
          ? existingUserDetails
          : "";
      return [extractedDetails, userDetails, savedServices].filter(Boolean).join("\n\n");
    });
  }, [initialDetails]);
  useEffect(() => {
    setDetails((current) => {
      const savedServicesHeader =
        /SAVED ACTIVITIES(?: AND TRANSFERS|, TRANSFERS AND HOTELS) \(EDIT THESE DETAILS AS NEEDED\)/;
      const headerMatch = current.match(savedServicesHeader);
      const userDetails = (
        headerMatch?.index != null ? current.slice(0, headerMatch.index) : current
      ).trimEnd();
      return [userDetails, savedServicesText].filter(Boolean).join("\n\n");
    });
  }, [savedServicesText]);
  const savedServicesHeader =
    /SAVED ACTIVITIES(?: AND TRANSFERS|, TRANSFERS AND HOTELS) \(EDIT THESE DETAILS AS NEEDED\)/;
  const savedServicesMatch = details.match(savedServicesHeader);
  const userDetails = (
    savedServicesMatch?.index != null ? details.slice(0, savedServicesMatch.index) : details
  ).trim();

  async function importFile() {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    const extractedText = await onExtract({
      ...(destination ? { destinationText: destination } : {}),
      fileName: file.name,
      mimeType: file.type,
      fileBase64: btoa(binary),
    });
    if (extractedText) {
      setDetails(extractedText);
      setHasExtractedFile(true);
    }
  }

  return (
    <div className="space-y-3 p-2">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        <Button
          type="button"
          variant={mode === "saved" ? "default" : "ghost"}
          size="sm"
          className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-xs"
          onClick={() => setMode("saved")}
        >
          Generate from Saved Services
        </Button>
        <Button
          type="button"
          variant={mode === "complete" ? "default" : "ghost"}
          size="sm"
          className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-xs"
          onClick={() => setMode("complete")}
        >
          Complete Itinerary
        </Button>
      </div>
      {mode === "complete" ? (
        <TravelPlannerPanel
          initialRequirements={initialPrompt}
          disabled={disabled}
          builderMessage={message}
          onAccept={onAcceptTravelPlannerPlan}
        />
      ) : (
        <>
          <label className="flex min-h-[92px] cursor-pointer items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
              <Upload className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-700">
                {file?.name ?? "Upload supplier plan"}
              </span>
              <span className="mt-1 block text-sm text-slate-400">PDF, DOCX, or TXT</span>
            </span>
            <FileUp className="size-4 shrink-0 text-slate-400" />
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              className="sr-only"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setHasExtractedFile(false);
              }}
            />
          </label>
          <Textarea
            value={details}
            onChange={(event) => {
              const text = event.target.value;
              setDetails(text);
              onTermsTextChange(text);
            }}
            placeholder={
              destination
                ? `${destination} — describe nights, cities, pace, client preferences, and any saved services`
                : "Describe destination, nights, cities, pace, and client preferences"
            }
            className="min-h-[320px] resize-y rounded-xl border-slate-200 bg-white text-base"
            aria-label="Editable itinerary details, activities, and transfers for AI"
          />
          {file && (
            <>
              <p className="px-1 text-xs text-slate-500">
                The selected supplier itinerary is ready to extract.
              </p>
              <Button
                type="button"
                className="h-12 w-full rounded-xl bg-[#151515] text-base font-semibold text-white hover:bg-black"
                disabled={disabled}
                onClick={() => void importFile()}
              >
                {disabled ? (
                  <>
                    <Sparkles className="mr-2 size-4 animate-pulse" />
                    Extracting…
                  </>
                ) : hasExtractedFile ? (
                  "Extract text again"
                ) : (
                  "Extract information"
                )}
              </Button>
              {hasExtractedFile && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-xl text-base font-semibold"
                  disabled={disabled || !details.trim()}
                  onClick={() => void onImport(details)}
                >
                  {disabled ? "Preparing itinerary…" : "Create itinerary draft from text"}
                </Button>
              )}
            </>
          )}
          <p className="px-1 text-xs text-slate-500">
            AI uses the itinerary details above and any saved trip facts to generate a structured
            draft.
          </p>
          {!file && (
            <Button
              className="h-12 w-full rounded-xl bg-[#151515] text-base font-semibold text-white hover:bg-black"
              disabled={
                disabled || (!userDetails && savedServices.length === 0 && tickets.length === 0)
              }
              onClick={() =>
                void onGenerate(savedServices, tickets, userDetails ? details.trim() : undefined)
              }
            >
              {disabled ? (
                <>
                  <Sparkles className="mr-2 size-4 animate-pulse" />
                  Preparing…
                </>
              ) : (
                "Generate itinerary using AI"
              )}
            </Button>
          )}
          {message && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {message}
            </p>
          )}
        </>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full rounded-xl border-sky-200 bg-sky-50 text-base font-semibold text-sky-950 hover:bg-sky-100"
        disabled={disabled || addingImages || !canAddImages}
        title={!canAddImages ? "Add itinerary days before searching for images." : undefined}
        onClick={() => void onAddImages()}
      >
        <ImagePlus className={`mr-2 size-4 ${addingImages ? "animate-pulse" : ""}`} />
        {addingImages
          ? "Adding images…"
          : imageResults?.some(
                (result) => result.status === "added" || result.status === "existing",
              )
            ? "Images Added"
            : "Add Images to Itinerary"}
      </Button>
      {!canAddImages && (
        <p className="text-xs text-slate-500">
          Add itinerary days before searching for matching images.
        </p>
      )}
      {imageError && (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800"
        >
          {imageError}
        </p>
      )}
      {imageResults && (
        <div
          role="status"
          aria-live="polite"
          className="space-y-1 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700"
        >
          {imageResults.map((result) => (
            <p key={result.dayNumber}>
              <strong>Day {result.dayNumber}</strong>{" "}
              {result.status === "added"
                ? `✓ ${result.placeName ? `Photo added: ${result.placeName}` : "Photo added"}`
                : result.status === "existing"
                  ? "✓ Existing image kept"
                  : result.status === "not_found"
                    ? `⚠ ${result.message ?? "No suitable image found"}`
                    : `⚠ ${result.message ?? "Could not add an image"}`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function TwelveHourTimeInput({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  required?: boolean;
}) {
  const parts = timeToTwelveHour(value);

  function update(hour: string, minute: string, period: string) {
    if (!hour.trim()) {
      onChange(null);
      return;
    }
    const time = twelveHourToTime(hour, minute || "00", period);
    if (time) onChange(time);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          aria-label={`${label} hour`}
          type="number"
          min="1"
          max="12"
          required={required}
          value={parts.hour}
          onChange={(event) => update(event.target.value, parts.minute, parts.period)}
          placeholder="HH"
          className="min-w-0"
        />
        <span aria-hidden="true">:</span>
        <Input
          aria-label={`${label} minute`}
          type="number"
          min="0"
          max="59"
          value={parts.minute}
          onChange={(event) => update(parts.hour, event.target.value, parts.period)}
          placeholder="MM"
          disabled={!parts.hour}
          className="min-w-0"
        />
        <Select
          value={parts.period}
          onValueChange={(period) => update(parts.hour, parts.minute || "00", period)}
          disabled={!parts.hour}
        >
          <SelectTrigger aria-label={`${label} AM or PM`} className="w-20 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

type ResearchKind = "hotel" | "flight";

const FLIGHT_TIME_ZONE_OPTIONS = [
  ["Afghanistan", "GMT+04:30"],
  ["Argentina", "GMT-03:00"],
  ["Australia", "GMT+10:00"],
  ["Austria", "GMT+01:00"],
  ["Bangladesh", "GMT+06:00"],
  ["Belgium", "GMT+01:00"],
  ["Brazil", "GMT-03:00"],
  ["Canada", "GMT-05:00"],
  ["Chile", "GMT-04:00"],
  ["China", "GMT+08:00"],
  ["Colombia", "GMT-05:00"],
  ["Croatia", "GMT+01:00"],
  ["Czech Republic", "GMT+01:00"],
  ["Denmark", "GMT+01:00"],
  ["Egypt", "GMT+02:00"],
  ["Fiji", "GMT+12:00"],
  ["Finland", "GMT+02:00"],
  ["France", "GMT+01:00"],
  ["Germany", "GMT+01:00"],
  ["Ghana", "GMT+00:00"],
  ["Greece", "GMT+02:00"],
  ["Hong Kong", "GMT+08:00"],
  ["Hungary", "GMT+01:00"],
  ["Iceland", "GMT+00:00"],
  ["India", "GMT+05:30"],
  ["Indonesia", "GMT+07:00"],
  ["Iran", "GMT+03:30"],
  ["Iraq", "GMT+03:00"],
  ["Ireland", "GMT+00:00"],
  ["Israel", "GMT+02:00"],
  ["Italy", "GMT+01:00"],
  ["Japan", "GMT+09:00"],
  ["Jordan", "GMT+03:00"],
  ["Kenya", "GMT+03:00"],
  ["Malaysia", "GMT+08:00"],
  ["Maldives", "GMT+05:00"],
  ["Mexico", "GMT-06:00"],
  ["Morocco", "GMT+01:00"],
  ["Myanmar", "GMT+06:30"],
  ["Nepal", "GMT+05:45"],
  ["Netherlands", "GMT+01:00"],
  ["New Zealand", "GMT+12:00"],
  ["Nigeria", "GMT+01:00"],
  ["Norway", "GMT+01:00"],
  ["Oman", "GMT+04:00"],
  ["Pakistan", "GMT+05:00"],
  ["Peru", "GMT-05:00"],
  ["Philippines", "GMT+08:00"],
  ["Poland", "GMT+01:00"],
  ["Portugal", "GMT+00:00"],
  ["Qatar", "GMT+03:00"],
  ["Romania", "GMT+02:00"],
  ["Russia", "GMT+03:00"],
  ["Saudi Arabia", "GMT+03:00"],
  ["Singapore", "GMT+08:00"],
  ["South Africa", "GMT+02:00"],
  ["South Korea", "GMT+09:00"],
  ["Spain", "GMT+01:00"],
  ["Sri Lanka", "GMT+05:30"],
  ["Sweden", "GMT+01:00"],
  ["Switzerland", "GMT+01:00"],
  ["Taiwan", "GMT+08:00"],
  ["Thailand", "GMT+07:00"],
  ["Turkey", "GMT+03:00"],
  ["Ukraine", "GMT+02:00"],
  ["United Arab Emirates", "GMT+04:00"],
  ["United Kingdom", "GMT+00:00"],
  ["United States", "GMT-05:00"],
  ["Vietnam", "GMT+07:00"],
  ["Zimbabwe", "GMT+02:00"],
] as const;
const DEFAULT_DOMESTIC_TIME_ZONE = "India (GMT+05:30)";
const FLIGHT_CURRENCY_OPTIONS = POPULAR_CURRENCIES;
const ITINERARY_OPTION_VALUES = ["Option 1", "Option 2", "Option 3"] as const;
type ItineraryOption = (typeof ITINERARY_OPTION_VALUES)[number];

function getItineraryOption(item: TripDayItemState): ItineraryOption {
  const value =
    item.item_type === "ACCOMMODATION" ? item.hotel_option_label : item.metadata?.flight_option;
  return ITINERARY_OPTION_VALUES.includes(value as ItineraryOption)
    ? (value as ItineraryOption)
    : "Option 1";
}

function ResearchWorkspace({
  kind,
  destination,
  travelStart,
  travelEnd,
  adults,
  children,
  onAdd,
}: {
  kind: ResearchKind;
  destination: string;
  travelStart: string;
  travelEnd: string;
  adults: string;
  children: string;
  onAdd: (values: Record<string, string | number | null>) => void;
}) {
  const initialHotelValues: Record<string, string> = {
    destination,
    checkIn: travelStart,
    checkOut: travelEnd,
    adults: adults || "2",
    children: children || "0",
    rooms: "1",
  };
  const initialFlightValues: Record<string, string> = {
    from: "",
    to: destination,
    departure: travelStart,
    returnDate: travelEnd,
    adults: adults || "2",
    children: children || "0",
    infants: "0",
    cabin: "Economy",
    tripType: "Round trip",
    departure_timezone: DEFAULT_DOMESTIC_TIME_ZONE,
    arrival_timezone: DEFAULT_DOMESTIC_TIME_ZONE,
  };

  const [values, setValues] = useState<Record<string, string>>(() =>
    kind === "hotel" ? initialHotelValues : initialFlightValues,
  );
  const [query, setQuery] = useState(() =>
    kind === "hotel"
      ? generateHotelSearchQuery(initialHotelValues)
      : generateFlightSearchQuery(initialFlightValues),
  );
  const [url, setUrl] = useState("");
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const provider = resolveTravelSearchProvider(kind, travelSearchConfig);
  const isGoibiboProvider = Boolean(provider?.url.match(/^https?:\/\/(www\.)?goibibo\.com\//i));
  const usesGoibiboFallback =
    isGoibiboProvider && (kind === "hotel" || (Boolean(url) && !url.includes("/flight/search?")));
  const label = kind === "hotel" ? "Hotel research" : "Flight research";

  function update(key: string, value: string) {
    setValues((current) => {
      const nextValues = { ...current, [key]: value };
      setQuery(
        kind === "hotel"
          ? generateHotelSearchQuery(nextValues)
          : generateFlightSearchQuery(nextValues),
      );
      return nextValues;
    });
  }

  function regenerateQuery() {
    setQuery(
      kind === "hotel" ? generateHotelSearchQuery(values) : generateFlightSearchQuery(values),
    );
  }

  function openSearch() {
    const target = buildTravelSearchUrl(kind, values, travelSearchConfig);
    if (!target) return;
    setUrl(target);
    setIframeBlocked(false);
    if (import.meta.env.DEV) console.debug("Generated travel search URL:", target);
    window.open(target, "_blank", "noopener,noreferrer");
  }

  async function copySearchDetails() {
    await navigator.clipboard.writeText(query);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (kind === "flight") {
    return (
      <div className="space-y-3 border border-slate-200 bg-white p-3">
        <h2 className="text-sm font-semibold text-slate-900">Flight details</h2>
        <ResearchDetailsForm
          kind="flight"
          travelStart={travelStart}
          travelEnd={travelEnd}
          onAdd={onAdd}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{label}</h2>
        <span className="text-[11px] text-slate-500">External research only</span>
      </div>
      <ResearchDetailsForm
        kind={kind}
        travelStart={travelStart}
        travelEnd={travelEnd}
        onAdd={onAdd}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {kind === "hotel" ? (
          <>
            <ResearchField
              label="Destination"
              value={values.destination ?? ""}
              onChange={(value) => update("destination", value)}
            />
            <ResearchField
              label="Check-in"
              type="date"
              min={travelStart || undefined}
              max={values.checkOut || travelEnd || undefined}
              value={values.checkIn ?? ""}
              onChange={(value) => update("checkIn", value)}
            />
            <ResearchField
              label="Check-out"
              type="date"
              min={values.checkIn || travelStart || undefined}
              max={travelEnd || undefined}
              value={values.checkOut ?? ""}
              onChange={(value) => update("checkOut", value)}
            />
            <ResearchField
              label="Adults"
              type="number"
              value={String(values.adults ?? "2")}
              onChange={(value) => update("adults", value)}
            />
            <ResearchField
              label="Children"
              type="number"
              value={String(values.children ?? "0")}
              onChange={(value) => update("children", value)}
            />
            <ResearchField
              label="Rooms"
              type="number"
              value={String(values.rooms ?? "1")}
              onChange={(value) => update("rooms", value)}
            />
          </>
        ) : (
          <>
            <ResearchField
              label="From"
              value={values.from ?? ""}
              onChange={(value) => update("from", value)}
            />
            <ResearchField
              label="To"
              value={values.to ?? ""}
              onChange={(value) => update("to", value)}
            />
            <ResearchField
              label="Departure date"
              type="date"
              value={values.departure ?? ""}
              onChange={(value) => update("departure", value)}
            />
            <ResearchField
              label="Return date"
              type="date"
              value={values.returnDate ?? ""}
              onChange={(value) => update("returnDate", value)}
            />
            <ResearchField
              label="Adults"
              type="number"
              value={String(values.adults ?? "2")}
              onChange={(value) => update("adults", value)}
            />
            <ResearchField
              label="Children"
              type="number"
              value={String(values.children ?? "0")}
              onChange={(value) => update("children", value)}
            />
            <ResearchField
              label="Infants"
              type="number"
              value={String(values.infants ?? "0")}
              onChange={(value) => update("infants", value)}
            />
            <ResearchField
              label="Cabin"
              value={values.cabin ?? "Economy"}
              onChange={(value) => update("cabin", value)}
            />
            <ResearchField
              label="Trip type"
              value={values.tripType ?? "Round trip"}
              onChange={(value) => update("tripType", value)}
            />
          </>
        )}
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-700" htmlFor={`${kind}-research-query`}>
          Search
        </label>
        <Input
          id={`${kind}-research-query`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={regenerateQuery}>
          <Search className="mr-1.5 size-3.5" />
          Update query
        </Button>
        <Button size="sm" disabled={!provider} onClick={openSearch}>
          <ExternalLink className="mr-1.5 size-3.5" />
          {isGoibiboProvider ? "Open Goibibo" : "Search / Open"}
        </Button>
      </div>
      {!provider && (
        <p className="border border-dashed border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {getTravelSearchConfigMessage(kind)}
        </p>
      )}
      <div className="flex items-center gap-1 border-t pt-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/search"
          className="h-8 text-xs"
        />
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={!url}
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          aria-label="Open in new tab"
        >
          <ExternalLink className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!url}
          onClick={() => setUrl((current) => current)}
          aria-label="Refresh search"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-40 border border-dashed border-slate-300 bg-slate-50 p-3 text-left text-xs text-slate-600">
        {provider ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>Browser workspace</span>
              <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                embed or fallback
              </span>
            </div>
            <div className="rounded border border-slate-200 bg-white p-2">
              <p className="mb-2 font-medium text-slate-700">External website</p>
              {usesGoibiboFallback && (
                <div className="mb-2 space-y-2 border border-amber-200 bg-amber-50 p-2 text-amber-950">
                  <p className="font-semibold">Search to perform</p>
                  <p className="select-all text-sm">{query}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={copySearchDetails}
                    >
                      <Copy className="mr-1.5 size-3.5" />
                      {copied ? "Copied" : "Copy search details"}
                    </Button>
                    <span className="text-[11px]">
                      Goibibo opens its public form; enter these details there.
                    </span>
                  </div>
                </div>
              )}
              <div className="mb-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={!url}
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="mr-1.5 size-3.5" />
                  Back
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={!url}
                  onClick={() => window.history.forward()}
                >
                  <ArrowUp className="mr-1.5 size-3.5" />
                  Forward
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={!url}
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw className="mr-1.5 size-3.5" />
                  Refresh
                </Button>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={url || "https://"}
                  onChange={(event) => setUrl(event.target.value)}
                  className="h-8 text-[11px]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!url}
                  onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  Open in new tab
                </Button>
              </div>
              {url && !iframeBlocked ? (
                <div className="overflow-hidden rounded border border-slate-200 bg-slate-100">
                  <iframe
                    src={url}
                    title={`${kind} research workspace`}
                    sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
                    className="h-64 w-full border-0 bg-white"
                    onError={() => setIframeBlocked(true)}
                    onLoad={() => setIframeBlocked(false)}
                  />
                </div>
              ) : (
                <div className="flex min-h-32 items-center justify-center rounded border border-dashed border-amber-200 bg-amber-50 p-3 text-center text-amber-900">
                  <p>Open in new tab</p>
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                If the provider blocks embedding, this workspace shows a fallback instead of
                pretending the site loaded.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-32 items-center justify-center text-center text-slate-500">
            <p>
              Open in new tab fallback is available when a provider is configured. Add the provider
              URL in the environment to enable external research.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResearchField({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] text-slate-500">{label}</label>
      <Input
        type={type}
        min={min}
        max={max}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}

function HotelPhotoPreview({
  placeId,
  savedPhotoUrl,
  hotelName,
  className,
}: {
  placeId: string;
  savedPhotoUrl: string;
  hotelName: string;
  className: string;
}) {
  const lookup = useServerFn(lookupGoogleActivityPlacesFn);
  const [googlePhoto, setGooglePhoto] = useState<GoogleActivityPhoto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const fetchPhoto = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setGooglePhoto(null);
    setError("");
    if (!placeId || savedPhotoUrl) return;
    setLoading(true);
    try {
      const result = await lookup({ data: { action: "photo", placeId } });
      if (sequence !== requestSequence.current) return;
      if (result && !Array.isArray(result) && "photoUri" in result)
        setGooglePhoto(result as GoogleActivityPhoto);
    } catch (photoError) {
      if (sequence === requestSequence.current)
        setError(
          photoError instanceof Error
            ? photoError.message
            : "Could not fetch a current Google Maps hotel photo.",
        );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [lookup, placeId, savedPhotoUrl]);

  useEffect(() => {
    void fetchPhoto();
    return () => {
      requestSequence.current += 1;
    };
  }, [fetchPhoto]);

  if (savedPhotoUrl)
    return <img src={savedPhotoUrl} alt={hotelName || "Hotel"} className={className} />;
  if (googlePhoto) {
    return (
      <div className="space-y-1">
        <img
          src={googlePhoto.photoUri}
          alt={hotelName || "Google Maps hotel photo"}
          className={className}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] leading-4 text-slate-500">
          <span>
            {googlePhoto.authorAttributions.length > 0 ? (
              googlePhoto.authorAttributions.map((author, index) => (
                <span
                  key={`${author.displayName}-${index}`}
                  className="mr-1 inline-flex items-center gap-1"
                >
                  {author.photoUri && (
                    <img src={author.photoUri} alt="" className="size-4 rounded-full" />
                  )}
                  {author.uri ? (
                    <a
                      href={author.uri}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline"
                    >
                      Photo by {author.displayName}
                    </a>
                  ) : (
                    `Photo by ${author.displayName}`
                  )}
                </span>
              ))
            ) : (
              <span translate="no">Google Maps</span>
            )}
          </span>
          {googlePhoto.googleMapsUri && (
            <a
              href={googlePhoto.googleMapsUri}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              View on Google Maps
            </a>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={`${className} flex flex-col items-center justify-center gap-1 p-2 text-center`}>
      {loading ? (
        <>
          <LoaderCircle className="size-6 animate-spin" />
          <span className="text-[10px]">Loading hotel photo…</span>
        </>
      ) : (
        <>
          <ImagePlus className="size-7" />
          <span className="text-[10px]">{error || "No hotel photo available"}</span>
          {placeId && error && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => void fetchPhoto()}
            >
              Try again
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function HotelGoogleDetailsEditor({
  item,
  destination,
  onUpdate,
  detailsOpen,
  onDetailsOpenChange,
}: {
  item: TripDayItemState;
  destination: string;
  onUpdate: (updates: Partial<TripDayItemState>) => void;
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
}) {
  const lookup = useServerFn(lookupGoogleActivityPlacesFn);
  const metadata = item.metadata ?? {};
  const initialQuery =
    item.hotel_name?.trim() ||
    (typeof metadata["hotel_search_query"] === "string" ? metadata["hotel_search_query"] : "");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GoogleActivityPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingPlaceId, setLoadingPlaceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [internalMoreInfoOpen, setInternalMoreInfoOpen] = useState(false);
  const requestSequence = useRef(0);
  const autoSelectionAttemptedFor = useRef("");
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  const googlePlaceId =
    typeof metadata["google_hotel_place_id"] === "string" ? metadata["google_hotel_place_id"] : "";
  const googleWebsite =
    typeof metadata["google_hotel_website"] === "string" ? metadata["google_hotel_website"] : "";
  const googlePhone =
    typeof metadata["google_hotel_phone"] === "string" ? metadata["google_hotel_phone"] : "";
  const googleRating =
    typeof metadata["google_hotel_rating"] === "string" ||
    typeof metadata["google_hotel_rating"] === "number"
      ? String(metadata["google_hotel_rating"])
      : "";
  const googleReviews =
    typeof metadata["google_hotel_reviews"] === "string" ||
    typeof metadata["google_hotel_reviews"] === "number"
      ? String(metadata["google_hotel_reviews"])
      : "";
  const googleMapsUrl =
    typeof metadata["google_hotel_maps_url"] === "string" ? metadata["google_hotel_maps_url"] : "";
  const customPhotoUrl =
    typeof metadata["custom_hotel_photo_url"] === "string"
      ? metadata["custom_hotel_photo_url"]
      : "";
  const autoSelectHotel = metadata["auto_select_google_hotel"] === true;
  const moreInfoOpen = detailsOpen ?? internalMoreInfoOpen;
  const setMoreInfoOpen = onDetailsOpenChange ?? setInternalMoreInfoOpen;

  function updateGoogleMetadata(key: string, value: string) {
    onUpdate({ metadata: { ...metadata, [key]: value } });
  }

  useEffect(() => {
    if (googlePlaceId) {
      setResults([]);
      setSearching(false);
      return;
    }
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 3) {
      setResults([]);
      setSearching(false);
      setError("");
      return;
    }
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError("");
      void lookupRef
        .current({
          data: { action: "search", query: trimmedQuery, destination, placeType: "hotel" },
        })
        .then((places) => {
          if (sequence !== requestSequence.current) return;
          const matches = Array.isArray(places) ? (places as GoogleActivityPlace[]) : [];
          setResults(matches);
          if (matches.length === 0)
            setError("No matching hotels found. Try a different hotel name or address.");
          const hotelMatch = firstGoogleHotelMatch(matches);
          if (autoSelectHotel && hotelMatch && autoSelectionAttemptedFor.current !== trimmedQuery) {
            autoSelectionAttemptedFor.current = trimmedQuery;
            void selectHotel(hotelMatch);
          } else if (autoSelectHotel && matches.length > 0 && !hotelMatch) {
            setError(
              "Google returned places but did not identify a hotel. Select a hotel result manually or refine the hotel requirement.",
            );
          }
        })
        .catch((searchError: unknown) => {
          if (sequence !== requestSequence.current) return;
          setResults([]);
          setError(
            searchError instanceof Error ? searchError.message : "Google hotel search failed.",
          );
        })
        .finally(() => {
          if (sequence === requestSequence.current) setSearching(false);
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [query, destination, autoSelectHotel, googlePlaceId]);

  async function selectHotel(place: GoogleActivityPlace) {
    setLoadingPlaceId(place.id);
    setError("");
    try {
      const result = await lookup({ data: { action: "details", placeId: place.id } });
      if (!result || Array.isArray(result) || typeof result === "string")
        throw new Error("Google returned invalid hotel details.");
      const hotel = result as GoogleActivityPlace;
      const selectedPlaceId = hotel.id || place.id;
      const selectedCustomPhoto = selectedPlaceId === googlePlaceId ? customPhotoUrl : "";
      onUpdate({
        title: hotel.name || place.name,
        hotel_name: hotel.name || place.name,
        hotel_address: hotel.address || place.address,
        hotel_city: destination,
        hotel_description: hotel.description,
        customer_facing_info: hotel.description,
        description: hotel.description,
        metadata: {
          ...metadata,
          hotel_search_query: "",
          auto_select_google_hotel: false,
          google_hotel_place_id: hotel.id,
          google_hotel_website: hotel.website ?? place.website ?? "",
          google_hotel_phone: hotel.phone ?? place.phone ?? "",
          google_hotel_rating: hotel.rating ?? place.rating ?? "",
          google_hotel_reviews: hotel.reviews ?? place.reviews ?? "",
          google_hotel_maps_url: hotel.mapsUrl ?? place.mapsUrl ?? "",
          google_hotel_description: hotel.description,
          google_hotel_types: hotel.types.join(", "),
          custom_hotel_photo_url: selectedCustomPhoto,
        },
      });
      setQuery(hotel.name || place.name);
      setResults([]);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Could not load the selected hotel's Google details.",
      );
    } finally {
      setLoadingPlaceId(null);
    }
  }

  return (
    <div
      className={
        googlePlaceId ? "contents" : "space-y-2 rounded-md border border-slate-200 bg-white p-3"
      }
    >
      {!googlePlaceId && (
        <>
          <Label>Search hotel on Google</Label>
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                destination ? `Search hotel name in ${destination}` : "Search hotel name or address"
              }
            />
            {searching && <span className="text-xs text-slate-500">Searching…</span>}
          </div>
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200">
              {results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 border-b p-3 text-left last:border-b-0 hover:bg-slate-50 disabled:opacity-60"
                  disabled={loadingPlaceId !== null}
                  onClick={() => void selectHotel(place)}
                >
                  <span>
                    <span className="block font-medium text-slate-900">{place.name}</span>
                    <span className="text-xs text-slate-500">{place.address}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-600">
                    {loadingPlaceId === place.id
                      ? "Loading…"
                      : `${place.rating ?? "—"} ★${place.reviews ? ` · ${place.reviews} reviews` : ""}`}
                  </span>
                </button>
              ))}
            </div>
          )}
          {results.length > 0 && (
            <p className="text-right text-[11px] text-slate-500">Powered by Google</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
        </>
      )}

      <Dialog open={moreInfoOpen} onOpenChange={setMoreInfoOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-blue-700">
              {item.hotel_name || "Hotel details"}
            </DialogTitle>
            <DialogDescription>
              Edit the hotel information fetched from Google Places.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                value={googleWebsite}
                onChange={(event) =>
                  updateGoogleMetadata("google_hotel_website", event.target.value)
                }
                placeholder="https://"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <Input
                value={googlePhone}
                onChange={(event) => updateGoogleMetadata("google_hotel_phone", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hotel Stars</Label>
              <Input
                value={
                  typeof metadata["google_hotel_stars"] === "string"
                    ? metadata["google_hotel_stars"]
                    : ""
                }
                onChange={(event) => updateGoogleMetadata("google_hotel_stars", event.target.value)}
                placeholder="Enter hotel star category"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rating</Label>
              <Input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={googleRating}
                onChange={(event) =>
                  updateGoogleMetadata("google_hotel_rating", event.target.value)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reviews</Label>
              <Input
                type="number"
                min="0"
                value={googleReviews}
                onChange={(event) =>
                  updateGoogleMetadata("google_hotel_reviews", event.target.value)
                }
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Full Address</Label>
              <Textarea
                value={item.hotel_address ?? ""}
                onChange={(event) => onUpdate({ hotel_address: event.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label>Description</Label>
              <Textarea
                value={
                  typeof metadata["google_hotel_description"] === "string"
                    ? metadata["google_hotel_description"]
                    : (item.hotel_description ?? "")
                }
                onChange={(event) => {
                  updateGoogleMetadata("google_hotel_description", event.target.value);
                  onUpdate({
                    hotel_description: event.target.value,
                    customer_facing_info: event.target.value,
                    description: event.target.value,
                  });
                }}
                rows={3}
              />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label>Photos</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {customPhotoUrl && (
                  <img
                    src={customPhotoUrl}
                    alt={`${item.hotel_name ?? "Hotel"} custom`}
                    className="h-48 w-full rounded-md object-cover"
                  />
                )}
                {!customPhotoUrl && (
                  <HotelPhotoPreview
                    placeId={googlePlaceId}
                    savedPhotoUrl=""
                    hotelName={item.hotel_name ?? "Hotel"}
                    className="h-48 w-full rounded-md object-cover bg-slate-100"
                  />
                )}
                <p className="text-xs text-slate-500">
                  Your uploaded hotel photo is saved with this itinerary. Google Maps photos are
                  fetched fresh and displayed with attribution, not copied into the database.
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setMoreInfoOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SavedHotelSummary({
  item,
  dayDate,
  overallBooking = false,
  onEdit,
  onDelete,
}: {
  item: TripDayItemState;
  dayDate: string;
  overallBooking?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const metadata = item.metadata ?? {};
  const customImage =
    typeof metadata.custom_hotel_photo_url === "string" ? metadata.custom_hotel_photo_url : "";
  const googlePlaceId =
    typeof metadata.google_hotel_place_id === "string" ? metadata.google_hotel_place_id : "";
  const defaultDates = hotelDatesForDay(dayDate);
  const dates = {
    checkIn: item.check_in || defaultDates.checkIn,
    checkOut: item.check_out || defaultDates.checkOut,
  };
  const rooms = getAccommodationRoomDetails(item);
  const roomSummary = rooms
    .map(
      (room) =>
        `${room.room_type} (${room.adults} adults${room.kids ? `, ${room.kids} kids` : ""})`,
    )
    .join(" · ");
  const stayNights = Math.max(1, nightsBetween(dates.checkIn, dates.checkOut));
  const checkInTime =
    typeof metadata.check_in_time === "string" && metadata.check_in_time
      ? metadata.check_in_time
      : "15:00";
  const checkOutTime =
    typeof metadata.check_out_time === "string" && metadata.check_out_time
      ? metadata.check_out_time
      : "11:00";
  const googleText = (key: string) =>
    typeof metadata[key] === "string" ? String(metadata[key]) : "";
  const formatRoomCost = (amount: number, currency: string = "INR") =>
    (Number(amount) || 0).toLocaleString("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });

  return (
    <>
      <div
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm"
        data-builder-type="ACCOMMODATION"
      >
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-5">
          <div className="h-28 w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-28 sm:w-36">
            {customImage ? (
              <img
                src={customImage}
                alt={item.hotel_name || "Hotel"}
                className="h-full w-full object-cover"
              />
            ) : googlePlaceId ? (
              <HotelPhotoPreview
                placeId={googlePlaceId}
                savedPhotoUrl=""
                hotelName={item.hotel_name || "Hotel"}
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-slate-200 text-slate-500">
                <ImagePlus className="size-8" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {item.hotel_name || "Hotel not selected"}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-sm font-medium text-blue-700 hover:text-blue-800"
                onClick={() => setMoreInfoOpen(true)}
              >
                More Info
              </Button>
              {item.hotel_city && <span className="text-sm text-slate-600">{item.hotel_city}</span>}
            </div>
            {item.hotel_address && (
              <p className="mt-1 line-clamp-2 text-sm text-slate-700">{item.hotel_address}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Check in:{" "}
                <strong className="font-medium text-slate-900">
                  {dates.checkIn ? formatTripDayDate(dates.checkIn) : "Date pending"}
                </strong>
              </span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Check out:{" "}
                <strong className="font-medium text-slate-900">
                  {dates.checkOut ? formatTripDayDate(dates.checkOut) : "Date pending"}
                </strong>
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">
              Check-in {formatTimeAmPm(checkInTime)}
              <span className="mx-2 text-slate-400">·</span>
              Check-out {formatTimeAmPm(checkOutTime)}
              {roomSummary && (
                <>
                  <span className="mx-2 text-slate-400">·</span>
                  {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          <span className="text-sm text-slate-600">
            {overallBooking ? "Overall hotel booking" : "Day-wise hotel booking"}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 size-4" />
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:text-rose-700"
              aria-label="Delete hotel"
              onClick={onDelete}
            >
              <Trash2 className="mr-1.5 size-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={moreInfoOpen} onOpenChange={setMoreInfoOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{item.hotel_name || "Hotel details"}</DialogTitle>
            <DialogDescription>
              {item.hotel_city || "Hotel stay"} ·{" "}
              {dates.checkIn ? formatTripDayDate(dates.checkIn) : "Check-in pending"} to{" "}
              {dates.checkOut ? formatTripDayDate(dates.checkOut) : "Check-out pending"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 text-sm">
            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="font-medium text-slate-900">Address</p>
                <p className="mt-1 text-slate-600">{item.hotel_address || "Not provided"}</p>
              </div>
              <div>
                <p className="font-medium text-slate-900">Hotel category</p>
                <p className="mt-1 text-slate-600">
                  {item.star_category || googleText("google_hotel_stars") || "Not provided"}
                </p>
              </div>
              <div>
                <p className="font-medium text-slate-900">Check-in / check-out times</p>
                <p className="mt-1 text-slate-600">
                  {formatTimeAmPm(checkInTime)} / {formatTimeAmPm(checkOutTime)}
                </p>
              </div>
              <div>
                <p className="font-medium text-slate-900">Hotel rating</p>
                <p className="mt-1 text-slate-600">
                  {googleText("google_hotel_rating")
                    ? `${googleText("google_hotel_rating")} / 5${googleText("google_hotel_reviews") ? ` · ${googleText("google_hotel_reviews")} reviews` : ""}`
                    : "Not provided"}
                </p>
              </div>
              {googleText("google_hotel_phone") && (
                <div>
                  <p className="font-medium text-slate-900">Contact</p>
                  <p className="mt-1 text-slate-600">{googleText("google_hotel_phone")}</p>
                </div>
              )}
              {googleText("google_hotel_website") && (
                <div>
                  <p className="font-medium text-slate-900">Website</p>
                  <a
                    href={googleText("google_hotel_website")}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-blue-700 underline"
                  >
                    {googleText("google_hotel_website")}
                  </a>
                </div>
              )}
            </section>
            {(item.customer_facing_info ||
              item.hotel_description ||
              googleText("google_hotel_description")) && (
              <section>
                <p className="font-medium text-slate-900">About this hotel</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">
                  {item.customer_facing_info ||
                    item.hotel_description ||
                    googleText("google_hotel_description")}
                </p>
              </section>
            )}
            <section>
              <h4 className="font-medium text-slate-900">Room details</h4>
              {rooms.length === 0 ? (
                <p className="mt-1 text-slate-600">No room details added.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {rooms.map((room, index) => {
                    const nightlyCost = Number(room.room_rate_per_night) || 0;
                    return (
                      <div
                        key={room.id || index}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <p className="font-medium text-slate-900">
                          Room {index + 1}: {room.room_type || "Standard"}
                        </p>
                        <p className="mt-1 text-slate-600">
                          {room.adults} adults · {room.kids} kids
                          {room.breakfast ? " · Breakfast" : ""}
                          {room.lunch ? " · Lunch" : ""}
                          {room.dinner ? " · Dinner" : ""}
                        </p>
                        <p className="mt-1 text-slate-600">
                          {formatRoomCost(nightlyCost, room.currency || "INR")} per night
                          {nightsBetween(dates.checkIn, dates.checkOut) > 0
                            ? ` · ${stayNights}-night total: ${formatRoomCost(nightlyCost * stayNights, room.currency || "INR")}`
                            : ""}
                          {room.room_rate_per_night_inr != null
                            ? ` · INR equivalent: ${formatRoomCost(Number(room.room_rate_per_night_inr), "INR")}`
                            : ""}
                        </p>
                        {room.free_cancellation_date && (
                          <p className="mt-1 text-slate-600">
                            Free cancellation until {formatTripDayDate(room.free_cancellation_date)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            {googleText("google_hotel_maps_url") && (
              <a
                href={googleText("google_hotel_maps_url")}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-blue-700 underline"
              >
                View on Google Maps
              </a>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setMoreInfoOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditableRichTextSection({
  title,
  value,
  placeholder,
  onUpdate,
}: {
  title: string;
  value: string;
  placeholder: string;
  onUpdate: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </h3>
      </div>
      <div className="p-3">
        <EditableRichTextField
          value={value}
          label={title.toLowerCase()}
          placeholder={placeholder}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

function EditableRichTextField({
  value,
  label,
  placeholder,
  onUpdate,
}: {
  value: string;
  label: string;
  placeholder: string;
  onUpdate: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (
      editor &&
      !editor.matches(":focus") &&
      editor.innerHTML !== sanitizeItineraryTermHtml(value)
    ) {
      editor.innerHTML = sanitizeItineraryTermHtml(value);
    }
  }, [value]);

  function saveSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const selection = window.getSelection();
    const range = selectionRef.current;
    if (!selection || !range || !editorRef.current?.contains(range.commonAncestorContainer)) return;
    editorRef.current.focus();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function publishContent() {
    const editor = editorRef.current;
    if (!editor) return;
    const safeHtml = sanitizeItineraryTermHtml(editor.innerHTML);
    onUpdate(safeHtml);
    if (document.activeElement !== editor) editor.innerHTML = safeHtml;
  }

  function format(command: string, commandValue?: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, commandValue);
    publishContent();
    saveSelection();
  }

  function changeFontSize(size: string) {
    restoreSelection();
    document.execCommand("fontSize", false, "7");
    editorRef.current?.querySelectorAll('font[size="7"]').forEach((font) => {
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
    publishContent();
    saveSelection();
  }

  const toolbarButton = (name: string, icon: React.ReactNode, command: string, value?: string) => (
    <Button
      type="button"
      key={name}
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label={`${name} ${label}`}
      title={name}
      onMouseDown={(event) => {
        event.preventDefault();
        saveSelection();
      }}
      onClick={() => format(command, value)}
    >
      {icon}
    </Button>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <div
          className="flex flex-wrap items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5"
          aria-label={`Text styling for ${label}`}
        >
          {toolbarButton("Bulleted list", <List className="size-3.5" />, "insertUnorderedList")}
          {toolbarButton(
            "Numbered list",
            <ListOrdered className="size-3.5" />,
            "insertOrderedList",
          )}
          {toolbarButton("Bold", <Bold className="size-3.5" />, "bold")}
          {toolbarButton("Italic", <Italic className="size-3.5" />, "italic")}
          {toolbarButton("Underline", <Underline className="size-3.5" />, "underline")}
          {toolbarButton("Strikethrough", <Strikethrough className="size-3.5" />, "strikeThrough")}
          {toolbarButton(
            "Highlight",
            <Highlighter className="size-3.5" />,
            "hiliteColor",
            "#fff2a8",
          )}
          <select
            aria-label={`Font family for ${label}`}
            defaultValue="Arial"
            className="h-7 max-w-24 rounded border-0 bg-white px-1 text-[11px] text-slate-600 outline-none"
            onMouseDown={saveSelection}
            onChange={(event) => format("fontName", event.target.value)}
          >
            <option value="Arial">Font</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Trebuchet MS">Trebuchet</option>
          </select>
          <select
            aria-label={`Font size for ${label}`}
            defaultValue=""
            className="h-7 w-14 rounded border-0 bg-white px-1 text-[11px] text-slate-600 outline-none"
            onMouseDown={saveSelection}
            onChange={(event) => {
              if (event.target.value) changeFontSize(event.target.value);
              event.target.value = "";
            }}
          >
            <option value="">Size</option>
            <option value="10">10</option>
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="16">16</option>
            <option value="18">18</option>
            <option value="24">24</option>
          </select>
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={publishContent}
        onBlur={publishContent}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        className="min-h-32 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 [&:empty]:before:pointer-events-none [&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)] [&_a]:text-blue-600 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
}

function ResearchDetailsForm({
  kind,
  travelStart,
  travelEnd,
  onAdd,
}: {
  kind: ResearchKind;
  travelStart: string;
  travelEnd: string;
  onAdd: (values: Record<string, string | number | null>) => void;
}) {
  const [details, setDetails] = useState<Record<string, string>>(() =>
    kind === "flight"
      ? {
          departure_timezone: DEFAULT_DOMESTIC_TIME_ZONE,
          arrival_timezone: DEFAULT_DOMESTIC_TIME_ZONE,
          flight_currency: "INR",
          flight_option: "Option 1",
        }
      : { check_in: travelStart, check_out: travelEnd },
  );
  const update = (key: string, value: string) =>
    setDetails((current) => ({ ...current, [key]: value }));
  const field = (key: string, label: string, type = "text", min?: string, max?: string) => {
    const dateMin =
      key === "check_in"
        ? travelStart
        : key === "check_out"
          ? details.check_in || travelStart
          : min;
    const dateMax =
      key === "check_in" ? details.check_out || travelEnd : key === "check_out" ? travelEnd : max;
    const required =
      kind === "flight" &&
      [
        "flight_departure_date",
        "flight_departure_time",
        "flight_arrival_date",
        "flight_arrival_time",
      ].includes(key);
    return (
      <ResearchField
        label={label}
        type={type}
        min={dateMin || undefined}
        max={dateMax || undefined}
        required={required}
        value={details[key] ?? ""}
        onChange={(value) => update(key, value)}
      />
    );
  };
  const flightScheduleMissing =
    kind === "flight" &&
    [
      "flight_departure_date",
      "flight_departure_time",
      "flight_arrival_date",
      "flight_arrival_time",
    ].some((key) => !details[key]);
  const flightTimingError =
    kind === "flight"
      ? validateFlightTimeOrder({
          ...defaultItemForType("FLIGHT", 1),
          flight_departure_date: details.flight_departure_date ?? "",
          flight_departure_time: details.flight_departure_time ?? "",
          flight_arrival_date: details.flight_arrival_date ?? "",
          flight_arrival_time: details.flight_arrival_time ?? "",
          metadata: {
            departure_timezone: details.departure_timezone ?? DEFAULT_DOMESTIC_TIME_ZONE,
            arrival_timezone: details.arrival_timezone ?? DEFAULT_DOMESTIC_TIME_ZONE,
          },
        })
      : null;
  const timeZoneField = (key: string, label: string) => (
    <div>
      <label className="text-[11px] text-slate-500">{label}</label>
      <Select value={details[key] ?? ""} onValueChange={(value) => update(key, value)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select GMT" />
        </SelectTrigger>
        <SelectContent>
          {FLIGHT_TIME_ZONE_OPTIONS.map(([country, offset]) => (
            <SelectItem key={`${country}-${offset}`} value={`${country} (${offset})`}>
              {country} ({offset})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const currencyField = (
    <div>
      <label className="text-[11px] text-slate-500">Currency</label>
      <Select
        value={details.flight_currency || "INR"}
        onValueChange={(value) => update("flight_currency", value)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FLIGHT_CURRENCY_OPTIONS.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const optionField =
    kind === "flight" ? (
      <div>
        <label className="text-[11px] text-slate-500">Option</label>
        <Select
          value={details.flight_option || "Option 1"}
          onValueChange={(value) => update("flight_option", value)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITINERARY_OPTION_VALUES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-semibold text-slate-800">Add selected {kind} manually</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {kind === "hotel" ? (
          <>
            {field("hotel_name", "Hotel name")}
            {field("hotel_address", "Address")}
            {field("hotel_city", "City")}
            {field("hotel_country", "Country")}
            {field("star_category", "Star category")}
            {field("room_type", "Room type")}
            {field("rooms", "Rooms", "number")}
            {field("meal_plan", "Meal plan")}
            {field("check_in", "Check-in", "date")}
            {field("check_out", "Check-out", "date")}
            {field("price", "Price", "number")}
            {field("currency", "Currency")}
            {field("cancellation_information", "Cancellation information")}
            {field("notes", "Notes")}
          </>
        ) : (
          <>
            {field("flight_airline", "Airline")}
            {field("flight_number", "Flight number")}
            {field("departure_city", "From")}
            {field("arrival_city", "To")}
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]">
              <div>{field("flight_departure_date", "Departure date", "date")}</div>
              <div>{field("flight_departure_time", "Departure time", "time")}</div>
              {timeZoneField("departure_timezone", "Time zone")}
            </div>
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]">
              <div>{field("flight_arrival_date", "Arrival date", "date")}</div>
              <div>{field("flight_arrival_time", "Arrival time", "time")}</div>
              {timeZoneField("arrival_timezone", "Time zone")}
            </div>
            {field("flight_cabin", "Cabin")}
            {field("baggage_information", "Baggage")}
            {field("flight_price", "Price", "number")}
            {currencyField}
            {optionField}
            {field("notes", "Notes")}
          </>
        )}
      </div>
      {kind === "flight" && details.flight_price && (
        <InrEquivalent amount={details.flight_price} currency={details.flight_currency || "INR"} />
      )}
      {flightTimingError && (
        <p className="text-sm font-medium text-rose-600">{flightTimingError}</p>
      )}
      <Button
        size="sm"
        disabled={Boolean(flightTimingError) || flightScheduleMissing}
        onClick={() => {
          if (!flightTimingError && !flightScheduleMissing) onAdd(details);
        }}
      >
        <Plus className="mr-1.5 size-3.5" />
        Add to Itinerary
      </Button>
    </div>
  );
}

function ActivitiesTransfersWorkspace({
  days,
  photos,
  photoDisplayUrls,
  suppliers,
  destination,
  travelStartDate,
  travelEndDate,
  adults,
  children,
  saving,
  saveMessage,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
  onMoveDay,
  onSave,
}: {
  days: TripDay[];
  photos: TripPhotoState[];
  photoDisplayUrls: Record<string, string>;
  suppliers: Array<{ id: string; name: string }>;
  destination: string;
  travelStartDate: string;
  travelEndDate: string;
  adults: number;
  children: number;
  saving: boolean;
  saveMessage: string | null;
  onAdd: (dayIndex: number, itemType: "ACTIVITY" | "TRANSPORT") => void;
  onUpdate: (dayIndex: number, itemIndex: number, updates: Partial<TripDayItemState>) => void;
  onDelete: (dayIndex: number, itemIndex: number) => void;
  onMove: (dayIndex: number, itemIndex: number, direction: "up" | "down") => void;
  onMoveDay: (dayIndex: number, itemIndex: number, targetDayIndex: number) => void;
  onSave: (
    activityTitle?: string,
    itemId?: string,
    itemKind?: "activity" | "transfer",
  ) => Promise<boolean>;
}) {
  const serviceItems = days.flatMap((day, dayIndex) =>
    day.items
      .map((item, itemIndex) => ({ day, dayIndex, item, itemIndex }))
      .filter(
        ({ item }) =>
          item.item_type === "ACTIVITY" ||
          item.item_type === "SIGHTSEEING" ||
          item.item_type === "TRANSPORT",
      ),
  );
  const { rates } = useCurrencyRates();
  function metadata(item: TripDayItemState) {
    return item.metadata ?? {};
  }
  function updateMetadata(
    dayIndex: number,
    itemIndex: number,
    item: TripDayItemState,
    key: string,
    value: string,
  ) {
    onUpdate(dayIndex, itemIndex, { metadata: { ...metadata(item), [key]: value } });
  }
  function updateTransferCost(
    dayIndex: number,
    itemIndex: number,
    item: TripDayItemState,
    key: "transfer_cost_adult" | "transfer_cost_child" | "transfer_cost_total",
    value: string,
  ) {
    const next = { ...metadata(item), [key]: value };
    const currency =
      typeof next["transfer_cost_currency"] === "string" ? next["transfer_cost_currency"] : "INR";
    const code = (POPULAR_CURRENCIES as readonly string[]).includes(currency)
      ? (currency as CurrencyCode)
      : null;
    for (const suffix of ["adult", "child", "total"] as const) {
      const amount = Number(next[`transfer_cost_${suffix}`]) || 0;
      next[`transfer_cost_${suffix}_inr`] =
        amount && code
          ? rates
            ? convertToInr(amount, code, rates.rates)
            : code === "INR"
              ? amount
              : null
          : 0;
    }
    const amount = Number(value) || 0;
    const converted = Number(next[`${key}_inr`]);
    next["transfer_cost_exchange_rate"] =
      amount > 0 && Number.isFinite(converted) ? converted / amount : 1;
    next["transfer_cost_exchange_rate_updated_at"] = rates?.updatedAt ?? null;
    onUpdate(dayIndex, itemIndex, { metadata: next });
  }
  function updateTransferCostCurrency(
    dayIndex: number,
    itemIndex: number,
    item: TripDayItemState,
    currency: string,
  ) {
    const next = { ...metadata(item), transfer_cost_currency: currency };
    const code = currency as CurrencyCode;
    for (const suffix of ["adult", "child", "total"] as const) {
      const amount = Number(next[`transfer_cost_${suffix}`]) || 0;
      next[`transfer_cost_${suffix}_inr`] = amount
        ? rates
          ? convertToInr(amount, code, rates.rates)
          : code === "INR"
            ? amount
            : null
        : 0;
    }
    next["transfer_cost_exchange_rate_updated_at"] = rates?.updatedAt ?? null;
    onUpdate(dayIndex, itemIndex, { metadata: next });
  }
  function activityKey(item: TripDayItemState, dayIndex: number, itemIndex: number) {
    return item.id ?? `activity-${dayIndex}-${itemIndex}`;
  }
  async function saveActivity(item: TripDayItemState) {
    if (!item.departure_time || !item.arrival_time) {
      toast.error("Enter both activity start and end times before saving.");
      return false;
    }
    await onSave(item.title, item.id, "activity");
    return true;
  }
  async function saveTransfer(item: TripDayItemState) {
    if (!item.departure_time || !item.arrival_time) {
      toast.error("Enter both transfer pickup and arrival times before saving.");
      return false;
    }
    await onSave(undefined, item.id, "transfer");
    return true;
  }
  function activityValue(item: TripDayItemState, key: string) {
    const value = item.metadata?.[key];
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }
  function savedActivity(record: {
    day: TripDay;
    dayIndex: number;
    item: TripDayItemState;
    itemIndex: number;
  }) {
    const { day, dayIndex, item, itemIndex } = record;
    const itemKey = activityKey(item, dayIndex, itemIndex);
    const itemMetadata = metadata(item);
    const attachedLibraryPhoto = photos.find(
      (photo) => photo.day_item_id === item.id && photo.storage_path,
    );
    const photoUrl = attachedLibraryPhoto?.storage_path
      ? photoDisplayUrls[attachedLibraryPhoto.storage_path]
      : "";
    const adultCost = activityValue(item, "activity_cost_adult");
    const childCost = activityValue(item, "activity_cost_child");
    const totalCost =
      activityValue(item, "activity_cost_total") ||
      String((Number(adultCost) || 0) * adults + (Number(childCost) || 0) * children);
    return (
      <div
        key={itemKey}
        className="relative space-y-3 bg-slate-200 p-5"
        data-builder-type="ACTIVITY"
      >
        <div className="pr-24 text-base leading-6 text-slate-950">
          <p>
            <strong>Activity:</strong> {item.title}
          </p>
          <p className="mt-2">
            <strong>Description:</strong>
          </p>
          <p className="line-clamp-3">
            {item.customer_facing_info || item.description || "No description added."}
          </p>
          {(item.customer_facing_info || item.description) && (
            <button
              type="button"
              className="text-sm text-blue-700"
              onClick={() =>
                onUpdate(dayIndex, itemIndex, {
                  metadata: { ...itemMetadata, activity_saved: false },
                })
              }
            >
              Show more
            </button>
          )}
          <p className="mt-3">
            <strong>Start:</strong> {item.departure_time || "Not set"}{" "}
            <span className="mx-1">|</span> <strong>Duration:</strong> {item.duration || "Not set"}
          </p>
          <p className="mt-2">
            <strong>Adult:</strong> {adultCost || "0"} <span className="mx-1">|</span>{" "}
            <strong>Child:</strong> {childCost || "0"} <span className="mx-1">|</span>{" "}
            <strong>Total:</strong> {totalCost}
          </p>
          <p className="mt-2">
            <strong>Note:</strong> {item.notes || "No notes added."}
          </p>
        </div>
        {photoUrl && (
          <img
            src={photoUrl}
            alt={item.title}
            className="absolute right-16 top-5 h-28 w-48 rounded-lg object-cover"
          />
        )}
        <div className="absolute right-4 top-5 flex flex-col gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-rose-600 hover:text-rose-700"
            aria-label="Delete activity"
            onClick={() => onDelete(dayIndex, itemIndex)}
          >
            <Trash2 className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-blue-600 hover:text-blue-700"
            aria-label="Edit activity"
            onClick={() =>
              onUpdate(dayIndex, itemIndex, {
                metadata: { ...itemMetadata, activity_saved: false },
              })
            }
          >
            <Pencil className="size-5" />
          </Button>
        </div>
      </div>
    );
  }
  function savedTransfer(record: {
    day: TripDay;
    dayIndex: number;
    item: TripDayItemState;
    itemIndex: number;
  }) {
    const { dayIndex, item, itemIndex } = record;
    const itemKey = activityKey(item, dayIndex, itemIndex);
    const itemMetadata = metadata(item);
    const customFrom =
      typeof itemMetadata.transfer_custom_from === "string"
        ? itemMetadata.transfer_custom_from
        : "";
    const customTo =
      typeof itemMetadata.transfer_custom_to === "string" ? itemMetadata.transfer_custom_to : "";
    const customType =
      typeof itemMetadata.transfer_custom_type === "string"
        ? itemMetadata.transfer_custom_type
        : "";
    const adultCost =
      typeof itemMetadata.transfer_cost_adult === "number" ||
      typeof itemMetadata.transfer_cost_adult === "string"
        ? String(itemMetadata.transfer_cost_adult)
        : "";
    const childCost =
      typeof itemMetadata.transfer_cost_child === "number" ||
      typeof itemMetadata.transfer_cost_child === "string"
        ? String(itemMetadata.transfer_cost_child)
        : "";
    const totalCost =
      typeof itemMetadata.transfer_cost_total === "number" ||
      typeof itemMetadata.transfer_cost_total === "string"
        ? String(itemMetadata.transfer_cost_total)
        : String((Number(adultCost) || 0) * adults + (Number(childCost) || 0) * children);
    return (
      <div
        key={itemKey}
        className="relative space-y-1 bg-blue-50 p-5 text-base text-slate-950"
        data-builder-type="TRANSPORT"
      >
        <p>
          <strong>Transfer:</strong>{" "}
          {String(
            item.pickup === "Custom" ? customFrom || "Custom" : item.pickup || "Select",
          ).toLowerCase()}{" "}
          →{" "}
          {String(
            item.dropoff === "Custom" ? customTo || "Custom" : item.dropoff || "Select",
          ).toLowerCase()}
        </p>
        <p>
          <strong>Type:</strong>{" "}
          {String(
            item.extra_transport_type === "Custom"
              ? customType || "Custom"
              : item.extra_transport_type || "Select",
          ).toLowerCase()}
        </p>
        {(item.departure_time || item.arrival_time || item.duration) && (
          <p>
            <strong>Schedule:</strong>{" "}
            {item.departure_time ? formatTimeAmPm(item.departure_time) : "Time not set"}
            {item.arrival_time ? ` → ${formatTimeAmPm(item.arrival_time)}` : ""}
            {item.duration ? ` · ${item.duration}` : ""}
          </p>
        )}
        <p>
          <strong>Adult:</strong> {adultCost || "0"} <span className="mx-1">|</span>{" "}
          <strong>Child:</strong> {childCost} <span className="mx-1">|</span>{" "}
          <strong>Total:</strong> {totalCost}
        </p>
        <div className="absolute right-4 top-4 flex gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-rose-600 hover:text-rose-700"
            aria-label="Delete transfer"
            onClick={() => onDelete(dayIndex, itemIndex)}
          >
            <Trash2 className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-blue-600 hover:text-blue-700"
            aria-label="Edit transfer"
            onClick={() =>
              onUpdate(dayIndex, itemIndex, {
                metadata: { ...itemMetadata, transfer_saved: false },
              })
            }
          >
            <Pencil className="size-5" />
          </Button>
        </div>
      </div>
    );
  }
  function editor(
    record: { day: TripDay; dayIndex: number; item: TripDayItemState; itemIndex: number },
    transfer: boolean,
  ) {
    const { day, dayIndex, item, itemIndex } = record;
    const itemMetadata = metadata(item);
    const fulfilmentMode =
      typeof itemMetadata.fulfilment_mode === "string" ? itemMetadata.fulfilment_mode : "DIRECT";
    if (transfer) {
      const adultCost =
        typeof itemMetadata.transfer_cost_adult === "number" ||
        typeof itemMetadata.transfer_cost_adult === "string"
          ? String(itemMetadata.transfer_cost_adult)
          : "";
      const childCost =
        typeof itemMetadata.transfer_cost_child === "number" ||
        typeof itemMetadata.transfer_cost_child === "string"
          ? String(itemMetadata.transfer_cost_child)
          : "";
      const totalCost =
        typeof itemMetadata.transfer_cost_total === "number" ||
        typeof itemMetadata.transfer_cost_total === "string"
          ? String(itemMetadata.transfer_cost_total)
          : String((Number(adultCost) || 0) * adults + (Number(childCost) || 0) * children);
      const calculatedArrivalTime = addDurationToTime(item.departure_time, item.duration);
      const durationParts = durationToParts(item.duration);
      return (
        <div
          key={item.id ?? `${dayIndex}-${itemIndex}`}
          className="space-y-5 border border-slate-200 bg-slate-50 p-5"
          data-builder-type="TRANSPORT"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-medium text-slate-900">Transfer Details</h3>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove transfer"
              onClick={() => onDelete(dayIndex, itemIndex)}
              className="text-rose-600 hover:text-rose-700"
            >
              <Trash2 className="size-5" />
            </Button>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <div>
                <Label>From</Label>
                <Select
                  value={item.pickup ?? ""}
                  onValueChange={(value) => onUpdate(dayIndex, itemIndex, { pickup: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Airport">Airport</SelectItem>
                    <SelectItem value="Hotel">Hotel</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {item.pickup === "Custom" && (
                <Input
                  aria-label="Custom from"
                  value={
                    typeof itemMetadata.transfer_custom_from === "string"
                      ? itemMetadata.transfer_custom_from
                      : ""
                  }
                  onChange={(event) =>
                    updateMetadata(
                      dayIndex,
                      itemIndex,
                      item,
                      "transfer_custom_from",
                      event.target.value,
                    )
                  }
                  placeholder="Enter custom from"
                />
              )}
            </div>
            <div className="space-y-2">
              <div>
                <Label>To</Label>
                <Select
                  value={item.dropoff ?? ""}
                  onValueChange={(value) => onUpdate(dayIndex, itemIndex, { dropoff: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Airport">Airport</SelectItem>
                    <SelectItem value="Hotel">Hotel</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {item.dropoff === "Custom" && (
                <Input
                  aria-label="Custom to"
                  value={
                    typeof itemMetadata.transfer_custom_to === "string"
                      ? itemMetadata.transfer_custom_to
                      : ""
                  }
                  onChange={(event) =>
                    updateMetadata(
                      dayIndex,
                      itemIndex,
                      item,
                      "transfer_custom_to",
                      event.target.value,
                    )
                  }
                  placeholder="Enter custom to"
                />
              )}
            </div>
            <div className="space-y-2">
              <div>
                <Label>Transfer Type</Label>
                <Select
                  value={item.extra_transport_type ?? ""}
                  onValueChange={(value) =>
                    onUpdate(dayIndex, itemIndex, { extra_transport_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Private">Private</SelectItem>
                    <SelectItem value="Sharing">Sharing</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {item.extra_transport_type === "Custom" && (
                <Input
                  aria-label="Custom transfer type"
                  value={
                    typeof itemMetadata.transfer_custom_type === "string"
                      ? itemMetadata.transfer_custom_type
                      : ""
                  }
                  onChange={(event) =>
                    updateMetadata(
                      dayIndex,
                      itemIndex,
                      item,
                      "transfer_custom_type",
                      event.target.value,
                    )
                  }
                  placeholder="Enter custom transfer type"
                />
              )}
            </div>
            <div>
              <Label>Transfer price currency</Label>
              <Select
                value={
                  typeof itemMetadata.transfer_cost_currency === "string"
                    ? itemMetadata.transfer_cost_currency
                    : "INR"
                }
                onValueChange={(currency) =>
                  updateTransferCostCurrency(dayIndex, itemIndex, item, currency)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPULAR_CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cost per Adult ({adults} Adults)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={adultCost}
                onChange={(event) =>
                  updateTransferCost(
                    dayIndex,
                    itemIndex,
                    item,
                    "transfer_cost_adult",
                    event.target.value,
                  )
                }
              />
              <InrEquivalent
                amount={adultCost}
                currency={
                  typeof itemMetadata.transfer_cost_currency === "string"
                    ? itemMetadata.transfer_cost_currency
                    : "INR"
                }
              />
            </div>
            <div>
              <Label>Cost per Child</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={childCost}
                onChange={(event) =>
                  updateTransferCost(
                    dayIndex,
                    itemIndex,
                    item,
                    "transfer_cost_child",
                    event.target.value,
                  )
                }
              />
              <InrEquivalent
                amount={childCost}
                currency={
                  typeof itemMetadata.transfer_cost_currency === "string"
                    ? itemMetadata.transfer_cost_currency
                    : "INR"
                }
              />
            </div>
            <div>
              <Label>Cost for All</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={totalCost}
                onChange={(event) =>
                  updateTransferCost(
                    dayIndex,
                    itemIndex,
                    item,
                    "transfer_cost_total",
                    event.target.value,
                  )
                }
              />
              <InrEquivalent
                amount={totalCost}
                currency={
                  typeof itemMetadata.transfer_cost_currency === "string"
                    ? itemMetadata.transfer_cost_currency
                    : "INR"
                }
              />
            </div>
            <TwelveHourTimeInput
              label="Pickup time"
              value={item.departure_time}
              required
              onChange={(departure_time) => {
                const arrival_time = departure_time
                  ? addDurationToTime(departure_time, item.duration)
                  : null;
                onUpdate(dayIndex, itemIndex, {
                  departure_time,
                  ...(arrival_time !== null
                    ? { arrival_time }
                    : departure_time === null
                      ? { arrival_time: null }
                      : {}),
                });
              }}
            />
            <TwelveHourTimeInput
              label="Arrival time"
              value={calculatedArrivalTime ?? item.arrival_time}
              required
              onChange={(arrival_time) => {
                const duration = arrival_time
                  ? durationBetweenTimes(item.departure_time, arrival_time)
                  : null;
                onUpdate(dayIndex, itemIndex, {
                  arrival_time,
                  ...(duration !== null
                    ? { duration }
                    : arrival_time === null && item.departure_time
                      ? { duration: "" }
                      : {}),
                });
              }}
            />
            <div className="space-y-1.5">
              <Label>Travel duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Travel duration hours"
                  type="number"
                  min="0"
                  value={durationParts.hours}
                  onChange={(event) => {
                    const duration = durationFromParts(event.target.value, durationParts.minutes);
                    if (duration === null && (event.target.value || durationParts.minutes)) return;
                    const nextDuration = duration ?? "";
                    const arrival_time = addDurationToTime(item.departure_time, nextDuration);
                    onUpdate(dayIndex, itemIndex, {
                      duration: nextDuration,
                      ...(arrival_time !== null
                        ? { arrival_time }
                        : nextDuration === ""
                          ? { arrival_time: null }
                          : {}),
                    });
                  }}
                  placeholder="0"
                  className="min-w-0"
                />
                <span className="text-sm text-slate-600">hr</span>
                <Input
                  aria-label="Travel duration minutes"
                  type="number"
                  min="0"
                  max="59"
                  value={durationParts.minutes}
                  onChange={(event) => {
                    const duration = durationFromParts(durationParts.hours, event.target.value);
                    if (duration === null && (event.target.value || durationParts.hours)) return;
                    const nextDuration = duration ?? "";
                    const arrival_time = addDurationToTime(item.departure_time, nextDuration);
                    onUpdate(dayIndex, itemIndex, {
                      duration: nextDuration,
                      ...(arrival_time !== null
                        ? { arrival_time }
                        : nextDuration === ""
                          ? { arrival_time: null }
                          : {}),
                    });
                  }}
                  placeholder="0"
                  className="min-w-0"
                />
                <span className="text-sm text-slate-600">min</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 md:col-span-2">
              Arrival updates automatically as soon as pickup time and a valid travel duration are
              entered.
            </p>
          </div>
          <div>
            <Label>Note</Label>
            <Textarea
              value={item.notes ?? ""}
              onChange={(event) => onUpdate(dayIndex, itemIndex, { notes: event.target.value })}
              placeholder="Add note"
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={saving || !item.departure_time || !item.arrival_time}
              className="bg-[#151515] text-white hover:bg-black"
              onClick={() => void saveTransfer(item)}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div
        key={item.id ?? `${dayIndex}-${itemIndex}`}
        className="space-y-3 border border-slate-200 bg-white p-3"
        data-builder-type={item.item_type}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Day {day.day_number}
            </p>
            <p className="font-semibold text-slate-900">
              {transfer
                ? item.pickup && item.dropoff
                  ? `${item.pickup} → ${item.dropoff}`
                  : item.title
                : item.title}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!item.departure_time || !item.arrival_time || saving}
              onClick={() => void onSave(item.title, item.id, transfer ? "transfer" : "activity")}
            >
              Save {transfer ? "Transfer" : "Activity"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onMove(dayIndex, itemIndex, "up")}
              disabled={itemIndex === 0}
            >
              Move up
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onMove(dayIndex, itemIndex, "down")}
              disabled={itemIndex === day.items.length - 1}
            >
              Move down
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(dayIndex, itemIndex)}>
              Delete
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>{transfer ? "Transfer title" : "Activity name"}</Label>
            <Input
              value={item.title}
              onChange={(event) => onUpdate(dayIndex, itemIndex, { title: event.target.value })}
            />
          </div>
          <div>
            <Label>Day</Label>
            <Select
              value={String(dayIndex)}
              onValueChange={(value) => onMoveDay(dayIndex, itemIndex, Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.map((option, index) => (
                  <SelectItem key={option.id ?? index} value={String(index)}>
                    Day {option.day_number}
                    {option.title ? ` - ${option.title}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {transfer ? (
            <>
              <div>
                <Label>From</Label>
                <Input
                  value={item.pickup ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { pickup: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>To</Label>
                <Input
                  value={item.dropoff ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { dropoff: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Pickup time</Label>
                <Input
                  required
                  type="time"
                  value={item.departure_time ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { departure_time: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Drop time / arrival</Label>
                <Input
                  required
                  type="time"
                  value={item.arrival_time ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { arrival_time: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Vehicle</Label>
                <Input
                  value={item.extra_transport_vehicle_type ?? item.vehicle_details ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, {
                      extra_transport_vehicle_type: event.target.value,
                      vehicle_details: event.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>Passengers</Label>
                <Input
                  type="number"
                  min={0}
                  value={item.extra_transport_passengers ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, {
                      extra_transport_passengers: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Location</Label>
                <Input
                  value={item.location ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { location: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Duration</Label>
                <Input
                  value={item.duration ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { duration: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Start time</Label>
                <Input
                  required
                  type="time"
                  value={item.departure_time ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { departure_time: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>End time</Label>
                <Input
                  required
                  type="time"
                  value={item.arrival_time ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { arrival_time: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Adults</Label>
                <Input
                  type="number"
                  min={0}
                  value={item.adults ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { adults: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label>Children</Label>
                <Input
                  type="number"
                  min={0}
                  value={item.children ?? ""}
                  onChange={(event) =>
                    onUpdate(dayIndex, itemIndex, { children: Number(event.target.value) || 0 })
                  }
                />
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <Label>Customer-facing description</Label>
            <Textarea
              value={item.customer_facing_info ?? item.description}
              onChange={(event) =>
                onUpdate(dayIndex, itemIndex, {
                  customer_facing_info: event.target.value,
                  description: event.target.value,
                })
              }
              rows={2}
            />
          </div>
          <div>
            <Label>Fulfilment</Label>
            <Select
              value={fulfilmentMode}
              onValueChange={(value) =>
                updateMetadata(dayIndex, itemIndex, item, "fulfilment_mode", value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT">Direct</SelectItem>
                <SelectItem value="SUPPLIER">Supplier/DMC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {fulfilmentMode === "SUPPLIER" && (
            <div>
              <Label>Supplier/DMC</Label>
              <Select
                value={typeof itemMetadata.supplier_id === "string" ? itemMetadata.supplier_id : ""}
                onValueChange={(value) =>
                  updateMetadata(dayIndex, itemIndex, item, "supplier_id", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="md:col-span-2">
            <Label>Internal notes</Label>
            <Textarea
              value={
                typeof itemMetadata.internal_notes === "string"
                  ? itemMetadata.internal_notes
                  : (item.notes ?? "")
              }
              onChange={(event) =>
                updateMetadata(dayIndex, itemIndex, item, "internal_notes", event.target.value)
              }
              rows={2}
            />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-0">
      {saveMessage && (
        <p
          role="status"
          className="mb-4 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700"
        >
          {saveMessage}
        </p>
      )}
      {days.map((day, dayIndex) => {
        const dayItems = serviceItems.filter((record) => record.dayIndex === dayIndex);
        const orderedDayItems = sortItineraryServicesChronologically(dayItems);
        return (
          <section
            key={day.id ?? day.day_number}
            className="space-y-3 border-b border-slate-200 py-5 first:pt-2 last:border-b-0"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-[220px] text-base font-semibold text-slate-900">
                Day {day.day_number}: {formatTripDayDate(day.date)}
              </h2>
              <Button variant="outline" size="sm" onClick={() => onAdd(dayIndex, "ACTIVITY")}>
                <Plus className="mr-1.5 size-4" /> Add Activity
              </Button>
              <Button variant="outline" size="sm" onClick={() => onAdd(dayIndex, "TRANSPORT")}>
                <Plus className="mr-1.5 size-4" /> Add Transfer
              </Button>
            </div>
            {orderedDayItems.map((record) => {
              const isTransfer = record.item.item_type === "TRANSPORT";
              if (isTransfer) {
                return record.item.metadata?.transfer_saved === true
                  ? savedTransfer(record)
                  : editor(record, true);
              }
              return record.item.metadata?.activity_saved === true ? (
                savedActivity(record)
              ) : (
                <ItineraryActivityEditor
                  key={record.item.id ?? `${dayIndex}-${record.itemIndex}`}
                  item={record.item}
                  dayDate={day.date}
                  tripStartDate={travelStartDate}
                  tripEndDate={travelEndDate}
                  destination={destination}
                  adults={adults}
                  children={children}
                  saving={saving}
                  onChange={(updates) => onUpdate(record.dayIndex, record.itemIndex, updates)}
                  onDelete={() => onDelete(record.dayIndex, record.itemIndex)}
                  onSave={() => saveActivity(record.item)}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function ItineraryBuilderPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { rates } = useCurrencyRates();
  const {
    data: customers = [],
    isLoading: customersLoading,
    error: customersError,
  } = useCustomers();
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useLeads();
  const destinationsQuery = useDestinations();
  const destinations = destinationsQuery.data ?? [];
  const { data: profiles = [] } = useProfiles();
  const { data: suppliers = [] } = useSuppliers();
  const formatItinerary = useServerFn(formatItineraryFromSourcesFn);
  const extractSupplier = useServerFn(extractItineraryFromSupplierDocumentFn);
  const extractSupplierText = useServerFn(extractSupplierDocumentTextFn);
  const createItineraryShare = useServerFn(createItineraryShareFn);
  const addItineraryImages = useServerFn(addImagesToItineraryFn);
  const lookupGooglePlaces = useServerFn(lookupGoogleActivityPlacesFn);
  const lookupGooglePlacesRef = useRef(lookupGooglePlaces);
  lookupGooglePlacesRef.current = lookupGooglePlaces;
  const [form, setForm] = useState<TripForm>(EMPTY_FORM);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [supplierDetails, setSupplierDetails] = useState("");
  const linkedLeadQuery = useLead(form.lead_id);
  const linkedLead = linkedLeadQuery.data;
  const appSettings = useAppSettings();
  const companyAgencySettings = appSettings.data?.find((setting) => setting.key === "agency")
    ?.value as Record<string, unknown> | undefined;
  const companyTermDefaults: ExtractedItineraryTerms = {
    inclusions:
      typeof companyAgencySettings?.["default_inclusions"] === "string"
        ? companyAgencySettings["default_inclusions"]
        : DEFAULT_ITINERARY_TERMS.inclusions,
    exclusions:
      typeof companyAgencySettings?.["default_exclusions"] === "string"
        ? companyAgencySettings["default_exclusions"]
        : DEFAULT_ITINERARY_TERMS.exclusions,
    cancellation_info:
      typeof companyAgencySettings?.["default_cancellation_info"] === "string"
        ? companyAgencySettings["default_cancellation_info"]
        : DEFAULT_ITINERARY_TERMS.cancellation_info,
    terms_conditions:
      typeof companyAgencySettings?.["default_terms_conditions"] === "string"
        ? companyAgencySettings["default_terms_conditions"]
        : typeof companyAgencySettings?.["terms"] === "string"
          ? companyAgencySettings["terms"]
          : DEFAULT_ITINERARY_TERMS.terms_conditions,
  };
  const [days, setDays] = useState<TripDay[]>([{ ...EMPTY_DAY }]);
  const [quickPreviewDraftReady, setQuickPreviewDraftReady] = useState(false);
  const addImagesToSavedItineraryRef = useRef<(() => Promise<void>) | null>(null);
  const [currentItineraryId, setCurrentItineraryId] = useState<string | null>(null);
  const savedTermsSnapshotRef = useRef<ReturnType<typeof buildItineraryTermsSnapshot> | null>(null);
  const recoveredDraftRef = useRef(false);
  const assignedItineraryPreviewOpenedRef = useRef(false);
  const termsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [draftOwnerId, setDraftOwnerId] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [librarySaveInProgress, setLibrarySaveInProgress] = useState(false);
  const [libraryNameDialogOpen, setLibraryNameDialogOpen] = useState(false);
  const [libraryItineraryName, setLibraryItineraryName] = useState("");
  const draftAutosavePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "local">(
    "idle",
  );
  const draftStorageKeyRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [costLines, setCostLines] = useState<ItineraryCostLine[]>([]);
  const [copyMetadata, setCopyMetadata] = useState<ItineraryCopyMetadata>({});
  const [previewTemplate, setPreviewTemplate] =
    useState<ItineraryPresentationTemplateId>("package");
  const [previewPackageOptions, setPreviewPackageOptions] = useState<
    ItineraryPreviewPackageOption[]
  >([]);
  const [selectedPreviewPackageId, setSelectedPreviewPackageId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareGenerating, setShareGenerating] = useState(false);
  const [shareLinkDialogOpen, setShareLinkDialogOpen] = useState(false);
  const [validation, setValidation] = useState<ValidationSummary>({
    valid: true,
    errors: [],
    warnings: [],
  });
  const [activeSection, setActiveSection] = useState("day");
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [clientAssignmentOpen, setClientAssignmentOpen] = useState(false);
  const [clientAssignmentKind, setClientAssignmentKind] = useState<"lead" | "customer">("lead");
  const [clientAssignmentSearch, setClientAssignmentSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [assignmentItineraryName, setAssignmentItineraryName] = useState("");
  const assignmentAutoSaveStartedRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copyMode, setCopyMode] = useState(false);
  const [copyPreviewReviewed, setCopyPreviewReviewed] = useState(false);
  const [hotelsDialogOpen, setHotelsDialogOpen] = useState(false);
  const [flightDialogOpen, setFlightDialogOpen] = useState(false);
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);
  const [timelineEditingItem, setTimelineEditingItem] = useState<{
    dayIndex: number;
    itemIndex: number;
  } | null>(null);
  const [inclusionsDialogOpen, setInclusionsDialogOpen] = useState(false);
  const [hotelDetailsOpen, setHotelDetailsOpen] = useState<string | null>(null);
  const [visaDialogOpen, setVisaDialogOpen] = useState(false);
  const [visaFormOpen, setVisaFormOpen] = useState(false);
  const [editingVisa, setEditingVisa] = useState<{ dayIndex: number; itemIndex: number } | null>(
    null,
  );
  const [visaForm, setVisaForm] = useState({
    country: "",
    type: "",
    details: "",
    cost: "",
    currency: "INR",
    startTime: "09:00",
    endTime: "10:00",
  });
  const [activitiesTransfersDialogOpen, setActivitiesTransfersDialogOpen] = useState(false);
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);
  const [addTransportCostDialogOpen, setAddTransportCostDialogOpen] = useState(false);
  const [transportCostForm, setTransportCostForm] = useState({
    title: "",
    type: "",
    cost: "",
    currency: "INR",
    details: "",
  });
  const [tablesDialogOpen, setTablesDialogOpen] = useState(false);
  const [newTableDialogOpen, setNewTableDialogOpen] = useState(false);
  const [tablesEnabled, setTablesEnabled] = useState(true);
  const [newTableSize, setNewTableSize] = useState({ rows: "3", columns: "3" });
  const [activitiesTransfersEnabled, setActivitiesTransfersEnabled] = useState(false);
  const [hotelsEnabled, setHotelsEnabled] = useState(false);
  const [hotelBookingMode, setHotelBookingMode] = useState<HotelBookingMode>("daywise");
  const [rightPanel, setRightPanel] = useState<"ai" | "land-package" | "flights">("ai");
  const [selectedHotelOption, setSelectedHotelOption] = useState<ItineraryOption>("Option 1");
  const [selectedFlightOption, setSelectedFlightOption] = useState<ItineraryOption>("Option 1");
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [marginLines, setMarginLines] = useState<MarginLine[]>([]);
  const [taxLines, setTaxLines] = useState<TaxLine[]>([]);
  const pricingLinesInitializedRef = useRef(false);
  const itineraryEditorRef = useRef<HTMLDivElement>(null);
  const itinerarySelectionRef = useRef<Range | null>(null);
  const linkSelectionMarkerRef = useRef<HTMLElement | null>(null);
  const [itineraryEditorEmpty, setItineraryEditorEmpty] = useState(false);
  const [itineraryEditorFocused, setItineraryEditorFocused] = useState(false);
  const [itineraryLinkHint, setItineraryLinkHint] = useState<{
    x: number;
    y: number;
    text: string;
    url: string;
  } | null>(null);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [photoDisplayUrls, setPhotoDisplayUrls] = useState<Record<string, string>>({});
  const [addingImages, setAddingImages] = useState(false);
  const [imageEnrichment, setImageEnrichment] = useState<{
    days: Array<{
      dayNumber: number;
      status: "added" | "existing" | "not_found" | "failed";
      placeName?: string;
      message?: string;
    }>;
    added: number;
    existing: number;
    notFound: number;
    failed: number;
  } | null>(null);
  const [imageEnrichmentError, setImageEnrichmentError] = useState<string | null>(null);
  const [hotelPreviewPhotos, setHotelPreviewPhotos] = useState<Record<string, GoogleActivityPhoto>>(
    {},
  );
  const [activityPreviewPhotos, setActivityPreviewPhotos] = useState<
    Record<
      string,
      {
        photos: Array<{
          id: string;
          url: string;
          caption?: string | null;
          alt_text?: string | null;
          sequence?: number;
        }>;
        imageCredit?: string;
      }
    >
  >({});
  const autoSavingImportedHotelsRef = useRef(false);
  const savedServicesForAi = useMemo(
    () => buildSavedServicesForAi(days, activitiesTransfersEnabled, hotelsEnabled),
    [activitiesTransfersEnabled, days, hotelsEnabled],
  );
  const savedHotelServicesForPlanner = useMemo(
    () => buildSavedServicesForAi(days, false, true).entries,
    [days],
  );
  const savedTicketDetails = useMemo(() => collectExistingItineraryTickets(days), [days]);
  const completePlanTripContext = useMemo(
    () =>
      form.travel_start_date && form.travel_end_date
        ? {
            startDate: form.travel_start_date,
            endDate: form.travel_end_date,
            adults: Number(form.adults) || 0,
            children: Number(form.children) || 0,
          }
        : null,
    [form.adults, form.children, form.travel_end_date, form.travel_start_date],
  );

  useEffect(() => {
    let cancelled = false;
    const storagePaths = [
      ...new Set(
        form.photos
          .map((photo) => photo.storage_path)
          .filter((path): path is string => Boolean(path)),
      ),
    ];
    void Promise.all(
      storagePaths.map(async (path) => [path, await createItineraryPhotoDisplayUrl(path)] as const),
    )
      .then((entries) => {
        if (!cancelled) setPhotoDisplayUrls(Object.fromEntries(entries));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn("[Itinerary builder] Could not resolve private itinerary photo URLs", error);
          setPhotoDisplayUrls({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [form.photos]);

  useEffect(() => {
    const importedHotels = days
      .flatMap((day) => day.items)
      .filter(
        (item) =>
          item.item_type === "ACCOMMODATION" && item.metadata?.["supplier_imported_hotel"] === true,
      );
    if (importedHotels.length === 0 || autoSavingImportedHotelsRef.current) return;
    const allHotelsMatched = importedHotels.every(
      (item) =>
        typeof item.metadata?.["google_hotel_place_id"] === "string" &&
        Boolean(item.metadata["google_hotel_place_id"]) &&
        item.metadata["auto_select_google_hotel"] !== true,
    );
    if (
      !allHotelsMatched ||
      importedHotels.every((item) => item.metadata?.["hotel_saved"] === true)
    )
      return;

    autoSavingImportedHotelsRef.current = true;
    void saveItinerary(false, undefined, undefined, undefined, "Option 1", days).then((saved) => {
      if (!saved) autoSavingImportedHotelsRef.current = false;
    });
  }, [days]);

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    const hotels = [
      ...new Set(
        days
          .flatMap((day) => day.items)
          .filter(
            (item) =>
              item.item_type === "ACCOMMODATION" &&
              !item.metadata?.custom_hotel_photo_url &&
              typeof item.metadata?.google_hotel_place_id === "string",
          )
          .map((item) => String(item.metadata?.google_hotel_place_id))
          .filter((placeId) => placeId && !hotelPreviewPhotos[placeId]),
      ),
    ];
    void Promise.all(
      hotels.map(async (placeId) => {
        try {
          const result = await lookupGooglePlaces({ data: { action: "photo", placeId } });
          return result && !Array.isArray(result) && "photoUri" in result
            ? ([placeId, result as GoogleActivityPhoto] as const)
            : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const resolved = Object.fromEntries(
        entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
      );
      if (Object.keys(resolved).length)
        setHotelPreviewPhotos((current) => ({ ...current, ...resolved }));
    });
    return () => {
      cancelled = true;
    };
  }, [days, hotelPreviewPhotos, lookupGooglePlaces, previewOpen]);

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    const placeIds = [
      ...new Set(
        days.flatMap((day) =>
          day.items
            .filter((item) => item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING")
            .map((item) =>
              typeof item.metadata?.google_place_id === "string"
                ? item.metadata.google_place_id
                : "",
            )
            .filter((placeId) => placeId && !activityPreviewPhotos[placeId]),
        ),
      ),
    ];
    void Promise.all(
      placeIds.map(async (placeId) => {
        try {
          const photos = await listActivityLibraryPhotos(placeId);
          if (photos.length > 0)
            return [
              placeId,
              {
                photos: photos
                  .map((photo) => ({
                    id: photo.id,
                    url: photo.display_url ?? "",
                    caption: photo.caption,
                    alt_text: photo.alt_text,
                    sequence: photo.display_order,
                  }))
                  .filter((photo) => photo.url),
              },
            ] as const;
          const result = await lookupGooglePlaces({ data: { action: "photo", placeId } });
          if (result && !Array.isArray(result) && "photoUri" in result) {
            const googlePhoto = result as GoogleActivityPhoto;
            return [
              placeId,
              {
                photos: [
                  {
                    id: `${placeId}-google-photo`,
                    url: googlePhoto.photoUri,
                    alt_text: "Google Maps activity photo",
                    sequence: 1,
                  },
                ],
                imageCredit:
                  googlePhoto.authorAttributions
                    .map((author) => author.displayName)
                    .filter(Boolean)
                    .join(", ") || "Google Maps",
              },
            ] as const;
          }
          return [placeId, { photos: [] }] as const;
        } catch (error) {
          console.warn("[Itinerary preview] Could not load saved activity photos", error);
          return [placeId, { photos: [] }] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const resolved = Object.fromEntries(entries);
      if (Object.keys(resolved).length)
        setActivityPreviewPhotos((current) => ({ ...current, ...resolved }));
    });
    return () => {
      cancelled = true;
    };
  }, [activityPreviewPhotos, days, previewOpen]);
  const landPackageLines = useMemo(() => {
    const normalizedDescription = (value: string) =>
      value.trim().toLowerCase().replace(/\s+/g, " ");
    const toInr = (amount: number, currencyValue: unknown, snapshot: unknown) => {
      if (typeof snapshot === "number" && Number.isFinite(snapshot)) return snapshot;
      const currency = typeof currencyValue === "string" ? currencyValue : "INR";
      if (currency === "INR") return amount;
      if (!(POPULAR_CURRENCIES as readonly string[]).includes(currency) || !rates) return 0;
      return convertToInr(amount, currency as CurrencyCode, rates.rates) ?? 0;
    };
    const derivedLines = days.flatMap((day) =>
      day.items.flatMap((item) => {
        const metadata = item.metadata ?? {};
        const numberValue = (key: string) => Number(metadata[key] ?? 0) || 0;
        let category: ItineraryCostLine["cost_category"] | null = null;
        let amount = 0;
        let description = item.title || "Itinerary service";

        if (item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING") {
          category = "ACTIVITY";
          amount =
            numberValue("activity_cost_total_inr") ||
            toInr(
              numberValue("activity_cost_total"),
              metadata["activity_cost_currency"],
              metadata["activity_cost_total_inr"],
            ) ||
            toInr(
              numberValue("activity_cost_adult"),
              metadata["activity_cost_currency"],
              metadata["activity_cost_adult_inr"],
            ) *
              Number(form.adults || 0) +
              toInr(
                numberValue("activity_cost_child"),
                metadata["activity_cost_currency"],
                metadata["activity_cost_child_inr"],
              ) *
                Number(form.children || 0);
          description = `Day ${day.day_number} - ${item.title || "Activity"}`;
        } else if (item.item_type === "TRANSPORT") {
          category = "EXTRA_TRANSPORT";
          amount =
            numberValue("transfer_cost_total_inr") ||
            toInr(
              numberValue("transfer_cost_total"),
              metadata["transfer_cost_currency"],
              metadata["transfer_cost_total_inr"],
            ) ||
            toInr(
              numberValue("transfer_cost_adult"),
              metadata["transfer_cost_currency"],
              metadata["transfer_cost_adult_inr"],
            ) *
              Number(form.adults || 0) +
              toInr(
                numberValue("transfer_cost_child"),
                metadata["transfer_cost_currency"],
                metadata["transfer_cost_child_inr"],
              ) *
                Number(form.children || 0);
          description = `Day ${day.day_number} - ${item.title || "Transfer"}`;
        } else if (item.item_type === "ACCOMMODATION") {
          category = "HOTEL";
          const nights = Math.max(1, Number(item.nights ?? 0) || 1);
          const rooms = Array.isArray(metadata["room_details"])
            ? (metadata["room_details"] as HotelRoomDetail[])
            : [];
          amount = rooms.reduce(
            (total, room) =>
              total +
              toInr(
                Number(room.room_rate_per_night) || 0,
                room.currency,
                room.room_rate_per_night_inr,
              ) *
                nights,
            0,
          );
          description = item.hotel_name || item.title || "Hotel";
        }

        if (
          !category ||
          costLines.some(
            (line) =>
              (line.itinerary_item_id === item.id && line.cost_category === category) ||
              (line.cost_category === category && line.total_cost === amount && amount > 0),
          )
        )
          return [];
        return [
          createItineraryCostLine({
            id: `derived-${item.id ?? `${day.day_number}-${item.sequence}`}`,
            itinerary_id: currentItineraryId ?? "00000000-0000-0000-0000-000000000000",
            itinerary_item_id: item.id ?? null,
            cost_category: category,
            description,
            quantity: 1,
            unit: "service",
            unit_cost: amount,
            currency: "INR",
            sequence: item.sequence,
            source: "derived",
          }),
        ];
      }),
    );
    const normalizedCostLines = costLines.map((line) => {
      const code = (POPULAR_CURRENCIES as readonly string[]).includes(line.currency)
        ? (line.currency as CurrencyCode)
        : null;
      const unitInr =
        line.unit_cost_inr ?? (code ? convertToInr(line.unit_cost, code, rates?.rates) : null);
      const totalInr =
        line.total_cost_inr ?? (code ? convertToInr(line.total_cost, code, rates?.rates) : null);
      return { ...line, unit_cost: unitInr ?? 0, total_cost: totalInr ?? 0, currency: "INR" };
    });
    const uniqueLines = new Map<string, ItineraryCostLine>();
    for (const line of [...normalizedCostLines, ...derivedLines]) {
      let identity: string;
      if (line.itinerary_item_id) {
        identity = `${line.cost_category}|item:${line.itinerary_item_id}`;
      } else if (line.source_reference === "land-package-extra" && line.id) {
        identity = `${line.cost_category}|land-package-extra:${line.id}`;
      } else {
        identity = `${line.cost_category}|description:${normalizedDescription(line.description)}|amount:${line.total_cost}`;
      }
      if (!uniqueLines.has(identity) || line.source !== "derived") uniqueLines.set(identity, line);
    }
    return [...uniqueLines.values()];
  }, [costLines, currentItineraryId, days, form.adults, form.children, rates]);
  const costSummary = useMemo(
    () => summarizeItineraryCostSections(landPackageLines),
    [landPackageLines],
  );
  const selectedLandPackageLines = useMemo(
    () =>
      landPackageLines.filter(
        (line) =>
          line.cost_category !== "HOTEL" ||
          days.some((day) =>
            day.items.some(
              (item) =>
                item.id === line.itinerary_item_id &&
                getItineraryOption(item) === selectedHotelOption,
            ),
          ),
      ),
    [days, landPackageLines, selectedHotelOption],
  );
  const selectedCostSummary = useMemo(
    () => summarizeItineraryCostSections(selectedLandPackageLines),
    [selectedLandPackageLines],
  );
  const savedFlights = useMemo(
    () =>
      days.flatMap((day, dayIndex) =>
        day.items
          .map((item, itemIndex) => ({ day, dayIndex, item, itemIndex }))
          .filter(
            ({ item }) =>
              item.item_type === "FLIGHT" &&
              item.metadata?.flight_saved === true &&
              getItineraryOption(item) === selectedFlightOption,
          ),
      ),
    [days, selectedFlightOption],
  );
  const flightQuoteLines = useMemo(
    () =>
      days.flatMap((day, dayIndex) =>
        day.items
          .map((item, itemIndex) => ({ day, dayIndex, item, itemIndex }))
          .filter(
            ({ item }) =>
              item.item_type === "FLIGHT" &&
              item.metadata?.flight_saved === true &&
              getItineraryOption(item) === selectedFlightOption,
          ),
      ),
    [days, selectedFlightOption],
  );
  const flightQuoteTotal = flightQuoteLines.reduce((total, { item }) => {
    const amount = Number(item.flight_price) || 0;
    const code = (POPULAR_CURRENCIES as readonly string[]).includes(item.flight_currency ?? "INR")
      ? ((item.flight_currency ?? "INR") as CurrencyCode)
      : null;
    const amountInr =
      amount && code
        ? rates
          ? convertToInr(amount, code, rates.rates)
          : code === "INR"
            ? amount
            : null
        : 0;
    return total + (amountInr ?? 0);
  }, 0);
  const marginTotal = marginLines.reduce((total, line) => total + (Number(line.amount) || 0), 0);
  const quoteBase =
    rightPanel === "flights"
      ? flightQuoteTotal
      : rightPanel === "land-package"
        ? selectedCostSummary.totalSupplierCost
        : costSummary.totalSupplierCost;
  const supplierCostWithMargin = quoteBase + marginTotal;
  const taxTotal = taxLines.reduce((total, line) => total + (Number(line.amount) || 0), 0);

  useEffect(() => {
    if (!draftReady || appSettings.isLoading || currentItineraryId || recoveredDraftRef.current)
      return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("aiDraft") || params.has("bookingDraft") || params.has("supplierDraft")) return;
    setForm((current) => ({
      ...current,
      inclusions: companyTermDefaults.inclusions.trim()
        ? [sanitizeItineraryTermHtml(companyTermDefaults.inclusions)]
        : [],
      exclusions: companyTermDefaults.exclusions.trim()
        ? [sanitizeItineraryTermHtml(companyTermDefaults.exclusions)]
        : [],
      cancellation_info: sanitizeItineraryTermHtml(companyTermDefaults.cancellation_info),
      terms_conditions: sanitizeItineraryTermHtml(companyTermDefaults.terms_conditions),
    }));
  }, [
    appSettings.isLoading,
    companyTermDefaults.cancellation_info,
    companyTermDefaults.exclusions,
    companyTermDefaults.inclusions,
    companyTermDefaults.terms_conditions,
    currentItineraryId,
    draftReady,
  ]);

  useEffect(() => {
    if (
      !draftReady ||
      pricingLinesInitializedRef.current ||
      appSettings.isLoading ||
      destinationsQuery.isLoading
    )
      return;
    if (form.lead_id && linkedLeadQuery.isLoading) return;

    const pricingDefaults = appSettings.data?.find((setting) => setting.key === "pricing")
      ?.value as Record<string, unknown> | undefined;
    const markup = Number(pricingDefaults?.["default_markup_pct"] ?? 12);
    const gst = Number(pricingDefaults?.["gst_domestic_pct"] ?? 5);
    const markupPercentage = Number.isFinite(markup) ? markup : 12;
    const gstPercentage = Number.isFinite(gst) ? gst : 5;

    setMarginLines((current) =>
      hasConfiguredPricingLines(current)
        ? current
        : [
            {
              id: crypto.randomUUID(),
              detail: "Margin",
              percentage: markupPercentage,
              amount: (markupPercentage * quoteBase) / 100,
            },
          ],
    );
    setTaxLines((current) =>
      hasConfiguredPricingLines(current)
        ? current
        : [
            {
              id: crypto.randomUUID(),
              detail: "GST",
              percentage: gstPercentage,
              amount: (gstPercentage * quoteBase) / 100,
            },
          ],
    );
    pricingLinesInitializedRef.current = true;
  }, [
    appSettings.data,
    appSettings.isLoading,
    destinations,
    destinationsQuery.isLoading,
    draftReady,
    form.destination_id,
    form.lead_id,
    linkedLead?.scope,
    linkedLeadQuery.isLoading,
    quoteBase,
  ]);

  useEffect(() => {
    if (!pricingLinesInitializedRef.current) return;
    setMarginLines((current) =>
      current.map((line) => ({
        ...line,
        amount:
          line.percentage === "" ? line.amount : ((Number(line.percentage) || 0) * quoteBase) / 100,
      })),
    );
    setTaxLines((current) =>
      current.map((line) => ({
        ...line,
        amount:
          line.percentage === ""
            ? line.amount
            : ((Number(line.percentage) || 0) * supplierCostWithMargin) / 100,
      })),
    );
  }, [quoteBase, supplierCostWithMargin]);
  const travellerCount = (Number(form.adults) || 0) + (Number(form.children) || 0);
  const selectedCustomerQuote: ItineraryCustomerQuoteOption = form.customer_quotes[
    selectedHotelOption
  ] ?? {
    mode: "total",
    lines: [{ id: `${selectedHotelOption}-1`, amount: "", currency: "INR" }],
    pushed: false,
  };
  const selectedCustomerQuoteInputCurrency = selectedCustomerQuote.lines[0]?.currency ?? "INR";
  const selectedCustomerQuoteInrOption: ItineraryCustomerQuoteOption = {
    ...selectedCustomerQuote,
    lines: selectedCustomerQuote.lines.map((line) => {
      const amount = Number(line.amount) || 0;
      const code = (POPULAR_CURRENCIES as readonly string[]).includes(line.currency)
        ? (line.currency as CurrencyCode)
        : null;
      const amountInr =
        amount && code
          ? rates
            ? convertToInr(amount, code, rates.rates)
            : code === "INR"
              ? amount
              : null
          : 0;
      return { ...line, amount: amountInr ?? 0, currency: "INR" };
    }),
  };
  const selectedCustomerQuoteTotals = calculateItineraryCustomerQuote(
    selectedCustomerQuoteInrOption,
    travellerCount,
  );
  const selectedCustomerQuoteFinalTotal =
    selectedCostSummary.totalSupplierCost +
    selectedCustomerQuoteTotals.total +
    marginTotal +
    taxTotal;
  const selectedCustomerQuotePerPerson =
    travellerCount > 0 ? selectedCustomerQuoteFinalTotal / travellerCount : 0;
  const selectedCustomerQuoteCurrency = "INR";

  function updateCustomerQuoteOption(
    option: string,
    update: Partial<ItineraryCustomerQuoteOption>,
  ) {
    setForm((current) => {
      const existing = current.customer_quotes[option] ?? {
        mode: "total" as const,
        lines: [{ id: `${option}-1`, amount: "", currency: "INR" }],
        pushed: false,
      };
      return {
        ...current,
        customer_quotes: {
          ...current.customer_quotes,
          [option]: { ...existing, ...update, pushed: false },
        },
      };
    });
  }

  function updateQuoteLineSnapshot(lines: ItineraryCustomerQuoteOption["lines"]) {
    const withSnapshots = lines.map((line) => {
      const amount = Number(line.amount) || 0;
      const code = (POPULAR_CURRENCIES as readonly string[]).includes(line.currency)
        ? (line.currency as CurrencyCode)
        : null;
      const amountInr =
        amount && code
          ? rates
            ? convertToInr(amount, code, rates.rates)
            : code === "INR"
              ? amount
              : null
          : 0;
      return {
        ...line,
        amount_inr: amountInr,
        exchange_rate: amount > 0 && amountInr !== null ? amountInr / amount : 1,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
      };
    });
    updateCustomerQuoteOption(selectedHotelOption, { lines: withSnapshots });
  }

  function pushCustomerQuote() {
    try {
      const linesWithSnapshots = selectedCustomerQuote.lines.map((line) => {
        const amount = Number(line.amount) || 0;
        const code = (POPULAR_CURRENCIES as readonly string[]).includes(line.currency)
          ? (line.currency as CurrencyCode)
          : null;
        const amountInr =
          amount && code
            ? rates
              ? convertToInr(amount, code, rates.rates)
              : code === "INR"
                ? amount
                : null
            : 0;
        if (amountInr === null)
          throw new Error("Live exchange rates are required to push this quote in INR.");
        return {
          ...line,
          amount_inr: amountInr,
          exchange_rate: amount > 0 ? amountInr / amount : 1,
          exchange_rate_updated_at: rates?.updatedAt ?? null,
        };
      });
      const pushedInrOption = pushItineraryCustomerQuote(
        {
          ...selectedCustomerQuote,
          lines: linesWithSnapshots.map((line) => ({
            ...line,
            amount: line.amount_inr ?? 0,
            currency: "INR",
          })),
        },
        travellerCount,
        {
          supplierCost: selectedCostSummary.totalSupplierCost,
          margin: marginTotal,
          gst: taxTotal,
        },
      );
      const pushedOption = { ...pushedInrOption, lines: linesWithSnapshots };
      const updatedQuotes = { ...form.customer_quotes, [selectedHotelOption]: pushedOption };
      setForm((current) => ({ ...current, customer_quotes: updatedQuotes }));
      setMessage(`${selectedHotelOption} customer price pushed to the itinerary PDF.`);
      if (currentItineraryId) {
        void supabase
          .from("itineraries")
          .update({ customer_quotes: updatedQuotes })
          .eq("id", currentItineraryId)
          .then(({ error }) => {
            if (error) {
              setMessage(
                `The quote was added to the preview but could not be saved to the itinerary: ${error.message}`,
              );
              toast.error("Unable to save package quote");
            }
          });
      }
      toast.success("Customer price added to itinerary");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to push this quote.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    }
  }

  const assignmentSearch = clientAssignmentSearch.trim().toLocaleLowerCase();
  const filteredAssignmentLeads = leads.filter((lead) =>
    [
      lead.customer_name,
      lead.code,
      lead.mobile,
      lead.email,
      lead.destination_text,
      lead.destinations?.name,
    ].some(
      (value) => typeof value === "string" && value.toLocaleLowerCase().includes(assignmentSearch),
    ),
  );
  const filteredAssignmentCustomers = [...customers]
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .filter((customer) =>
      [
        customer.full_name,
        customer.code,
        customer.mobile,
        customer.email,
        customer.city,
        customer.country,
      ].some(
        (value) =>
          typeof value === "string" && value.toLocaleLowerCase().includes(assignmentSearch),
      ),
    );
  const selectedAssignmentLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const selectedAssignmentCustomer =
    customers.find((customer) => customer.id === selectedCustomerId) ?? null;

  function openClientAssignment() {
    const currentLead = leads.find((lead) => lead.id === form.lead_id);
    setClientAssignmentKind(currentLead ? "lead" : "customer");
    setSelectedLeadId(currentLead?.id ?? "");
    setSelectedCustomerId(currentLead ? "" : form.customer_id);
    setAssignmentItineraryName(form.title.trim() || `${destinationName || "Trip"} itinerary`);
    setClientAssignmentSearch("");
    setClientAssignmentOpen(true);
  }

  async function assignItineraryToClient() {
    const selectedLead = clientAssignmentKind === "lead" ? selectedAssignmentLead : null;
    const selectedCustomer =
      clientAssignmentKind === "customer" ? selectedAssignmentCustomer : null;
    if (!selectedLead && !selectedCustomer) {
      toast.error("Select a lead or customer first.");
      return;
    }
    const assignmentName = assignmentItineraryName.trim();
    if (!assignmentName) {
      toast.error("Enter a name for this assigned itinerary.");
      return;
    }

    const relationship: Partial<TripForm> = selectedLead
      ? { lead_id: selectedLead.id, customer_id: selectedLead.customer_id ?? "", enquiry_id: "" }
      : { lead_id: "", customer_id: selectedCustomer!.id, enquiry_id: "" };
    if (
      currentItineraryId &&
      relationship.customer_id &&
      selectedCustomer
    ) {
      const params = new URLSearchParams({
        copyFrom: currentItineraryId,
        customerId: relationship.customer_id,
        copyName: assignmentName,
        assignNow: "1",
      });
      window.location.assign(`/itinerary-builder?${params.toString()}`);
      return;
    }
    setSaving(true);
    try {
      const destinationId =
        form.destination_id ||
        destinations.find((destination) => destination.name === destinationName)?.id ||
        "";
      const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
      if (sessionError) throw sessionError;
      const assignmentPayload = {
        title: assignmentName,
        ...buildItineraryLibrarySaveFields({
          title: assignmentName,
          dayCount: days.length,
          status: form.status,
        }),
        customer_id: relationship.customer_id || null,
        lead_id: relationship.lead_id || null,
        enquiry_id: null,
        destination_id: destinationId || null,
        travel_start_date: form.travel_start_date || null,
        travel_end_date: form.travel_end_date || null,
        adults: Number(form.adults) || 0,
        children: Number(form.children) || 0,
      };

      let assignedItineraryId = currentItineraryId;
      if (assignedItineraryId && !copyMode) {
        const { data, error } = await supabase
          .from("itineraries")
          .update(assignmentPayload)
          .eq("id", assignedItineraryId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data?.id)
          throw new Error("The itinerary could not be found to update its client assignment.");
      } else {
        const { data, error } = await supabase
          .from("itineraries")
          .insert({ ...assignmentPayload, created_by: sessionData.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        if (!data?.id) throw new Error("The itinerary assignment could not be saved.");
        setCurrentItineraryId(data.id);
        window.history.replaceState(
          window.history.state,
          "",
          itineraryBuilderUrl(window.location.href, data.id),
        );
      }

      setForm((current) => ({ ...current, ...relationship, title: assignmentName }));
      setClientAssignmentOpen(false);
      setMessage(
        selectedLead
          ? `Itinerary assigned to ${selectedLead.customer_name} through lead ${selectedLead.code}. Save the assigned itinerary to persist its content.`
          : `Itinerary assigned to ${selectedCustomer!.full_name}. Save the assigned itinerary to persist its content.`,
      );
      toast.success("Itinerary assigned to client");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to assign this itinerary to the client.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  async function removeItineraryClient() {
    const relationship: Partial<TripForm> = { lead_id: "", customer_id: "", enquiry_id: "" };
    const saved = await saveItinerary(
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      relationship,
      true,
    );
    if (!saved) return;
    setForm((current) => ({ ...current, ...relationship }));
    setClientAssignmentOpen(false);
    setMessage("Client assignment removed from the itinerary.");
    toast.success("Client assignment removed");
  }

  useEffect(() => {
    if (activeSection !== "day" || !form.document_html.trim() || itineraryEditorFocused) return;
    const editor = itineraryEditorRef.current;
    if (!editor) return;
    const inlinePhotos = days.flatMap((day) => {
      const photo = form.photos.find((entry) => entry.day_id === day.id);
      if (!photo) return [];
      const url = photo.storage_path ? (photoDisplayUrls[photo.storage_path] ?? "") : photo.url;
      if (!url) return [];
      const authors = Array.isArray(photo.attribution)
        ? photo.attribution.flatMap((entry) =>
            entry &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            typeof entry["displayName"] === "string"
              ? [entry["displayName"]]
              : [],
          )
        : [];
      const credit =
        photo.source === "GOOGLE_PLACES"
          ? `Photo: ${photo.place_name || photo.caption || "Google Places"} · Google Maps${authors.length ? ` · ${authors.join(", ")}` : ""}`
          : photo.caption;
      return [{ day_number: day.day_number, url, alt_text: photo.alt_text, caption: "", credit }];
    });
    const safeHtml = insertInlineItineraryDayPhotos(
      sanitizeItineraryEditorHtml(form.document_html),
      inlinePhotos,
    );
    if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;
    setItineraryEditorEmpty(!editor.innerText.trim());
  }, [
    activeSection,
    days,
    form.document_html,
    form.photos,
    itineraryEditorFocused,
    photoDisplayUrls,
  ]);

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (!itineraryEditorRef.current?.contains(document.activeElement)) return;
        event.preventDefault();
        saveItinerarySelection();
        insertItineraryLink();
      }
    }
    document.addEventListener("keydown", handleEditorShortcut);
    return () => document.removeEventListener("keydown", handleEditorShortcut);
  });

  const validationState = useMemo(
    () =>
      validateItineraryDraftState({
        ...(form.title ? { title: form.title } : {}),
        ...(form.customer_id ? { customer_id: form.customer_id } : {}),
        ...(form.lead_id ? { lead_id: form.lead_id } : {}),
        ...(form.enquiry_id ? { enquiry_id: form.enquiry_id } : {}),
        ...(form.destination_id ? { destination_id: form.destination_id } : {}),
        ...(form.travel_start_date ? { travel_start_date: form.travel_start_date } : {}),
        ...(form.travel_end_date ? { travel_end_date: form.travel_end_date } : {}),
        ...(form.adults ? { adults: form.adults } : {}),
        ...(form.children ? { children: form.children } : {}),
        ...(form.assigned_to ? { assigned_to: form.assigned_to } : {}),
        ...(form.status ? { status: form.status } : {}),
        ...(form.inclusions.length > 0 ? { inclusions: form.inclusions } : {}),
        ...(form.exclusions.length > 0 ? { exclusions: form.exclusions } : {}),
        ...(form.cancellation_info ? { cancellation_info: form.cancellation_info } : {}),
        ...(form.custom_tables.length > 0 ? { custom_tables: form.custom_tables } : {}),
        ...(form.photos.length > 0 ? { photos: form.photos } : {}),
        days: days.map((day) => ({
          day_number: day.day_number,
          date: day.date,
          title: day.title,
          items: day.items.map((item) => {
            const validationItem: Record<string, string | number | null | undefined> = {
              sequence: item.sequence,
              item_type: item.item_type,
              title: item.title,
            };

            if (item.location != null) validationItem["location"] = item.location;
            if (item.hotel_name != null) validationItem["hotel_name"] = item.hotel_name;
            if (item.check_in != null) validationItem["check_in"] = item.check_in;
            if (item.check_out != null) validationItem["check_out"] = item.check_out;
            if (typeof item.metadata?.check_in_time === "string")
              validationItem["check_in_time"] = item.metadata.check_in_time;
            if (typeof item.metadata?.check_out_time === "string")
              validationItem["check_out_time"] = item.metadata.check_out_time;
            if (typeof item.metadata?.activity_date === "string")
              validationItem["activity_date"] = item.metadata.activity_date;
            if (item.extra_transport_date != null)
              validationItem["extra_transport_date"] = item.extra_transport_date;
            if (item.departure_time != null) validationItem["departure_time"] = item.departure_time;
            if (item.arrival_time != null) validationItem["arrival_time"] = item.arrival_time;
            if (item.duration != null) validationItem["duration"] = item.duration;
            if (item.extra_transport_pickup_time != null)
              validationItem["extra_transport_pickup_time"] = item.extra_transport_pickup_time;
            if (item.extra_transport_drop_time != null)
              validationItem["extra_transport_drop_time"] = item.extra_transport_drop_time;
            if (item.nights != null) validationItem["nights"] = item.nights;
            if (item.rooms != null) validationItem["rooms"] = item.rooms;
            if (item.adults != null) validationItem["adults"] = item.adults;
            if (item.children != null) validationItem["children"] = item.children;
            if (item.meal_plan != null) validationItem["meal_plan"] = item.meal_plan;
            if (item.star_category != null) validationItem["star_category"] = item.star_category;
            if (item.room_type != null) validationItem["room_type"] = item.room_type;
            if (item.flight_departure_date != null)
              validationItem["flight_departure_date"] = item.flight_departure_date;
            if (item.flight_arrival_date != null)
              validationItem["flight_arrival_date"] = item.flight_arrival_date;
            if (item.flight_departure_time != null)
              validationItem["flight_departure_time"] = item.flight_departure_time;
            if (item.flight_arrival_time != null)
              validationItem["flight_arrival_time"] = item.flight_arrival_time;
            if (item.flight_price != null) validationItem["flight_price"] = item.flight_price;
            if (item.flight_currency != null)
              validationItem["flight_currency"] = item.flight_currency;
            if (item.pickup != null) validationItem["pickup"] = item.pickup;
            if (item.dropoff != null) validationItem["dropoff"] = item.dropoff;
            if (item.extra_transport_passengers != null)
              validationItem["extra_transport_passengers"] = item.extra_transport_passengers;
            if (item.visa_country != null) validationItem["visa_country"] = item.visa_country;
            if (item.extra_transport_type != null)
              validationItem["extra_transport_type"] = item.extra_transport_type;

            return validationItem;
          }),
        })),
      }),
    [days, form],
  );

  const customerQuoteTotal = selectedCustomerQuote.pushed
    ? (selectedCustomerQuote.breakdown?.total ?? selectedCustomerQuoteTotals.total)
    : null;
  const customerQuotePackageOptions = (
    previewPackageOptions.length > 0
      ? previewPackageOptions
      : customerQuoteTotal !== null
        ? [{ id: "default-package", name: selectedHotelOption }]
        : []
  ).map((option) =>
    option.id === (selectedPreviewPackageId ?? previewPackageOptions[0]?.id ?? "default-package") &&
    customerQuoteTotal !== null
      ? {
          ...option,
          pricing: {
            final_customer_price: customerQuoteTotal,
            subtotal: customerQuoteTotal - (selectedCustomerQuote.breakdown?.gst ?? 0),
            tax: selectedCustomerQuote.breakdown?.gst ?? 0,
            per_person_price:
              selectedCustomerQuote.breakdown?.per_person ??
              (travellerCount > 0 ? customerQuoteTotal / travellerCount : null),
            pricing_mode: selectedCustomerQuote.mode,
            currency:
              selectedCustomerQuote.breakdown?.currency ?? selectedCustomerQuoteTotals.currency,
          },
        }
      : option,
  );
  const customerQuotePackageId =
    selectedPreviewPackageId ??
    previewPackageOptions[0]?.id ??
    (customerQuoteTotal !== null ? "default-package" : null);

  const sortedDays = useMemo(
    () => [...days].sort((left, right) => left.day_number - right.day_number),
    [days],
  );
  const displayedItineraryPhotos = useMemo(() => {
    const usedImageKeys = new Set<string>();
    const imageKeys = (photo: TripPhotoState) =>
      [
        photo.google_place_id ? `place:${photo.google_place_id}` : "",
        photo.storage_path ? `path:${photo.storage_path}` : "",
        photo.url ? `url:${photo.url}` : "",
      ].filter(Boolean);
    const dayScopedKeys = new Set(
      form.photos.filter((photo) => photo.day_id || photo.day_item_id).flatMap(imageKeys),
    );
    const takeIfUnique = (photo: TripPhotoState) => {
      const keys = imageKeys(photo);
      if (!keys.length || keys.some((key) => usedImageKeys.has(key))) return false;
      keys.forEach((key) => usedImageKeys.add(key));
      return true;
    };
    const coverPhoto =
      form.photos
        .filter((photo) => !photo.day_id && !photo.day_item_id)
        .sort((left, right) => left.sequence - right.sequence)
        .find(
          (photo) =>
            imageKeys(photo).every((key) => !dayScopedKeys.has(key)) && takeIfUnique(photo),
        ) ?? null;
    const dayPhotos = new Map<string, TripPhotoState>();
    for (const day of sortedDays) {
      const itemIds = new Set(
        day.items.map((item) => item.id).filter((id): id is string => Boolean(id)),
      );
      const photo = form.photos
        .filter(
          (entry) =>
            entry.day_id === day.id || Boolean(entry.day_item_id && itemIds.has(entry.day_item_id)),
        )
        .sort(
          (left, right) =>
            Number(Boolean(right.day_id)) - Number(Boolean(left.day_id)) ||
            left.sequence - right.sequence,
        )
        .find(takeIfUnique);
      if (photo) dayPhotos.set(day.id ?? `day-${day.day_number}`, photo);
    }
    return { coverPhoto, dayPhotos };
  }, [form.photos, sortedDays]);

  const previewData = useMemo(() => {
    try {
      return buildItineraryPresentation({
        itinerary: {
          title: form.title,
          destination:
            destinations.find((destination) => destination.id === form.destination_id)?.name ?? "",
          customer_name:
            linkedLead?.customer_name ||
            customers.find((customer) => customer.id === form.customer_id)?.full_name ||
            "",
          editor_content_html: sanitizeItineraryEditorHtml(form.document_html),
          travel_start_date: form.travel_start_date,
          travel_end_date: form.travel_end_date,
          adults: Number(form.adults) || 0,
          children: Number(form.children) || 0,
          inclusions: form.inclusions.filter((value) => value.trim()),
          exclusions: form.exclusions.filter((value) => value.trim()),
          cancellation_info: form.cancellation_info ?? "",
          terms_conditions: form.terms_conditions,
          custom_tables: tablesEnabled ? form.custom_tables : [],
          photos: displayedItineraryPhotos.coverPhoto
            ? [
                {
                  ...displayedItineraryPhotos.coverPhoto,
                  url: displayedItineraryPhotos.coverPhoto.storage_path
                    ? (photoDisplayUrls[displayedItineraryPhotos.coverPhoto.storage_path] ?? "")
                    : displayedItineraryPhotos.coverPhoto.url,
                },
              ]
            : [],
          days: sortedDays.map((day) => ({
            day_number: day.day_number,
            date: day.date,
            title: day.title,
            description: day.description,
            photos: (() => {
              const photo = displayedItineraryPhotos.dayPhotos.get(
                day.id ?? `day-${day.day_number}`,
              );
              return photo?.day_id
                ? [
                    {
                      ...photo,
                      url: photo.storage_path
                        ? (photoDisplayUrls[photo.storage_path] ?? "")
                        : photo.url,
                    },
                  ]
                : [];
            })(),
            items: day.items.map((item) => ({
              ...item,
              image_url:
                typeof item.metadata?.custom_hotel_photo_url === "string" &&
                item.metadata.custom_hotel_photo_url
                  ? item.metadata.custom_hotel_photo_url
                  : typeof item.metadata?.google_hotel_place_id === "string"
                    ? hotelPreviewPhotos[item.metadata.google_hotel_place_id]?.photoUri
                    : undefined,
              image_credit:
                item.item_type === "ACCOMMODATION"
                  ? !item.metadata?.custom_hotel_photo_url &&
                    typeof item.metadata?.google_hotel_place_id === "string"
                    ? hotelPreviewPhotos[item.metadata.google_hotel_place_id]?.authorAttributions
                        .map((entry) => entry.displayName)
                        .filter(Boolean)
                        .join(", ")
                    : undefined
                  : typeof item.metadata?.google_place_id === "string"
                    ? activityPreviewPhotos[item.metadata.google_place_id]?.imageCredit
                    : undefined,
              photos: (() => {
                const photo = displayedItineraryPhotos.dayPhotos.get(
                  day.id ?? `day-${day.day_number}`,
                );
                return photo?.day_item_id === item.id
                  ? [
                      {
                        ...photo,
                        url: photo.storage_path
                          ? (photoDisplayUrls[photo.storage_path] ?? "")
                          : photo.url,
                      },
                    ]
                  : [];
              })(),
              title: item.title,
              description: item.description,
              customer_facing_info: item.customer_facing_info,
              hotel_name: item.hotel_name,
              flight_airline: item.flight_airline,
              flight_number: item.flight_number,
              visa_country: item.visa_country,
              visa_type: item.visa_type,
              extra_transport_type: item.extra_transport_type,
            })),
          })),
        },
        template: previewTemplate,
        packageOptions: customerQuotePackageOptions,
        selectedPackageId: customerQuotePackageId,
        branding: {
          company_name: "SAVR Travels",
          header_text: "Tailor-made travel experiences",
          footer_text: "Thank you for choosing SAVR Travels.",
          signature_text: "Regards,\nThe SAVR Travels team",
        },
      });
    } catch {
      return buildItineraryPresentation({
        itinerary: {
          title: form.title || "Itinerary preview",
          destination:
            destinations.find((destination) => destination.id === form.destination_id)?.name ?? "",
          customer_name:
            linkedLead?.customer_name ||
            customers.find((customer) => customer.id === form.customer_id)?.full_name ||
            "",
          editor_content_html: sanitizeItineraryEditorHtml(form.document_html),
          travel_start_date: form.travel_start_date,
          travel_end_date: form.travel_end_date,
          adults: Number(form.adults) || 0,
          children: Number(form.children) || 0,
          inclusions: form.inclusions.filter((value) => value.trim()),
          exclusions: form.exclusions.filter((value) => value.trim()),
          cancellation_info: form.cancellation_info,
          terms_conditions: form.terms_conditions,
          custom_tables: tablesEnabled ? form.custom_tables : [],
          photos: displayedItineraryPhotos.coverPhoto
            ? [
                {
                  ...displayedItineraryPhotos.coverPhoto,
                  url: displayedItineraryPhotos.coverPhoto.storage_path
                    ? (photoDisplayUrls[displayedItineraryPhotos.coverPhoto.storage_path] ?? "")
                    : displayedItineraryPhotos.coverPhoto.url,
                },
              ]
            : [],
          days: sortedDays.map((day) => ({
            day_number: day.day_number,
            date: day.date,
            title: day.title,
            description: day.description,
            photos: (() => {
              const photo = displayedItineraryPhotos.dayPhotos.get(
                day.id ?? `day-${day.day_number}`,
              );
              return photo?.day_id
                ? [
                    {
                      ...photo,
                      url: photo.storage_path
                        ? (photoDisplayUrls[photo.storage_path] ?? "")
                        : photo.url,
                    },
                  ]
                : [];
            })(),
            items: day.items.map((item) => ({
              title: item.title,
              description: item.description,
              item_type: item.item_type,
              image_url:
                typeof item.metadata?.custom_hotel_photo_url === "string" &&
                item.metadata.custom_hotel_photo_url
                  ? item.metadata.custom_hotel_photo_url
                  : typeof item.metadata?.google_hotel_place_id === "string"
                    ? hotelPreviewPhotos[item.metadata.google_hotel_place_id]?.photoUri
                    : undefined,
              image_credit:
                item.item_type === "ACCOMMODATION"
                  ? !item.metadata?.custom_hotel_photo_url &&
                    typeof item.metadata?.google_hotel_place_id === "string"
                    ? hotelPreviewPhotos[item.metadata.google_hotel_place_id]?.authorAttributions
                        .map((entry) => entry.displayName)
                        .filter(Boolean)
                        .join(", ")
                    : undefined
                  : typeof item.metadata?.google_place_id === "string"
                    ? activityPreviewPhotos[item.metadata.google_place_id]?.imageCredit
                    : undefined,
              customer_facing_info: item.customer_facing_info,
              hotel_name: item.hotel_name,
              flight_airline: item.flight_airline,
              flight_number: item.flight_number,
              visa_country: item.visa_country,
              visa_type: item.visa_type,
              extra_transport_type: item.extra_transport_type,
              hotel_city: item.hotel_city,
              hotel_address: item.hotel_address,
              hotel_country: item.hotel_country,
              star_category: item.star_category,
              room_type: item.room_type,
              meal_plan: item.meal_plan,
              hotel_description: item.hotel_description,
              check_in: item.check_in,
              check_out: item.check_out,
              nights: item.nights,
              rooms: item.rooms,
              adults: item.adults,
              children: item.children,
              photos: (() => {
                const photo = displayedItineraryPhotos.dayPhotos.get(
                  day.id ?? `day-${day.day_number}`,
                );
                return photo?.day_item_id === item.id
                  ? [
                      {
                        ...photo,
                        url: photo.storage_path
                          ? (photoDisplayUrls[photo.storage_path] ?? "")
                          : photo.url,
                      },
                    ]
                  : [];
              })(),
            })),
          })),
        },
        template: previewTemplate,
        packageOptions:
          customerQuotePackageOptions.length > 0
            ? customerQuotePackageOptions
            : [{ id: "default-package", name: selectedHotelOption }],
        selectedPackageId:
          customerQuotePackageId ?? previewPackageOptions[0]?.id ?? "default-package",
        branding: {
          company_name: "SAVR Travels",
          header_text: "Tailor-made travel experiences",
          footer_text: "Thank you for choosing SAVR Travels.",
          signature_text: "Regards,\nThe SAVR Travels team",
        },
      });
    }
  }, [
    activitiesTransfersEnabled,
    activityPreviewPhotos,
    customerQuotePackageId,
    customerQuotePackageOptions,
    customers,
    days,
    destinations,
    form,
    hotelPreviewPhotos,
    hotelsEnabled,
    linkedLead?.customer_name,
    photoDisplayUrls,
    previewPackageOptions,
    previewTemplate,
    selectedPreviewPackageId,
    tablesEnabled,
  ]);

  useEffect(() => {
    setValidation(validationState);
  }, [validationState]);

  useEffect(() => {
    if (!form.travel_start_date || !form.travel_end_date) return;
    setDays((current) =>
      buildTripDaysFromDateRange(form.travel_start_date, form.travel_end_date, current),
    );
  }, [form.travel_start_date, form.travel_end_date]);

  useEffect(() => {
    if (previewPackageOptions.length > 0 && !selectedPreviewPackageId) {
      setSelectedPreviewPackageId(previewPackageOptions[0]?.id ?? null);
    }
  }, [previewPackageOptions, selectedPreviewPackageId]);

  function downloadPreviewPdf() {
    const win = window.open("", "_blank", "width=1200,height=1400");
    if (!win) {
      setMessage("Unable to open PDF preview window.");
      return;
    }

    const documentTitle = form.title?.trim() || previewData.summary || "Itinerary";
    const html = buildItineraryPdfHtml(previewData);
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>${documentTitle}</title></head><body>${html}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 400);
  }

  async function addImagesToSavedItinerary() {
    setAddingImages(true);
    setImageEnrichment(null);
    setImageEnrichmentError(null);
    try {
      const destination = destinations.find((entry) => entry.id === form.destination_id);
      const draftDays = days.map((day) => ({ ...day, id: day.id ?? crypto.randomUUID() }));
      if (!currentItineraryId) setDays(draftDays);
      const result = currentItineraryId
        ? await addItineraryImages({ data: { itineraryId: currentItineraryId } })
        : await addItineraryImages({
            data: {
              draft: {
                title: form.title || destinationName || "Itinerary",
                destinationName: destination?.name || destinationName || form.title,
                destinationCountry: destination?.country || "",
                existingPhotoDayIds: form.photos.flatMap((photo) => {
                  const dayId =
                    photo.day_id ??
                    (photo.day_item_id
                      ? draftDays.find((day) =>
                          day.items.some((item) => item.id === photo.day_item_id),
                        )?.id
                      : null);
                  return dayId ? [dayId] : [];
                }),
                existingGooglePlaceIds: form.photos.flatMap((photo) =>
                  photo.google_place_id ? [photo.google_place_id] : [],
                ),
                days: draftDays.map((day) => ({
                  id: day.id,
                  day_number: day.day_number,
                  date: day.date,
                  title: day.title,
                  description: day.description,
                  notes: day.notes,
                  items: day.items.map((item) => ({
                    item_type: item.item_type,
                    title: item.title,
                    location: item.location,
                    description: item.description,
                    hotel_city: item.hotel_city,
                    dropoff: item.dropoff,
                  })),
                })),
              },
            },
          });
      setImageEnrichment(result);
      const addedPhotos = result.days.flatMap((dayResult) => {
        const photo = dayResult.photo;
        if (!photo) return [];
        return [
          {
            id: photo.id,
            day_id: photo.day_id,
            day_item_id: photo.day_item_id,
            url: photo.url ?? "",
            storage_path: photo.storage_path,
            caption: photo.caption ?? "",
            alt_text: photo.alt_text ?? "",
            sequence: photo.sequence,
            source: photo.source,
            selection_type: photo.selection_type,
            is_primary: photo.is_primary,
            google_place_id: photo.google_place_id,
            place_name: photo.place_name,
            google_photo_reference: photo.google_photo_reference,
            attribution: photo.attribution,
          } satisfies TripPhotoState,
        ];
      });
      if (addedPhotos.length) {
        setForm((current) => {
          const knownIds = new Set(
            current.photos.map((photo) => photo.id).filter((id): id is string => Boolean(id)),
          );
          return {
            ...current,
            photos: [
              ...current.photos,
              ...addedPhotos.filter((photo) => !photo.id || !knownIds.has(photo.id)),
            ],
          };
        });
      }
      if (result.added > 0)
        toast.success(
          `Added itinerary photos for ${result.added} day${result.added === 1 ? "" : "s"}.`,
        );
      else if (result.failed > 0 || result.notFound > 0)
        toast.info("No new itinerary photos were added. Review the per-day results.");
      else toast.success("All existing day images were kept.");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not add itinerary images.";
      setImageEnrichmentError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setAddingImages(false);
    }
  }

  addImagesToSavedItineraryRef.current = addImagesToSavedItinerary;

  async function generateShareLink() {
    if (!currentItineraryId) {
      setMessage("Save the itinerary before creating a customer share link.");
      return;
    }

    setShareGenerating(true);
    setShareCopied(false);
    setMessage(null);
    try {
      const pushedQuote = form.customer_quotes[selectedHotelOption];
      const pushedQuoteTotals = pushedQuote
        ? calculateItineraryCustomerQuote(pushedQuote, travellerCount)
        : null;
      const result = await createItineraryShare({
        data: {
          itineraryId: currentItineraryId,
          packageId: selectedPreviewPackageId,
          template: previewTemplate,
          expiresInDays: 30,
          customerPricing:
            pushedQuote?.pushed && pushedQuoteTotals
              ? {
                  total: pushedQuote.breakdown?.total ?? pushedQuoteTotals.total,
                  perPerson:
                    pushedQuote.breakdown?.per_person ??
                    (pushedQuote.mode === "per_person"
                      ? pushedQuoteTotals.unitTotal
                      : travellerCount > 0
                        ? pushedQuoteTotals.total / travellerCount
                        : 0),
                  tax: pushedQuote.breakdown?.gst ?? 0,
                  currency: pushedQuote.breakdown?.currency ?? pushedQuoteTotals.currency,
                  mode: pushedQuote.mode,
                }
              : null,
        },
      });
      const url = buildPublicItineraryShareUrl(window.location.origin, result.token);
      setShareUrl(url);
      setShareLinkDialogOpen(true);
      setMessage(
        `Customer share link ready. It expires on ${new Date(result.expiresAt ?? Date.now()).toLocaleDateString()}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create the customer share link.",
      );
    } finally {
      setShareGenerating(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      toast.success("Customer share link copied");
    } catch {
      setShareCopied(false);
      toast.error("Could not copy automatically. Select the link and copy it.");
    }
  }

  function updateTermsFromAiDetails(text: string) {
    setSupplierDetails(text);
    const extracted = extractItineraryTermsFromText(text) ?? {
      inclusions: "",
      exclusions: "",
      cancellation_info: "",
      terms_conditions: "",
    };
    const safeValue = (value: string) => (value.trim() ? sanitizeItineraryTermHtml(value) : "");
    const inclusions = safeValue(extracted.inclusions);
    const exclusions = safeValue(extracted.exclusions);
    setForm((current) => ({
      ...current,
      inclusions: inclusions ? [inclusions] : [],
      exclusions: exclusions ? [exclusions] : [],
      cancellation_info: safeValue(extracted.cancellation_info),
      terms_conditions: safeValue(extracted.terms_conditions),
    }));
  }

  async function generateDraftFromPrompt(
    savedServices: AiSavedService[],
    tickets: ItineraryTicketFacts[],
    sourceText?: string,
  ) {
    if (sourceText?.trim()) {
      const ticketFacts =
        tickets.length > 0
          ? `SAVED FLIGHT/TRAIN FACTS (preserve exactly):\n${JSON.stringify(tickets, null, 2)}`
          : "";
      await extractSupplierDraftFromText(
        [sourceText.trim(), ticketFacts].filter(Boolean).join("\n\n"),
      );
      return;
    }
    if (savedServices.length === 0 && tickets.length === 0) {
      setMessage("There is not enough itinerary information to generate an itinerary.");
      return;
    }
    const currentEditorText = itineraryEditorRef.current?.innerText.trim() ?? "";
    if (
      (form.document_html.trim() || currentEditorText) &&
      !window.confirm(
        "Generate a new AI itinerary? This will replace the current itinerary content.",
      )
    )
      return;

    setSaving(true);
    setMessage(null);
    try {
      const generatedText = await formatItinerary({ data: { savedServices, tickets } });
      const generatedHtml = itineraryTextToSafeHtml(generatedText);
      if (itineraryEditorRef.current) {
        itineraryEditorRef.current.innerHTML = sanitizeItineraryEditorHtml(generatedHtml);
        setItineraryEditorEmpty(!generatedText.trim());
      }
      setForm((current) => ({ ...current, document_html: generatedHtml }));
      setMessage(
        "AI-formatted itinerary is ready in the editor. Review and edit it before saving.",
      );
    } catch (error) {
      const failureCode = error instanceof Error ? error.message : "";
      if (failureCode.includes("ITINERARY_FORMATTER_AUTH_FAILURE")) {
        setMessage(
          "The AI provider rejected its configured credentials. Ask your administrator to update the server OpenAI API key.",
        );
      } else if (failureCode.includes("ITINERARY_FORMATTER_RATE_LIMITED")) {
        setMessage(
          "The AI provider is rate-limited or out of quota. Try again later or check the provider account.",
        );
      } else if (failureCode.includes("ITINERARY_FORMATTER_NOT_CONFIGURED")) {
        setMessage(
          "AI itinerary generation is not configured on the server. Configure the OpenAI API key and model, then retry.",
        );
      } else if (failureCode.includes("ITINERARY_FORMATTER_INVALID_RESPONSE")) {
        const countFailure = /ITINERARY_FORMATTER_INVALID_RESPONSE:COUNT:(\d{1,4}):(\d{1,4})/.exec(
          failureCode,
        );
        setMessage(
          countFailure
            ? `OpenAI returned ${countFailure[1]} itinerary entries for ${countFailure[2]} saved services/tickets. Your existing content was kept; please retry.`
            : "OpenAI returned an invalid itinerary response. Your existing content was kept; please retry.",
        );
      } else if (failureCode.includes("ITINERARY_FORMATTER_UNSAFE_OUTPUT")) {
        setMessage(
          "The generated itinerary included pricing or internal information and was blocked. Your existing content was kept; please retry.",
        );
      } else if (failureCode.includes("ITINERARY_FORMATTER_FACTS_CHANGED")) {
        setMessage(
          "The generated itinerary changed or omitted a saved date, time, route, or other supplied fact, so it was blocked. Your existing content was kept; please retry.",
        );
      } else if (failureCode.includes("ITINERARY_FORMATTER_UNGROUNDED_DESCRIPTION")) {
        const rejectedDescription =
          /ITINERARY_FORMATTER_UNGROUNDED_DESCRIPTION:(\d{1,3}):([a-z -]{1,40})/i.exec(failureCode);
        setMessage(
          rejectedDescription
            ? `OpenAI added an unsupported service detail (“${rejectedDescription[2]}”) to source item ${Number(rejectedDescription[1]) + 1}; the draft was blocked and your existing content was kept.`
            : "The AI added unsupported description details, so its draft was blocked. Your existing content was kept; please retry.",
        );
      } else if (failureCode.includes("ITINERARY_FORMATTER_PROVIDER_FAILURE")) {
        const providerFailure =
          /ITINERARY_FORMATTER_PROVIDER_FAILURE:(\d{3}|unknown):([a-z0-9_-]{1,80})/i.exec(
            failureCode,
          );
        setMessage(
          providerFailure
            ? `OpenAI request failed (${providerFailure[1]}, ${providerFailure[2]}). Your existing content was kept; check the OpenAI model configuration and provider account.`
            : "OpenAI request failed. Your existing content was kept; check the server configuration and provider account.",
        );
      } else {
        setMessage(
          savedServices.length || tickets.length
            ? "AI generation failed. Your existing content was kept. Check the server/provider connection and try again."
            : "There is not enough itinerary information to generate an itinerary.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function acceptTravelPlannerPlan(plan: TripPlan, requirements: string): Promise<boolean> {
    const nextDays: TripDay[] = plan.days.map((plannedDay) => {
      const existing = plannedDay.date
        ? (days.find((day) => day.date === plannedDay.date) ??
          days.find((day) => !day.date && day.day_number === plannedDay.day))
        : days.find((day) => day.day_number === plannedDay.day);
      const existingNotes = existing?.notes.trim();
      return {
        ...(existing?.id ? { id: existing.id } : { id: crypto.randomUUID() }),
        day_number: plannedDay.day,
        date: plannedDay.date ?? existing?.date ?? "",
        title: plannedDay.title || `Day ${plannedDay.day}`,
        description: travelPlanDayDescription(
          plannedDay,
          /\b(?:hotels?|accommodations?|lodges?|hostels?|resorts?|check[ -]in|check[ -]out)\b/i.test(
            requirements,
          ),
        ),
        notes: [existingNotes, plannedDay.why_this_day].filter(Boolean).join("\n"),
        items: [...(existing?.items ?? [])],
      };
    });

    const generatedHtml = itineraryTextToSafeHtml(travelPlanToDocumentText(plan, requirements));
    const plannerFormOverride: Partial<TripForm> = {
      title: plan.trip_summary.title,
      destination_id: null,
      travel_start_date: plan.trip_summary.start_date ?? form.travel_start_date,
      travel_end_date: plan.trip_summary.end_date ?? form.travel_end_date,
      adults: String(plan.understood_request.adults ?? (Number(form.adults) || 0)),
      children: String(plan.understood_request.children ?? (Number(form.children) || 0)),
    };
    const saved = await saveItinerary(
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      nextDays,
      generatedHtml,
      plannerFormOverride,
      true,
    );
    if (!saved) return false;
    setForm((current) => ({ ...current, ...plannerFormOverride, document_html: generatedHtml }));
    setDays(nextDays);
    setActiveSection("day");
    setMessage(
      "AI itinerary created in the editor and saved as a draft. You can review and edit it in the white workspace.",
    );
    return true;
  }

  async function acceptCompleteItinerary(
    plan: CompleteItineraryPlan,
    text: string,
    requirements: string,
    includeHotels: boolean,
  ): Promise<boolean> {
    if (!text.trim()) {
      setMessage("The complete itinerary draft is empty.");
      return false;
    }
    const generatedHtml = sanitizeItineraryEditorHtml(itineraryTextToSafeHtml(text));
    const existingItemsByDate = new Map(
      days.map((day) => [
        day.date || `day:${day.day_number}`,
        day.items.map((item) => ({
          item_type: item.item_type,
          check_in: item.check_in,
          check_out: item.check_out,
        })),
      ]),
    );
    const plannedStays = includeHotels
      ? buildPlannedHotelStays(plan, requirements, existingItemsByDate)
      : [];
    const nextDays = [...days];
    const generatedHotelIds = new Set<string>();
    for (const stay of plannedStays) {
      let dayIndex = nextDays.findIndex((day) => day.day_number === stay.day_number);
      if (dayIndex < 0 && stay.date) dayIndex = nextDays.findIndex((day) => day.date === stay.date);
      if (dayIndex < 0) {
        while (!nextDays.some((day) => day.day_number === stay.day_number)) {
          const nextDayNumber = Math.max(0, ...nextDays.map((day) => day.day_number)) + 1;
          nextDays.push({
            day_number: nextDayNumber,
            date: "",
            title: `Day ${nextDayNumber}`,
            description: "",
            notes: "",
            items: [],
          });
        }
        dayIndex = nextDays.findIndex((day) => day.day_number === stay.day_number);
      }
      const day = nextDays[dayIndex]!;
      const hotelItem: TripDayItemState = {
        ...defaultItemForType("ACCOMMODATION", day.items.length + 1),
        title: `Hotel — ${stay.city}`,
        hotel_name: "",
        hotel_city: stay.city,
        hotel_address: "",
        check_in: stay.check_in,
        check_out: stay.check_out,
        nights: stay.nights,
        star_category: stay.star_category,
        room_type: stay.room_type,
        rooms: stay.rooms,
        adults: stay.adults,
        children: stay.children,
        extra_beds: stay.extra_beds,
        meal_plan: stay.meal_plan,
        room_details: JSON.stringify(stay.room_details),
        customer_facing_info: "",
        hotel_description: "",
        package_id: selectedPreviewPackageId,
        metadata: {
          check_in_time: "15:00",
          check_out_time: "11:00",
          room_details: stay.room_details,
          hotel_search_query:
            `${stay.star_category ? `${stay.star_category} ` : ""}${stay.hotel_requirement}`.slice(
              0,
              120,
            ),
          auto_select_google_hotel: true,
          hotel_suggestion: true,
          hotel_saved: false,
          hotel_option_label: "Option 1",
          hotel_option_sequence: 0,
        },
      };
      if (hotelItem.id) generatedHotelIds.add(hotelItem.id);
      nextDays[dayIndex] = {
        ...day,
        date: day.date || stay.date,
        items: [...day.items, hotelItem],
      };
    }
    const orderedDays = [...nextDays]
      .sort((left, right) => left.day_number - right.day_number)
      .map((day, index) => ({
        ...day,
        id: day.id ?? crypto.randomUUID(),
        day_number: index + 1,
        items: day.items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })),
      }));
    if (itineraryEditorRef.current) {
      itineraryEditorRef.current.innerHTML = generatedHtml;
      setItineraryEditorEmpty(false);
    }
    setForm((current) => ({ ...current, document_html: generatedHtml }));
    setHotelsEnabled(plannedStays.length > 0 || hotelsEnabled);
    setMessage(null);
    const itineraryDaysWithoutGeneratedHotels = orderedDays.map((day) => ({
      ...day,
      items: day.items.filter((item) => !item.id || !generatedHotelIds.has(item.id)),
    }));
    const saved = await saveItinerary(
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      itineraryDaysWithoutGeneratedHotels,
      generatedHtml,
    );
    if (!saved) return false;
    setDays(orderedDays);
    if (plannedStays.length > 0) {
      setActiveSection("hotels");
      setHotelsDialogOpen(true);
    }
    return saved;
  }

  async function extractSupplierTextFromFile(input: {
    sourceText?: string;
    destinationText?: string;
    fileName?: string;
    mimeType?: string;
    fileBase64?: string;
  }): Promise<string | null> {
    setSaving(true);
    setMessage("Opening supplier document…");
    try {
      const browserRuntime = isBrowserRuntime() && typeof atob === "function";
      let extractedText: string | null = null;
      if (browserRuntime && input.fileBase64 && input.fileName) {
        const binary = atob(input.fileBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1)
          bytes[index] = binary.charCodeAt(index);
        const candidate = await extractDocumentCandidate({
            fileName: input.fileName,
            mimeType: input.mimeType ?? "application/octet-stream",
            file: bytes as unknown as Buffer,
        }, (progress) => {
            const pageLabel =
              progress.page && progress.totalPages
                ? `Page ${progress.page} of ${progress.totalPages}`
                : "PDF";
            if (progress.stage === "loading_ocr") {
            setMessage("Loading on-device OCR engine. The first scanned document can take longer.");
            } else if (progress.stage === "recognizing") {
              setMessage(`Extracting text from ${pageLabel}…`);
            } else {
              setMessage(`Reading ${pageLabel}…`);
            }
        });
        extractedText = candidate.text.trim();
        if (!extractedText && browserRuntime) {
          setSupplierDetails(null);
          setMessage(
            candidate.reason ??
              "Unable to read this PDF automatically. Please review or enter the details manually.",
          );
          return null;
        }
      }
      if (!extractedText && !browserRuntime) {
        const extracted = await extractSupplierText({ data: input });
        extractedText = extracted.text;
      }
      setSupplierDetails(extractedText);
      setMessage(
        extractedText
          ? `Extracted ${extractedText.length.toLocaleString()} characters. Review or edit the text before creating the itinerary draft.`
          : "Unable to read this PDF automatically. Please review or enter the details manually.",
      );
      return extractedText;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to extract supplier document text.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function extractSupplierDraftFromText(
    sourceText: string,
    options?: { destinationText?: string; quickPreview?: boolean },
  ) {
    setSaving(true);
    setMessage(null);
    try {
      const destinationText = options?.destinationText?.trim() || destinationName?.trim();
      const extracted = await extractSupplier({
        data: { sourceText, ...(destinationText ? { destinationText } : {}) },
      });
      sessionStorage.setItem("itinerary-supplier-draft", JSON.stringify(extracted));
      const params = new URLSearchParams({
        supplierDraft: "1",
        ...(options?.quickPreview ? { quickPreview: "1" } : {}),
      });
      if (form.lead_id) params.set("leadId", form.lead_id);
      window.location.assign(`/itinerary-builder?${params.toString()}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import supplier itinerary.");
    } finally {
      setSaving(false);
    }
  }

  const fetchSupplierHotelDetails = useCallback(
    async (
      item: TripDayItemState,
      destination: string,
    ): Promise<Partial<TripDayItemState> | null> => {
      const query = (item.hotel_name || item.title || "").trim();
      if (query.length < 3 || item.metadata?.google_hotel_place_id) return null;
      try {
        const searchResult = await lookupGooglePlacesRef.current({
          data: {
            action: "search",
            query,
            destination: item.hotel_city || destination,
            placeType: "hotel",
          },
        });
        if (!Array.isArray(searchResult)) return null;
        const match = firstGoogleHotelMatch(searchResult as GoogleActivityPlace[]);
        if (!match) return null;
        const detailsResult = await lookupGooglePlacesRef.current({
          data: { action: "details", placeId: match.id },
        });
        if (!detailsResult || Array.isArray(detailsResult) || typeof detailsResult === "string") {
          return null;
        }
        const hotel = detailsResult as GoogleActivityPlace;
        return {
          hotel_name: item.hotel_name || hotel.name || match.name,
          title: item.hotel_name || hotel.name || match.name,
          hotel_address: item.hotel_address || hotel.address || match.address,
          hotel_city: item.hotel_city || destination,
          hotel_description:
            item.hotel_description || hotel.description || match.description || "",
          customer_facing_info:
            item.customer_facing_info || hotel.description || match.description || "",
          metadata: {
            ...(item.metadata ?? {}),
            google_hotel_place_id: hotel.id || match.id,
            google_hotel_website: hotel.website ?? match.website ?? "",
            google_hotel_phone: hotel.phone ?? match.phone ?? "",
            google_hotel_rating: hotel.rating ?? match.rating ?? "",
            google_hotel_reviews: hotel.reviews ?? match.reviews ?? "",
            google_hotel_maps_url: hotel.mapsUrl ?? match.mapsUrl ?? "",
            google_hotel_description: hotel.description || match.description || "",
            google_hotel_types: hotel.types.join(", "),
          },
        };
      } catch (error) {
        console.warn("[Itinerary builder] Could not fetch imported hotel details.", error);
        return null;
      }
    },
    [],
  );

  const fetchSupplierActivityDetails = useCallback(
    async (
      item: TripDayItemState,
      destination: string,
    ): Promise<Partial<TripDayItemState> | null> => {
      const query = (item.title || "").trim();
      if (
        query.length < 3 ||
        (typeof item.metadata?.["google_place_id"] === "string" &&
          item.metadata["google_place_id"])
      ) {
        return null;
      }
      try {
        const searchResult = await lookupGooglePlacesRef.current({
          data: {
            action: "search",
            query,
            destination: item.location || destination,
            placeType: "activity",
          },
        });
        if (!Array.isArray(searchResult) || searchResult.length === 0) return null;
        const match = searchResult[0] as GoogleActivityPlace;
        const detailsResult = await lookupGooglePlacesRef.current({
          data: { action: "details", placeId: match.id },
        });
        if (!detailsResult || Array.isArray(detailsResult) || typeof detailsResult === "string") {
          return null;
        }
        const activity = detailsResult as GoogleActivityPlace;
        return {
          metadata: {
            ...(item.metadata ?? {}),
            google_place_id: activity.id || match.id,
            google_maps_url: activity.mapsUrl ?? match.mapsUrl ?? "",
            google_activity_website: activity.website ?? match.website ?? "",
            google_activity_phone: activity.phone ?? match.phone ?? "",
            google_activity_rating: activity.rating ?? match.rating ?? "",
            google_activity_reviews: activity.reviews ?? match.reviews ?? "",
            google_activity_types: activity.types.join(", "),
            google_activity_opening_hours: activity.openingHours,
          },
        };
      } catch (error) {
        console.warn("[Itinerary builder] Could not fetch imported activity details.", error);
        return null;
      }
    },
    [],
  );

  async function extractSupplierDraft(input: {
      sourceText?: string;
      destinationText?: string;
      fileName?: string;
      mimeType?: string;
      fileBase64?: string;
  }, options?: { quickPreview?: boolean }) {
    const extractedText = await extractSupplierTextFromFile(input);
    if (extractedText)
      await extractSupplierDraftFromText(extractedText, {
        ...(input.destinationText ? { destinationText: input.destinationText } : {}),
        ...(options?.quickPreview !== undefined
          ? { quickPreview: options.quickPreview }
          : {}),
      });
  }

  async function loadSavedItinerary(
    itineraryId: string,
    options?: { copyForCustomerId?: string | null; createLibraryCopy?: boolean },
  ) {
    const isCopy = options !== undefined;
    const customerCopy = isCopy && !options.createLibraryCopy;
    const { data: itinerary, error: itineraryError } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", itineraryId)
      .maybeSingle();

    if (itineraryError) throw itineraryError;
    if (!itinerary) {
      if (isCopy) throw new Error("The source itinerary could not be found.");
      return;
    }

    savedTermsSnapshotRef.current = buildItineraryTermsSnapshot({
      inclusions: Array.isArray(itinerary.inclusions)
        ? itinerary.inclusions.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [],
      exclusions: Array.isArray(itinerary.exclusions)
        ? itinerary.exclusions.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [],
      cancellation_info:
        typeof itinerary.cancellation_info === "string" ? itinerary.cancellation_info : "",
      terms_conditions:
        typeof itinerary.terms_conditions === "string" ? itinerary.terms_conditions : "",
    });

    const { data: packageRows, error: packageError } = await supabase
      .from("itinerary_package_options")
      .select("*")
      .eq("itinerary_id", itineraryId)
      .order("sequence", { ascending: true });
    if (packageError && options?.createLibraryCopy) throw packageError;
    const loadedPackageRows = packageRows ?? [];
    const packageIdMap = new Map(
      loadedPackageRows.map((packageRow) => [
        packageRow.id,
        options?.createLibraryCopy ? crypto.randomUUID() : packageRow.id,
      ]),
    );
    if (
      options?.createLibraryCopy &&
      itinerary.package_id &&
      !packageIdMap.has(itinerary.package_id)
    ) {
      throw new Error("The itinerary's selected package could not be copied.");
    }

    const customTableCandidates = Array.isArray(
      (itinerary as Record<string, unknown>)["custom_tables"],
    )
      ? ((itinerary as Record<string, unknown>)["custom_tables"] as Array<Record<string, unknown>>)
      : [];

    setCopyMetadata(
      options?.createLibraryCopy
        ? {
            currency: itinerary.currency,
            description: itinerary.description,
            exchange_rate: itinerary.exchange_rate,
            exchange_rate_updated_at: itinerary.exchange_rate_updated_at,
            hotel_category: itinerary.hotel_category,
            package_id: itinerary.package_id
              ? (packageIdMap.get(itinerary.package_id) ?? null)
              : null,
            price: itinerary.price,
            price_inr: itinerary.price_inr,
            summary: itinerary.summary,
            trip_type: itinerary.trip_type,
            valid_from: itinerary.valid_from,
            valid_until: itinerary.valid_until,
          }
        : {},
    );

    const sourceCustomerQuotes = normalizeItineraryCustomerQuotes(
      (itinerary as Record<string, unknown>)["customer_quotes"],
    );
    const copiedCustomerQuotes = options?.createLibraryCopy
      ? Object.fromEntries(
          Object.entries(sourceCustomerQuotes).map(([packageId, quote]) => [
            packageIdMap.get(packageId) ?? packageId,
            quote,
          ]),
        )
      : sourceCustomerQuotes;

    setCurrentItineraryId(isCopy ? null : itineraryId);
    setCopyMode(customerCopy);
    const copyCustomer = options?.copyForCustomerId
      ? customers.find((customer) => customer.id === options.copyForCustomerId)
      : null;
    setForm((current) => ({
      ...current,
      title: customerCopy
        ? new URLSearchParams(window.location.search).get("copyName")?.trim() ||
          `${typeof itinerary.title === "string" ? itinerary.title : current.title}${copyCustomer ? ` — ${copyCustomer.full_name}` : ""}`
        : options?.createLibraryCopy
          ? buildItineraryCopyTitle(
              typeof itinerary.name === "string" && itinerary.name.trim()
                ? itinerary.name
                : typeof itinerary.title === "string"
                  ? itinerary.title
                  : current.title,
            )
          : typeof itinerary.title === "string"
            ? itinerary.title
            : current.title,
      destination_id: itinerary.destination_id ?? "",
      travel_start_date: itinerary.travel_start_date ?? "",
      travel_end_date: itinerary.travel_end_date ?? "",
      adults: String(itinerary.adults ?? 0),
      children: String(itinerary.children ?? 0),
      assigned_to: itinerary.assigned_to ?? "",
      customer_id: isCopy ? (options?.copyForCustomerId ?? "") : (itinerary.customer_id ?? ""),
      lead_id: isCopy ? "" : (itinerary.lead_id ?? ""),
      enquiry_id: isCopy ? "" : (itinerary.enquiry_id ?? ""),
      customer_quotes: customerCopy ? {} : copiedCustomerQuotes,
      status: isCopy ? "DRAFT" : itinerary.status === "READY" ? "READY" : "DRAFT",
      inclusions: Array.isArray(itinerary.inclusions)
        ? itinerary.inclusions.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : current.inclusions,
      exclusions: Array.isArray(itinerary.exclusions)
        ? itinerary.exclusions.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : current.exclusions,
      cancellation_info:
        typeof itinerary.cancellation_info === "string"
          ? itinerary.cancellation_info
          : current.cancellation_info,
      terms_conditions:
        typeof itinerary.terms_conditions === "string"
          ? itinerary.terms_conditions
          : current.terms_conditions,
      document_html:
        typeof (itinerary as Record<string, unknown>).document_html === "string"
          ? String((itinerary as Record<string, unknown>).document_html)
          : current.document_html,
      custom_tables:
        customTableCandidates.length > 0
          ? customTableCandidates.map((table) => ({
              ...(typeof table["id"] === "string"
                ? { id: isCopy ? crypto.randomUUID() : table["id"] }
                : {}),
              title: typeof table["title"] === "string" ? table["title"] : "Custom table",
              columns: Array.isArray(table["columns"])
                ? table["columns"].filter(
                    (value: unknown): value is string => typeof value === "string",
                  )
                : ["Column 1"],
              rows: Array.isArray(table["rows"])
                ? table["rows"].map((row: unknown) =>
                    Array.isArray(row) ? row.map((cell: unknown) => String(cell ?? "")) : [],
                  )
                : [[""]],
            }))
          : current.custom_tables,
    }));

    const { data: savedDays, error: daysError } = await supabase
      .from("itinerary_days")
      .select("*")
      .eq("itinerary_id", itineraryId)
      .order("day_number", { ascending: true });
    if (daysError) throw daysError;
    const { data: savedItems, error: itemsError } = await supabase
      .from("itinerary_day_items")
      .select("*")
      .in(
        "itinerary_day_id",
        (savedDays ?? []).map((day) => day.id),
      )
      .order("sequence", { ascending: true });
    if (itemsError) throw itemsError;
    if (
      options?.createLibraryCopy &&
      (savedItems ?? []).some((item) => item.package_id && !packageIdMap.has(item.package_id))
    ) {
      throw new Error("A package linked to this itinerary could not be copied.");
    }
    const dayIdMap = new Map(
      (savedDays ?? []).map((day) => [day.id, isCopy ? crypto.randomUUID() : day.id]),
    );
    const itemIdMap = new Map(
      (savedItems ?? []).map((item) => [item.id, isCopy ? crypto.randomUUID() : item.id]),
    );
    setDays(
      (savedDays ?? []).map((day) => ({
        id: dayIdMap.get(day.id) ?? day.id,
        day_number: day.day_number,
        date: day.day_date ?? "",
        title: day.title ?? "",
        description: day.description ?? "",
        notes: day.notes ?? "",
        items: (savedItems ?? [])
          .filter((item) => item.itinerary_day_id === day.id)
          .map((item) => ({
            id: itemIdMap.get(item.id) ?? item.id,
            itinerary_day_id: dayIdMap.get(item.itinerary_day_id) ?? item.itinerary_day_id,
            package_id:
              options?.createLibraryCopy && item.package_id
                ? (packageIdMap.get(item.package_id) ?? null)
                : isCopy
                  ? null
                  : item.package_id,
            item_type: item.item_type as TripDayItemState["item_type"],
            title: item.title,
            description: item.description,
            location: item.location,
            duration: item.duration,
            notes: item.notes,
            pickup: item.pickup,
            dropoff: item.dropoff,
            departure_time: item.departure_time,
            arrival_time: item.arrival_time,
            vehicle_details: item.vehicle_details,
            meal_type: item.meal_type as TripDayItemState["meal_type"],
            hotel_name: item.hotel_name,
            hotel_city: item.hotel_city,
            check_in: item.check_in,
            check_out: item.check_out,
            room_details: item.room_details,
            hotel_address: item.hotel_address,
            hotel_country: item.hotel_country,
            star_category: item.star_category,
            nights: item.nights,
            room_type: item.room_type,
            rooms: item.rooms,
            adults: item.adults,
            children: item.children,
            extra_beds: item.extra_beds,
            meal_plan: item.meal_plan,
            hotel_description: item.hotel_description,
            customer_facing_info: item.customer_facing_info,
            hotel_option_group: item.hotel_option_group,
            hotel_option_label: item.hotel_option_label,
            hotel_option_sequence: item.hotel_option_sequence,
            flight_airline: item.flight_airline,
            flight_number: item.flight_number,
            departure_airport: item.departure_airport,
            departure_city: item.departure_city,
            arrival_airport: item.arrival_airport,
            arrival_city: item.arrival_city,
            flight_departure_date: item.flight_departure_date,
            flight_departure_time: item.flight_departure_time,
            flight_arrival_date: item.flight_arrival_date,
            flight_arrival_time: item.flight_arrival_time,
            flight_cabin: item.flight_cabin,
            baggage_information: item.baggage_information,
            flight_duration: item.flight_duration,
            flight_price: item.flight_price,
            flight_currency: item.flight_currency,
            visa_country: item.visa_country,
            visa_type: item.visa_type,
            visa_validity: item.visa_validity,
            visa_processing_time: item.visa_processing_time,
            visa_required_documents: item.visa_required_documents,
            visa_entry_exit_information: item.visa_entry_exit_information,
            visa_customer_information: item.visa_customer_information,
            extra_transport_type: item.extra_transport_type,
            extra_transport_date: item.extra_transport_date,
            extra_transport_pickup_time: item.extra_transport_pickup_time,
            extra_transport_drop_time: item.extra_transport_drop_time,
            extra_transport_vehicle_type: item.extra_transport_vehicle_type,
            extra_transport_vehicle_details: item.extra_transport_vehicle_details,
            extra_transport_driver_details: item.extra_transport_driver_details,
            extra_transport_passengers: item.extra_transport_passengers,
            extra_transport_customer_notes: item.extra_transport_customer_notes,
            metadata:
              item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
                ? (item.metadata as Record<string, unknown>)
                : {},
            sequence: item.sequence,
          })),
      })),
    );

    const { data: costRows, error: costError } = await supabase
      .from("itinerary_cost_lines")
      .select("*")
      .eq("itinerary_id", itineraryId)
      .order("sequence", { ascending: true });

    if (costError && isCopy) throw costError;
    if (!costError && costRows) {
      setCostLines(
        costRows.map((line) =>
          createItineraryCostLine({
            id: isCopy ? crypto.randomUUID() : line.id,
            itinerary_id: line.itinerary_id,
            itinerary_item_id: line.itinerary_item_id
              ? isCopy
                ? (itemIdMap.get(line.itinerary_item_id) ?? null)
                : line.itinerary_item_id
              : null,
            cost_category: line.cost_category as ItineraryCostLine["cost_category"],
            description: line.description,
            supplier_ref: line.supplier_ref ?? null,
            quantity: line.quantity,
            unit: line.unit,
            unit_cost: line.unit_cost,
            unit_cost_inr: line.unit_cost_inr ?? null,
            currency: line.currency,
            total_cost: line.total_cost,
            total_cost_inr: line.total_cost_inr ?? null,
            exchange_rate: line.exchange_rate ?? null,
            exchange_rate_updated_at: line.exchange_rate_updated_at ?? null,
            notes: line.notes ?? null,
            sequence: line.sequence,
            source: (line.source ?? "manual") as ItineraryCostLine["source"],
            source_reference: line.source_reference ?? null,
          }),
        ),
      );
    }

    const { data: photoRows, error: photoError } = await supabase
      .from("itinerary_photos")
      .select("*")
      .eq("itinerary_id", itineraryId)
      .order("sequence", { ascending: true });

    if (photoError && isCopy) throw photoError;
    if (
      isCopy &&
      photoRows?.some(
        (photo) =>
          (photo.day_id && !dayIdMap.has(photo.day_id)) ||
          (photo.day_item_id && !itemIdMap.has(photo.day_item_id)),
      )
    ) {
      throw new Error("A photo linked to this itinerary could not be copied.");
    }
    if (!photoError && photoRows) {
      setForm((current) => ({
        ...current,
        photos: photoRows.map((photo) => ({
          id: isCopy ? crypto.randomUUID() : photo.id,
          day_id: photo.day_id
            ? isCopy
              ? (dayIdMap.get(photo.day_id) ?? null)
              : photo.day_id
            : null,
          day_item_id: photo.day_item_id
            ? isCopy
              ? (itemIdMap.get(photo.day_item_id) ?? null)
              : photo.day_item_id
            : null,
          url: photo.url ?? "",
          storage_path: photo.storage_path ?? null,
          caption: photo.caption ?? "",
          alt_text: photo.alt_text ?? "",
          sequence: Number(photo.sequence ?? 0),
          source: photo.source,
          selection_type: photo.selection_type,
          is_primary: photo.is_primary,
          google_place_id: photo.google_place_id,
          place_name: photo.place_name,
          google_photo_reference: photo.google_photo_reference,
          attribution: photo.attribution,
        })),
      }));
    }

    if (!packageError) {
      const mappedPackageOptions: ItineraryPreviewPackageOption[] = customerCopy
        ? []
        : loadedPackageRows.map((packageRow) => ({
            id: packageIdMap.get(packageRow.id) ?? packageRow.id,
            name: packageRow.name,
            description: packageRow.description ?? null,
            sequence: packageRow.sequence,
            is_active: packageRow.is_active,
            pricing: { final_customer_price: 0, currency: "INR" },
          }));
      setPreviewPackageOptions(mappedPackageOptions);
      const copiedSelectedPackageId = itinerary.package_id
        ? (packageIdMap.get(itinerary.package_id) ?? null)
        : (mappedPackageOptions[0]?.id ?? null);
      setSelectedPreviewPackageId(
        customerCopy
          ? null
          : options?.createLibraryCopy
            ? copiedSelectedPackageId
            : (current) => current ?? mappedPackageOptions[0]?.id ?? null,
      );
    } else {
      setPreviewPackageOptions([]);
      setSelectedPreviewPackageId(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quickUpload") === "1") {
      const storedUpload = sessionStorage.getItem("itinerary-quick-upload");
      sessionStorage.removeItem("itinerary-quick-upload");
      if (storedUpload) {
        try {
          const upload = JSON.parse(storedUpload) as {
            name?: string;
            type?: string;
            base64?: string;
            destination?: string;
          };
          if (upload.name && upload.base64) {
            void extractSupplierDraft(
              {
                fileName: upload.name,
                mimeType: upload.type || "application/octet-stream",
                fileBase64: upload.base64,
                ...(upload.destination ? { destinationText: upload.destination } : {}),
              },
              { quickPreview: params.get("quickPreview") === "1" },
            );
          } else {
            setMessage("The selected quick-itinerary file is incomplete. Please choose it again.");
          }
        } catch {
          setMessage(
            "The selected quick-itinerary file could not be prepared. Please choose it again.",
          );
        }
      } else {
        setMessage("The selected quick-itinerary file was not found. Please choose it again.");
      }
    }
    if (params.get("quickText") === "1") {
      const storedText = sessionStorage.getItem("itinerary-quick-text");
      sessionStorage.removeItem("itinerary-quick-text");
      if (storedText) {
        try {
          const quickInput = JSON.parse(storedText) as {
            text?: string;
            destination?: string;
          };
          if (quickInput.text?.trim()) {
            void extractSupplierDraftFromText(quickInput.text, {
              ...(quickInput.destination ? { destinationText: quickInput.destination } : {}),
              quickPreview: params.get("quickPreview") === "1",
            });
          } else {
            setMessage("Enter itinerary details before generating a quick itinerary.");
          }
        } catch {
          setMessage("The quick-itinerary text could not be prepared. Please try again.");
        }
      } else {
        setMessage("The quick-itinerary text was not found. Please paste the details again.");
      }
    }
    const bookingDraftRequested = new URLSearchParams(window.location.search).get("bookingDraft");
    if (bookingDraftRequested) {
      const stored = sessionStorage.getItem("itinerary-booking-draft");
      if (stored) {
        try {
          const generated = JSON.parse(stored) as {
            draft: {
              title: string;
              travel_start_date: string | null;
              travel_end_date: string | null;
              adults: number | null;
              children: number | null;
              inclusions: string[];
              exclusions: string[];
              cancellation_info: string | null;
              days: Array<{
                date: string | null;
                title: string;
                description?: string;
                notes?: string | null;
                items: Array<Record<string, unknown>>;
              }>;
            };
            photo_attachments?: GeneratedPhotoAttachment[];
            source_context: {
              customer_id: string | null;
              lead_id: string | null;
              assigned_to: string | null;
            };
            destination_resolution: { destination_id: string | null };
          };
          setCurrentItineraryId(null);
          setPreviewPackageOptions([]);
          setSelectedPreviewPackageId(null);
          setForm((current) => ({
            ...current,
            title: generated.draft.title,
            customer_id: generated.source_context.customer_id ?? "",
            lead_id: generated.source_context.lead_id ?? "",
            destination_id: generated.destination_resolution.destination_id ?? "",
            travel_start_date: generated.draft.travel_start_date ?? "",
            travel_end_date: generated.draft.travel_end_date ?? "",
            adults: String(generated.draft.adults ?? 0),
            children: String(generated.draft.children ?? 0),
            assigned_to: generated.source_context.assigned_to ?? "",
            inclusions: generated.draft.inclusions,
            exclusions: generated.draft.exclusions,
            cancellation_info: generated.draft.cancellation_info ?? "",
            provenance: "AI_BOOKING_SERVICES",
          }));
          const generatedDays = generated.draft.days.map((day, dayIndex) => ({
            id: crypto.randomUUID(),
            day_number: dayIndex + 1,
            date: day.date ?? "",
            title: day.title,
            description: day.description ?? "",
            notes: day.notes ?? "",
            items: day.items.map(
              (item, itemIndex) =>
                ({ ...item, id: crypto.randomUUID(), sequence: itemIndex + 1 }) as TripDayItemState,
            ),
          }));
          setDays(generatedDays);
          setForm((current) => ({
            ...current,
            photos: generatedPhotosForDays(generated.photo_attachments, generatedDays),
          }));
          sessionStorage.removeItem("itinerary-booking-draft");
          setMessage("Booking services loaded for human review. Review and save it when ready.");
        } catch {
          setMessage("The booking itinerary draft could not be loaded.");
        }
      }
    }
    const supplierDraftRequested = new URLSearchParams(window.location.search).get("supplierDraft");
    if (supplierDraftRequested && !appSettings.isLoading) {
      const stored = sessionStorage.getItem("itinerary-supplier-draft");
      if (stored) {
        try {
          const generated = JSON.parse(stored) as {
            draft: {
              title: string;
              destination: string;
              travel_start_date: string | null;
              travel_end_date: string | null;
              adults: number | null;
              children: number | null;
              inclusions: string[];
              exclusions: string[];
              cancellation_info: string | null;
              days: Array<{
                date: string | null;
                title: string;
                description?: string;
                notes?: string | null;
                items: Array<Record<string, unknown>>;
              }>;
            };
            extracted_text?: string;
            tables?: Array<{ title: string; columns: string[]; rows: string[][] }>;
            photo_attachments?: GeneratedPhotoAttachment[];
            destination_resolution: {
              status: "resolved" | "ambiguous" | "unresolved" | "unknown";
              destination_id: string | null;
            };
          };
          const mergedTerms = buildSupplierItineraryTerms(
            generated.draft,
            generated.extracted_text ?? "",
            companyTermDefaults,
          );
          const inclusions = mergedTerms.inclusions.trim()
            ? [sanitizeItineraryTermHtml(mergedTerms.inclusions)]
            : [];
          const exclusions = mergedTerms.exclusions.trim()
            ? [sanitizeItineraryTermHtml(mergedTerms.exclusions)]
            : [];
          setSupplierDetails(generated.extracted_text ?? "");
          setPreviewPackageOptions([]);
          setSelectedPreviewPackageId(null);
          setForm((current) => ({
            ...current,
            title: generated.draft.title,
            destination_id: generated.destination_resolution.destination_id ?? "",
            travel_start_date: generated.draft.travel_start_date ?? "",
            travel_end_date: generated.draft.travel_end_date ?? "",
            adults: String(generated.draft.adults ?? 0),
            children: String(generated.draft.children ?? 0),
            inclusions,
            exclusions,
            cancellation_info: sanitizeItineraryTermHtml(mergedTerms.cancellation_info),
            terms_conditions: sanitizeItineraryTermHtml(mergedTerms.terms_conditions),
            custom_tables: generated.tables?.length ? generated.tables : [],
            provenance: "AI_SUPPLIER_IMPORT",
          }));
          const generatedDays = generated.draft.days.map((day, dayIndex) => ({
            id: crypto.randomUUID(),
            day_number: dayIndex + 1,
            date: day.date ?? "",
            title: day.title,
            description: day.description ?? "",
            notes: day.notes ?? "",
            items: day.items.map(
              (item, itemIndex) =>
                ({ ...item, id: crypto.randomUUID(), sequence: itemIndex + 1 }) as TripDayItemState,
            ),
          }));
          const generatedDaysWithHotelPrices = applyImportedHotelPrices(
            generatedDays,
            generated.extracted_text ?? "",
          ).map((day) => ({
            ...day,
            items: day.items.map((item) =>
              item.item_type === "ACCOMMODATION"
                ? {
                    ...item,
                    metadata: {
                      ...(item.metadata ?? {}),
                      overall_hotel_booking: true,
                      hotel_saved: true,
                      hotel_option_label: item.hotel_option_label || "Option 1",
                    },
                  }
                : item,
            ),
          }));
          autoSavingImportedHotelsRef.current = false;
          setDays(generatedDaysWithHotelPrices);
          const generatedHtml = sanitizeItineraryEditorHtml(
            itineraryTextToSafeHtml(supplierDraftToDocumentText(generated.draft)),
          );
          if (itineraryEditorRef.current) {
            itineraryEditorRef.current.innerHTML = generatedHtml;
            setItineraryEditorEmpty(!generatedHtml.trim());
          }
          setActiveSection("day");
          setForm((current) => ({ ...current, document_html: generatedHtml }));
          setForm((current) => ({
            ...current,
            photos: generatedPhotosForDays(
              generated.photo_attachments,
              generatedDaysWithHotelPrices,
            ),
          }));
          if (
            generatedDaysWithHotelPrices.some((day) =>
              day.items.some((item) => item.item_type === "ACCOMMODATION"),
            )
          ) {
            setHotelsEnabled(true);
            setHotelBookingMode("overall");
            const quickPreview =
              new URLSearchParams(window.location.search).get("quickPreview") === "1";
            if (!quickPreview) {
              setActiveSection("hotels");
              setHotelsDialogOpen(true);
            }
            const importedHotels = generatedDaysWithHotelPrices.flatMap((day) =>
              day.items
                .filter((item) => item.item_type === "ACCOMMODATION")
                .map((item) => ({ dayId: day.id, item })),
            );
            void Promise.all(
              importedHotels.map(async ({ dayId, item }) => {
                const details = await fetchSupplierHotelDetails(item, generated.draft.destination);
                if (!details) return;
                setDays((current) =>
                  current.map((day) =>
                    day.id !== dayId
                      ? day
                      : {
                          ...day,
                          items: day.items.map((currentItem) =>
                            currentItem.id === item.id
                              ? {
                                  ...currentItem,
                                  ...details,
                                  metadata: {
                                    ...(currentItem.metadata ?? {}),
                                    ...(details.metadata ?? {}),
                                  },
                                }
                              : currentItem,
                          ),
                        },
                  ),
                );
              }),
            );
          }
          const importedActivities = generatedDaysWithHotelPrices.flatMap((day) =>
            day.items
              .filter(
                (item) => item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING",
              )
              .map((item) => ({ dayId: day.id, item })),
          );
          void Promise.all(
            importedActivities.map(async ({ dayId, item }) => {
              const details = await fetchSupplierActivityDetails(item, generated.draft.destination);
              if (!details) return;
              setDays((current) =>
                current.map((day) =>
                  day.id !== dayId
                    ? day
                    : {
                        ...day,
                        items: day.items.map((currentItem) =>
                          currentItem.id === item.id
                            ? {
                                ...currentItem,
                                metadata: {
                                  ...(currentItem.metadata ?? {}),
                                  ...(details.metadata ?? {}),
                                },
                              }
                            : currentItem,
                        ),
                      },
                ),
              );
            }),
          );
          if (new URLSearchParams(window.location.search).get("quickPreview") === "1") {
            setQuickPreviewDraftReady(true);
          }
          sessionStorage.removeItem("itinerary-supplier-draft");
          setMessage(
            new URLSearchParams(window.location.search).get("quickPreview") === "1"
              ? "Quick itinerary generated. Preparing images and preview…"
              : "AI itinerary generated and displayed. Review it in the editor, then save when ready.",
          );
        } catch {
          setMessage("The supplier draft could not be loaded.");
        }
      }
    }
    const draftRequested = new URLSearchParams(window.location.search).get("aiDraft");
    if (draftRequested) {
      const stored = sessionStorage.getItem("itinerary-ai-draft");
      if (stored) {
        try {
          const generated = JSON.parse(stored) as {
            draft: {
              title: string;
              destination: string;
              travel_start_date: string | null;
              travel_end_date: string | null;
              adults: number | null;
              children: number | null;
              inclusions: string[];
              exclusions: string[];
              cancellation_info: string | null;
              days: Array<{
                date: string | null;
                title: string;
                description?: string;
                notes?: string | null;
                items: Array<Record<string, unknown>>;
              }>;
            };
            photo_attachments?: GeneratedPhotoAttachment[];
            requirements: {
              customer_id?: string | null;
              lead_id?: string | null;
              enquiry_id?: string | null;
              assigned_to?: string | null;
            };
            destination_resolution: { destination_id: string | null };
          };
          setCurrentItineraryId(null);
          setPreviewPackageOptions([]);
          setSelectedPreviewPackageId(null);
          setForm((current) => ({
            ...current,
            title: generated.draft.title,
            customer_id: generated.requirements.customer_id ?? "",
            lead_id: generated.requirements.lead_id ?? "",
            enquiry_id: generated.requirements.enquiry_id ?? "",
            destination_id: generated.destination_resolution.destination_id ?? "",
            travel_start_date: generated.draft.travel_start_date ?? "",
            travel_end_date: generated.draft.travel_end_date ?? "",
            adults: String(generated.draft.adults ?? 0),
            children: String(generated.draft.children ?? 0),
            assigned_to: generated.requirements.assigned_to ?? "",
            inclusions: generated.draft.inclusions,
            exclusions: generated.draft.exclusions,
            cancellation_info: generated.draft.cancellation_info ?? "",
            provenance: "AI_REQUIREMENTS",
          }));
          const generatedDays = generated.draft.days.map((day, dayIndex) => ({
            id: crypto.randomUUID(),
            day_number: dayIndex + 1,
            date: day.date ?? "",
            title: day.title,
            description: day.description ?? "",
            notes: day.notes ?? "",
            items: day.items.map(
              (item, itemIndex) =>
                ({ ...item, id: crypto.randomUUID(), sequence: itemIndex + 1 }) as TripDayItemState,
            ),
          }));
          setDays(generatedDays);
          setForm((current) => ({
            ...current,
            photos: generatedPhotosForDays(generated.photo_attachments, generatedDays),
          }));
          sessionStorage.removeItem("itinerary-ai-draft");
          setMessage("AI draft loaded for human review. Review and save it when ready.");
        } catch {
          setMessage("The generated itinerary draft could not be loaded.");
        }
      }
    }
  }, [
    appSettings.data,
    appSettings.isLoading,
    companyTermDefaults.cancellation_info,
    companyTermDefaults.exclusions,
    companyTermDefaults.inclusions,
    companyTermDefaults.terms_conditions,
    fetchSupplierHotelDetails,
  ]);

  useEffect(() => {
    if (!quickPreviewDraftReady || addingImages) return;
    setQuickPreviewDraftReady(false);
    const enrichImages = addImagesToSavedItineraryRef.current;
    if (!enrichImages) {
      setMessage("Quick itinerary is ready to review, but images could not be prepared.");
      setPreviewOpen(true);
      return;
    }
    void enrichImages().then(() => {
      setActiveSection("day");
      setPreviewOpen(true);
      setMessage(
        "Quick itinerary is ready. Review the preview and any image-enrichment alerts.",
      );
    });
  }, [addingImages, days, form, quickPreviewDraftReady]);

  useEffect(() => {
    let cancelled = false;
    async function initializeItineraryDraft() {
      const params = new URLSearchParams(window.location.search);
      const itineraryIdFromQuery = params.get("itineraryId");
      const copyFromId = params.get("copyFrom");
      const libraryCopyFromId = params.get("libraryCopyFrom");
      const copySourceId = copyFromId ?? libraryCopyFromId;
      const customerIdFromQuery = params.get("customerId");
      const leadIdFromQuery = params.get("leadId");
      const destinationId = params.get("destinationId");
      const pendingGenerationKeys = new Set(
        ["itinerary-ai-draft", "itinerary-booking-draft", "itinerary-supplier-draft"].filter(
          (key) => Boolean(sessionStorage.getItem(key)),
        ),
      );
      const generatedDraftMode = hasPendingItineraryGeneration(params, pendingGenerationKeys);
      const authResult = await supabase.auth.getUser();
      if (cancelled) return;
      const userId = authResult.data.user?.id;
      if (!userId) {
        setDraftReady(true);
        return;
      }
      setDraftOwnerId(userId);

      if (!generatedDraftMode && copyFromId) {
        await loadSavedItinerary(copyFromId, { copyForCustomerId: customerIdFromQuery }).catch(
          (error: unknown) => {
            if (!cancelled)
              setMessage(
                error instanceof Error ? error.message : "Unable to open the itinerary copy.",
              );
          },
        );
        if (!cancelled && !customerIdFromQuery) {
          setClientAssignmentKind("customer");
          setSelectedLeadId("");
          setSelectedCustomerId("");
          setClientAssignmentOpen(true);
        }
      } else if (!generatedDraftMode && libraryCopyFromId) {
        await loadSavedItinerary(libraryCopyFromId, { createLibraryCopy: true }).catch(
          (error: unknown) => {
            if (!cancelled)
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Unable to create an editable itinerary copy.",
              );
          },
        );
      } else if (!generatedDraftMode && itineraryIdFromQuery) {
        await loadSavedItinerary(itineraryIdFromQuery).catch((error: unknown) => {
          if (!cancelled)
            setMessage(error instanceof Error ? error.message : "Unable to load itinerary.");
        });
      } else if (!generatedDraftMode && leadIdFromQuery) {
        const { data: lead, error } = await supabase
          .from("leads")
          .select(
            "id,customer_id,customer_name,destination_text,destination_id,travel_start,travel_end,adults,children,assigned_to",
          )
          .eq("id", leadIdFromQuery)
          .maybeSingle();
        if (cancelled) return;
        if (error || !lead) setMessage(error?.message ?? "Unable to load the selected lead.");
        else
          setForm((current) => ({
            ...current,
            lead_id: lead.id,
            customer_id: lead.customer_id ?? "",
            title: current.title || `${lead.destination_text ?? "Trip"} — ${lead.customer_name}`,
            destination_id: lead.destination_id ?? current.destination_id,
            travel_start_date: lead.travel_start ?? current.travel_start_date,
            travel_end_date: lead.travel_end ?? current.travel_end_date,
            adults: String(lead.adults ?? 1),
            children: String(lead.children ?? 0),
            assigned_to: lead.assigned_to ?? current.assigned_to,
          }));
      } else if (!generatedDraftMode && customerIdFromQuery) {
        setForm((current) => ({ ...current, customer_id: customerIdFromQuery }));
      } else if (!generatedDraftMode && destinationId) {
        setForm((current) => ({ ...current, destination_id: destinationId }));
      }

      let linkedItineraryDraftId: string | null = null;
      if (!generatedDraftMode && !copySourceId && itineraryIdFromQuery) {
        const { data: linkedDraft, error: linkedDraftError } = await supabase
          .from("itinerary_drafts")
          .select("id")
          .eq("user_id", userId)
          .eq("itinerary_id", itineraryIdFromQuery)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (linkedDraftError) {
          console.warn(
            "[Itinerary builder] Could not locate the draft linked to this itinerary.",
            linkedDraftError,
          );
        } else {
          linkedItineraryDraftId = linkedDraft?.id ?? null;
        }
      }

      const copyDraftId = copySourceId ? crypto.randomUUID() : null;
      const scope = itineraryDraftStorageScope({
        itineraryId: copySourceId ? null : itineraryIdFromQuery,
        leadId: copySourceId ? null : leadIdFromQuery,
        draftId: copyDraftId ?? params.get("draftId"),
      });
      const storageBaseKey = `savr-itinerary-draft:${userId}:${scope}`;
      const latestDraftKey = itineraryDraftLatestKey(userId);
      draftStorageKeyRef.current = storageBaseKey;
      let savedDraftId = copyDraftId ?? linkedItineraryDraftId ?? params.get("draftId");
      if (!copySourceId) {
        try {
          savedDraftId ||= window.localStorage.getItem(`${storageBaseKey}:id`);
          if (!itineraryIdFromQuery) savedDraftId ||= window.localStorage.getItem(latestDraftKey);
        } catch {
          // Continue with the server-backed draft when browser storage is unavailable.
        }
      }
      savedDraftId ||= crypto.randomUUID();
      setCurrentDraftId(savedDraftId);
      try {
        window.localStorage.setItem(`${storageBaseKey}:id`, savedDraftId);
        if (!itineraryIdFromQuery) window.localStorage.setItem(latestDraftKey, savedDraftId);
      } catch {
        // Private browsing or storage restrictions do not prevent database autosave.
      }
      if (params.get("draftId") !== savedDraftId || libraryCopyFromId) {
        const nextSearch = new URLSearchParams(window.location.search);
        nextSearch.set("draftId", savedDraftId);
        nextSearch.delete("libraryCopyFrom");
        const nextUrl = `${window.location.pathname}?${nextSearch.toString()}${window.location.hash}`;
        window.history.replaceState(null, "", nextUrl);
      }

      if (!generatedDraftMode && !copySourceId) {
        let snapshot: ItineraryDraftSnapshot | null = null;
        let localSavedAt = 0;
        try {
          const localRaw = window.localStorage.getItem(`${storageBaseKey}:snapshot`);
          if (localRaw) {
            const localEntry = JSON.parse(localRaw) as {
              savedAt?: number;
              snapshot?: ItineraryDraftSnapshot;
            };
            if (
              localEntry.snapshot &&
              Array.isArray(localEntry.snapshot.days) &&
              localEntry.snapshot.form
            ) {
              snapshot = localEntry.snapshot;
              localSavedAt = Number(localEntry.savedAt ?? 0);
            }
          }
        } catch {
          // Ignore a damaged local snapshot and try the authenticated database copy.
        }

        const { data: remoteDraft, error: draftError } = await supabase
          .from("itinerary_drafts")
          .select("draft_data,updated_at")
          .eq("id", savedDraftId)
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        if (draftError) {
          console.warn(
            "[Itinerary builder] Database draft recovery unavailable; keeping browser autosave.",
            draftError,
          );
          if (!snapshot) setDraftSaveState("local");
        } else if (remoteDraft && new Date(remoteDraft.updated_at).getTime() >= localSavedAt) {
          const candidate = remoteDraft.draft_data as unknown as ItineraryDraftSnapshot;
          if (candidate && candidate.form && Array.isArray(candidate.days)) snapshot = candidate;
        }

        if (
          snapshot &&
          (!itineraryIdFromQuery ||
            !snapshot.itineraryId ||
            snapshot.itineraryId === itineraryIdFromQuery)
        ) {
          recoveredDraftRef.current = true;
          setForm({
            ...snapshot.form,
            customer_quotes: normalizeItineraryCustomerQuotes(snapshot.form.customer_quotes),
          });
          setDays(snapshot.days);
          setQuickPrompt(snapshot.quickPrompt ?? "");
          setSupplierDetails(snapshot.supplierDetails ?? "");
          setCostLines(Array.isArray(snapshot.costLines) ? snapshot.costLines : []);
          setCopyMetadata(snapshot.copyMetadata ?? {});
          setPreviewPackageOptions(
            Array.isArray(snapshot.previewPackageOptions) ? snapshot.previewPackageOptions : [],
          );
          setSelectedPreviewPackageId(snapshot.selectedPreviewPackageId ?? null);
          if (Array.isArray(snapshot.marginLines) && Array.isArray(snapshot.taxLines)) {
            setMarginLines(snapshot.marginLines);
            setTaxLines(snapshot.taxLines);
          }
          setActivitiesTransfersEnabled(Boolean(snapshot.activitiesTransfersEnabled));
          setHotelsEnabled(Boolean(snapshot.hotelsEnabled));
          setHotelBookingMode(snapshot.hotelBookingMode === "overall" ? "overall" : "daywise");
          setCurrentItineraryId(snapshot.itineraryId ?? itineraryIdFromQuery);
          setMessage("Recovered your automatically saved itinerary draft.");
        }
      }

      if (params.get("newItinerary") === "1") {
        setForm((current) => ({
          ...current,
          title: params.get("title") || current.title,
          travel_start_date: params.get("travelStartDate") || "",
          travel_end_date: params.get("travelEndDate") || "",
          adults: params.get("adults") ?? current.adults,
          children: params.get("children") ?? current.children,
        }));
      }
      const promptFromQuery = params.get("quickPrompt");
      if (promptFromQuery) setQuickPrompt(promptFromQuery);

      if (!cancelled) setDraftReady(true);
    }

    void initializeItineraryDraft().catch((error: unknown) => {
      console.error("[Itinerary builder] Draft initialization failed", error);
      if (!cancelled) {
        setDraftReady(true);
        setDraftSaveState("local");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !draftReady ||
      !currentItineraryId ||
      new URLSearchParams(window.location.search).get("preview") !== "1" ||
      assignedItineraryPreviewOpenedRef.current
    )
      return;
    assignedItineraryPreviewOpenedRef.current = true;
    setPreviewOpen(true);
  }, [currentItineraryId, draftReady]);

  useEffect(() => {
    if (
      !draftReady ||
      !draftOwnerId ||
      !currentDraftId ||
      librarySaveInProgress ||
      form.status === "READY"
    )
      return;
    const snapshot: ItineraryDraftSnapshot = {
      form,
      days,
      quickPrompt,
      supplierDetails,
      costLines,
      copyMetadata,
      previewPackageOptions,
      selectedPreviewPackageId,
      marginLines,
      taxLines,
      activitiesTransfersEnabled,
      hotelsEnabled,
      hotelBookingMode,
      itineraryId: currentItineraryId,
    };
    const storageBaseKey = currentItineraryId
      ? `savr-itinerary-draft:${draftOwnerId}:itinerary-${currentItineraryId}`
      : draftStorageKeyRef.current;
    if (storageBaseKey) {
      try {
        window.localStorage.setItem(`${storageBaseKey}:id`, currentDraftId);
        window.localStorage.setItem(
          `${storageBaseKey}:snapshot`,
          JSON.stringify({ savedAt: Date.now(), snapshot }),
        );
        window.localStorage.setItem(itineraryDraftLatestKey(draftOwnerId), currentDraftId);
        setDraftSaveState("local");
      } catch (error) {
        console.warn("[Itinerary builder] Local draft storage unavailable", error);
      }
    }

    const timer = window.setTimeout(() => {
      setDraftSaveState("saving");
      const pendingSave = supabase
        .from("itinerary_drafts")
        .upsert(
          {
            id: currentDraftId,
            user_id: draftOwnerId,
            itinerary_id: currentItineraryId,
            lead_id:
              !leadsLoading &&
              !leadsError &&
              form.lead_id &&
              leads.some((lead) => lead.id === form.lead_id)
                ? form.lead_id
                : null,
            draft_data:
              snapshot as unknown as Database["public"]["Tables"]["itinerary_drafts"]["Insert"]["draft_data"],
          },
          { onConflict: "id" },
        )
        .then(({ error }) => {
          if (error) {
            console.warn(
              "[Itinerary builder] Database draft autosave failed; browser copy is retained.",
              error,
            );
            setDraftSaveState("local");
            return;
          }
          setDraftSaveState("saved");
        })
        .catch((error: unknown) => {
          console.warn(
            "[Itinerary builder] Database draft autosave request failed; browser copy is retained.",
            error,
          );
          setDraftSaveState("local");
        });
      draftAutosavePromiseRef.current = pendingSave;
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    activitiesTransfersEnabled,
    copyMetadata,
    costLines,
    currentDraftId,
    currentItineraryId,
    days,
    draftOwnerId,
    draftReady,
    form,
    hotelBookingMode,
    hotelsEnabled,
    leads,
    leadsError,
    leadsLoading,
    librarySaveInProgress,
    marginLines,
    previewPackageOptions,
    selectedPreviewPackageId,
    taxLines,
    quickPrompt,
    supplierDetails,
  ]);

  const itineraryTermsSnapshot = useMemo(
    () =>
      buildItineraryTermsSnapshot({
        inclusions: form.inclusions,
        exclusions: form.exclusions,
        cancellation_info: form.cancellation_info,
        terms_conditions: form.terms_conditions,
      }),
    [form.cancellation_info, form.exclusions, form.inclusions, form.terms_conditions],
  );

  useEffect(() => {
    if (!draftReady) return;
    if (!currentItineraryId) {
      savedTermsSnapshotRef.current = null;
      return;
    }
    if (!savedTermsSnapshotRef.current) {
      savedTermsSnapshotRef.current = itineraryTermsSnapshot;
      return;
    }
    if (itineraryTermsSnapshotsEqual(savedTermsSnapshotRef.current, itineraryTermsSnapshot)) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      termsSaveQueueRef.current = termsSaveQueueRef.current
        .then(async () => {
          if (cancelled || !currentItineraryId) return;
          if (
            itineraryTermsSnapshotsEqual(
              savedTermsSnapshotRef.current ?? itineraryTermsSnapshot,
              itineraryTermsSnapshot,
            )
          )
            return;
          const { error } = await supabase
            .from("itineraries")
            .update(itineraryTermsSnapshot)
            .eq("id", currentItineraryId);
          if (error) {
            console.warn("[Itinerary builder] Terms autosave failed", error);
            toast.error(
              "Could not save inclusions, exclusions, and terms. Use Save itinerary to retry.",
            );
            return;
          }
          if (!cancelled) savedTermsSnapshotRef.current = itineraryTermsSnapshot;
        })
        .catch((error: unknown) => {
          console.warn("[Itinerary builder] Terms autosave request failed", error);
          toast.error(
            "Could not save inclusions, exclusions, and terms. Use Save itinerary to retry.",
          );
        });
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentItineraryId, draftReady, itineraryTermsSnapshot]);

  useEffect(() => {
    if (!draftReady || form.destination_id || destinations.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("newItinerary") !== "1") return;
    const destinationId = matchItineraryDestinationId(
      form.title,
      params.get("quickPrompt") ?? "",
      destinations,
    );
    if (destinationId)
      setForm((current) =>
        current.destination_id ? current : { ...current, destination_id: destinationId },
      );
  }, [destinations, draftReady, form.destination_id, form.title]);

  function updateDay(index: number, updates: Partial<TripDay>) {
    setDays((current) =>
      current.map((day, dayIndex) => (dayIndex === index ? { ...day, ...updates } : day)),
    );
  }

  function addDay() {
    setDays((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        day_number: current.length + 1,
        date: "",
        title: `Day ${current.length + 1}`,
        description: "",
        notes: "",
        items: [],
      },
    ]);
  }

  function generateDayWiseActivitiesPlan() {
    if (
      !form.travel_start_date ||
      !form.travel_end_date ||
      form.travel_end_date < form.travel_start_date
    ) {
      toast.error("Set valid trip start and end dates before generating the day-wise plan.");
      return;
    }
    const alignedDays = buildTripDaysFromDateRange(
      form.travel_start_date,
      form.travel_end_date,
      days,
    );
    setDays(alignedDays);
    setActivitiesTransfersEnabled(true);
    toast.success(`Day-wise plan ready for ${alignedDays.length} trip days`);
  }

  function deleteDay(index: number) {
    setDays((current) =>
      current
        .filter((_, dayIndex) => dayIndex !== index)
        .map((day, position) => ({
          ...day,
          day_number: position + 1,
          title: day.title || `Day ${position + 1}`,
        })),
    );
  }

  function moveDay(index: number, direction: "up" | "down") {
    setDays((current) => {
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const updated = [...current].map((day, itemIndex) => ({
        ...day,
        id: day.id ?? `day-${itemIndex + 1}`,
      }));
      const next = [...updated];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return reorderTripItineraryDays(next).map((day, position) => ({
        ...day,
        day_number: position + 1,
        title: day.title || `Day ${position + 1}`,
      }));
    });
  }

  function addItemToDay(dayIndex: number, itemType: (typeof ITINERARY_CONTENT_ITEM_TYPES)[number]) {
    const targetDay = days[dayIndex];
    if (
      itemType === "ACCOMMODATION" &&
      targetDay &&
      !hotelCheckInAllowed(targetDay, dayIndex, days, form.travel_end_date)
    ) {
      toast.error("The final trip day is checkout-only. Add hotel stays to an earlier day.");
      return;
    }
    setDays((current) =>
      current.map((day, idx) => {
        if (idx !== dayIndex) return day;
        const nextSequence = day.items.length + 1;
        const hotelDates =
          itemType === "ACCOMMODATION"
            ? (() => {
                const dates = hotelDatesForDay(day.date);
                return { check_in: dates.checkIn, check_out: dates.checkOut };
              })()
            : {};
        const optionFields =
          itemType === "ACCOMMODATION" ? { hotel_option_label: selectedHotelOption } : {};
        return {
          ...day,
          items: [
            ...day.items,
            { ...defaultItemForType(itemType, nextSequence), ...hotelDates, ...optionFields },
          ],
        };
      }),
    );
  }

  function addOverallHotel() {
    if (days.length === 0) {
      toast.error("Add at least one itinerary day before adding an overall hotel.");
      return;
    }

    setDays((current) =>
      current.map((day, dayIndex) => {
        if (dayIndex !== 0) return day;
        const nextSequence = day.items.length + 1;
        const overallHotel = defaultItemForType("ACCOMMODATION", nextSequence);
        return {
          ...day,
          items: [
            ...day.items,
            {
              ...overallHotel,
              title: "",
              hotel_name: "",
              check_in: "",
              check_out: "",
              nights: 0,
              hotel_option_label: selectedHotelOption,
              metadata: {
                ...(overallHotel.metadata ?? {}),
                overall_hotel_booking: true,
                room_details: [{
                    id: crypto.randomUUID(),
                    room_type: "Standard",
                    adults: Number(form.adults) || 2,
                    kids: Number(form.children) || 0,
                    breakfast: false,
                    lunch: false,
                    dinner: false,
                    room_rate_per_night: 0,
                    currency: "INR",
                    free_cancellation_date: "",
                }],
              },
            },
          ],
        };
      }),
    );
  }

  function updateItem(dayIndex: number, itemIndex: number, updates: Partial<TripDayItemState>) {
    setDays((current) =>
      current.map((day, idx) => {
        if (idx !== dayIndex) return day;
        return {
          ...day,
          items: day.items.map((item, index) =>
            index === itemIndex ? { ...item, ...updates } : item,
          ),
        };
      }),
    );
  }

  function updateFlightPrice(
    dayIndex: number,
    itemIndex: number,
    item: TripDayItemState,
    value: string,
  ) {
    const price = value === "" ? null : Number(value) || 0;
    const currency = (item.flight_currency || "INR") as CurrencyCode;
    const converted =
      price == null
        ? null
        : rates
          ? convertToInr(price, currency, rates.rates)
          : currency === "INR"
            ? price
            : null;
    updateItem(dayIndex, itemIndex, {
      flight_price: price,
      metadata: {
        ...(item.metadata ?? {}),
        flight_price_inr: converted,
        flight_exchange_rate: price && converted !== null ? converted / price : 1,
        flight_exchange_rate_updated_at: rates?.updatedAt ?? null,
      },
    });
  }

  function updateFlightCurrency(
    dayIndex: number,
    itemIndex: number,
    item: TripDayItemState,
    currency: string,
  ) {
    const code = currency as CurrencyCode;
    const price = item.flight_price;
    const converted =
      price == null
        ? null
        : rates
          ? convertToInr(price, code, rates.rates)
          : code === "INR"
            ? price
            : null;
    updateItem(dayIndex, itemIndex, {
      flight_currency: currency,
      metadata: {
        ...(item.metadata ?? {}),
        flight_price_inr: converted,
        flight_exchange_rate: price && converted !== null ? converted / price : 1,
        flight_exchange_rate_updated_at: rates?.updatedAt ?? null,
      },
    });
  }

  function updateRoomRate(
    dayIndex: number,
    itemIndex: number,
    item: TripDayItemState,
    roomIndex: number,
    value: string,
  ) {
    const rooms = getAccommodationRoomDetails(item).map((room, index) => {
      if (index !== roomIndex) return room;
      const amount = Number(value) || 0;
      const currency = (room.currency || "INR") as CurrencyCode;
      const amountInr = amount
        ? rates
          ? convertToInr(amount, currency, rates.rates)
          : currency === "INR"
            ? amount
            : null
        : 0;
      return {
        ...room,
        room_rate_per_night: amount,
        room_rate_per_night_inr: amountInr,
        exchange_rate: amount > 0 && amountInr !== null ? amountInr / amount : 1,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
      };
    });
    updateItem(dayIndex, itemIndex, {
      metadata: { ...(item.metadata ?? {}), room_details: rooms },
    });
  }

  function updateAccommodationRoom(
    dayIndex: number,
    itemIndex: number,
    item: TripDayItemState,
    roomIndex: number,
    updates: Partial<HotelRoomDetail>,
  ) {
    const rooms = getAccommodationRoomDetails(item).map((room, index) =>
      index === roomIndex ? { ...room, ...updates } : room,
    );
    updateItem(dayIndex, itemIndex, {
      metadata: { ...(item.metadata ?? {}), room_details: rooms },
    });
  }

  function updateRoomCurrency(
    dayIndex: number,
    itemIndex: number,
    item: TripDayItemState,
    roomIndex: number,
    currency: string,
  ) {
    const rooms = getAccommodationRoomDetails(item).map((room, index) => {
      if (index !== roomIndex) return room;
      const amount = Number(room.room_rate_per_night) || 0;
      const code = currency as CurrencyCode;
      const amountInr = amount
        ? rates
          ? convertToInr(amount, code, rates.rates)
          : code === "INR"
            ? amount
            : null
        : 0;
      return {
        ...room,
        currency,
        room_rate_per_night_inr: amountInr,
        exchange_rate: amount > 0 && amountInr !== null ? amountInr / amount : 1,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
      };
    });
    updateItem(dayIndex, itemIndex, {
      metadata: { ...(item.metadata ?? {}), room_details: rooms },
    });
  }

  function moveItem(dayIndex: number, itemIndex: number, direction: "up" | "down") {
    setDays((current) =>
      current.map((day, idx) => {
        if (idx !== dayIndex) return day;
        const nextIndex = direction === "up" ? itemIndex - 1 : itemIndex + 1;
        if (nextIndex < 0 || nextIndex >= day.items.length) return day;
        const swapped = [...day.items];
        [swapped[itemIndex], swapped[nextIndex]] = [swapped[nextIndex]!, swapped[itemIndex]!];
        return {
          ...day,
          items: reorderItineraryItems(swapped).map((item, sequenceIndex) => ({
            ...item,
            sequence: sequenceIndex + 1,
          })),
        };
      }),
    );
  }

  function deleteItem(dayIndex: number, itemIndex: number) {
    setDays((current) =>
      current.map((day, idx) => {
        if (idx !== dayIndex) return day;
        return {
          ...day,
          items: reorderItineraryItems(day.items.filter((_, index) => index !== itemIndex)).map(
            (item, sequenceIndex) => ({ ...item, sequence: sequenceIndex + 1 }),
          ),
        };
      }),
    );
  }

  function openVisaForm(entry?: { dayIndex: number; itemIndex: number; item: TripDayItemState }) {
    if (entry) {
      const existingCost = costLines.find(
        (line) => line.itinerary_item_id === entry.item.id && line.cost_category === "VISA",
      );
      setEditingVisa({ dayIndex: entry.dayIndex, itemIndex: entry.itemIndex });
      setVisaForm({
        country: entry.item.visa_country ?? "",
        type: entry.item.visa_type ?? "",
        details: entry.item.visa_customer_information ?? entry.item.description ?? "",
        cost: String(existingCost?.unit_cost ?? ""),
        currency: existingCost?.currency ?? "INR",
        startTime: entry.item.departure_time ?? "",
        endTime: entry.item.arrival_time ?? "",
      });
    } else {
      setEditingVisa(null);
      setVisaForm({
        country: "",
        type: "",
        details: "",
        cost: "",
        currency: "INR",
        startTime: "09:00",
        endTime: "10:00",
      });
    }
    setVisaFormOpen(true);
  }

  function saveVisa() {
    const country = visaForm.country.trim();
    const type = visaForm.type.trim();
    const cost = visaForm.cost.trim();
    if (!country || !type || !visaForm.startTime || !visaForm.endTime) {
      toast.error("Visa country, visa type, start time, and end time are required.");
      return;
    }
    if (cost && (!Number.isFinite(Number(cost)) || Number(cost) < 0)) {
      toast.error(`Visa cost must be a non-negative amount in ${visaForm.currency}.`);
      return;
    }
    const visaCostInr = cost
      ? convertToInr(Number(cost), visaForm.currency as CurrencyCode, rates?.rates)
      : 0;
    if (visaCostInr === null) {
      toast.error(
        "Live exchange rates are required to save this visa cost in INR. Please try again.",
      );
      return;
    }

    const details = visaForm.details.trim();
    const existingItem = editingVisa
      ? days[editingVisa.dayIndex]?.items[editingVisa.itemIndex]
      : undefined;
    const visaItemId = existingItem?.id ?? crypto.randomUUID();
    const updates: Partial<TripDayItemState> = {
      id: visaItemId,
      title: `${country} ${type}`,
      item_type: "VISA",
      visa_country: country,
      visa_type: type,
      visa_customer_information: details,
      description: details,
      departure_time: visaForm.startTime,
      arrival_time: visaForm.endTime,
    };

    setCostLines((current) => {
      const existingLine = current.find(
        (line) => line.itinerary_item_id === visaItemId && line.cost_category === "VISA",
      );
      if (!cost)
        return current.filter(
          (line) => !(line.itinerary_item_id === visaItemId && line.cost_category === "VISA"),
        );
      const costLine = createItineraryCostLine({
        ...(existingLine ?? {}),
        id: existingLine?.id ?? crypto.randomUUID(),
        itinerary_id: currentItineraryId ?? "00000000-0000-0000-0000-000000000000",
        itinerary_item_id: visaItemId,
        cost_category: "VISA",
        description: `${country} ${type} visa`,
        quantity: 1,
        unit: "visa",
        unit_cost: Number(cost),
        unit_cost_inr: visaCostInr,
        total_cost_inr: visaCostInr,
        currency: visaForm.currency,
        exchange_rate: cost && Number(cost) > 0 ? visaCostInr / Number(cost) : 1,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
        sequence: existingLine?.sequence ?? current.length + 1,
        source: existingLine?.source ?? "manual",
      });
      return existingLine
        ? current.map((line) => (line.id === existingLine.id ? costLine : line))
        : [...current, costLine];
    });

    if (editingVisa) {
      updateItem(editingVisa.dayIndex, editingVisa.itemIndex, updates);
    } else {
      setDays((current) => {
        const targetDays = current.length > 0 ? current : [{ ...EMPTY_DAY, items: [] }];
        return targetDays.map((day, dayIndex) =>
          dayIndex === 0
            ? {
                ...day,
                items: [
                  ...day.items,
                  { ...defaultItemForType("VISA", day.items.length + 1), ...updates },
                ],
              }
            : day,
        );
      });
    }

    setVisaFormOpen(false);
    setEditingVisa(null);
    toast.success(editingVisa ? "Visa updated." : "Visa added.");
  }

  function moveItemToDay(dayIndex: number, itemIndex: number, targetDayIndex: number) {
    if (dayIndex === targetDayIndex || targetDayIndex < 0 || targetDayIndex >= days.length) return;
    setDays((current) => {
      const source = current[dayIndex];
      const item = source?.items[itemIndex];
      if (!source || !item) return current;
      return current.map((day, index) => {
        if (index === dayIndex) {
          return {
            ...day,
            items: reorderItineraryItems(
              day.items.filter((_, itemPosition) => itemPosition !== itemIndex),
            ).map((entry, sequence) => ({ ...entry, sequence: sequence + 1 })),
          };
        }
        if (index === targetDayIndex) {
          return {
            ...day,
            items: [
              ...day.items,
              { ...item, itinerary_day_id: day.id, sequence: day.items.length + 1 },
            ],
          };
        }
        return day;
      });
    });
  }

  function openTimelineEvent(event: TimelineEvent) {
    const { item, dayIndex, itemIndex } = event;
    if (item.item_type === "ACCOMMODATION") {
      setSelectedHotelOption(getItineraryOption(item));
      updateItem(dayIndex, itemIndex, {
        metadata: { ...(item.metadata ?? {}), hotel_saved: false },
      });
      setActiveSection("hotels");
      setHotelsDialogOpen(true);
      return;
    }
    if (
      item.item_type === "ACTIVITY" ||
      item.item_type === "SIGHTSEEING" ||
      item.item_type === "TRANSPORT"
    ) {
      const savedKey = item.item_type === "TRANSPORT" ? "transfer_saved" : "activity_saved";
      updateItem(dayIndex, itemIndex, {
        metadata: { ...(item.metadata ?? {}), [savedKey]: false },
      });
      setActiveSection("activities");
      setActivitiesTransfersDialogOpen(true);
      return;
    }
    if (item.item_type === "FLIGHT") {
      setSelectedFlightOption(getItineraryOption(item));
      setEditingFlightId(item.id ?? `${dayIndex}-${itemIndex}`);
      setActiveSection("flight");
      setFlightDialogOpen(true);
      return;
    }
    if (item.item_type === "VISA") {
      openVisaForm({ dayIndex, itemIndex, item });
      return;
    }
    setTimelineEditingItem({ dayIndex, itemIndex });
  }

  function changeTimelineSchedule(event: TimelineEvent, change: ScheduleChange) {
    const destinationIndex = days.findIndex((day) => day.date === change.startDate);
    if (destinationIndex < 0) {
      toast.error("Timeline events must stay within the itinerary dates.");
      return;
    }

    const sourceDay = days[event.dayIndex];
    const item = sourceDay?.items[event.itemIndex];
    if (!item) return;
    const duration =
      durationFromParts(
        String(Math.floor(change.durationMinutes / 60)),
        String(change.durationMinutes % 60),
      ) ?? "";
    const updates: Partial<TripDayItemState> = {};
    if (item.item_type === "ACCOMMODATION") {
      updates.check_in = change.startDate;
      updates.check_out = change.endDate;
      updates.nights = Math.max(
        1,
        Math.round(
          (Date.parse(`${change.endDate}T00:00:00Z`) -
            Date.parse(`${change.startDate}T00:00:00Z`)) /
            86_400_000,
        ),
      );
      updates.metadata = {
        ...(item.metadata ?? {}),
        check_in_time: change.startTime || item.metadata?.check_in_time || "15:00",
        check_out_time: change.endTime || item.metadata?.check_out_time || "11:00",
      };
    } else if (item.item_type === "FLIGHT") {
      updates.flight_departure_date = change.startDate;
      updates.flight_departure_time = change.startTime || null;
      updates.flight_arrival_date = change.endDate;
      updates.flight_arrival_time = change.endTime || null;
    } else if (item.item_type === "EXTRA_TRANSPORT") {
      updates.extra_transport_date = change.startDate;
      updates.extra_transport_pickup_time = change.startTime || null;
      updates.extra_transport_drop_time = change.endTime || null;
      updates.duration = duration;
    } else if (item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING") {
      updates.metadata = { ...(item.metadata ?? {}), activity_date: change.startDate };
      updates.departure_time = change.startTime || null;
      updates.duration = duration;
    } else if (item.item_type === "TRANSPORT") {
      updates.departure_time = change.startTime || null;
      updates.arrival_time = change.endTime || null;
      updates.duration = duration;
    } else {
      updates.departure_time = change.startTime || null;
      updates.arrival_time = change.endTime || null;
      updates.duration = duration;
    }

    const updatedItem = { ...item, id: item.id ?? crypto.randomUUID(), ...updates };
    const nextDays = days.map((day) => ({ ...day, items: [...day.items] }));
    if (destinationIndex === event.dayIndex) {
      nextDays[destinationIndex]!.items[event.itemIndex] = updatedItem;
    } else {
      nextDays[event.dayIndex]!.items.splice(event.itemIndex, 1);
      nextDays[destinationIndex]!.items.push({
        ...updatedItem,
        itinerary_day_id: nextDays[destinationIndex]!.id,
        sequence: nextDays[destinationIndex]!.items.length + 1,
      });
    }
    setDays(nextDays);
    const saveKind =
      updatedItem.item_type === "ACCOMMODATION"
        ? "hotel"
        : updatedItem.item_type === "FLIGHT"
          ? "flight"
          : updatedItem.item_type === "TRANSPORT"
            ? "transfer"
            : updatedItem.item_type === "ACTIVITY" || updatedItem.item_type === "SIGHTSEEING"
              ? "activity"
              : "timeline";
    void saveItinerary(false, updatedItem.title, updatedItem.id, saveKind, undefined, nextDays);
  }

  function addCostLine() {
    setCostLines((current) => [
      ...current,
      createItineraryCostLine({
        id: crypto.randomUUID(),
        itinerary_id: currentItineraryId ?? "00000000-0000-0000-0000-000000000000",
        cost_category: "OTHER",
        description: "New internal cost",
        quantity: 1,
        unit: "unit",
        unit_cost: 0,
        currency: "INR",
        sequence: current.length + 1,
      }),
    ]);
  }

  function addLandPackageExtraCost() {
    setCostLines((current) => [
      ...current,
      createItineraryCostLine({
        id: crypto.randomUUID(),
        itinerary_id: currentItineraryId ?? "00000000-0000-0000-0000-000000000000",
        cost_category: "OTHER",
        description: "Additional cost",
        quantity: 1,
        unit: "service",
        unit_cost: 0,
        currency: "INR",
        sequence: current.length + 1,
        source: "manual",
        source_reference: "land-package-extra",
      }),
    ]);
  }

  function saveTransportCost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = transportCostForm.title.trim();
    const type = transportCostForm.type.trim();
    if (!title || !type) return;
    const amount = Number(transportCostForm.cost) || 0;
    const amountInr = convertToInr(
      amount,
      transportCostForm.currency as CurrencyCode,
      rates?.rates,
    );
    if (amountInr === null) {
      toast.error("Live exchange rates are required to save this cost in INR. Please try again.");
      return;
    }

    setCostLines((current) => [
      ...current,
      createItineraryCostLine({
        id: crypto.randomUUID(),
        itinerary_id: currentItineraryId ?? "00000000-0000-0000-0000-000000000000",
        cost_category: "TRANSPORT",
        description: `${title} - ${type}`,
        quantity: 1,
        unit: "service",
        unit_cost: amount,
        unit_cost_inr: amountInr,
        total_cost_inr: amountInr,
        currency: transportCostForm.currency,
        exchange_rate: amount > 0 ? amountInr / amount : 1,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
        notes: transportCostForm.details.trim() || null,
        sequence: current.length + 1,
      }),
    ]);
    setTransportCostForm({ title: "", type: "", cost: "", currency: "INR", details: "" });
    setAddTransportCostDialogOpen(false);
  }

  function createCustomTable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rows = Math.min(6, Math.max(1, Number(newTableSize.rows) || 1));
    const columns = Math.min(6, Math.max(1, Number(newTableSize.columns) || 1));
    setForm((current) => ({
      ...current,
      custom_tables: [
        ...current.custom_tables,
        {
          id: crypto.randomUUID(),
          title: `Table ${current.custom_tables.length + 1}`,
          columns: Array.from({ length: columns }, (_, index) => `Column ${index + 1}`),
          rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => "")),
        },
      ],
    }));
    setNewTableDialogOpen(false);
  }

  function updateCustomTable(
    tableIndex: number,
    updates: Partial<TripForm["custom_tables"][number]>,
  ) {
    setForm((current) => ({
      ...current,
      custom_tables: current.custom_tables.map((table, index) =>
        index === tableIndex ? { ...table, ...updates } : table,
      ),
    }));
  }

  function saveCustomTable() {
    void saveItinerary(false).then((saved) => {
      if (saved) toast.success("Table saved");
    });
  }

  function updateCostLineById(id: string, changes: Partial<ItineraryCostLine>) {
    setCostLines((current) =>
      current.map((line) => (line.id === id ? updateItineraryCostLine(line, changes) : line)),
    );
  }

  function deleteCostLineById(id?: string | null) {
    setCostLines((current) => deleteItineraryCostLine(current, id));
  }

  function movePhoto(index: number, direction: "up" | "down") {
    setForm((current) => {
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.photos.length) return current;
      const swapped = [...current.photos];
      [swapped[index], swapped[nextIndex]] = [swapped[nextIndex]!, swapped[index]!];
      return {
        ...current,
        photos: reorderItineraryPhotos(swapped).map((photo, sequenceIndex) => ({
          ...photo,
          sequence: sequenceIndex + 1,
        })),
      };
    });
  }

  async function saveItinerary(
    resetAfterSave = false,
    activityTitle?: string,
    savedItemId?: string,
    savedItemKind?: "activity" | "transfer" | "hotel" | "flight" | "timeline",
    saveHotelsOption?: ItineraryOption,
    daysOverride?: TripDay[],
    documentHtmlOverride?: string,
    formOverride?: Partial<TripForm>,
    allowMissingDestination = false,
  ): Promise<boolean> {
    if (copyMode && !form.customer_id) {
      toast.error("Choose a customer before saving this itinerary copy.");
      return false;
    }
    if (
      copyMode &&
      !copyPreviewReviewed &&
      new URLSearchParams(window.location.search).get("assignNow") !== "1"
    ) {
      toast.error("Preview the itinerary for this customer before saving their copy.");
      return false;
    }
    setSaving(true);
    setMessage(null);

    try {
      const sourceDays = daysOverride ?? days;
      const daysToSave = sourceDays.map((day) => ({
        ...day,
        id: day.id ?? crypto.randomUUID(),
        items: day.items.map((item, itemIndex) => ({
          ...item,
          id: item.id ?? crypto.randomUUID(),
          sequence: itemIndex + 1,
          metadata:
            item.item_type === "ACCOMMODATION"
              ? {
                  ...(item.metadata ?? {}),
                  check_in_time:
                    typeof item.metadata?.check_in_time === "string" && item.metadata.check_in_time
                      ? item.metadata.check_in_time
                      : "15:00",
                  check_out_time:
                    typeof item.metadata?.check_out_time === "string" &&
                    item.metadata.check_out_time
                      ? item.metadata.check_out_time
                      : "11:00",
                  ...(saveHotelsOption && getItineraryOption(item) === saveHotelsOption
                    ? { hotel_saved: true }
                    : {}),
                  ...(savedItemKind === "hotel" && item.id === savedItemId
                    ? { hotel_saved: true }
                    : {}),
                }
              : item.metadata,
          ...(item.item_type === "ACCOMMODATION"
            ? (() => {
                const fallback = hotelDatesForDay(day.date);
                const checkIn = item.check_in || fallback.checkIn;
                const checkOut = item.check_out || fallback.checkOut;
                return {
                  check_in: checkIn,
                  check_out: checkOut,
                  nights:
                    checkIn && checkOut
                      ? nightsBetween(checkIn, checkOut)
                      : Math.max(0, Number(item.nights) || 0),
                };
              })()
            : {}),
        })),
      }));
      const validationItems = savedItemKind
        ? daysToSave.flatMap((day) => day.items).filter((item) => item.id === savedItemId)
        : daysToSave.flatMap((day) => day.items);
      const invalidFlight = validationItems
        .map((item) => ({
          item,
          error: item.item_type === "FLIGHT" ? validateFlightTimeOrder(item) : null,
        }))
        .find(({ error }) => error);
      if (invalidFlight?.error) throw new Error(invalidFlight.error);
      const selectedServiceDay = savedItemKind
        ? daysToSave.find((day) => day.items.some((item) => item.id === savedItemId))
        : undefined;
      if (savedItemKind && !selectedServiceDay)
        throw new Error(
          "The selected itinerary item is no longer available. Reopen it and try again.",
        );
      if (savedItemKind === "activity" || savedItemKind === "transfer") {
        const selectedItem = selectedServiceDay?.items.find((item) => item.id === savedItemId);
        if (!selectedItem?.departure_time || !selectedItem.arrival_time) {
          throw new Error(`Enter both start and end times before saving this ${savedItemKind}.`);
        }
      }
      const saveTitle =
        (formOverride?.title ?? form.title).trim() || activityTitle?.trim() || "Activity itinerary";
      const saveDestinationId =
        (formOverride?.destination_id ?? form.destination_id) ||
        destinations.find((destination) => destination.name === destinationName)?.id ||
        "";
      const validation = validateItineraryDraftState(
        {
          title: saveTitle,
          ...(!savedItemKind
            ? {
                customer_id: (formOverride?.customer_id ?? form.customer_id) || null,
                lead_id: (formOverride?.lead_id ?? form.lead_id) || null,
                enquiry_id: form.enquiry_id || null,
              }
            : {}),
          destination_id: saveDestinationId || null,
          travel_start_date: (formOverride?.travel_start_date ?? form.travel_start_date) || null,
          travel_end_date: (formOverride?.travel_end_date ?? form.travel_end_date) || null,
          adults: formOverride?.adults ?? form.adults,
          children: formOverride?.children ?? form.children,
          ...(!savedItemKind ? { assigned_to: form.assigned_to || null } : {}),
          status: formOverride?.status ?? form.status,
          summary: form.provenance ?? null,
          inclusions: form.inclusions,
          exclusions: form.exclusions,
          cancellation_info: form.cancellation_info,
          custom_tables: savedItemKind ? [] : form.custom_tables,
          photos: savedItemKind ? [] : form.photos,
          days: (selectedServiceDay
            ? [
                {
                  ...selectedServiceDay,
                  items: selectedServiceDay.items.filter((item) => item.id === savedItemId),
                },
              ]
            : daysToSave
          ).map((day) => ({
            day_number: day.day_number,
            date: day.date,
            title: day.title,
            items: day.items.map((item) => ({
              sequence: item.sequence,
              item_type: item.item_type,
              title: item.title,
              location: item.location,
              hotel_name: item.hotel_name,
              check_in: item.check_in,
              check_out: item.check_out,
              check_in_time:
                typeof item.metadata?.check_in_time === "string"
                  ? item.metadata.check_in_time
                  : null,
              check_out_time:
                typeof item.metadata?.check_out_time === "string"
                  ? item.metadata.check_out_time
                  : null,
              activity_date:
                typeof item.metadata?.activity_date === "string"
                  ? item.metadata.activity_date
                  : null,
              extra_transport_date: item.extra_transport_date,
              departure_time: item.departure_time,
              arrival_time: item.arrival_time,
              duration: item.duration,
              extra_transport_pickup_time: item.extra_transport_pickup_time,
              extra_transport_drop_time: item.extra_transport_drop_time,
              nights: item.nights,
              rooms: item.rooms,
              adults: item.adults,
              children: item.children,
              meal_plan: item.meal_plan,
              star_category: item.star_category,
              room_type: item.room_type,
              flight_departure_date: item.flight_departure_date,
              flight_arrival_date: item.flight_arrival_date,
              flight_departure_time: item.flight_departure_time,
              flight_arrival_time: item.flight_arrival_time,
              flight_price: item.flight_price,
              flight_currency: item.flight_currency,
              pickup: item.pickup,
              dropoff: item.dropoff,
              extra_transport_passengers: item.extra_transport_passengers,
              visa_country: item.visa_country,
              extra_transport_type: item.extra_transport_type,
            })),
          })),
        },
        {
          allowMissingDestination:
            Boolean(savedItemKind) ||
            allowMissingDestination ||
            form.provenance === "AI_SUPPLIER_IMPORT",
        },
      );

      if (!validation.valid) {
        const firstIssue = validation.errors[0];
        throw new Error(
          firstIssue ? firstIssue.message : "The itinerary has blocking validation issues.",
        );
      }

      const { data: sessionData } = await supabase.auth.getUser();
      const libraryFields = buildItineraryLibrarySaveFields({
        title: saveTitle,
        dayCount: daysToSave.length,
        status: formOverride?.status ?? form.status,
      });
      const itineraryPayload = {
        ...copyMetadata,
        ...(!currentItineraryId && copyMetadata.package_id ? { package_id: null } : {}),
        title: saveTitle,
        ...libraryFields,
        ...(!savedItemKind
          ? {
              customer_id: (formOverride?.customer_id ?? form.customer_id) || null,
              lead_id: (formOverride?.lead_id ?? form.lead_id) || null,
              enquiry_id: form.enquiry_id || null,
            }
          : {}),
        destination_id: saveDestinationId || null,
        travel_start_date: (formOverride?.travel_start_date ?? form.travel_start_date) || null,
        travel_end_date: (formOverride?.travel_end_date ?? form.travel_end_date) || null,
        adults: Number(formOverride?.adults ?? form.adults) || 0,
        children: Number(formOverride?.children ?? form.children) || 0,
        ...(!savedItemKind ? { assigned_to: form.assigned_to || null } : {}),
        created_by: sessionData.user?.id ?? null,
        inclusions: sanitizeListValues(form.inclusions),
        exclusions: sanitizeListValues(form.exclusions),
        cancellation_info: (form.cancellation_info ?? "").trim(),
        terms_conditions: (form.terms_conditions ?? "").trim(),
        ...(!allowMissingDestination ? { customer_quotes: form.customer_quotes } : {}),
        // Item saves must not depend on the separate document_html migration being deployed.
        ...(savedItemKind || allowMissingDestination
          ? {}
          : { document_html: documentHtmlOverride ?? form.document_html }),
        custom_tables: (form.custom_tables ?? [])
          .filter((table) => (table.title ?? "").trim())
          .map((table) => validateItineraryTable(table)),
      };

      let savedItineraryId = currentItineraryId;
      if (currentItineraryId) {
        const { error: itineraryError } = await supabase
          .from("itineraries")
          .update(itineraryPayload)
          .eq("id", currentItineraryId);

        if (itineraryError) throw itineraryError;
      } else {
        const { data: inserted, error: itineraryError } = await supabase
          .from("itineraries")
          .insert(itineraryPayload)
          .select("id")
          .single();

        if (itineraryError) throw itineraryError;
        if (!inserted?.id) throw new Error("Itinerary could not be saved.");
        savedItineraryId = inserted.id;
        setCurrentItineraryId(inserted.id);
      }

      if (!savedItineraryId) throw new Error("Itinerary could not be saved.");
      savedTermsSnapshotRef.current = buildItineraryTermsSnapshot({
        inclusions: form.inclusions,
        exclusions: form.exclusions,
        cancellation_info: form.cancellation_info,
        terms_conditions: form.terms_conditions,
      });

      if (previewPackageOptions.length > 0) {
        const { error: packageOptionsError } = await supabase
          .from("itinerary_package_options")
          .upsert(
            previewPackageOptions.map((option, index) => ({
              id: option.id,
              itinerary_id: savedItineraryId,
              name: option.name,
              description: option.description ?? null,
              sequence: option.sequence ?? index + 1,
              is_active: option.is_active ?? true,
            })),
            { onConflict: "id" },
          );

        if (packageOptionsError) throw packageOptionsError;
      }

      if (!currentItineraryId && copyMetadata.package_id) {
        const { error: packageLinkError } = await supabase
          .from("itineraries")
          .update({ package_id: copyMetadata.package_id })
          .eq("id", savedItineraryId);

        if (packageLinkError) throw packageLinkError;
      }

      const { data: dayRows, error: dayError } = await supabase
        .from("itinerary_days")
        .upsert(
          daysToSave.map((day, position) => ({
            id: day.id,
            itinerary_id: savedItineraryId,
            day_number: position + 1,
            day_date: day.date || null,
            title: day.title || `Day ${position + 1}`,
            description: day.description || null,
            notes: day.notes || null,
          })),
          { onConflict: "id" },
        )
        .select("id, day_number");

      if (dayError) throw dayError;

      const savedDays = new Map((dayRows ?? []).map((day) => [Number(day.day_number), day.id]));
      const itemPayloads: Array<Database["public"]["Tables"]["itinerary_day_items"]["Insert"]> = [];
      for (const day of selectedServiceDay ? [selectedServiceDay] : daysToSave) {
        const dayNumber = day.day_number;
        const savedDayId = savedDays.get(dayNumber);
        if (!savedDayId) continue;

        const itemsForPersistence = savedItemKind
          ? day.items.filter((item) => item.id === savedItemId)
          : day.items;
        const orderedItems = reorderItineraryItems(itemsForPersistence).map((item, index) => ({
          ...item,
          id: item.id ?? crypto.randomUUID(),
          itinerary_day_id: savedDayId,
          sequence: index + 1,
          title: item.title || `Item ${index + 1}`,
          metadata:
            item.id && item.id === savedItemId && savedItemKind
              ? {
                  ...(item.metadata ?? {}),
                  [savedItemKind === "timeline" ? "timeline_saved" : `${savedItemKind}_saved`]:
                    true,
                }
              : item.metadata,
        }));

        for (const item of orderedItems) {
          const normalizedInput = {
            ...item,
            itinerary_day_id: savedDayId,
            item_type: item.item_type,
            sequence: item.sequence,
            ...(typeof item.id === "string" ? { id: item.id } : {}),
          };
          const normalized = normalizeItineraryItem(normalizedInput);
          const validated = validateItineraryDayItem({
            ...normalized,
            itinerary_day_id: savedDayId,
            item_type: normalized.item_type,
            title: normalized.title,
            description: normalized.description,
            sequence: normalized.sequence,
          });
          itemPayloads.push({
            id: validated.id ?? crypto.randomUUID(),
            itinerary_day_id: savedDayId,
            package_id: validated.package_id ?? null,
            item_type: validated.item_type,
            title: validated.title,
            description: validated.description ?? "",
            notes: validated.notes ?? null,
            location: validated.location ?? null,
            duration: validated.duration ?? null,
            pickup: validated.pickup ?? null,
            dropoff: validated.dropoff ?? null,
            departure_time: validated.departure_time ?? null,
            arrival_time: validated.arrival_time ?? null,
            vehicle_details: validated.vehicle_details ?? null,
            meal_type: validated.meal_type ?? null,
            hotel_name: validated.hotel_name ?? null,
            hotel_city: validated.hotel_city ?? null,
            check_in: validated.check_in ?? null,
            check_out: validated.check_out ?? null,
            room_details: validated.room_details ?? null,
            hotel_address: validated.hotel_address ?? null,
            hotel_country: validated.hotel_country ?? null,
            star_category: validated.star_category ?? null,
            nights:
              validated.item_type === "ACCOMMODATION"
                ? validated.check_in && validated.check_out
                  ? nightsBetween(validated.check_in, validated.check_out)
                  : (validated.nights ?? null)
                : null,
            room_type: validated.room_type ?? null,
            rooms: validated.rooms ?? null,
            adults: validated.adults ?? null,
            children: validated.children ?? null,
            extra_beds: validated.extra_beds ?? null,
            meal_plan: validated.meal_plan ?? null,
            hotel_description: validated.hotel_description ?? null,
            customer_facing_info: validated.customer_facing_info ?? null,
            hotel_option_group: validated.hotel_option_group ?? null,
            hotel_option_label: validated.hotel_option_label ?? null,
            hotel_option_sequence: validated.hotel_option_sequence ?? null,
            flight_airline: validated.flight_airline ?? null,
            flight_number: validated.flight_number ?? null,
            departure_airport: validated.departure_airport ?? null,
            departure_city: validated.departure_city ?? null,
            arrival_airport: validated.arrival_airport ?? null,
            arrival_city: validated.arrival_city ?? null,
            flight_departure_date: validated.flight_departure_date ?? null,
            flight_departure_time: validated.flight_departure_time ?? null,
            flight_arrival_date: validated.flight_arrival_date ?? null,
            flight_arrival_time: validated.flight_arrival_time ?? null,
            flight_cabin: validated.flight_cabin ?? null,
            baggage_information: validated.baggage_information ?? null,
            flight_duration: validated.flight_duration ?? null,
            flight_price: validated.flight_price ?? null,
            flight_currency: validated.flight_currency ?? null,
            visa_country: validated.visa_country ?? null,
            visa_type: validated.visa_type ?? null,
            visa_validity: validated.visa_validity ?? null,
            visa_processing_time: validated.visa_processing_time ?? null,
            visa_required_documents: validated.visa_required_documents ?? null,
            visa_entry_exit_information: validated.visa_entry_exit_information ?? null,
            visa_customer_information: validated.visa_customer_information ?? null,
            extra_transport_type: validated.extra_transport_type ?? null,
            extra_transport_date: validated.extra_transport_date ?? null,
            extra_transport_pickup_time: validated.extra_transport_pickup_time ?? null,
            extra_transport_drop_time: validated.extra_transport_drop_time ?? null,
            extra_transport_vehicle_type: validated.extra_transport_vehicle_type ?? null,
            extra_transport_vehicle_details: validated.extra_transport_vehicle_details ?? null,
            extra_transport_driver_details: validated.extra_transport_driver_details ?? null,
            extra_transport_passengers: validated.extra_transport_passengers ?? null,
            extra_transport_customer_notes: validated.extra_transport_customer_notes ?? null,
            metadata: validated.metadata ?? {},
            sequence: validated.sequence,
          });
        }
      }

      if (itemPayloads.length > 0) {
        const { error: itemError } = await supabase
          .from("itinerary_day_items")
          .upsert(itemPayloads, { onConflict: "id" });
        if (itemError) throw itemError;
      }

      if (savedItemKind) {
        if (savedItemKind === "activity" || savedItemKind === "transfer") {
          setActivitiesTransfersEnabled(true);
        }
        setDays((current) =>
          current.map((day, dayIndex) => {
            const persistedDay = daysToSave[dayIndex];
            const persistedDayId =
              dayRows?.find((row) => Number(row.day_number) === day.day_number)?.id ??
              persistedDay?.id ??
              day.id;
            return {
              ...day,
              ...(persistedDayId ? { id: persistedDayId } : {}),
              items: day.items.map((item, itemIndex) => {
                const persistedItem = persistedDay?.items[itemIndex];
                const savedFlag =
                  item.id === savedItemId
                    ? {
                        [savedItemKind === "timeline"
                          ? "timeline_saved"
                          : `${savedItemKind}_saved`]: true,
                      }
                    : {};
                return {
                  ...item,
                  ...(persistedItem?.id ? { id: persistedItem.id } : {}),
                  ...(persistedDayId ? { itinerary_day_id: persistedDayId } : {}),
                  metadata: { ...(item.metadata ?? {}), ...savedFlag },
                };
              }),
            };
          }),
        );
        window.history.replaceState(
          window.history.state,
          "",
          itineraryBuilderUrl(window.location.href, savedItineraryId),
        );
        const savedLabel =
          savedItemKind === "transfer"
            ? "Transfer"
            : savedItemKind === "hotel"
              ? "Hotel"
              : savedItemKind === "flight"
                ? "Flight"
                : savedItemKind === "timeline"
                  ? "Itinerary item"
                  : "Activity";
        setMessage(`${savedLabel} saved to the itinerary.`);
        toast.success(`${savedLabel} saved`);
        return true;
      }

      const validatedCostLines = costLines.map((line, index) =>
        validateItineraryCostLine({
          ...line,
          itinerary_id: savedItineraryId,
          itinerary_item_id: line.itinerary_item_id ?? null,
          sequence: index + 1,
        }),
      );

      if (validatedCostLines.length > 0) {
        const { error: costError } = await supabase.from("itinerary_cost_lines").upsert(
          validatedCostLines.map((line) => ({
            id: line.id ?? crypto.randomUUID(),
            itinerary_id: savedItineraryId,
            itinerary_item_id: line.itinerary_item_id ?? null,
            cost_category: line.cost_category,
            description: line.description,
            supplier_ref: line.supplier_ref ?? null,
            quantity: Number(line.quantity),
            unit: line.unit,
            unit_cost: Number(line.unit_cost),
            unit_cost_inr: line.unit_cost_inr ?? null,
            currency: line.currency,
            total_cost: Number(line.total_cost),
            total_cost_inr: line.total_cost_inr ?? null,
            exchange_rate: line.exchange_rate ?? null,
            exchange_rate_updated_at: line.exchange_rate_updated_at ?? null,
            notes: line.notes ?? null,
            sequence: Number(line.sequence),
            source: (line.source ?? "manual") as ItineraryCostLine["source"],
            source_reference: line.source_reference ?? null,
          })),
          { onConflict: "id" },
        );

        if (costError) throw costError;
      }
      setCostLines(validatedCostLines);

      const savedDayIds = new Map(
        daysToSave.map((day, index) => [
          day.id ?? `draft-day-${index}`,
          dayRows?.find((row) => Number(row.day_number) === day.day_number)?.id ?? null,
        ]),
      );
      const savedItemIds = new Map(
        daysToSave.flatMap((day, dayIndex) =>
          day.items.map(
            (item, itemIndex) =>
              [item.id ?? `draft-item-${dayIndex}-${itemIndex}`, item.id ?? null] as const,
          ),
        ),
      );
      const photoRows = form.photos
        .filter((photo) => photo.url.trim() || photo.storage_path?.trim())
        .map((photo, index) => {
          const dayId = photo.day_id ? (savedDayIds.get(photo.day_id) ?? null) : null;
          const itemId = photo.day_item_id ? (savedItemIds.get(photo.day_item_id) ?? null) : null;
          return validateItineraryPhoto({
            ...(typeof photo.id === "string" ? { id: photo.id } : {}),
            itinerary_id: savedItineraryId,
            day_id: dayId,
            day_item_id: itemId,
            url: photo.url,
            storage_path: photo.storage_path ?? null,
            caption: photo.caption,
            alt_text: photo.alt_text,
            source: photo.source,
            selection_type: photo.selection_type,
            is_primary: photo.is_primary,
            google_place_id: photo.google_place_id,
            place_name: photo.place_name,
            google_photo_reference: photo.google_photo_reference,
            attribution: photo.attribution,
            sequence: photo.sequence || index + 1,
          });
        });

      if (photoRows.length > 0) {
        const rowsToPersist = photoRows.map((photo, index) => ({
          id: photo.id ?? crypto.randomUUID(),
          itinerary_id: savedItineraryId,
          day_id: photo.day_id ?? null,
          day_item_id: photo.day_item_id ?? null,
          url: photo.url.trim() || null,
          storage_path: photo.storage_path ?? null,
          caption: photo.caption || null,
          alt_text: photo.alt_text || null,
          ...(photo.source ? { source: photo.source } : {}),
          ...(photo.selection_type ? { selection_type: photo.selection_type } : {}),
          ...(typeof photo.is_primary === "boolean" ? { is_primary: photo.is_primary } : {}),
          google_place_id: photo.google_place_id ?? null,
          place_name: photo.place_name ?? null,
          google_photo_reference: photo.google_photo_reference ?? null,
          attribution: photo.attribution ?? [],
          sequence: photo.sequence || index + 1,
        }));

        const { error: photoError } = await supabase
          .from("itinerary_photos")
          .upsert(rowsToPersist, { onConflict: "id" });
        if (photoError) throw photoError;
      }

      if (currentItineraryId) {
        const { data: existingPhotos } = await supabase
          .from("itinerary_photos")
          .select("id")
          .eq("itinerary_id", currentItineraryId);

        const remainingPhotoIds = new Set(
          (photoRows ?? [])
            .map((photo) => photo.id)
            .filter((value): value is string => Boolean(value)),
        );
        const stalePhotoIds = (existingPhotos ?? [])
          .map((photo) => photo.id)
          .filter((id) => !remainingPhotoIds.has(id));

        if (stalePhotoIds.length > 0) {
          const { error: stalePhotoError } = await supabase
            .from("itinerary_photos")
            .delete()
            .in("id", stalePhotoIds);
          if (stalePhotoError) throw stalePhotoError;
        }
      }

      setDays(
        sourceDays.map((day, dayIndex) => {
          const persistedDay = daysToSave[dayIndex];
          const persistedDayId =
            dayRows?.find((row) => Number(row.day_number) === day.day_number)?.id ??
            persistedDay?.id ??
            day.id;
          return {
            ...day,
            ...(persistedDayId ? { id: persistedDayId } : {}),
            items: day.items.map((item, itemIndex) => {
              const persistedItem = persistedDay?.items[itemIndex];
              const savedFlag = {
                ...(item.id === savedItemId && savedItemKind
                  ? {
                      [savedItemKind === "timeline" ? "timeline_saved" : `${savedItemKind}_saved`]:
                        true,
                    }
                  : {}),
                ...(item.item_type === "ACCOMMODATION" &&
                saveHotelsOption &&
                getItineraryOption(item) === saveHotelsOption
                  ? { hotel_saved: true }
                  : {}),
              };
              return {
                ...item,
                ...(persistedItem?.id ? { id: persistedItem.id } : {}),
                ...(persistedDayId ? { itinerary_day_id: persistedDayId } : {}),
                metadata: { ...(item.metadata ?? {}), ...savedFlag },
              };
            }),
          };
        }),
      );
      window.history.replaceState(
        window.history.state,
        "",
        itineraryBuilderUrl(window.location.href, savedItineraryId),
      );
      setMessage(
        "Itinerary saved with day content, inclusions, exclusions, photos, custom metadata and internal cost lines.",
      );
      toast.success("Itinerary saved");
      if (copyMode) setCopyMode(false);
      if (resetAfterSave) {
        setForm(EMPTY_FORM);
        setDays([{ ...EMPTY_DAY }]);
        setCostLines([]);
        setCurrentItineraryId(null);
        window.history.replaceState(
          window.history.state,
          "",
          itineraryBuilderUrl(window.location.href, null),
        );
      }
      return true;
    } catch (error) {
      console.error("[Itinerary builder] Save failed", error);
      const errorMessage = saveErrorMessage(error);
      setMessage(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      !draftReady ||
      !copyMode ||
      params.get("assignNow") !== "1" ||
      assignmentAutoSaveStartedRef.current
    )
      return;

    assignmentAutoSaveStartedRef.current = true;
    void saveItinerary(false).then((saved) => {
      if (!saved) return;
      const currentParams = new URLSearchParams(window.location.search);
      currentParams.delete("assignNow");
      currentParams.delete("copyName");
      const query = currentParams.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
      toast.success("New assigned itinerary saved");
    });
  }, [copyMode, currentItineraryId, draftReady]);

  function openLibraryNameDialog() {
    setLibraryItineraryName(form.title.trim() || `${destinationName || "Trip"} itinerary`);
    setLibraryNameDialogOpen(true);
  }

  async function saveItineraryToLibrary() {
    if (librarySaveInProgress || saving) return;
    const itineraryName = libraryItineraryName.trim();
    if (!itineraryName) {
      toast.error("Enter a name for this itinerary.");
      return;
    }
    setLibrarySaveInProgress(true);
    try {
      const saved = await saveItinerary(
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { status: "READY", title: itineraryName },
      );
      if (!saved) return;
      setForm((current) => ({ ...current, title: itineraryName }));
      setLibraryNameDialogOpen(false);

      const savedItineraryId = new URL(window.location.href).searchParams.get("itineraryId");
      let draftCleanupFailed = false;
      if (draftOwnerId) {
        try {
          await draftAutosavePromiseRef.current;
          if (currentDraftId) {
            const { error: draftError } = await supabase
              .from("itinerary_drafts")
              .delete()
              .eq("id", currentDraftId)
              .eq("user_id", draftOwnerId);
            if (draftError) throw draftError;
          }
        } catch (cleanupError) {
          console.warn(
            "[Itinerary builder] Saved library itinerary, but could not remove its database draft copy.",
            cleanupError,
          );
          draftCleanupFailed = true;
        }

        const prefix = `savr-itinerary-draft:${draftOwnerId}:`;
        try {
          const keysToRemove: string[] = [];
          const removedDraftIds = new Set<string>();
          for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key?.startsWith(prefix) || !key.endsWith(":id")) continue;
            const storageBase = key.slice(0, -":id".length);
            const draftId = window.localStorage.getItem(key);
            let isSavedDraft = draftId === currentDraftId;
            if (!isSavedDraft && savedItineraryId) {
              const rawSnapshot = window.localStorage.getItem(`${storageBase}:snapshot`);
              try {
                const entry = JSON.parse(rawSnapshot ?? "null") as {
                  snapshot?: { itineraryId?: unknown };
                } | null;
                isSavedDraft = entry?.snapshot?.itineraryId === savedItineraryId;
              } catch {
                // An unreadable browser snapshot cannot be matched to a saved itinerary.
              }
            }
            if (isSavedDraft) {
              if (draftId) removedDraftIds.add(draftId);
              keysToRemove.push(`${storageBase}:id`, `${storageBase}:snapshot`);
            }
          }
          keysToRemove.forEach((key) => window.localStorage.removeItem(key));
          const latestKey = itineraryDraftLatestKey(draftOwnerId);
          if (removedDraftIds.has(window.localStorage.getItem(latestKey) ?? ""))
            window.localStorage.removeItem(latestKey);
        } catch (storageError) {
          console.warn(
            "[Itinerary builder] Saved library itinerary, but could not clear its browser draft copy.",
            storageError,
          );
          draftCleanupFailed = true;
        }
      }

      setForm((current) => ({ ...current, status: "READY" }));
      setCurrentDraftId(null);
      setDraftSaveState("saved");
      void queryClient.invalidateQueries({ queryKey: ["itinerary-drafts"] });
      if (draftCleanupFailed) {
        toast.warning(
          "Itinerary saved to the library, but its previous database draft could not be removed.",
        );
      } else {
        toast.success("Complete itinerary saved to the library.");
      }
      await navigate({ to: "/itinerary-library" });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "The itinerary could not be moved from drafts to the library.";
      setMessage(`The itinerary is saved, but draft cleanup failed: ${errorMessage}`);
      toast.error("Could not finish moving the draft to the library.");
    } finally {
      setLibrarySaveInProgress(false);
    }
  }

  const destinationName = destinations.find(
    (destination) => destination.id === form.destination_id,
  )?.name;
  const assignedProfile = profiles.find((profile) => profile.id === form.assigned_to);
  const assignedProfileName = assignedProfile
    ? assignedProfile.full_name || assignedProfile.email
    : form.assigned_to
      ? "Unavailable team member"
      : "Unassigned";
  const linkedCustomer = customers.find((customer) => customer.id === form.customer_id) ?? null;
  const customerName = linkedLead?.customer_name || linkedCustomer?.full_name || "Client details";
  const leadCityNightStays = Array.isArray(linkedLead?.city_nights)
    ? (linkedLead.city_nights as unknown[]).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const stay = entry as { city?: unknown; nights?: unknown };
        return typeof stay.city === "string" && stay.city.trim()
          ? [{ city: stay.city, nights: Number(stay.nights) || 0 }]
          : [];
      })
    : [];
  const heroPhotoState = displayedItineraryPhotos.coverPhoto;
  const heroPhoto = heroPhotoState
    ? heroPhotoState.storage_path
      ? (photoDisplayUrls[heroPhotoState.storage_path] ?? "")
      : heroPhotoState.url
    : "";
  const itineraryLabel = currentItineraryId
    ? currentItineraryId.slice(0, 8).toUpperCase()
    : "New itinerary";
  const routeSummary = sortedDays
    .filter((day) => day.title.trim())
    .map((day) => {
      const nights = day.items
        .filter((item) => item.item_type === "ACCOMMODATION")
        .reduce((total, item) => total + Number(item.nights ?? 0), 0);
      return nights > 0 ? `${day.title} (${nights} N)` : day.title;
    })
    .join(", ");
  const sectionTabs = [
    ["day", "Overview"],
    ["timeline", "Timeline"],
    ["flight", "Flight"],
    ["activities", "Activities/Transfers"],
    ["hotels", "Hotels"],
    ["inclusions", "Inclusions/Exclusions"],
    ["visa", "Visa"],
    ["transport", "Transport/Other"],
    ["tables", "Tables"],
  ] as const;

  function focusSection(section: string) {
    if (section === "flight") {
      setFlightDialogOpen(true);
      return;
    }
    setActiveSection(section);
    const sectionTarget: Record<string, string> = {
      activities:
        '[data-builder-type="ACTIVITY"], [data-builder-type="SIGHTSEEING"], [data-builder-type="TRANSPORT"]',
      hotels: '[data-builder-type="ACCOMMODATION"]',
      flight: '[data-builder-type="FLIGHT"]',
      visa: '[data-builder-type="VISA"]',
      transport: '[data-builder-type="EXTRA_TRANSPORT"]',
    };
    const target = sectionTarget[section]
      ? document.querySelector(sectionTarget[section])
      : document.getElementById(`builder-${section}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openLandPackageQuote() {
    setRightPanel("land-package");
  }

  function openFlightQuote() {
    setRightPanel("flights");
  }

  function addResearchItem(kind: ResearchKind, values: Record<string, string | number | null>) {
    setDays((current) => {
      const itemType = kind === "hotel" ? "ACCOMMODATION" : "FLIGHT";
      const targetDays = current.length > 0 ? current : [{ ...EMPTY_DAY }];
      const itemBase = {
        ...defaultItemForType(itemType, (targetDays[0]?.items.length ?? 0) + 1),
        title: kind === "hotel" ? "Hotel research" : "Flight research",
      };

      const updates: Partial<TripDayItemState> =
        kind === "hotel"
          ? {
              hotel_name: String(values.hotel_name ?? ""),
              hotel_address: String(values.hotel_address ?? ""),
              hotel_city: String(values.hotel_city ?? ""),
              hotel_country: String(values.hotel_country ?? ""),
              star_category: String(values.star_category ?? ""),
              room_type: String(values.room_type ?? ""),
              rooms: Number(values.rooms ?? 0) || 0,
              adults: Number(values.adults ?? form.adults ?? 0) || 0,
              children: Number(values.children ?? form.children ?? 0) || 0,
              meal_plan: String(values.meal_plan ?? ""),
              check_in: String(values.check_in ?? form.travel_start_date ?? ""),
              check_out: String(values.check_out ?? form.travel_end_date ?? ""),
              notes: String(values.notes ?? ""),
              hotel_description: String(values.cancellation_information ?? ""),
              customer_facing_info: String(values.cancellation_information ?? ""),
              hotel_option_label: selectedHotelOption,
            }
          : {
              flight_airline: String(values.flight_airline ?? ""),
              flight_number: String(values.flight_number ?? ""),
              departure_airport: String(values.departure_city ?? ""),
              departure_city: String(values.departure_city ?? ""),
              arrival_airport: String(values.arrival_city ?? ""),
              arrival_city: String(values.arrival_city ?? ""),
              flight_departure_date: String(
                values.flight_departure_date ?? form.travel_start_date ?? "",
              ),
              flight_departure_time: String(values.flight_departure_time ?? ""),
              flight_arrival_date: String(values.flight_arrival_date ?? form.travel_end_date ?? ""),
              flight_arrival_time: String(values.flight_arrival_time ?? ""),
              flight_cabin: String(values.flight_cabin ?? "Economy"),
              flight_duration: String(values.flight_duration ?? ""),
              baggage_information: String(values.baggage_information ?? ""),
              flight_price: values.flight_price ? Number(values.flight_price) : null,
              flight_currency: String(values.flight_currency ?? "INR"),
              notes: String(values.notes ?? ""),
              metadata: {
                flight_saved: true,
                flight_option: String(values.flight_option ?? "Option 1"),
                departure_timezone: String(values.departure_timezone ?? DEFAULT_DOMESTIC_TIME_ZONE),
                arrival_timezone: String(values.arrival_timezone ?? DEFAULT_DOMESTIC_TIME_ZONE),
              },
            };

      return targetDays.map((day, index) =>
        index === 0 ? { ...day, items: [...day.items, { ...itemBase, ...updates }] } : day,
      );
    });
    setMessage(
      `${kind === "hotel" ? "Hotel" : "Flight"} added to the structured itinerary. Review and save it.`,
    );
  }

  function addLiveFlight(offer: LiveFlightOffer) {
    const departureDate =
      /^\d{4}-\d{2}-\d{2}/.exec(offer.departure_at)?.[0] ?? form.travel_start_date;
    const arrivalDate = /^\d{4}-\d{2}-\d{2}/.exec(offer.arrival_at)?.[0] ?? departureDate;
    const departureTime = /(?:T|\s)(\d{2}:\d{2})/.exec(offer.departure_at)?.[1] ?? "";
    const arrivalTime = /(?:T|\s)(\d{2}:\d{2})/.exec(offer.arrival_at)?.[1] ?? "";
    const duration = offer.duration
      .replace(/(\d+)h/g, "$1 hr ")
      .replace(/(\d+)m/g, "$1 min")
      .trim();
    addResearchItem("flight", {
      flight_airline: offer.airline,
      flight_number: offer.flight_number,
      departure_city: offer.from,
      arrival_city: offer.to,
      departure_airport: offer.from,
      arrival_airport: offer.to,
      flight_departure_date: departureDate,
      flight_departure_time: departureTime,
      flight_arrival_date: arrivalDate,
      flight_arrival_time: arrivalTime,
      flight_cabin: offer.cabin ?? "Economy",
      flight_duration: duration,
      baggage_information: offer.baggage_information ?? "",
      flight_price: offer.price,
      flight_currency: offer.currency,
      flight_option: selectedFlightOption,
      notes: `Captured from flight details · ${offer.stops === undefined ? "Stops not identified" : offer.stops === 0 ? "Non-stop" : `${offer.stops} stop(s)`}. Verify fare and availability before booking.`,
    });
    if (offer.return_departure_at && offer.return_arrival_at) {
      const returnDepartureDate =
        /^\d{4}-\d{2}-\d{2}/.exec(offer.return_departure_at)?.[0] ?? form.travel_end_date;
      const returnArrivalDate =
        /^\d{4}-\d{2}-\d{2}/.exec(offer.return_arrival_at)?.[0] ?? returnDepartureDate;
      const returnDepartureTime =
        /(?:T|\s)(\d{2}:\d{2})/.exec(offer.return_departure_at)?.[1] ?? "";
      const returnArrivalTime = /(?:T|\s)(\d{2}:\d{2})/.exec(offer.return_arrival_at)?.[1] ?? "";
      addResearchItem("flight", {
        flight_airline: offer.return_airline ?? offer.airline,
        flight_number: offer.return_flight_number ?? "",
        departure_city: offer.return_from ?? offer.to,
        arrival_city: offer.return_to ?? offer.from,
        flight_departure_date: returnDepartureDate,
        flight_departure_time: returnDepartureTime,
        flight_arrival_date: returnArrivalDate,
        flight_arrival_time: returnArrivalTime,
        flight_cabin: offer.cabin ?? "Economy",
        flight_duration: (offer.return_duration ?? "")
          .replace(/(\d+)h/g, "$1 hr ")
          .replace(/(\d+)m/g, "$1 min")
          .trim(),
        baggage_information: offer.return_baggage_information ?? "",
        flight_price: null,
        flight_currency: offer.currency,
        flight_option: selectedFlightOption,
        notes: `Return leg${offer.return_stops === undefined ? "; stops not identified" : `; ${offer.return_stops === 0 ? "non-stop" : `${offer.return_stops} stop(s)`}`}. ${offer.price > 0
          ? `Round-trip fare ${offer.currency} ${offer.price.toLocaleString("en-IN")} is recorded on the outbound leg.`
          : "Fare was not identified in the source; confirm it before booking."}`,
      });
    }
  }

  function formatItineraryText(command: string, value?: string) {
    itineraryEditorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function saveItinerarySelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !itineraryEditorRef.current?.contains(selection.anchorNode))
      return;
    itinerarySelectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreItinerarySelection() {
    const selection = window.getSelection();
    const range = itinerarySelectionRef.current;
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function clearLinkSelectionMarker() {
    const marker = linkSelectionMarkerRef.current;
    if (!marker) return;
    const selection = window.getSelection();
    if (selection && selection.anchorNode && marker.contains(selection.anchorNode)) {
      selection.removeAllRanges();
    }
    marker.replaceWith(...Array.from(marker.childNodes));
    linkSelectionMarkerRef.current = null;
  }

  function setItineraryFontSize(size: string) {
    const editor = itineraryEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("fontSize", false, "7");
    editor.querySelectorAll('font[size="7"]').forEach((font) => {
      font.removeAttribute("size");
      (font as HTMLElement).style.fontSize = `${size}px`;
    });
  }

  function insertItineraryLink() {
    saveItinerarySelection();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !itineraryEditorRef.current?.contains(range.commonAncestorContainer)) return;
    const selectedLink =
      selection?.anchorNode instanceof Element
        ? selection.anchorNode.closest("a")
        : selection?.anchorNode?.parentElement?.closest("a");
    setLinkUrl(selectedLink?.getAttribute("href") ?? "");
    setLinkText(selectedLink?.textContent ?? range.toString());
    clearLinkSelectionMarker();
    if (!range.collapsed) {
      const marker = document.createElement("span");
      marker.style.color = "#2563eb";
      marker.style.display = "inline";
      marker.appendChild(range.extractContents());
      range.insertNode(marker);
      linkSelectionMarkerRef.current = marker;
      const preservedRange = document.createRange();
      preservedRange.selectNodeContents(marker);
      // Keep the range for link editing, but hide the browser's default blue selection box.
      // Word shows the link in blue text, not as a highlighted selection rectangle.
      selection?.removeAllRanges();
      const storedRange = preservedRange.cloneRange();
      itinerarySelectionRef.current = storedRange;
    }
    setLinkPopoverOpen(true);
  }

  function normalizeItineraryUrl(value: string) {
    const trimmed = value.trim();
    if (/^(javascript|vbscript|data):/i.test(trimmed)) return null;
    if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
    return trimmed ? `https://${trimmed}` : null;
  }

  function applyItineraryLink() {
    const href = normalizeItineraryUrl(linkUrl);
    if (!href) {
      toast.error("Enter a valid http, https, mailto, or tel link.");
      return;
    }
    const marker = linkSelectionMarkerRef.current;
    const markerParentLink = marker?.parentElement?.closest("a");
    const selection = window.getSelection();
    const range = marker
      ? document.createRange()
      : selection?.rangeCount
        ? selection.getRangeAt(0)
        : null;
    if (marker) range?.selectNodeContents(marker);
    selection?.removeAllRanges();
    if (
      !range ||
      range.collapsed ||
      !itineraryEditorRef.current?.contains(range.commonAncestorContainer)
    ) {
      toast.error("Select text first, then click the link button.");
      return;
    }
    const link = document.createElement("a");
    const existingLink = markerParentLink ?? range.startContainer.parentElement?.closest("a");
    if (existingLink && existingLink.contains(range.endContainer)) {
      existingLink.href = href;
      existingLink.target = "_blank";
      existingLink.rel = "noreferrer noopener";
      existingLink.textContent = linkText.trim() || existingLink.textContent || "Link";
      clearLinkSelectionMarker();
      selection?.removeAllRanges();
      const postLinkRange = document.createRange();
      postLinkRange.setStartAfter(existingLink);
      postLinkRange.collapse(true);
      selection?.addRange(postLinkRange);
      setLinkPopoverOpen(false);
      setLinkUrl("");
      setLinkText("");
      return;
    }
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.className = "text-blue-700 underline";
    const selectedContents = range.extractContents();
    if (linkText.trim()) {
      link.textContent = linkText.trim();
    } else {
      link.appendChild(selectedContents);
    }
    range.insertNode(link);
    linkSelectionMarkerRef.current = null;
    selection?.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.setStartAfter(link);
    nextRange.collapse(true);
    selection?.addRange(nextRange);
    setLinkPopoverOpen(false);
    setLinkUrl("");
    setLinkText("");
  }

  function openItineraryLink() {
    const url = normalizeItineraryUrl(linkUrl);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function removeItineraryLink() {
    const marker = linkSelectionMarkerRef.current;
    const existingLink = marker?.parentElement?.closest("a");
    if (existingLink) existingLink.replaceWith(...Array.from(existingLink.childNodes));
    clearLinkSelectionMarker();
    document.execCommand("unlink");
    setLinkPopoverOpen(false);
    setLinkUrl("");
    setLinkText("");
  }

  function insertItineraryImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") formatItineraryText("insertImage", reader.result);
    };
    reader.readAsDataURL(file);
  }

  function showItineraryLinkHint(target: HTMLAnchorElement) {
    if (!itineraryEditorRef.current) return;
    const editorRect = itineraryEditorRef.current.getBoundingClientRect();
    const linkRect = target.getBoundingClientRect();
    const hintX = linkRect.left - editorRect.left + linkRect.width / 2;
    const hintY = linkRect.top - editorRect.top - 10;
    setItineraryLinkHint({
      x: hintX,
      y: hintY,
      text: "Ctrl + Click to follow link",
      url: target.href,
    });
  }

  function hideItineraryLinkHint() {
    setItineraryLinkHint(null);
  }

  function handleItineraryEditorHover(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target.closest("a") : null;
    if (target?.href) {
      showItineraryLinkHint(target as HTMLAnchorElement);
      return;
    }
    hideItineraryLinkHint();
  }

  function handleItineraryEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target.closest("a") : null;
    if (!target?.href) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      window.open(target.href, "_blank", "noopener,noreferrer");
      hideItineraryLinkHint();
      return;
    }
    event.preventDefault();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection?.removeAllRanges();
    selection?.addRange(range);
    itinerarySelectionRef.current = range.cloneRange();
    setLinkText(target.textContent ?? "");
    setLinkUrl(target.getAttribute("href") ?? "");
    insertItineraryLink();
  }

  function handleItineraryLinkContextMenu(event: React.MouseEvent<HTMLAnchorElement>) {
    const target = event.currentTarget;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      window.open(target.href, "_blank", "noopener,noreferrer");
      hideItineraryLinkHint();
      return;
    }
    event.preventDefault();
    showItineraryLinkHint(target);
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] space-y-2 bg-white pb-4 text-[13px]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/itinerary-proposals" })}
          >
            <ArrowLeft className="mr-1.5 size-4" /> Back
          </Button>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span>
                Itinerary ID: <strong className="text-slate-900">{itineraryLabel}</strong>
              </span>
              <strong className="text-slate-900">
                {destinationName ? `${destinationName} - ` : ""}
                {form.title || "New itinerary"}
              </strong>
              {(form.lead_id || form.customer_id) && (
                <span>
                  Client:{" "}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs font-semibold text-sky-700"
                    onClick={() => setCustomerDetailsOpen(true)}
                  >
                    {customerName}
                  </Button>
                </span>
              )}
              <span>
                Travel dates:{" "}
                {form.travel_start_date || form.travel_end_date
                  ? `${form.travel_start_date || "-"} - ${form.travel_end_date || "-"}`
                  : "-"}
              </span>
              <span>
                {Number(form.adults || 0)} Adults, {Number(form.children || 0)} Children
              </span>
            </div>
            {routeSummary && (
              <p className="max-w-3xl truncate text-xs text-slate-500">{routeSummary}</p>
            )}
            {draftReady && draftOwnerId && (
              <p role="status" className="text-[11px] text-slate-500">
                {librarySaveInProgress
                  ? "Saving complete itinerary to library…"
                  : form.status === "READY"
                    ? "Saved to the itinerary library"
                    : draftSaveState === "saving"
                      ? "Saving draft…"
                      : draftSaveState === "saved"
                        ? "Draft autosaved to your account"
                        : draftSaveState === "local"
                          ? "Draft saved on this device; database autosave is unavailable"
                          : "Draft autosave is ready"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Freeform Itinerary
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || librarySaveInProgress}
            onClick={openLibraryNameDialog}
          >
            <FolderOpen className="mr-1.5 size-4" />
            {librarySaveInProgress ? "Saving to Library…" : "Save to Itinerary Library"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={openClientAssignment}
          >
            <UserPlus className="mr-1.5 size-4" />
            Assign to Client
          </Button>
          {currentItineraryId && form.customer_id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || librarySaveInProgress}
              onClick={() => void saveItinerary(false)}
            >
              {saving ? "Saving…" : "Save to Assigned Itinerary"}
            </Button>
          )}
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-9 bg-emerald-300 text-slate-950 hover:bg-emerald-200"
            disabled={saving}
            onClick={() => {
              setCopyPreviewReviewed(true);
              setPreviewOpen(true);
            }}
          >
            <Eye className="mr-1.5 size-4" /> Itinerary Preview &amp; Send
          </Button>
        </div>
      </header>

      <Dialog open={libraryNameDialogOpen} onOpenChange={setLibraryNameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save itinerary</DialogTitle>
            <DialogDescription>
              Confirm or edit the name that will be used in your itinerary library.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="library-itinerary-name">Itinerary name</Label>
            <Input
              id="library-itinerary-name"
              autoFocus
              value={libraryItineraryName}
              onChange={(event) => setLibraryItineraryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !saving && !librarySaveInProgress) {
                  event.preventDefault();
                  void saveItineraryToLibrary();
                }
              }}
              placeholder="Enter itinerary name"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLibraryNameDialogOpen(false)}
              disabled={librarySaveInProgress}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveItineraryToLibrary()}
              disabled={saving || librarySaveInProgress || !libraryItineraryName.trim()}
            >
              {librarySaveInProgress ? "Saving…" : "Save itinerary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customerDetailsOpen} onOpenChange={setCustomerDetailsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{customerName}</DialogTitle>
            <DialogDescription>
              Client information and requirements collected for this trip.
            </DialogDescription>
          </DialogHeader>
          {linkedLead ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Mobile", linkedLead.mobile],
                  ["Email", linkedLead.email],
                  ["Enquiry source", linkedLead.source],
                  ["Trip scope", linkedLead.scope],
                  [
                    "Trip name / destination",
                    linkedLead.destination_text ?? linkedLead.destinations?.name,
                  ],
                  [
                    "Travel dates",
                    `${linkedLead.travel_start || "Not set"} – ${linkedLead.travel_end || "Not set"}`,
                  ],
                  [
                    "Travellers",
                    `${linkedLead.adults ?? 0} adults · ${linkedLead.children ?? 0} children${linkedLead.infants ? ` · ${linkedLead.infants} infants` : ""}`,
                  ],
                  [
                    "Budget",
                    linkedLead.budget == null
                      ? "Not provided"
                      : `${linkedLead.currency ?? "INR"} ${Number(linkedLead.budget).toLocaleString("en-IN")}`,
                  ],
                  ["Trip type", linkedLead.trip_type],
                  ["Priority", linkedLead.priority],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {value || "Not provided"}
                    </p>
                  </div>
                ))}
              </div>
              {leadCityNightStays.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Requested cities and nights
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {leadCityNightStays.map((stay, index) => (
                      <span
                        key={`${stay.city}-${index}`}
                        className="rounded-full bg-sky-50 px-3 py-1.5 text-sm text-sky-900"
                      >
                        {stay.city} · {stay.nights} {stay.nights === 1 ? "night" : "nights"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {linkedLead.special_requirements && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">Client requirements</h3>
                  <p className="whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                    {linkedLead.special_requirements}
                  </p>
                </div>
              )}
              {linkedLead.notes && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">Internal notes</h3>
                  <p className="whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                    {linkedLead.notes}
                  </p>
                </div>
              )}
            </div>
          ) : linkedCustomer ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Customer ID", linkedCustomer.code],
                ["Mobile", linkedCustomer.mobile],
                ["Email", linkedCustomer.email],
                [
                  "Location",
                  [linkedCustomer.city, linkedCustomer.state, linkedCustomer.country]
                    .filter(Boolean)
                    .join(", "),
                ],
                ["Segment", linkedCustomer.segment],
                ["Tags", Array.isArray(linkedCustomer.tags) ? linkedCustomer.tags.join(", ") : ""],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 break-words text-sm font-medium text-slate-900">
                    {value || "Not provided"}
                  </p>
                </div>
              ))}
            </div>
          ) : form.customer_id ? (
            <p className="text-sm text-slate-500">Loading client details…</p>
          ) : (
            <p className="text-sm text-slate-500">No client is assigned to this itinerary yet.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={clientAssignmentOpen} onOpenChange={setClientAssignmentOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Assign itinerary to a client</DialogTitle>
            <DialogDescription>
              {copyMode
                ? "Select a customer to create a separate editable itinerary copy. The original itinerary will not be changed."
                : "Choose an existing lead or customer. Their contact and trip details are shown before you assign this itinerary."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <section className="flex min-h-0 flex-col gap-3">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                {!copyMode && (
                  <Button
                    type="button"
                    variant={clientAssignmentKind === "lead" ? "default" : "ghost"}
                    onClick={() => setClientAssignmentKind("lead")}
                  >
                    Leads ({leads.length})
                  </Button>
                )}
                <Button
                  type="button"
                  variant={clientAssignmentKind === "customer" ? "default" : "ghost"}
                  onClick={() => setClientAssignmentKind("customer")}
                >
                  Customers ({customers.length})
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
                <Input
                  aria-label="Search leads and customers"
                  value={clientAssignmentSearch}
                  onChange={(event) => setClientAssignmentSearch(event.target.value)}
                  placeholder="Search name, phone, email, or destination"
                  className="pl-9"
                />
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {clientAssignmentKind === "lead" ? (
                  <>
                    {leadsLoading && <p className="p-4 text-sm text-slate-500">Loading leads…</p>}
                    {leadsError && (
                      <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
                        Could not load leads: {leadsError.message}
                      </p>
                    )}
                    {!leadsLoading && !leadsError && filteredAssignmentLeads.length === 0 && (
                      <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">
                        No matching leads found.
                      </p>
                    )}
                    {filteredAssignmentLeads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        aria-pressed={selectedLeadId === lead.id}
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          setSelectedCustomerId("");
                        }}
                        className={`w-full rounded-lg border p-3 text-left transition ${selectedLeadId === lead.id ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700" : "border-slate-200 hover:border-slate-400 hover:bg-slate-50"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-semibold text-slate-900">{lead.customer_name}</span>
                          <span className="text-xs text-slate-500">{lead.code}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {[
                            lead.destination_text ?? lead.destinations?.name,
                            lead.mobile,
                            lead.email,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No destination or contact details"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {lead.status} · {lead.travel_start || "Dates not set"}
                          {lead.travel_end ? ` – ${lead.travel_end}` : ""}
                        </p>
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {customersLoading && (
                      <p className="p-4 text-sm text-slate-500">Loading customers…</p>
                    )}
                    {customersError && (
                      <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
                        Could not load customers: {customersError.message}
                      </p>
                    )}
                    {!customersLoading &&
                      !customersError &&
                      filteredAssignmentCustomers.length === 0 && (
                        <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">
                          No matching customers found.
                        </p>
                      )}
                    {filteredAssignmentCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        aria-pressed={selectedCustomerId === customer.id}
                        onClick={() => {
                          setSelectedCustomerId(customer.id);
                          setSelectedLeadId("");
                        }}
                        className={`w-full rounded-lg border p-3 text-left transition ${selectedCustomerId === customer.id ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700" : "border-slate-200 hover:border-slate-400 hover:bg-slate-50"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-semibold text-slate-900">{customer.full_name}</span>
                          <span className="text-xs text-slate-500">{customer.code}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {[customer.mobile, customer.email, customer.city, customer.country]
                            .filter(Boolean)
                            .join(" · ") || "No contact details"}
                        </p>
                        {customer.segment && (
                          <p className="mt-1 text-[11px] text-slate-500">{customer.segment}</p>
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </section>
            <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
              {clientAssignmentKind === "lead" && selectedAssignmentLead ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                      Selected lead
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      {selectedAssignmentLead.customer_name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {selectedAssignmentLead.code} · {selectedAssignmentLead.status}
                    </p>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-slate-500">Phone</dt>
                    <dd className="break-all text-slate-900">
                      {selectedAssignmentLead.mobile || "Not provided"}
                    </dd>
                    <dt className="text-slate-500">Email</dt>
                    <dd className="break-all text-slate-900">
                      {selectedAssignmentLead.email || "Not provided"}
                    </dd>
                    <dt className="text-slate-500">Destination</dt>
                    <dd className="text-slate-900">
                      {selectedAssignmentLead.destination_text ??
                        selectedAssignmentLead.destinations?.name ??
                        "Not set"}
                    </dd>
                    <dt className="text-slate-500">Travel dates</dt>
                    <dd className="text-slate-900">
                      {selectedAssignmentLead.travel_start || "Not set"}
                      {selectedAssignmentLead.travel_end
                        ? ` – ${selectedAssignmentLead.travel_end}`
                        : ""}
                    </dd>
                    <dt className="text-slate-500">Travellers</dt>
                    <dd className="text-slate-900">
                      {selectedAssignmentLead.adults ?? 0} adults ·{" "}
                      {selectedAssignmentLead.children ?? 0} children
                    </dd>
                    <dt className="text-slate-500">Requirements</dt>
                    <dd className="whitespace-pre-wrap text-slate-900">
                      {selectedAssignmentLead.special_requirements || "None recorded"}
                    </dd>
                  </dl>
                </div>
              ) : clientAssignmentKind === "customer" && selectedAssignmentCustomer ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                      Selected customer
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      {selectedAssignmentCustomer.full_name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {selectedAssignmentCustomer.code || "Customer"}
                      {selectedAssignmentCustomer.segment
                        ? ` · ${selectedAssignmentCustomer.segment}`
                        : ""}
                    </p>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-slate-500">Phone</dt>
                    <dd className="break-all text-slate-900">
                      {selectedAssignmentCustomer.mobile || "Not provided"}
                    </dd>
                    <dt className="text-slate-500">Email</dt>
                    <dd className="break-all text-slate-900">
                      {selectedAssignmentCustomer.email || "Not provided"}
                    </dd>
                    <dt className="text-slate-500">Location</dt>
                    <dd className="text-slate-900">
                      {[
                        selectedAssignmentCustomer.city,
                        selectedAssignmentCustomer.state,
                        selectedAssignmentCustomer.country,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Not provided"}
                    </dd>
                    <dt className="text-slate-500">Segment</dt>
                    <dd className="text-slate-900">
                      {selectedAssignmentCustomer.segment || "Not set"}
                    </dd>
                    <dt className="text-slate-500">Tags</dt>
                    <dd className="text-slate-900">
                      {Array.isArray(selectedAssignmentCustomer.tags)
                        ? selectedAssignmentCustomer.tags.join(", ") || "None"
                        : "None"}
                    </dd>
                  </dl>
                </div>
              ) : (
                <div className="flex h-full min-h-40 items-center justify-center text-center text-sm text-slate-500">
                  Select a lead or customer to review their details here.
                </div>
              )}
            </section>
          </div>
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <Label htmlFor="assigned-itinerary-name">Itinerary name</Label>
            <Input
              id="assigned-itinerary-name"
              value={assignmentItineraryName}
              onChange={(event) => setAssignmentItineraryName(event.target.value)}
              placeholder="Enter itinerary name"
            />
          </div>
          <DialogFooter className="border-t border-slate-200 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClientAssignmentOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            {(form.lead_id || form.customer_id) && (
              <Button
                type="button"
                variant="outline"
                className="text-rose-700"
                onClick={() => void removeItineraryClient()}
                disabled={saving}
              >
                Remove client
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void assignItineraryToClient()}
              disabled={
                saving ||
                !assignmentItineraryName.trim() ||
                (clientAssignmentKind === "lead"
                  ? !selectedAssignmentLead
                  : !selectedAssignmentCustomer)
              }
            >
              <UserPlus className="mr-2 size-4" />
              {saving ? "Assigning…" : "Assign itinerary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1">
        <nav className="flex max-w-full gap-1 overflow-x-auto" aria-label="Itinerary sections">
          {sectionTabs.map(([value, label]) => (
            <Button
              key={value}
              variant={activeSection === value ? "default" : "outline"}
              size="sm"
              className={`h-9 shrink-0 rounded-md px-3 text-xs ${activeSection === value ? "bg-slate-950 text-white hover:bg-slate-800" : "bg-white"}`}
              onClick={() => {
                setActiveSection(value);
                if (value === "activities") setActivitiesTransfersDialogOpen(true);
                if (value === "hotels") setHotelsDialogOpen(true);
                if (value === "inclusions") setInclusionsDialogOpen(true);
                if (value === "flight") setFlightDialogOpen(true);
                if (value === "timeline") setTimelineDialogOpen(true);
                if (value === "visa") setVisaDialogOpen(true);
                if (value === "transport") setTransportDialogOpen(true);
                if (value === "tables") setTablesDialogOpen(true);
              }}
            >
              {label}
            </Button>
          ))}
        </nav>
      </div>

      <div className="flex items-center justify-end gap-2 border-b border-slate-200 pb-1 text-xs text-slate-600">
        <span>
          Assigned To: <strong className="text-slate-900">{assignedProfileName}</strong>
        </span>
        <Button variant="outline" size="sm" disabled>
          Assign To Lead
        </Button>
        <Button variant="ghost" size="icon" aria-label="Message assigned employee" disabled>
          <Link2 className="size-4" />
        </Button>
      </div>

      <div className="relative flex flex-wrap items-center gap-1 border-b border-slate-200 pb-1 text-slate-500">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Undo"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("undo")}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Redo"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("redo")}
        >
          <Redo2 className="size-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Bulleted list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("insertUnorderedList")}
        >
          <List className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Numbered list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("insertOrderedList")}
        >
          <ListOrdered className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Block quote"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("formatBlock", "blockquote")}
        >
          <Quote className="size-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <select
          aria-label="Font family"
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
          defaultValue="Arial"
          onChange={(event) => formatItineraryText("fontName", event.target.value)}
        >
          <option value="Arial">Font</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
          <option value="Trebuchet MS">Trebuchet</option>
        </select>
        <select
          aria-label="Font size"
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) setItineraryFontSize(event.target.value);
          }}
        >
          <option value="">Size</option>
          <option value="8">8</option>
          <option value="9">9</option>
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
          <option value="14">14</option>
          <option value="16">16</option>
          <option value="18">18</option>
          <option value="20">20</option>
          <option value="24">24</option>
          <option value="28">28</option>
          <option value="32">32</option>
          <option value="36">36</option>
          <option value="48">48</option>
        </select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Bold"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("bold")}
        >
          <Bold className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Italic"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("italic")}
        >
          <Italic className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Strikethrough"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("strikeThrough")}
        >
          <Strikethrough className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Underline"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("underline")}
        >
          <Underline className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Highlight"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("hiliteColor", "#fff2a8")}
        >
          <Highlighter className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Insert link"
          onMouseDown={(event) => {
            event.preventDefault();
            saveItinerarySelection();
          }}
          onClick={insertItineraryLink}
        >
          <Link2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Superscript"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("superscript")}
        >
          <Superscript className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Subscript"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("subscript")}
        >
          <Subscript className="size-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Align left"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("justifyLeft")}
        >
          <AlignLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Align center"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("justifyCenter")}
        >
          <AlignCenter className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Align right"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("justifyRight")}
        >
          <AlignRight className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Justify"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => formatItineraryText("justifyFull")}
        >
          <AlignJustify className="size-4" />
        </Button>
        <label
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-sm hover:bg-slate-100"
          title="Insert image"
        >
          <ImagePlus className="size-4" /> Add
          <input type="file" accept="image/*" className="sr-only" onChange={insertItineraryImage} />
        </label>
        {linkPopoverOpen && (
          <div className="absolute left-1/2 top-11 z-20 flex w-[min(425px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
            <div className="min-w-0 flex-1 space-y-1">
              <Input
                value={linkText}
                onChange={(event) => setLinkText(event.target.value)}
                placeholder="Text to display"
                className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                aria-label="Text to display"
              />
              <Input
                autoFocus
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyItineraryLink();
                  if (event.key === "Escape") {
                    clearLinkSelectionMarker();
                    setLinkPopoverOpen(false);
                    setLinkUrl("");
                    setLinkText("");
                  }
                }}
                placeholder="Address / URL"
                className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                aria-label="Address or URL"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Apply link"
              onClick={applyItineraryLink}
            >
              <Undo2 className="size-4 rotate-180" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Open link"
              onClick={openItineraryLink}
            >
              <ExternalLink className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-slate-500"
              aria-label="Remove link"
              onClick={removeItineraryLink}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid min-h-[calc(100vh-14rem)] grid-cols-[minmax(0,2fr)_minmax(300px,0.9fr)] items-stretch gap-2 max-[700px]:grid-cols-1">
        <section className="min-w-0 border border-slate-200 bg-white">
          <div className="flex min-h-[38rem] flex-col bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                SAVR Travels
              </p>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">
                {destinationName ? `${destinationName} - ` : ""}
                {form.title || "Untitled itinerary"}
              </h1>
            </div>
            {heroPhoto && (
              <img
                src={heroPhoto}
                alt="Itinerary destination"
                className="h-72 w-full object-cover"
              />
            )}
            <div
              ref={itineraryEditorRef}
              onClick={handleItineraryEditorClick}
              onMouseMove={handleItineraryEditorHover}
              onMouseLeave={() => hideItineraryLinkHint()}
              onInput={(event) => {
                const editorHtml = removeInlineItineraryDayPhotos(event.currentTarget.innerHTML);
                setItineraryEditorEmpty(!event.currentTarget.innerText.trim());
                setForm((current) => ({ ...current, document_html: editorHtml }));
              }}
              onFocus={() => setItineraryEditorFocused(true)}
              onBlur={() => setItineraryEditorFocused(false)}
              data-editor-empty={itineraryEditorEmpty}
              contentEditable={
                activeSection !== "hotels" &&
                activeSection !== "inclusions" &&
                activeSection !== "flight" &&
                activeSection !== "timeline"
              }
              suppressContentEditableWarning
              data-placeholder="Click here and start typing..."
              className="relative min-h-[32rem] flex-1 cursor-text space-y-3 rounded-lg border border-slate-200 bg-white p-6 text-slate-900 caret-slate-950 outline-none transition focus:border-slate-400 focus:bg-slate-50/30 focus:ring-2 focus:ring-slate-200 [&[data-editor-empty=true]]:before:pointer-events-none [&[data-editor-empty=true]]:before:text-slate-400 [&[data-editor-empty=true]]:before:content-[attr(data-placeholder)] [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-800 [&_blockquote]:pl-4 [&_blockquote]:italic [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
            >
              {itineraryLinkHint && (
                <div
                  className="pointer-events-none absolute z-30 -translate-x-1/2 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[10px] font-medium tracking-[0.08em] text-slate-600 shadow-sm"
                  style={{ left: `${itineraryLinkHint.x}px`, top: `${itineraryLinkHint.y}px` }}
                >
                  {itineraryLinkHint.text}
                </div>
              )}
              {activeSection === "hotels" && (
                <p className="text-sm text-slate-500">
                  Add a hotel stay to the relevant trip day using the day-wise hotel planner.
                </p>
              )}
            </div>
          </div>
        </section>

        <aside className="min-w-0 border border-slate-200 bg-white">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 p-1.5">
            <Button
              variant={rightPanel === "ai" ? "default" : "ghost"}
              size="sm"
              className="h-8 shrink-0 px-2 text-xs"
              onClick={() => setRightPanel("ai")}
            >
              AI Day Plan
            </Button>
            <Button
              variant={rightPanel === "land-package" ? "default" : "ghost"}
              size="sm"
              className="shrink-0 px-2 text-xs"
              onClick={openLandPackageQuote}
            >
              Quote - LandPackage
            </Button>
            <Button
              variant={rightPanel === "flights" ? "default" : "ghost"}
              size="sm"
              className="shrink-0 px-2 text-xs"
              onClick={openFlightQuote}
            >
              Quote - Flights
            </Button>
            <Button variant="ghost" size="sm" className="shrink-0 px-2 text-xs" disabled>
              Import Rates
            </Button>
          </div>
          {rightPanel === "ai" ? (
            <div className="space-y-2 p-2">
              {linkedLead && (
                <section className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                        Client requirements
                      </p>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto max-w-full justify-start truncate p-0 text-sm font-semibold text-slate-900"
                        onClick={() => setCustomerDetailsOpen(true)}
                      >
                        {customerName} · View details
                      </Button>
                    </div>
                    <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-800">
                      {linkedLead.budget == null
                        ? "Budget not set"
                        : `${linkedLead.currency ?? "INR"} ${Number(linkedLead.budget).toLocaleString("en-IN")}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700">
                    {leadCityNightStays.length
                      ? leadCityNightStays
                          .map((stay) => `${stay.city} (${stay.nights}N)`)
                          .join(" → ")
                      : (linkedLead.destination_text ?? "Destination not specified")}
                  </p>
                  <p className="text-xs text-slate-600">
                    {linkedLead.travel_start || "Dates not set"}
                    {linkedLead.travel_end ? ` – ${linkedLead.travel_end}` : ""} ·{" "}
                    {linkedLead.adults ?? 0} adults, {linkedLead.children ?? 0} children
                  </p>
                  {linkedLead.special_requirements && (
                    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-slate-600">
                      {linkedLead.special_requirements}
                    </p>
                  )}
                </section>
              )}
              <AiDayPlanPanel
                onExtract={extractSupplierTextFromFile}
                onImport={extractSupplierDraftFromText}
                onGenerate={generateDraftFromPrompt}
                onAddImages={addImagesToSavedItinerary}
                onTermsTextChange={updateTermsFromAiDetails}
                addingImages={addingImages}
                canAddImages={
                  days.length > 0 &&
                  days.some(
                    (day) => day.title.trim() || day.description.trim() || day.items.length > 0,
                  )
                }
                imageResults={imageEnrichment?.days ?? null}
                imageError={imageEnrichmentError}
                onAcceptTravelPlannerPlan={acceptTravelPlannerPlan}
                destination={destinationName ?? ""}
                disabled={saving}
                message={message}
                savedServices={savedServicesForAi.entries}
                savedHotelServices={savedHotelServicesForPlanner}
                savedServicesText={savedServicesForAi.editableText}
                tickets={savedTicketDetails}
                tripContext={completePlanTripContext}
                initialPrompt={quickPrompt}
                initialDetails={supplierDetails}
              />
            </div>
          ) : rightPanel === "flights" ? (
            <div className="space-y-3 overflow-y-auto p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Flight Quote</p>
                <p className="mt-1 text-xs text-slate-500">
                  Flight prices are fetched from the saved flight details.
                </p>
              </div>
              <div className="flex gap-2">
                {ITINERARY_OPTION_VALUES.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={selectedFlightOption === option ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedFlightOption(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
              <details
                open
                className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>Total Flights</span>
                  <span>
                    {flightQuoteTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ⌃
                  </span>
                </summary>
                <div className="space-y-2 border-t border-slate-200 p-2">
                  {flightQuoteLines.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-slate-600">
                      Add a flight to calculate the quote.
                    </p>
                  ) : (
                    flightQuoteLines.map(({ item, day }) => {
                      const amount = Number(item.flight_price) || 0;
                      return (
                        <div
                          key={item.id ?? `${day.day_number}-${item.sequence}`}
                          className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2"
                        >
                          <Input
                            value={`${item.departure_city || "Departure"} → ${item.arrival_city || "Arrival"} ${item.flight_airline || ""} ${item.flight_number || ""}`.trim()}
                            readOnly
                            className="h-9 bg-white text-sm"
                          />
                          <Input
                            value={`${item.flight_currency || "INR"} ${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                            readOnly
                            className="h-9 bg-white text-sm"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </details>
              <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold">
                <span>Total Supplier Cost</span>
                <span>
                  {flightQuoteTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
              <details open className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <summary className="flex cursor-pointer list-none justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span>Margin</span>
                  <span>{marginTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ⌃</span>
                </summary>
                <div className="mt-2 space-y-2">
                  {marginLines.map((line, index) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-[minmax(0,1fr)_70px_100px_28px] gap-1"
                    >
                      <Input
                        value={line.detail}
                        onChange={(event) =>
                          setMarginLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? { ...entry, detail: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        placeholder="Detail"
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        value={line.percentage}
                        onChange={(event) =>
                          setMarginLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? {
                                    ...entry,
                                    percentage: event.target.value,
                                    amount:
                                      event.target.value === ""
                                        ? ""
                                        : ((Number(event.target.value) || 0) * quoteBase) / 100,
                                  }
                                : entry,
                            ),
                          )
                        }
                        placeholder="%"
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        value={line.amount}
                        onChange={(event) =>
                          setMarginLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? {
                                    ...entry,
                                    amount: event.target.value,
                                    percentage:
                                      event.target.value === ""
                                        ? ""
                                        : quoteBase > 0
                                          ? ((Number(event.target.value) || 0) / quoteBase) * 100
                                          : 0,
                                  }
                                : entry,
                            ),
                          )
                        }
                        placeholder="Amount"
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setMarginLines((current) =>
                            current.filter((_, lineIndex) => lineIndex !== index),
                          )
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMarginLines((current) => [
                        ...current,
                        { id: crypto.randomUUID(), detail: "", percentage: "", amount: "" },
                      ])
                    }
                  >
                    + Add
                  </Button>
                </div>
              </details>
              <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold">
                <span>Total Supplier Cost + Margin</span>
                <span>
                  {supplierCostWithMargin.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
              <details open className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <summary className="flex cursor-pointer list-none justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span>Taxes</span>
                  <span>{taxTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ⌃</span>
                </summary>
                <div className="mt-2 space-y-2">
                  {taxLines.map((line, index) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-[minmax(0,1fr)_70px_100px_28px] gap-1"
                    >
                      <Input
                        value={line.detail}
                        onChange={(event) =>
                          setTaxLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? { ...entry, detail: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        placeholder="Detail"
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        value={line.percentage}
                        onChange={(event) =>
                          setTaxLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? {
                                    ...entry,
                                    percentage: event.target.value,
                                    amount:
                                      event.target.value === ""
                                        ? ""
                                        : ((Number(event.target.value) || 0) *
                                            supplierCostWithMargin) /
                                          100,
                                  }
                                : entry,
                            ),
                          )
                        }
                        placeholder="%"
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        value={line.amount}
                        onChange={(event) =>
                          setTaxLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? {
                                    ...entry,
                                    amount: event.target.value,
                                    percentage:
                                      event.target.value === ""
                                        ? ""
                                        : supplierCostWithMargin > 0
                                          ? ((Number(event.target.value) || 0) /
                                              supplierCostWithMargin) *
                                            100
                                          : 0,
                                  }
                                : entry,
                            ),
                          )
                        }
                        placeholder="Amount"
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setTaxLines((current) =>
                            current.filter((_, lineIndex) => lineIndex !== index),
                          )
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setTaxLines((current) => [
                        ...current,
                        { id: crypto.randomUUID(), detail: "", percentage: "", amount: "" },
                      ])
                    }
                  >
                    + Add
                  </Button>
                </div>
              </details>
              <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold">
                <span>Total Supplier Cost + Margin + Taxes</span>
                <span>
                  {(supplierCostWithMargin + taxTotal).toLocaleString("en-IN", {
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Land Package Costing</p>
                <p className="mt-1 text-xs text-slate-500">
                  Live supplier cost summary for this itinerary.
                </p>
              </div>
              <div className="flex gap-2">
                {ITINERARY_OPTION_VALUES.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={selectedHotelOption === option ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedHotelOption(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
              <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-100/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={
                      selectedCustomerQuote.mode === "total"
                        ? "font-medium text-slate-950"
                        : "text-slate-600"
                    }
                  >
                    Total Costing
                  </span>
                  <Switch
                    checked={selectedCustomerQuote.mode === "per_person"}
                    onCheckedChange={(checked) =>
                      updateCustomerQuoteOption(selectedHotelOption, {
                        mode: checked ? "per_person" : "total",
                      })
                    }
                    aria-label="Enable per person costing"
                  />
                  <span
                    className={
                      selectedCustomerQuote.mode === "per_person"
                        ? "font-medium text-slate-950"
                        : "text-slate-600"
                    }
                  >
                    Per Person Costing
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() =>
                      updateQuoteLineSnapshot([
                        ...selectedCustomerQuote.lines,
                        {
                          id: crypto.randomUUID(),
                          amount: "",
                          currency: selectedCustomerQuoteInputCurrency,
                        },
                      ])
                    }
                  >
                    + Add
                  </Button>
                </div>
                {selectedCustomerQuote.lines.map((line, index) => (
                  <div
                    key={line.id}
                    className="grid gap-2 sm:grid-cols-[72px_minmax(0,1fr)_minmax(125px,0.8fr)]"
                  >
                    <Select
                      value={
                        POPULAR_CURRENCIES.includes(line.currency as CurrencyCode)
                          ? line.currency
                          : "INR"
                      }
                      onValueChange={(currency) =>
                        updateQuoteLineSnapshot(
                          selectedCustomerQuote.lines.map((current) =>
                            current.id === line.id ? { ...current, currency } : current,
                          ),
                        )
                      }
                    >
                      <SelectTrigger
                        aria-label={`Quote currency ${index + 1}`}
                        className="bg-white/80"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POPULAR_CURRENCIES.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.amount}
                      aria-label={`Customer quote amount ${index + 1}`}
                      onChange={(event) =>
                        updateQuoteLineSnapshot(
                          selectedCustomerQuote.lines.map((current) =>
                            current.id === line.id
                              ? { ...current, amount: event.target.value }
                              : current,
                          ),
                        )
                      }
                      placeholder="Enter price"
                      className="bg-white/80"
                    />
                    <div className="flex items-center rounded-md border border-input bg-white/60 px-3 text-sm text-slate-700">
                      {selectedCustomerQuote.mode === "per_person" ? "Per Person" : "Total"}
                    </div>
                    <InrEquivalent
                      amount={line.amount}
                      currency={line.currency}
                      className="sm:col-span-3"
                    />
                  </div>
                ))}
                <p className="text-xs text-slate-600">
                  Per-person entries multiply by {travellerCount} travellers. Pushing combines these
                  entries with selected supplier costs, margin, and GST.
                </p>
              </section>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  Total Price ({selectedHotelOption.toUpperCase()}): {selectedCustomerQuoteCurrency}{" "}
                  {selectedCustomerQuoteFinalTotal.toLocaleString("en-IN", {
                    maximumFractionDigits: 2,
                  })}
                  <span className="mx-2 text-slate-400">|</span>
                  Per Person: {selectedCustomerQuoteCurrency}{" "}
                  {selectedCustomerQuotePerPerson.toLocaleString("en-IN", {
                    maximumFractionDigits: 2,
                  })}
                </p>
                <Button
                  type="button"
                  variant={selectedCustomerQuote.pushed ? "default" : "outline"}
                  size="icon"
                  onClick={pushCustomerQuote}
                  aria-label={`Push ${selectedHotelOption} price to itinerary PDF`}
                  title={
                    selectedCustomerQuote.pushed
                      ? "Update price in itinerary PDF"
                      : "Push price to itinerary PDF"
                  }
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
              {selectedCustomerQuote.pushed && (
                <p className="text-xs font-medium text-emerald-800">
                  Customer price is included in the itinerary PDF and share link.
                </p>
              )}
              <section className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Additional costs</p>
                    <p className="text-xs text-slate-500">
                      Add named costs in INR; they are included in supplier totals.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLandPackageExtraCost}
                  >
                    + Add another cost
                  </Button>
                </div>
                {landPackageLines
                  .filter((line) => line.source_reference === "land-package-extra")
                  .map((line) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-[minmax(0,1fr)_110px_32px] items-center gap-2"
                    >
                      <Input
                        value={line.description}
                        onChange={(event) =>
                          updateCostLineById(line.id ?? "", { description: event.target.value })
                        }
                        aria-label="Additional cost name"
                        placeholder="Cost name"
                        className="h-9 bg-white text-sm"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.total_cost}
                        onChange={(event) => {
                          const amount = Number(event.target.value) || 0;
                          updateCostLineById(line.id ?? "", {
                            unit_cost: amount,
                            unit_cost_inr: amount,
                            total_cost_inr: amount,
                          });
                        }}
                        aria-label={`${line.description} amount in INR`}
                        placeholder="Amount"
                        className="h-9 bg-white text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCostLineById(line.id)}
                        aria-label={`Remove ${line.description}`}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
              </section>
              <div className="space-y-2">
                {[
                  {
                    key: "activities",
                    label: "Activities & Transfers",
                    categories: [
                      "ACTIVITY",
                      "EXTRA_TRANSPORT",
                    ] as ItineraryCostLine["cost_category"][],
                    total: costSummary.activitiesTransfers,
                  },
                  {
                    key: "hotels",
                    label: "Total Hotels",
                    categories: ["HOTEL"] as ItineraryCostLine["cost_category"][],
                    total: costSummary.totalHotels,
                  },
                  {
                    key: "visa",
                    label: "Total Visa",
                    categories: ["VISA"] as ItineraryCostLine["cost_category"][],
                    total: costSummary.totalVisa,
                  },
                  {
                    key: "transport",
                    label: "Total Transport/Other",
                    categories: ["TRANSPORT", "OTHER"] as ItineraryCostLine["cost_category"][],
                    total: costSummary.transportOther,
                  },
                ].map((section) => {
                  const lines = landPackageLines.filter(
                    (line) =>
                      section.categories.includes(line.cost_category) &&
                      (line.cost_category !== "HOTEL" ||
                        days.some((day) =>
                          day.items.some(
                            (item) =>
                              item.id === line.itinerary_item_id &&
                              getItineraryOption(item) === selectedHotelOption,
                          ),
                        )),
                  );
                  const sectionTotal = lines.reduce((sum, line) => sum + line.total_cost, 0);
                  return (
                    <details
                      key={section.key}
                      open
                      className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                        <span>{section.label}</span>
                        <span className="flex items-center gap-2">
                          ₹{sectionTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          <span className="text-slate-500">⌃</span>
                        </span>
                      </summary>
                      <div className="space-y-2 border-t border-slate-200 p-2">
                        {lines.length === 0 ? (
                          <p className="px-1 py-2 text-xs text-slate-500">No costs entered yet.</p>
                        ) : (
                          lines.map((line) => (
                            <div
                              key={line.id ?? `${line.description}-${line.sequence}`}
                              className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2"
                            >
                              <Input
                                value={line.description}
                                readOnly
                                aria-label={`${section.label} description`}
                                className="h-9 bg-white text-sm"
                              />
                              <Input
                                value={line.total_cost.toString()}
                                readOnly
                                aria-label={`${line.description} amount`}
                                className="h-9 bg-white text-sm"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  );
                })}
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900">
                  <span>Total Supplier Cost</span>
                  <span>
                    ₹
                    {selectedCostSummary.totalSupplierCost.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <details
                  open
                  className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                    <span>Margin</span>
                    <span className="flex items-center gap-2">
                      ₹{marginTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      <span className="text-slate-500">⌃</span>
                    </span>
                  </summary>
                  <div className="space-y-2 border-t border-slate-200 p-2">
                    {marginLines.map((line, index) => (
                      <div key={line.id}>
                        <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_32px] gap-2">
                          <Input
                            value={line.detail}
                            onChange={(event) =>
                              setMarginLines((current) =>
                                current.map((entry) =>
                                  entry.id === line.id
                                    ? { ...entry, detail: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                            placeholder="Detail"
                            className="h-9 bg-white text-sm"
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.percentage}
                            onChange={(event) =>
                              setMarginLines((current) =>
                                current.map((entry) => {
                                  if (entry.id !== line.id) return entry;
                                  const percentage = event.target.value;
                                  return {
                                    ...entry,
                                    percentage,
                                    amount:
                                      percentage === ""
                                        ? ""
                                        : ((Number(percentage) || 0) * quoteBase) / 100,
                                  };
                                }),
                              )
                            }
                            placeholder="%"
                            aria-label="Margin percentage"
                            className="h-9 bg-white text-sm"
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.amount}
                            onChange={(event) =>
                              setMarginLines((current) =>
                                current.map((entry) => {
                                  if (entry.id !== line.id) return entry;
                                  const amount = event.target.value;
                                  return {
                                    ...entry,
                                    amount,
                                    percentage:
                                      amount === ""
                                        ? ""
                                        : quoteBase > 0
                                          ? ((Number(amount) || 0) / quoteBase) * 100
                                          : 0,
                                  };
                                }),
                              )
                            }
                            placeholder="Amount"
                            className="h-9 bg-white text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-8 text-rose-500 hover:text-rose-700"
                            onClick={() =>
                              setMarginLines((current) =>
                                current.filter((_, lineIndex) => lineIndex !== index),
                              )
                            }
                            aria-label="Remove margin line"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setMarginLines((current) => [
                          ...current,
                          { id: crypto.randomUUID(), detail: "", percentage: "", amount: "" },
                        ])
                      }
                    >
                      + Add
                    </Button>
                  </div>
                </details>
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900">
                  <span>Total Supplier Cost + Margin</span>
                  <span>
                    ₹{supplierCostWithMargin.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <details
                  open
                  className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                    <span>Taxes</span>
                    <span className="flex items-center gap-2">
                      ₹{taxTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      <span className="text-slate-500">⌃</span>
                    </span>
                  </summary>
                  <div className="space-y-2 border-t border-slate-200 p-2">
                    {taxLines.map((line, index) => (
                      <div key={line.id}>
                        <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_32px] gap-2">
                          <Input
                            value={line.detail}
                            onChange={(event) =>
                              setTaxLines((current) =>
                                current.map((entry) =>
                                  entry.id === line.id
                                    ? { ...entry, detail: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                            placeholder="Detail"
                            className="h-9 bg-white text-sm"
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.percentage}
                            onChange={(event) =>
                              setTaxLines((current) =>
                                current.map((entry) => {
                                  if (entry.id !== line.id) return entry;
                                  const percentage = event.target.value;
                                  return {
                                    ...entry,
                                    percentage,
                                    amount:
                                      percentage === ""
                                        ? ""
                                        : ((Number(percentage) || 0) * supplierCostWithMargin) /
                                          100,
                                  };
                                }),
                              )
                            }
                            placeholder="%"
                            aria-label="Tax percentage"
                            className="h-9 bg-white text-sm"
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.amount}
                            onChange={(event) =>
                              setTaxLines((current) =>
                                current.map((entry) => {
                                  if (entry.id !== line.id) return entry;
                                  const amount = event.target.value;
                                  return {
                                    ...entry,
                                    amount,
                                    percentage:
                                      amount === ""
                                        ? ""
                                        : supplierCostWithMargin > 0
                                          ? ((Number(amount) || 0) / supplierCostWithMargin) * 100
                                          : 0,
                                  };
                                }),
                              )
                            }
                            placeholder="Amount"
                            className="h-9 bg-white text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-8 text-rose-500 hover:text-rose-700"
                            onClick={() =>
                              setTaxLines((current) =>
                                current.filter((_, lineIndex) => lineIndex !== index),
                              )
                            }
                            aria-label="Remove tax line"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setTaxLines((current) => [
                          ...current,
                          { id: crypto.randomUUID(), detail: "", percentage: "", amount: "" },
                        ])
                      }
                    >
                      + Add
                    </Button>
                  </div>
                </details>
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900">
                  <span>Total Supplier Cost + Margin + Taxes</span>
                  <span>
                    ₹
                    {(supplierCostWithMargin + taxTotal).toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={timelineDialogOpen}
        onOpenChange={(open) => {
          setTimelineDialogOpen(open);
          if (!open) setActiveSection("day");
        }}
      >
        <DialogContent className="flex h-[min(90vh,900px)] w-[calc(100vw-2rem)] max-w-6xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Itinerary timeline</DialogTitle>
            <DialogDescription>
              Review and adjust the itinerary schedule. Select an event to edit its details.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            <ItineraryTimeline
              days={days}
              travelStartDate={form.travel_start_date}
              travelEndDate={form.travel_end_date}
              onOpenEvent={openTimelineEvent}
              onScheduleChange={changeTimelineSchedule}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={timelineEditingItem !== null}
        onOpenChange={(open) => {
          if (!open) setTimelineEditingItem(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {timelineEditingItem &&
            (() => {
              const day = days[timelineEditingItem.dayIndex];
              const item = day?.items[timelineEditingItem.itemIndex];
              if (!day || !item) return null;
              const itemDate =
                item.item_type === "EXTRA_TRANSPORT"
                  ? (item.extra_transport_date ?? day.date)
                  : typeof item.metadata?.activity_date === "string"
                    ? item.metadata.activity_date
                    : day.date;
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>
                      Edit {item.item_type.replaceAll("_", " ").toLowerCase()}
                    </DialogTitle>
                    <DialogDescription>
                      Updates are applied to this itinerary item.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-2 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Title</Label>
                      <Input
                        value={item.title}
                        onChange={(event) =>
                          updateItem(timelineEditingItem.dayIndex, timelineEditingItem.itemIndex, {
                            title: event.target.value,
                          })
                        }
                      />
                    </div>
                    {item.item_type === "ACCOMMODATION" && (
                      <>
                        <div className="space-y-2">
                          <Label>Check-in time ({item.check_in || "date pending"})</Label>
                          <Input
                            required
                            type="time"
                            value={
                              typeof item.metadata?.check_in_time === "string"
                                ? item.metadata.check_in_time
                                : "15:00"
                            }
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                {
                                  metadata: {
                                    ...(item.metadata ?? {}),
                                    check_in_time: event.target.value,
                                  },
                                },
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Check-out time ({item.check_out || "date pending"})</Label>
                          <Input
                            required
                            type="time"
                            value={
                              typeof item.metadata?.check_out_time === "string"
                                ? item.metadata.check_out_time
                                : "11:00"
                            }
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                {
                                  metadata: {
                                    ...(item.metadata ?? {}),
                                    check_out_time: event.target.value,
                                  },
                                },
                              )
                            }
                          />
                        </div>
                      </>
                    )}
                    {item.item_type === "EXTRA_TRANSPORT" && (
                      <>
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input
                            type="date"
                            min={form.travel_start_date || undefined}
                            max={form.travel_end_date || undefined}
                            value={itemDate}
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                { extra_transport_date: event.target.value },
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Transport type</Label>
                          <Input
                            value={item.extra_transport_type ?? ""}
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                { extra_transport_type: event.target.value },
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Pickup</Label>
                          <Input
                            value={item.pickup ?? ""}
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                { pickup: event.target.value },
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Drop-off</Label>
                          <Input
                            value={item.dropoff ?? ""}
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                { dropoff: event.target.value },
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Pickup time</Label>
                          <Input
                            required
                            type="time"
                            value={item.extra_transport_pickup_time ?? ""}
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                { extra_transport_pickup_time: event.target.value },
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Arrival time</Label>
                          <Input
                            required
                            type="time"
                            value={item.extra_transport_drop_time ?? ""}
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                { extra_transport_drop_time: event.target.value },
                              )
                            }
                          />
                        </div>
                      </>
                    )}
                    {!["ACCOMMODATION", "EXTRA_TRANSPORT", "FLIGHT"].includes(item.item_type) && (
                      <>
                        <div className="space-y-2">
                          <Label>Start time</Label>
                          <Input
                            required
                            type="time"
                            value={item.departure_time ?? ""}
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                { departure_time: event.target.value },
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>End time</Label>
                          <Input
                            required
                            type="time"
                            value={item.arrival_time ?? ""}
                            onChange={(event) =>
                              updateItem(
                                timelineEditingItem.dayIndex,
                                timelineEditingItem.itemIndex,
                                { arrival_time: event.target.value },
                              )
                            }
                          />
                        </div>
                      </>
                    )}
                    {item.item_type === "MEAL" && (
                      <div className="space-y-2">
                        <Label>Meal</Label>
                        <Select
                          value={item.meal_type ?? "BREAKFAST"}
                          onValueChange={(value) =>
                            updateItem(
                              timelineEditingItem.dayIndex,
                              timelineEditingItem.itemIndex,
                              { meal_type: value as "BREAKFAST" | "LUNCH" | "DINNER" },
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BREAKFAST">Breakfast</SelectItem>
                            <SelectItem value="LUNCH">Lunch</SelectItem>
                            <SelectItem value="DINNER">Dinner</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        value={item.description}
                        rows={3}
                        onChange={(event) =>
                          updateItem(timelineEditingItem.dayIndex, timelineEditingItem.itemIndex, {
                            description: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={item.notes ?? ""}
                        rows={2}
                        onChange={(event) =>
                          updateItem(timelineEditingItem.dayIndex, timelineEditingItem.itemIndex, {
                            notes: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTimelineEditingItem(null)}
                    >
                      Close
                    </Button>
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void saveItinerary(false).then((saved) => {
                          if (saved) setTimelineEditingItem(null);
                        })
                      }
                    >
                      {saving ? "Saving…" : "Save item"}
                    </Button>
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>

      <Dialog
        open={inclusionsDialogOpen}
        onOpenChange={(open) => {
          setInclusionsDialogOpen(open);
          if (!open) setActiveSection("day");
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1000px] flex-col gap-0 overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-5 pr-12">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Inclusions / Exclusions</DialogTitle>
              <DialogDescription>
                Manage inclusions, exclusions, cancellation policies, and terms. Changes save
                automatically; new drafts are autosaved to your account.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <EditableRichTextSection
              title="INCLUSIONS"
              value={form.inclusions
                .map((value) => sanitizeItineraryTermHtml(value))
                .filter(Boolean)
                .join("<br>")}
              placeholder="Paste or type all inclusions here"
              onUpdate={(value) =>
                setForm((current) => ({
                  ...current,
                  inclusions: itineraryTermHtmlToText(value).trim()
                    ? [sanitizeItineraryTermHtml(value)]
                    : [],
                }))
              }
            />
            <EditableRichTextSection
              title="EXCLUSIONS"
              value={form.exclusions
                .map((value) => sanitizeItineraryTermHtml(value))
                .filter(Boolean)
                .join("<br>")}
              placeholder="Paste or type all exclusions here"
              onUpdate={(value) =>
                setForm((current) => ({
                  ...current,
                  exclusions: itineraryTermHtmlToText(value).trim()
                    ? [sanitizeItineraryTermHtml(value)]
                    : [],
                }))
              }
            />
            <EditableRichTextSection
              title="CANCELLATION POLICIES"
              value={form.cancellation_info}
              placeholder="Paste or type the full cancellation policy here"
              onUpdate={(value) =>
                setForm((current) => ({
                  ...current,
                  cancellation_info: itineraryTermHtmlToText(value).trim()
                    ? sanitizeItineraryTermHtml(value)
                    : "",
                }))
              }
            />
            <EditableRichTextSection
              title="TERMS AND CONDITIONS"
              value={form.terms_conditions}
              placeholder="Paste or type all terms and conditions here"
              onUpdate={(value) =>
                setForm((current) => ({
                  ...current,
                  terms_conditions: itineraryTermHtmlToText(value).trim()
                    ? sanitizeItineraryTermHtml(value)
                    : "",
                }))
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={flightDialogOpen}
        onOpenChange={(open) => {
          setFlightDialogOpen(open);
          if (!open) setActiveSection("day");
        }}
      >
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 pr-12">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Flights &amp; trains</DialogTitle>
              <DialogDescription>
                Open external flight or train searches. Add train details to the itinerary manually
                after checking the provider.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex gap-2 border-b border-slate-200 pb-3">
              {ITINERARY_OPTION_VALUES.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={selectedFlightOption === option ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFlightOption(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            <LiveTravelSearch
              travelStart={form.travel_start_date}
              travelEnd={form.travel_end_date}
              adults={Number(form.adults) || 1}
              children={Number(form.children) || 0}
              onAddFlight={addLiveFlight}
            />
            {savedFlights.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Saved Flights
                </h2>
                {savedFlights.map(({ day, dayIndex, item, itemIndex }) => (
                  <div
                    key={item.id ?? `${dayIndex}-${itemIndex}`}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">
                          {item.flight_airline || "Flight"}
                          {item.flight_number ? ` ${item.flight_number}` : ""}
                        </p>
                        <p>
                          {item.departure_city || item.departure_airport || "Departure"} →{" "}
                          {item.arrival_city || item.arrival_airport || "Arrival"}
                        </p>
                        <p>
                          {item.flight_departure_date || "Date pending"}
                          {item.flight_departure_time
                            ? ` ${item.flight_departure_time}`
                            : ""} → {item.flight_arrival_date || "Date pending"}
                          {item.flight_arrival_time ? ` ${item.flight_arrival_time}` : ""}
                        </p>
                        <p>
                          Day {day.day_number} · {item.flight_cabin || "Economy"}
                          {item.flight_price != null
                            ? ` · ${item.flight_currency || "INR"} ${item.flight_price.toLocaleString("en-IN")}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingFlightId(item.id ?? `${dayIndex}-${itemIndex}`)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-rose-600"
                          aria-label="Delete saved flight"
                          onClick={() => deleteItem(dayIndex, itemIndex)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={saving}
                          onClick={() => void saveItinerary(false)}
                        >
                          {saving ? "Saving…" : "Save Flight"}
                        </Button>
                      </div>
                    </div>
                    {editingFlightId === (item.id ?? `${dayIndex}-${itemIndex}`) && (
                      <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
                        <div>
                          <Label>Airline</Label>
                          <Input
                            value={item.flight_airline ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, {
                                flight_airline: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Flight number</Label>
                          <Input
                            value={item.flight_number ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, { flight_number: event.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label>From</Label>
                          <Input
                            value={item.departure_city ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, {
                                departure_city: event.target.value,
                                departure_airport: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>To</Label>
                          <Input
                            value={item.arrival_city ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, {
                                arrival_city: event.target.value,
                                arrival_airport: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Departure date</Label>
                          <Input
                            type="date"
                            value={item.flight_departure_date ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, {
                                flight_departure_date: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Departure time</Label>
                          <Input
                            type="time"
                            value={item.flight_departure_time ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, {
                                flight_departure_time: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Arrival date</Label>
                          <Input
                            type="date"
                            value={item.flight_arrival_date ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, {
                                flight_arrival_date: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Arrival time</Label>
                          <Input
                            type="time"
                            value={item.flight_arrival_time ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, {
                                flight_arrival_time: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Cabin</Label>
                          <Input
                            value={item.flight_cabin ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, { flight_cabin: event.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label>Option</Label>
                          <Select
                            value={getItineraryOption(item)}
                            onValueChange={(value) =>
                              updateItem(dayIndex, itemIndex, {
                                metadata: { ...(item.metadata ?? {}), flight_option: value },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ITINERARY_OPTION_VALUES.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Price</Label>
                          <Input
                            type="number"
                            min={0}
                            value={item.flight_price ?? ""}
                            onChange={(event) =>
                              updateItem(dayIndex, itemIndex, {
                                flight_price:
                                  event.target.value === "" ? null : Number(event.target.value),
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Currency</Label>
                          <Select
                            value={item.flight_currency || "INR"}
                            onValueChange={(value) =>
                              updateItem(dayIndex, itemIndex, { flight_currency: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FLIGHT_CURRENCY_OPTIONS.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end md:col-span-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingFlightId(null)}
                          >
                            Done
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <ResearchWorkspace
              kind="flight"
              destination={destinationName ?? ""}
              travelStart={form.travel_start_date}
              travelEnd={form.travel_end_date}
              adults={form.adults}
              children={form.children}
              onAdd={(values) =>
                addResearchItem("flight", { ...values, flight_option: selectedFlightOption })
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transportDialogOpen}
        onOpenChange={(open) => {
          setTransportDialogOpen(open);
          if (!open) setActiveSection("day");
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 pr-12">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Transport / Others</DialogTitle>
              <DialogDescription className="sr-only">
                Add transport and other itinerary costs.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => toast.info("Cab rate import is not configured yet.")}
              >
                IMPORT CAB RATE
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddTransportCostDialogOpen(true)}
              >
                Add Cost
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
            {costLines.filter(
              (line) =>
                line.cost_category === "TRANSPORT" || line.cost_category === "EXTRA_TRANSPORT",
            ).length === 0 ? (
              <p className="text-center text-base text-slate-500">No items added yet.</p>
            ) : (
              <div className="space-y-3">
                {costLines
                  .filter(
                    (line) =>
                      line.cost_category === "TRANSPORT" ||
                      line.cost_category === "EXTRA_TRANSPORT",
                  )
                  .map((line) => (
                    <div
                      key={line.id}
                      className="flex items-start justify-between gap-4 rounded-md border border-slate-200 p-4"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{line.description}</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">
                          Cost: {line.currency} {line.unit_cost.toLocaleString("en-IN")}
                        </p>
                        {line.notes && <p className="mt-1 text-sm text-slate-500">{line.notes}</p>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-rose-600"
                        aria-label="Delete transport cost"
                        onClick={() => deleteCostLineById(line.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addTransportCostDialogOpen} onOpenChange={setAddTransportCostDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Cost</DialogTitle>
            <DialogDescription className="sr-only">
              Add a transport or other itinerary cost.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTransportCost} className="space-y-5 pt-2">
            <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
              <Label htmlFor="transport-cost-title">Title</Label>
              <Input
                id="transport-cost-title"
                required
                value={transportCostForm.title}
                onChange={(event) =>
                  setTransportCostForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
              <Label htmlFor="transport-cost-type">Type</Label>
              <Input
                id="transport-cost-type"
                required
                value={transportCostForm.type}
                onChange={(event) =>
                  setTransportCostForm((current) => ({ ...current, type: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
              <Label htmlFor="transport-cost-cost">Cost ({transportCostForm.currency})</Label>
              <Input
                id="transport-cost-cost"
                required
                type="number"
                min="0"
                step="0.01"
                value={transportCostForm.cost}
                onChange={(event) =>
                  setTransportCostForm((current) => ({ ...current, cost: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
              <Label>Currency</Label>
              <Select
                value={transportCostForm.currency}
                onValueChange={(currency) =>
                  setTransportCostForm((current) => ({ ...current, currency }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPULAR_CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <InrEquivalent amount={transportCostForm.cost} currency={transportCostForm.currency} />
            <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-start">
              <Label htmlFor="transport-cost-details" className="pt-2">
                Details
              </Label>
              <Textarea
                id="transport-cost-details"
                value={transportCostForm.details}
                onChange={(event) =>
                  setTransportCostForm((current) => ({ ...current, details: event.target.value }))
                }
                rows={3}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" className="bg-slate-950 px-6 text-white hover:bg-slate-800">
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={tablesDialogOpen}
        onOpenChange={(open) => {
          setTablesDialogOpen(open);
          if (!open) setActiveSection("day");
        }}
      >
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-4 px-7 pb-5 pt-6 pr-14">
            <DialogHeader>
              <DialogTitle className="text-2xl">Itinerary Tables</DialogTitle>
              <DialogDescription className="text-base">
                Create and edit tables. Each table is saved separately under this itinerary.
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              className="bg-slate-950 text-white hover:bg-slate-800"
              onClick={() => setNewTableDialogOpen(true)}
            >
              <Plus className="mr-2 size-4" /> Add Table
            </Button>
          </div>

          <div className="min-h-0 space-y-5 overflow-y-auto px-7 pb-7">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-5 py-4">
              <div>
                <p className="text-base font-medium text-slate-900">Enable in itinerary preview</p>
                <p className="text-sm text-slate-500">
                  When on, saved tables appear in the itinerary preview &amp; PDF after the day-wise
                  plan.
                </p>
              </div>
              <Switch
                checked={tablesEnabled}
                onCheckedChange={setTablesEnabled}
                aria-label="Enable tables in itinerary preview"
              />
            </div>

            {form.custom_tables.length === 0 ? (
              <div className="border border-dashed border-slate-200 px-5 py-10 text-center text-base text-slate-500">
                No tables yet. Click &quot;Add Table&quot; above to create one.
              </div>
            ) : (
              form.custom_tables.map((table, tableIndex) => (
                <section
                  key={table.id ?? `table-${tableIndex}`}
                  className="space-y-4 border-b border-slate-200 pb-6 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Input
                        className="max-w-[400px] text-base"
                        value={table.title}
                        onChange={(event) =>
                          updateCustomTable(tableIndex, { title: event.target.value })
                        }
                        aria-label={`Table ${tableIndex + 1} title`}
                      />
                      <span className="text-sm text-orange-500">(unsaved)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            custom_tables: current.custom_tables.filter(
                              (_, index) => index !== tableIndex,
                            ),
                          }))
                        }
                      >
                        <Trash2 className="mr-2 size-4" /> Delete
                      </Button>
                      <Button
                        type="button"
                        className="bg-slate-950 text-white hover:bg-slate-800"
                        onClick={saveCustomTable}
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <Button type="button" variant="secondary" size="icon" aria-label="Align left">
                      <AlignLeft className="size-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" aria-label="Align center">
                      <AlignCenter className="size-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" aria-label="Align right">
                      <AlignRight className="size-4" />
                    </Button>
                    <span>
                      Background{" "}
                      <input
                        type="color"
                        defaultValue="#ffffff"
                        className="ml-1 h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-1"
                        aria-label="Table background color"
                      />
                    </span>
                    <span>
                      Text{" "}
                      <input
                        type="color"
                        defaultValue="#111827"
                        className="ml-1 h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-1"
                        aria-label="Table text color"
                      />
                    </span>
                    <Button type="button" variant="outline" size="icon" aria-label="Bold">
                      <Bold className="size-4" />
                    </Button>
                    <span className="text-slate-400">Size 14</span>
                    <span className="text-slate-400">Font Arial</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Click a cell to edit. Add or remove rows and columns below.
                  </p>

                  <div className="overflow-x-auto rounded-lg border border-slate-300">
                    <table className="w-full min-w-[620px] border-collapse">
                      <thead>
                        <tr>
                          {table.columns.map((column, columnIndex) => (
                            <th
                              key={`column-${tableIndex}-${columnIndex}`}
                              className="border border-slate-300 bg-slate-50 p-1"
                            >
                              <Input
                                value={column}
                                onChange={(event) =>
                                  updateCustomTable(tableIndex, {
                                    columns: table.columns.map((value, index) =>
                                      index === columnIndex ? event.target.value : value,
                                    ),
                                  })
                                }
                                className="border-0 bg-transparent shadow-none"
                                aria-label={`Table ${tableIndex + 1} column ${columnIndex + 1}`}
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row, rowIndex) => (
                          <tr key={`row-${tableIndex}-${rowIndex}`}>
                            {table.columns.map((_, columnIndex) => (
                              <td
                                key={`cell-${tableIndex}-${rowIndex}-${columnIndex}`}
                                className="border border-slate-300 p-1"
                              >
                                <Input
                                  value={row[columnIndex] ?? ""}
                                  onChange={(event) =>
                                    updateCustomTable(tableIndex, {
                                      rows: table.rows.map((existingRow, index) =>
                                        index === rowIndex
                                          ? existingRow.map((value, cellIndex) =>
                                              cellIndex === columnIndex
                                                ? event.target.value
                                                : value,
                                            )
                                          : existingRow,
                                      ),
                                    })
                                  }
                                  className="border-0 shadow-none"
                                  aria-label={`Table ${tableIndex + 1} row ${rowIndex + 1} column ${columnIndex + 1}`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateCustomTable(tableIndex, {
                          columns: [...table.columns, `Column ${table.columns.length + 1}`],
                          rows: table.rows.map((row) => [...row, ""]),
                        })
                      }
                    >
                      + Add column
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={table.columns.length <= 1}
                      onClick={() =>
                        updateCustomTable(tableIndex, {
                          columns: table.columns.slice(0, -1),
                          rows: table.rows.map((row) => row.slice(0, -1)),
                        })
                      }
                    >
                      - Remove column
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateCustomTable(tableIndex, {
                          rows: [...table.rows, new Array(table.columns.length).fill("")],
                        })
                      }
                    >
                      + Add row
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={table.rows.length <= 1}
                      onClick={() =>
                        updateCustomTable(tableIndex, { rows: table.rows.slice(0, -1) })
                      }
                    >
                      - Remove row
                    </Button>
                  </div>
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newTableDialogOpen} onOpenChange={setNewTableDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">New Table</DialogTitle>
            <DialogDescription className="text-base">
              Enter the number of rows and columns for your table (max 6 each).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createCustomTable} className="space-y-6 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-table-rows">Rows</Label>
                <Input
                  id="new-table-rows"
                  type="number"
                  min="1"
                  max="6"
                  required
                  value={newTableSize.rows}
                  onChange={(event) =>
                    setNewTableSize((current) => ({ ...current, rows: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-table-columns">Columns</Label>
                <Input
                  id="new-table-columns"
                  type="number"
                  min="1"
                  max="6"
                  required
                  value={newTableSize.columns}
                  onChange={(event) =>
                    setNewTableSize((current) => ({ ...current, columns: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewTableDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-slate-950 text-white hover:bg-slate-800">
                Create Table
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={hotelsDialogOpen}
        onOpenChange={(open) => {
          setHotelsDialogOpen(open);
          if (!open) setActiveSection("day");
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 pr-12">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Hotels</DialogTitle>
              <DialogDescription>
                Choose day-wise stays or an overall hotel summary. Hotel selection adds details to
                this itinerary but does not place a supplier reservation.
              </DialogDescription>
            </DialogHeader>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              Enable Hotels in Itinerary
              <Switch
                checked={hotelsEnabled}
                onCheckedChange={setHotelsEnabled}
                aria-label="Enable Hotels in Itinerary"
              />
            </label>
          </div>
          <div className="flex gap-2 border-b border-slate-200 px-6 py-3">
            {ITINERARY_OPTION_VALUES.map((option) => (
              <Button
                key={option}
                type="button"
                variant={selectedHotelOption === option ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedHotelOption(option)}
              >
                {option}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 border-b border-slate-200 px-6 py-3">
            <Button
              type="button"
              variant={hotelBookingMode === "daywise" ? "default" : "outline"}
              size="sm"
              onClick={() => setHotelBookingMode("daywise")}
            >
              Day-wise booking
            </Button>
            <Button
              type="button"
              variant={hotelBookingMode === "overall" ? "default" : "outline"}
              size="sm"
              onClick={() => setHotelBookingMode("overall")}
            >
              Overall booking
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {(() => {
              const overallHotels = days
                .flatMap((day, dayIndex) =>
                day.items
                  .map((item, itemIndex) => ({ day, dayIndex, item, itemIndex }))
                  .filter(({ item }) => {
                    return (
                      item.item_type === "ACCOMMODATION" &&
                      getItineraryOption(item) === selectedHotelOption &&
                      (item.metadata?.["overall_hotel_booking"] === true ||
                        (!item.check_in && !item.check_out))
                    );
                  }),
              );
              return hotelBookingMode === "overall" ? (
                <section className="space-y-3 border-b border-slate-200 pb-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-900">
                        Overall hotel booking
                      </h2>
                      <p className="text-xs text-slate-500">
                        Add hotel names and guest-facing details without assigning them to trip days.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={addOverallHotel}
                    >
                      <Plus className="mr-1.5 size-4" /> Add Overall Hotel
                    </Button>
                  </div>
                  {overallHotels.length === 0 && (
                    <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      No overall hotels added yet. Add a hotel to include its summary card in the itinerary.
                    </p>
                  )}
                  <div className="space-y-3">
                    {overallHotels.map(({ day, item, itemIndex, dayIndex }) => {
                      const key = `${day.id ?? day.day_number}-${item.id ?? itemIndex}`;
                      const customHotelImage =
                        typeof item.metadata?.["custom_hotel_photo_url"] === "string"
                          ? item.metadata["custom_hotel_photo_url"]
                          : "";
                      const hotelPlaceId =
                        typeof item.metadata?.["google_hotel_place_id"] === "string"
                          ? item.metadata["google_hotel_place_id"]
                          : "";
                      if (item.metadata?.["hotel_saved"] === true) {
                        return (
                          <SavedHotelSummary
                            key={key}
                            item={item}
                            dayDate=""
                            overallBooking
                            onEdit={() =>
                              updateItem(dayIndex, itemIndex, {
                                metadata: { ...(item.metadata ?? {}), hotel_saved: false },
                              })
                            }
                            onDelete={() => deleteItem(dayIndex, itemIndex)}
                          />
                        );
                      }
                      return (
                        <div
                          key={key}
                          className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
                          data-builder-type="ACCOMMODATION"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              {item.metadata?.["hotel_saved"] === true ? (
                                <>
                                  <h3 className="text-lg font-semibold text-slate-900">
                                    {item.hotel_name || "Hotel"}
                                  </h3>
                                  {item.hotel_city && (
                                    <p className="text-sm text-slate-600">{item.hotel_city}</p>
                                  )}
                                </>
                              ) : (
                                <Input
                                  aria-label="Hotel name"
                                  value={item.hotel_name ?? ""}
                                  onChange={(event) =>
                                    updateItem(dayIndex, itemIndex, {
                                      hotel_name: event.target.value,
                                      title: event.target.value,
                                    })
                                  }
                                  placeholder="Hotel name"
                                  className="max-w-lg bg-white text-lg font-semibold"
                                />
                              )}
                            </div>
                            {item.metadata?.["hotel_saved"] !== true && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Remove hotel"
                                onClick={() => deleteItem(dayIndex, itemIndex)}
                                className="text-rose-600 hover:text-rose-700"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                          {item.metadata?.["hotel_saved"] !== true && (
                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                              <div className="flex items-start gap-4 p-4">
                                <div className="h-24 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                  {customHotelImage ? (
                                    <img
                                      src={customHotelImage}
                                      alt={item.hotel_name ?? "Hotel image"}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : hotelPlaceId ? (
                                    <HotelPhotoPreview
                                      placeId={hotelPlaceId}
                                      savedPhotoUrl=""
                                      hotelName={item.hotel_name ?? "Hotel"}
                                      className="h-24 w-28 rounded-lg object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-slate-200 text-slate-500">
                                      <ImagePlus className="size-8" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                                      Overall stay
                                    </span>
                                    {item.hotel_address && (
                                      <span className="text-sm text-slate-600">
                                        {item.hotel_address}
                                      </span>
                                    )}
                                  </div>
                                  {item.star_category && (
                                    <p className="mt-2 text-sm text-slate-700">
                                      {item.star_category}
                                    </p>
                                  )}
                                  {item.room_type && (
                                    <p className="mt-1 text-sm text-slate-700">{item.room_type}</p>
                                  )}
                                  {item.meal_plan && (
                                    <p className="mt-1 text-sm text-slate-700">
                                      Meal plan: {item.meal_plan}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          {item.metadata?.["hotel_saved"] === true ? (
                            <SavedHotelSummary
                              item={item}
                              dayDate=""
                              overallBooking
                              onEdit={() =>
                                updateItem(dayIndex, itemIndex, {
                                  metadata: { ...(item.metadata ?? {}), hotel_saved: false },
                                })
                              }
                              onDelete={() => deleteItem(dayIndex, itemIndex)}
                            />
                          ) : (
                            <>
                              <HotelGoogleDetailsEditor
                                item={item}
                                destination={item.hotel_city || destinationName || ""}
                                onUpdate={(updates) => updateItem(dayIndex, itemIndex, updates)}
                                detailsOpen={hotelDetailsOpen === key}
                                onDetailsOpenChange={(open) =>
                                  setHotelDetailsOpen(open ? key : null)
                                }
                              />
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label>Check-in date</Label>
                                  <Input
                                    type="date"
                                    value={item.check_in ?? ""}
                                    onChange={(event) => {
                                      const checkIn = event.target.value;
                                      updateItem(dayIndex, itemIndex, {
                                        check_in: checkIn,
                                        nights:
                                          checkIn && item.check_out
                                            ? nightsBetween(checkIn, item.check_out)
                                            : 0,
                                      });
                                    }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Check-out date</Label>
                                  <Input
                                    type="date"
                                    value={item.check_out ?? ""}
                                    onChange={(event) => {
                                      const checkOut = event.target.value;
                                      updateItem(dayIndex, itemIndex, {
                                        check_out: checkOut,
                                        nights:
                                          item.check_in && checkOut
                                            ? nightsBetween(item.check_in, checkOut)
                                            : 0,
                                      });
                                    }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>City</Label>
                                  <Input
                                    value={item.hotel_city ?? ""}
                                    onChange={(event) =>
                                      updateItem(dayIndex, itemIndex, {
                                        hotel_city: event.target.value,
                                      })
                                    }
                                    placeholder="Hotel city"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Address</Label>
                                  <Input
                                    value={item.hotel_address ?? ""}
                                    onChange={(event) =>
                                      updateItem(dayIndex, itemIndex, {
                                        hotel_address: event.target.value,
                                      })
                                    }
                                    placeholder="Hotel address"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Hotel category</Label>
                                  <Select
                                    value={item.star_category || HOTEL_STAR_CATEGORIES[0]}
                                    onValueChange={(value) =>
                                      updateItem(dayIndex, itemIndex, { star_category: value })
                                    }
                                  >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {HOTEL_STAR_CATEGORIES.map((category) => (
                                        <SelectItem key={category} value={category}>{category}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Room type</Label>
                                  <Select
                                    value={item.room_type || ROOM_TYPES[0]}
                                    onValueChange={(value) =>
                                      updateItem(dayIndex, itemIndex, { room_type: value })
                                    }
                                  >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {ROOM_TYPES.map((roomType) => (
                                        <SelectItem key={roomType} value={roomType}>{roomType}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Meal plan</Label>
                                  <Select
                                    value={item.meal_plan || HOTEL_MEAL_PLANS[0]}
                                    onValueChange={(value) =>
                                      updateItem(dayIndex, itemIndex, { meal_plan: value })
                                    }
                                  >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {HOTEL_MEAL_PLANS.map((mealPlan) => (
                                        <SelectItem key={mealPlan} value={mealPlan}>{mealPlan}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5 md:col-span-2">
                                  <Label>Guest-facing hotel summary</Label>
                                  <Textarea
                                    value={item.customer_facing_info ?? item.hotel_description ?? ""}
                                    onChange={(event) =>
                                      updateItem(dayIndex, itemIndex, {
                                        customer_facing_info: event.target.value,
                                        hotel_description: event.target.value,
                                        description: event.target.value,
                                      })
                                    }
                                    rows={3}
                                    placeholder="Describe the hotel for the itinerary summary card"
                                  />
                                </div>
                              </div>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <Label className="text-base font-medium">Rooms</Label>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const rooms = getAccommodationRoomDetails(item);
                                      const nextRooms = [
                                        ...rooms,
                                        {
                                          id: crypto.randomUUID(),
                                          room_type: "Standard",
                                          adults: 2,
                                          kids: 0,
                                          breakfast: false,
                                          lunch: false,
                                          dinner: false,
                                          room_rate_per_night: 0,
                                          currency: "INR",
                                          free_cancellation_date: "",
                                        },
                                      ];
                                      updateItem(dayIndex, itemIndex, {
                                        metadata: {
                                          ...(item.metadata ?? {}),
                                          room_details: nextRooms,
                                        },
                                      });
                                    }}
                                  >
                                    + Add Room
                                  </Button>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {getAccommodationRoomDetails(item).map((room, roomIndex) => (
                                    <div
                                      key={room.id}
                                      className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                                    >
                                      <div className="flex justify-end">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          aria-label="Remove room"
                                          className="text-rose-600 hover:text-rose-700"
                                          onClick={() => {
                                            const rooms = getAccommodationRoomDetails(item).filter(
                                              (_, index) => index !== roomIndex,
                                            );
                                            updateItem(dayIndex, itemIndex, {
                                              metadata: {
                                                ...(item.metadata ?? {}),
                                                room_details:
                                                  rooms.length > 0
                                                    ? rooms
                                                    : [{
                                                          id: crypto.randomUUID(),
                                                          room_type: "Standard",
                                                          adults: 2,
                                                          kids: 0,
                                                          breakfast: false,
                                                          lunch: false,
                                                          dinner: false,
                                                          room_rate_per_night: 0,
                                                          currency: "INR",
                                                          free_cancellation_date: "",
                                                      }],
                                              },
                                            });
                                          }}
                                        >
                                          <Trash2 className="size-4" />
                                        </Button>
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label>Room Type</Label>
                                        <Input
                                          value={room.room_type}
                                          onChange={(event) =>
                                            updateAccommodationRoom(dayIndex, itemIndex, item, roomIndex, {
                                                room_type: event.target.value,
                                            })
                                          }
                                          placeholder="Room Type"
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                          <Label>Adults</Label>
                                          <Input
                                            type="number"
                                            min={0}
                                            value={room.adults}
                                            onChange={(event) =>
                                              updateAccommodationRoom(dayIndex, itemIndex, item, roomIndex, {
                                                  adults: Number(event.target.value) || 0,
                                              })
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label>Kids</Label>
                                          <Input
                                            type="number"
                                            min={0}
                                            value={room.kids}
                                            onChange={(event) =>
                                              updateAccommodationRoom(
                                                dayIndex,
                                                itemIndex,
                                                item,
                                                roomIndex,
                                                {
                                                  kids: Number(event.target.value) || 0,
                                                },
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap gap-4">
                                        {([
                                            { key: "breakfast", label: "Breakfast" },
                                            { key: "lunch", label: "Lunch" },
                                            { key: "dinner", label: "Dinner" },
                                        ] as const).map((meal) => (
                                          <label
                                            key={meal.key}
                                            className="flex items-center gap-2 text-sm text-slate-700"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={room[meal.key]}
                                              onChange={(event) =>
                                                updateAccommodationRoom(dayIndex, itemIndex, item, roomIndex, {
                                                    [meal.key]: event.target.checked,
                                                })
                                              }
                                            />
                                            {meal.label}
                                          </label>
                                        ))}
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label>Room Rate Per Night ({room.currency || "INR"})</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          value={room.room_rate_per_night}
                                          onChange={(event) =>
                                            updateRoomRate(dayIndex, itemIndex, item, roomIndex, event.target.value)
                                          }
                                        />
                                        <Select
                                          value={room.currency || "INR"}
                                          onValueChange={(currency) =>
                                            updateRoomCurrency(dayIndex, itemIndex, item, roomIndex, currency)
                                          }
                                        >
                                          <SelectTrigger className="mt-2">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {POPULAR_CURRENCIES.map((currency) => (
                                              <SelectItem key={currency} value={currency}>
                                                {currency}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <InrEquivalent
                                          amount={room.room_rate_per_night}
                                          currency={room.currency || "INR"}
                                          className="mt-2"
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label>Free Cancellation Date</Label>
                                        <Input
                                          type="date"
                                          value={room.free_cancellation_date}
                                          onChange={(event) =>
                                            updateAccommodationRoom(dayIndex, itemIndex, item, roomIndex, {
                                                free_cancellation_date: event.target.value,
                                            })
                                          }
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  disabled={!item.hotel_name?.trim()}
                                  onClick={() =>
                                    updateItem(dayIndex, itemIndex, {
                                      metadata: { ...(item.metadata ?? {}), hotel_saved: true },
                                    })
                                  }
                                >
                                  Save hotel summary
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null;
            })()}
            {hotelBookingMode === "daywise" && (
              <>
                {days.map((day, dayIndex) => {
                  const hotels = day.items
                    .map((item, itemIndex) => ({ item, itemIndex }))
                    .filter(({ item }) => {
                      return (
                        item.item_type === "ACCOMMODATION" &&
                        getItineraryOption(item) === selectedHotelOption &&
                        item.metadata?.["overall_hotel_booking"] !== true &&
                        (Boolean(item.check_in) || Boolean(item.check_out))
                      );
                    });
                  const checkoutOnlyDay = !hotelCheckInAllowed(
                    day,
                    dayIndex,
                    days,
                    form.travel_end_date,
                  );
                  return (
                    <section
                      key={day.id ?? day.day_number}
                      className="space-y-3 border-b border-slate-200 pb-5 last:border-b-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="font-semibold text-slate-900">Day {day.day_number}</h2>
                          <p className="text-xs text-slate-500">{formatTripDayDate(day.date)}</p>
                        </div>
                        {checkoutOnlyDay ? (
                          <span className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                            Checkout only · final trip day
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addItemToDay(dayIndex, "ACCOMMODATION")}
                          >
                            <BedDouble className="mr-1.5 size-4" /> Add Hotel
                          </Button>
                        )}
                      </div>
                      {checkoutOnlyDay && hotels.length > 0 && (
                        <p
                          role="alert"
                          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                        >
                      The final trip day is checkout-only. Remove these entries and add the hotel to
                      an earlier overnight day if needed; no hotel can check in on this date.
                        </p>
                      )}
                      {hotels.length === 0 && (
                        <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                          No hotel added for this day yet.
                        </p>
                      )}
                      {hotels.map(({ item, itemIndex }) => {
                        const customHotelImage =
                          typeof item.metadata?.custom_hotel_photo_url === "string"
                            ? item.metadata.custom_hotel_photo_url
                            : "";
                        const hotelPlaceId =
                          typeof item.metadata?.google_hotel_place_id === "string"
                            ? item.metadata.google_hotel_place_id
                            : "";
                        const defaultHotelDates = hotelDatesForDay(day.date);
                        const hotelDates = {
                          checkIn: item.check_in || defaultHotelDates.checkIn,
                          checkOut: item.check_out || defaultHotelDates.checkOut,
                        };
                        const hotelKey = item.id ?? `${dayIndex}-${itemIndex}`;
                        return item.metadata?.hotel_saved === true ? (
                          <SavedHotelSummary
                            key={hotelKey}
                            item={item}
                            dayDate={day.date}
                            onEdit={() =>
                              updateItem(dayIndex, itemIndex, {
                                metadata: { ...(item.metadata ?? {}), hotel_saved: false },
                              })
                            }
                            onDelete={() => deleteItem(dayIndex, itemIndex)}
                          />
                        ) : (
                          <div
                            key={hotelKey}
                            className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
                            data-builder-type="ACCOMMODATION"
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium text-slate-900">Hotel Details</h3>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Remove hotel"
                                onClick={() => deleteItem(dayIndex, itemIndex)}
                                className="text-rose-600 hover:text-rose-700"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>

                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                              <div className="flex items-start gap-4 p-4">
                                <div className="h-24 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                  {customHotelImage ? (
                                    <img
                                      src={customHotelImage}
                                      alt={item.hotel_name ?? "Hotel image"}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : hotelPlaceId ? (
                                    <HotelPhotoPreview
                                      placeId={hotelPlaceId}
                                      savedPhotoUrl=""
                                      hotelName={item.hotel_name ?? "Hotel"}
                                      className="h-24 w-28 rounded-lg object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-slate-200 text-slate-500">
                                      <ImagePlus className="size-8" />
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <h4 className="text-2xl font-semibold tracking-tight text-slate-900">
                                      {item.hotel_name || "Hotel Name"}
                                    </h4>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-sm font-medium text-blue-700 hover:text-blue-800"
                                      onClick={() => setHotelDetailsOpen(hotelKey)}
                                    >
                                      More Info
                                    </Button>
                                    <span className="text-base text-slate-700">
                                      {item.hotel_city || "Vadodara"}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-base text-slate-800">
                                    {item.hotel_address || "Hotel address"}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
                                    <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                                      Check in:{" "}
                                      <strong className="font-medium text-slate-900">
                                        {hotelDates.checkIn
                                          ? formatTripDayDate(hotelDates.checkIn)
                                          : "Date pending"}
                                      </strong>
                                    </span>
                                    <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                                      Check out:{" "}
                                      <strong className="font-medium text-slate-900">
                                        {hotelDates.checkOut
                                          ? formatTripDayDate(hotelDates.checkOut)
                                          : "Date pending"}
                                      </strong>
                                    </span>
                                  </div>
                                  <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label>Check-in time ({hotelDates.checkIn})</Label>
                                      <Input
                                        required
                                        type="time"
                                        value={
                                          typeof item.metadata?.check_in_time === "string"
                                            ? item.metadata.check_in_time
                                            : "15:00"
                                        }
                                        onChange={(event) =>
                                          updateItem(dayIndex, itemIndex, {
                                            metadata: {
                                              ...(item.metadata ?? {}),
                                              check_in_time: event.target.value,
                                            },
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Check-out time ({hotelDates.checkOut})</Label>
                                      <Input
                                        required
                                        type="time"
                                        value={
                                          typeof item.metadata?.check_out_time === "string"
                                            ? item.metadata.check_out_time
                                            : "11:00"
                                        }
                                        onChange={(event) =>
                                          updateItem(dayIndex, itemIndex, {
                                            metadata: {
                                              ...(item.metadata ?? {}),
                                              check_out_time: event.target.value,
                                            },
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="border-t border-slate-200 bg-white px-4 py-3">
                                <div className="flex flex-wrap items-center gap-3">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 border-slate-300 bg-white text-sm font-medium text-slate-700"
                                    onClick={() =>
                                  document.getElementById(`custom-hotel-image-${hotelKey}`)?.click()
                                    }
                                  >
                                    <Upload className="mr-2 size-4" />
                                {customHotelImage ? "Replace Custom Image" : "Upload Custom Image"}
                                  </Button>
                                  <input
                                    id={`custom-hotel-image-${hotelKey}`}
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={async (event) => {
                                      const file = event.target.files?.[0];
                                      if (!file) return;
                                      event.target.value = "";
                                      try {
                                        const imageUrl = await prepareCustomHotelImage(file);
                                        updateItem(dayIndex, itemIndex, {
                                          metadata: {
                                            ...(item.metadata ?? {}),
                                            custom_hotel_photo_url: imageUrl,
                                          },
                                        });
                                      } catch (error) {
                                        toast.error(
                                          error instanceof Error
                                            ? error.message
                                            : "The hotel image could not be uploaded.",
                                        );
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </div>

                            <HotelGoogleDetailsEditor
                              item={item}
                              destination={item.hotel_city || destinationName || ""}
                              onUpdate={(updates) => {
                                updateItem(dayIndex, itemIndex, updates);
                                if (!updates.hotel_name) return;
                                const selectedHotelHtml = replaceHotelRecommendationInHtml(
                                  form.document_html,
                                  item.hotel_city ?? "",
                                  updates.hotel_name,
                                );
                                if (selectedHotelHtml !== form.document_html) {
                                  const safeHtml = sanitizeItineraryEditorHtml(selectedHotelHtml);
                                  if (itineraryEditorRef.current)
                                    itineraryEditorRef.current.innerHTML = safeHtml;
                                  setForm((current) => ({ ...current, document_html: safeHtml }));
                                }
                              }}
                              detailsOpen={hotelDetailsOpen === hotelKey}
                              onDetailsOpenChange={(open) =>
                                setHotelDetailsOpen(open ? hotelKey : null)
                              }
                            />
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-1.5 md:col-span-2">
                                <Label>Guest-facing notes</Label>
                                <Textarea
                                  value={item.customer_facing_info ?? item.hotel_description ?? ""}
                                  onChange={(event) =>
                                    updateItem(dayIndex, itemIndex, {
                                      customer_facing_info: event.target.value,
                                      hotel_description: event.target.value,
                                      description: event.target.value,
                                    })
                                  }
                                  rows={3}
                                  placeholder="Add hotel details for the itinerary"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <div className="flex items-center justify-between gap-3">
                                  <Label className="text-base font-medium">Rooms</Label>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const rooms = getAccommodationRoomDetails(item);
                                      const nextRooms = [
                                        ...rooms,
                                        {
                                          id: crypto.randomUUID(),
                                          room_type: "Room Type",
                                          adults: 0,
                                          kids: 0,
                                          breakfast: false,
                                          lunch: false,
                                          dinner: false,
                                          room_rate_per_night: 0,
                                          free_cancellation_date: "",
                                        },
                                      ];
                                      updateItem(dayIndex, itemIndex, {
                                    metadata: { ...(item.metadata ?? {}), room_details: nextRooms },
                                      });
                                    }}
                                  >
                                    + Add Room
                                  </Button>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {getAccommodationRoomDetails(item).map((room, roomIndex) => (
                                    <div
                                      key={room.id}
                                      className="w-full rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                                    >
                                      <div className="mb-3 flex items-center justify-end">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          aria-label="Remove room"
                                          onClick={() => {
                                            const rooms = getAccommodationRoomDetails(item).filter(
                                              (_, index) => index !== roomIndex,
                                            );
                                            updateItem(dayIndex, itemIndex, {
                                              metadata: {
                                                ...(item.metadata ?? {}),
                                                room_details:
                                                  rooms.length > 0
                                                    ? rooms
                                                    : [
                                                        {
                                                          id: crypto.randomUUID(),
                                                          room_type: item.room_type ?? "Room Type",
                                                          adults: Number(item.adults ?? 0),
                                                          kids: Number(item.children ?? 0),
                                                          breakfast: false,
                                                          lunch: false,
                                                          dinner: false,
                                                          room_rate_per_night: 0,
                                                          free_cancellation_date: "",
                                                        },
                                                      ],
                                              },
                                            });
                                          }}
                                          className="text-rose-600 hover:text-rose-700"
                                        >
                                          <Trash2 className="size-4" />
                                        </Button>
                                      </div>
                                      <div className="grid gap-3">
                                        <div>
                                          <Label>Room Type</Label>
                                          <Input
                                            value={room.room_type}
                                            onChange={(event) => {
                                              const rooms = getAccommodationRoomDetails(item).map(
                                                (entry, index) =>
                                                  index === roomIndex
                                                    ? { ...entry, room_type: event.target.value }
                                                    : entry,
                                              );
                                              updateItem(dayIndex, itemIndex, {
                                                metadata: {
                                                  ...(item.metadata ?? {}),
                                                  room_details: rooms,
                                                },
                                              });
                                            }}
                                            placeholder="Room Type"
                                          />
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                          <div>
                                            <Label>Adults</Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              value={room.adults}
                                              onChange={(event) => {
                                                const rooms = getAccommodationRoomDetails(item).map(
                                                  (entry, index) =>
                                                    index === roomIndex
                                                      ? {
                                                          ...entry,
                                                          adults: Number(event.target.value) || 0,
                                                        }
                                                      : entry,
                                                );
                                                updateItem(dayIndex, itemIndex, {
                                                  metadata: {
                                                    ...(item.metadata ?? {}),
                                                    room_details: rooms,
                                                  },
                                                });
                                              }}
                                            />
                                          </div>
                                          <div>
                                            <Label>Kids</Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              value={room.kids}
                                              onChange={(event) => {
                                                const rooms = getAccommodationRoomDetails(item).map(
                                                  (entry, index) =>
                                                    index === roomIndex
                                                      ? {
                                                          ...entry,
                                                          kids: Number(event.target.value) || 0,
                                                        }
                                                      : entry,
                                                );
                                                updateItem(dayIndex, itemIndex, {
                                                  metadata: {
                                                    ...(item.metadata ?? {}),
                                                    room_details: rooms,
                                                  },
                                                });
                                              }}
                                            />
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap gap-4">
                                          {(
                                            [
                                              { key: "breakfast", label: "Breakfast" },
                                              { key: "lunch", label: "Lunch" },
                                              { key: "dinner", label: "Dinner" },
                                            ] as const
                                          ).map((meal) => (
                                            <label
                                              key={meal.key}
                                              className="flex items-center gap-2 text-sm text-slate-700"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={room[meal.key]}
                                                onChange={(event) => {
                                              const rooms = getAccommodationRoomDetails(item).map(
                                                (entry, index) =>
                                                    index === roomIndex
                                                    ? { ...entry, [meal.key]: event.target.checked }
                                                      : entry,
                                                  );
                                                  updateItem(dayIndex, itemIndex, {
                                                    metadata: {
                                                      ...(item.metadata ?? {}),
                                                      room_details: rooms,
                                                    },
                                                  });
                                                }}
                                              />
                                              {meal.label}
                                            </label>
                                          ))}
                                        </div>
                                        <div>
                                      <Label>Room Rate Per Night ({room.currency || "INR"})</Label>
                                          <Input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={room.room_rate_per_night}
                                            onChange={(event) =>
                                              updateRoomRate(
                                                dayIndex,
                                                itemIndex,
                                                item,
                                                roomIndex,
                                                event.target.value,
                                              )
                                            }
                                          />
                                          <Select
                                            value={room.currency || "INR"}
                                            onValueChange={(currency) =>
                                              updateRoomCurrency(
                                                dayIndex,
                                                itemIndex,
                                                item,
                                                roomIndex,
                                                currency,
                                              )
                                            }
                                          >
                                            <SelectTrigger className="mt-2">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {POPULAR_CURRENCIES.map((currency) => (
                                                <SelectItem key={currency} value={currency}>
                                                  {currency}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <InrEquivalent
                                            amount={room.room_rate_per_night}
                                            currency={room.currency || "INR"}
                                            className="mt-2"
                                          />
                                        </div>
                                        <div>
                                          <Label>Free Cancellation Date</Label>
                                          <Input
                                            type="date"
                                            value={room.free_cancellation_date}
                                            onChange={(event) => {
                                              const rooms = getAccommodationRoomDetails(item).map(
                                                (entry, index) =>
                                                  index === roomIndex
                                                    ? {
                                                        ...entry,
                                                        free_cancellation_date: event.target.value,
                                                      }
                                                    : entry,
                                              );
                                              updateItem(dayIndex, itemIndex, {
                                                metadata: {
                                                  ...(item.metadata ?? {}),
                                                  room_details: rooms,
                                                },
                                              });
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex justify-end border-t border-slate-200 pt-3">
                                <Button
                                  type="button"
                                  disabled={saving || checkoutOnlyDay}
                                  title={
                                checkoutOnlyDay ? "The final trip day is checkout-only." : undefined
                                  }
                                  onClick={async () => {
                                    const saved = await saveItinerary(
                                      false,
                                      item.hotel_name || "Hotel",
                                      item.id,
                                      "hotel",
                                    );
                                    if (saved) {
                                      setDays((current) =>
                                        current.map((currentDay) => ({
                                          ...currentDay,
                                          items: currentDay.items.map((currentItem) =>
                                            currentItem.id === item.id
                                              ? {
                                                  ...currentItem,
                                                  metadata: {
                                                    ...(currentItem.metadata ?? {}),
                                                    hotel_saved: true,
                                                  },
                                                }
                                              : currentItem,
                                          ),
                                        })),
                                      );
                                    }
                                  }}
                                >
                                  {saving
                                    ? "Saving…"
                                    : checkoutOnlyDay
                                      ? "Checkout only"
                                      : "Save Hotel"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
                {days.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Set trip dates to create days, then add hotels.
                  </p>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activitiesTransfersDialogOpen}
        onOpenChange={(open) => {
          setActivitiesTransfersDialogOpen(open);
          if (!open) setActiveSection("day");
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 pr-12">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Activities</DialogTitle>
              <DialogDescription className="sr-only">
                Add activities and transfers to each date of the trip.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center justify-end gap-4">
              <Button variant="outline" onClick={generateDayWiseActivitiesPlan}>
                Generate DayWise Plan as Per Activities and Transfers
              </Button>
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                Enable Activities/Transfers in Itinerary
                <Switch
                  checked={activitiesTransfersEnabled}
                  onCheckedChange={setActivitiesTransfersEnabled}
                  aria-label="Enable Activities/Transfers in Itinerary"
                />
              </label>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
            <ActivitiesTransfersWorkspace
              days={days}
              photos={form.photos}
              photoDisplayUrls={photoDisplayUrls}
              suppliers={suppliers}
              destination={destinationName ?? ""}
              travelStartDate={form.travel_start_date}
              travelEndDate={form.travel_end_date}
              adults={Number(form.adults) || 0}
              children={Number(form.children) || 0}
              saving={saving}
              saveMessage={message}
              onAdd={addItemToDay}
              onUpdate={updateItem}
              onDelete={deleteItem}
              onMove={moveItem}
              onMoveDay={moveItemToDay}
              onSave={(activityTitle, itemId, itemKind) =>
                saveItinerary(false, activityTitle, itemId, itemKind)
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={visaDialogOpen}
        onOpenChange={(open) => {
          setVisaDialogOpen(open);
          if (!open) setActiveSection("day");
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 pr-12">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Visa</DialogTitle>
              <DialogDescription>Manage visa details for this itinerary.</DialogDescription>
            </DialogHeader>
            <Button type="button" onClick={() => openVisaForm()}>
              <Plus className="mr-2 size-4" />
              Add Visa
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {days
              .flatMap((day, dayIndex) =>
                day.items
                  .map((item, itemIndex) => ({ day, dayIndex, item, itemIndex }))
                  .filter(({ item }) => item.item_type === "VISA"),
              )
              .map(({ day, dayIndex, item, itemIndex }) => (
                <article
                  key={item.id ?? `${dayIndex}-${itemIndex}`}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="font-medium text-slate-900">
                        {item.title || `${item.visa_country || "Visa"} ${item.visa_type || ""}`}
                      </p>
                      <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <p>
                          <span className="font-medium text-slate-700">VisaCountry</span>
                          <span className="ml-2">{item.visa_country || "—"}</span>
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">VisaType</span>
                          <span className="ml-2">{item.visa_type || "—"}</span>
                        </p>
                      </div>
                      {costLines.find(
                        (line) =>
                          line.itinerary_item_id === item.id && line.cost_category === "VISA",
                      ) && (
                        <p className="text-sm font-medium text-slate-700">
                          Cost (Rs): ₹
                          {Number(
                            costLines.find(
                              (line) =>
                                line.itinerary_item_id === item.id && line.cost_category === "VISA",
                            )?.unit_cost ?? 0,
                          ).toLocaleString("en-IN")}
                        </p>
                      )}
                      {item.visa_customer_information && (
                        <p className="whitespace-pre-wrap text-sm text-slate-600">
                          {item.visa_customer_information}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">Day {day.day_number}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openVisaForm({ dayIndex, itemIndex, item })}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => {
                          deleteItem(dayIndex, itemIndex);
                          setCostLines((current) =>
                            current.filter(
                              (line) =>
                                line.itinerary_item_id !== item.id || line.cost_category !== "VISA",
                            ),
                          );
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            {!days.some((day) => day.items.some((item) => item.item_type === "VISA")) && (
              <p className="rounded-md border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                No visa details yet. Select Add Visa to include one in this itinerary.
              </p>
            )}
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void saveItinerary(false)}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save itinerary"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={visaFormOpen} onOpenChange={setVisaFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingVisa ? "Edit Visa" : "Add Visa"}</DialogTitle>
            <DialogDescription>
              Add country, visa type, and any customer-facing details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-[minmax(120px,0.8fr)_minmax(0,1.4fr)] items-center gap-4">
              <Label htmlFor="visa-country">Visa Country</Label>
              <Input
                id="visa-country"
                autoFocus
                required
                value={visaForm.country}
                onChange={(event) =>
                  setVisaForm((current) => ({ ...current, country: event.target.value }))
                }
              />
              <Label htmlFor="visa-type">Visa Type</Label>
              <Input
                id="visa-type"
                required
                value={visaForm.type}
                onChange={(event) =>
                  setVisaForm((current) => ({ ...current, type: event.target.value }))
                }
              />
              <Label htmlFor="visa-start-time">Start time</Label>
              <Input
                id="visa-start-time"
                required
                type="time"
                value={visaForm.startTime}
                onChange={(event) =>
                  setVisaForm((current) => ({ ...current, startTime: event.target.value }))
                }
              />
              <Label htmlFor="visa-end-time">End time</Label>
              <Input
                id="visa-end-time"
                required
                type="time"
                value={visaForm.endTime}
                onChange={(event) =>
                  setVisaForm((current) => ({ ...current, endTime: event.target.value }))
                }
              />
              <Label htmlFor="visa-cost">Cost ({visaForm.currency})</Label>
              <Input
                id="visa-cost"
                type="number"
                min="0"
                step="0.01"
                value={visaForm.cost}
                onChange={(event) =>
                  setVisaForm((current) => ({ ...current, cost: event.target.value }))
                }
                placeholder="0.00"
              />
              <Label>Currency</Label>
              <Select
                value={visaForm.currency}
                onValueChange={(currency) => setVisaForm((current) => ({ ...current, currency }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPULAR_CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span />
              <InrEquivalent amount={visaForm.cost} currency={visaForm.currency} />
              <Label htmlFor="visa-details" className="self-start pt-2">
                Details
              </Label>
              <Textarea
                id="visa-details"
                value={visaForm.details}
                onChange={(event) =>
                  setVisaForm((current) => ({ ...current, details: event.target.value }))
                }
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setVisaFormOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveVisa}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[92vh] max-h-[94vh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 px-6 py-4 pr-12">
            <DialogHeader>
              <DialogTitle>Itinerary Preview &amp; Send</DialogTitle>
              <DialogDescription>
                Review the customer-ready itinerary in the selected template before downloading or
                sharing it.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-44">
                <Label htmlFor="itinerary-preview-template">Document template</Label>
                <Select
                  value={previewTemplate}
                  onValueChange={(value) =>
                    setPreviewTemplate(value as ItineraryPresentationTemplateId)
                  }
                >
                  <SelectTrigger id="itinerary-preview-template">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="package">Travel Package</SelectItem>
                    <SelectItem value="classic">Classic</SelectItem>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="luxury">Luxury</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={downloadPreviewPdf}>
                Download PDF
              </Button>
              {copyMode && !currentItineraryId && (
                <Button
                  type="button"
                  onClick={() =>
                    void saveItinerary().then((saved) => {
                      if (saved) setPreviewOpen(false);
                    })
                  }
                  disabled={saving || !form.customer_id}
                >
                  {saving ? "Saving…" : "Save customer itinerary"}
                </Button>
              )}
              <Button
                type="button"
                onClick={() => void generateShareLink()}
                disabled={shareGenerating || !currentItineraryId}
                title={
                  !currentItineraryId
                    ? "Save the itinerary before creating a customer share link"
                    : undefined
                }
              >
                {shareGenerating ? "Creating share…" : "Create share link"}
              </Button>
              {shareUrl && (
                <Button type="button" variant="outline" onClick={() => void copyShareLink()}>
                  <Copy className="mr-1.5 size-4" />
                  {shareCopied ? "Copied" : "Copy link"}
                </Button>
              )}
              {shareUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(shareUrl)}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  Share via WhatsApp
                </Button>
              )}
            </div>
          </div>
          {shareUrl && (
            <div className="mx-5 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Customer share link</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 bg-white"
                  onClick={() => void copyShareLink()}
                >
                  <Copy className="mr-1.5 size-3.5" />
                  {shareCopied ? "Copied" : "Copy URL"}
                </Button>
              </div>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-emerald-700 underline"
              >
                {shareUrl}
              </a>
            </div>
          )}
          {!currentItineraryId && (
            <p className="px-5 pt-3 text-xs text-amber-800">
              Preview and PDF are available now. Save the itinerary to create a share link.
            </p>
          )}
          <iframe
            key={`${previewTemplate}-${previewData.summary}`}
            title="Customer-ready itinerary preview"
            srcDoc={buildItineraryPdfHtml(previewData)}
            className="m-4 min-h-0 flex-1 rounded-lg border border-slate-200 bg-white"
          />
          <Dialog open={shareLinkDialogOpen} onOpenChange={setShareLinkDialogOpen}>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Customer share link</DialogTitle>
                <DialogDescription>
                  Copy this URL and send it to your client. The link expires after 30 days.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Customer share URL"
                  readOnly
                  value={shareUrl ?? ""}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" onClick={() => void copyShareLink()} disabled={!shareUrl}>
                  <Copy className="mr-2 size-4" />
                  {shareCopied ? "Copied" : "Copy"}
                </Button>
              </div>
              {shareUrl && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto w-fit p-0"
                  onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  Open customer preview
                </Button>
              )}
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </div>
  );

  /* The former stacked CRUD builder UI was removed from the rendered route.
   * The reference workspace above is the only builder experience exposed here.
   * Existing state and handlers remain available for the next behavior pass.
  return (
    <div className="space-y-3 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/itinerary-proposals" })}>
            <ArrowLeft className="mr-1.5 size-4" /> Back
          </Button>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Itinerary ID: <strong className="text-foreground">{itineraryLabel}</strong></span>
              <span>{destinationName ? `${destinationName} - ` : ""}{form.title || "Untitled itinerary"}</span>
              <span>{form.travel_start_date || form.travel_end_date ? `${form.travel_start_date || "-"} - ${form.travel_end_date || "-"}` : "Dates pending"}</span>
              <span>{Number(form.adults || 0)} Adults, {Number(form.children || 0)} Children</span>
            </div>
            {routeSummary && <p className="truncate text-xs text-muted-foreground">{routeSummary}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled title="A separate freeform editor is not supported by the structured itinerary model">Freeform Itinerary</Button>
          <Button size="sm" onClick={() => { setPreviewOpen(true); document.getElementById("builder-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            <Eye className="mr-1.5 size-4" /> Itinerary Preview &amp; Send
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex max-w-full gap-1 overflow-x-auto">
          {sectionTabs.map(([value, label]) => (
            <Button key={value} variant={activeSection === value ? "default" : "outline"} size="sm" className="shrink-0 rounded-md px-3 text-xs" onClick={() => focusSection(value)}>{label}</Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Assigned To: <strong className="text-foreground">{assignedProfileName}</strong></span>
          <Button variant="outline" size="sm" disabled title="Lead assignment is not available as a separate mutation in the current itinerary model">Assign To Lead</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-2 text-muted-foreground">
        <Button variant="ghost" size="icon" className="size-8" aria-label="Undo" disabled><Undo2 className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Redo" disabled><Redo2 className="size-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className="size-8" aria-label="Bold" disabled><Bold className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Italic" disabled><Italic className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Underline" disabled><Underline className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Link" disabled><Link2 className="size-4" /></Button>
        <span className="text-xs">Structured editor</span>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <aside className="order-2 min-w-0 space-y-3 xl:order-2 xl:sticky xl:top-4">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-2">
        <Button variant="default" size="sm" className="shrink-0 px-2 text-xs">AI Day Plan</Button>
        <Button variant="outline" size="sm" className="shrink-0 px-2 text-xs" onClick={openLandPackageQuote}>Quote - LandPackage</Button>
        <Button variant="outline" size="sm" className="shrink-0 px-2 text-xs" onClick={() => focusSection("flight")}>Quote - Flights</Button>
        <Button variant="outline" size="sm" className="shrink-0 px-2 text-xs" disabled title="No rates import system exists in the current application">Import Rates</Button>
      </div>
      <AiGenerationPanel
        leads={leads}
        enquiries={enquiries}
        conversations={whatsappConversations}
        onGenerate={generateDraftFromRequirements}
        disabled={saving}
      />
      <SupplierImportPanel onExtract={extractSupplierDraft} disabled={saving} />

      <Card id="builder-preview" className={previewOpen ? "max-h-[calc(100vh-8rem)] overflow-y-auto" : "max-h-80 overflow-y-auto"}>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Customer-facing itinerary preview</CardTitle>
            <div className="flex items-center gap-3">
              <div className="w-40">
                <Label>Template</Label>
                <Select value={previewTemplate} onValueChange={(value) => setPreviewTemplate(value as ItineraryPresentationTemplateId)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="classic">Classic</SelectItem>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="luxury">Luxury</SelectItem>
                    <SelectItem value="package">Travel Package</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {previewPackageOptions.length > 0 && (
                <div className="w-48">
                  <Label>Selected package</Label>
                  <Select value={selectedPreviewPackageId ?? previewPackageOptions[0]?.id ?? ""} onValueChange={(value) => setSelectedPreviewPackageId(value)}>
                    <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                    <SelectContent>
                      {previewPackageOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="button" variant="outline" onClick={downloadPreviewPdf}>Download PDF</Button>
              <Button type="button" variant="outline" onClick={() => void generateShareLink()} disabled={shareGenerating || !currentItineraryId}> {shareGenerating ? "Creating share…" : "Create share link"}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {shareUrl && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-medium">Customer-facing itinerary link</p>
              <a href={shareUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-emerald-700 underline">{shareUrl}</a>
            </div>
          )}
          <div className="rounded-2xl border bg-white p-6 text-slate-900 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{previewData.branding.company_name}</p>
                <h3 className="mt-2 text-3xl font-semibold">{previewData.summary || "Itinerary preview"}</h3>
                <p className="mt-2 text-sm text-slate-600">{previewData.selectedPackage ? `Selected package: ${previewData.selectedPackage.name}` : "Package selection pending"}</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <p>{form.travel_start_date || "Dates pending"} to {form.travel_end_date || "Dates pending"}</p>
                <p>{Number(form.adults || 0)} adults · {Number(form.children || 0)} children</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
              <div className="space-y-6">
                {previewData.days.map((day) => (
                  <div key={`${day.day_number}-${day.title}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-lg font-semibold">Day {day.day_number}</h4>
                      <span className="text-xs uppercase tracking-wide text-slate-500">{day.date || "Date pending"}</span>
                    </div>
                    <h5 className="mb-2 text-base font-medium text-slate-800">{day.title}</h5>
                    {day.description && <p className="mb-3 text-sm text-slate-600">{day.description}</p>}
                    {day.photos.filter((photo) => photo.url).map((photo, photoIndex) => <figure key={`${day.day_number}-day-photo-${photoIndex}`} className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <img src={photo.url ?? ""} alt={photo.alt_text || photo.caption || `Day ${day.day_number} destination`} className="h-56 w-full object-cover" />
                      <figcaption className="px-3 py-2 text-xs text-slate-600">{photo.place_name || photo.caption || `Day ${day.day_number} photo`}{photo.source === "GOOGLE_PLACES" ? ` · Google Maps${photo.attribution?.length ? ` · Photo by ${photo.attribution.map((author) => author.displayName).join(", ")}` : ""}` : ""}</figcaption>
                    </figure>)}
                    {day.items.length > 0 ? (
                      <div className="space-y-3">
                        {day.items.filter((item) => previewData.template.id !== "package" || item.item_type !== "ACCOMMODATION").map((item, itemIndex) => (
                          <div key={`${item.title}-${itemIndex}`} className="rounded-lg border border-slate-200 bg-white p-3">
                            <p className="font-medium text-slate-800">{item.title}</p>
                            {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
                            {(item.photos ?? []).length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{(item.photos ?? []).map((photo, photoIndex) => photo.url ? <img key={`${item.title}-photo-${photoIndex}`} src={photo.url} alt={photo.alt_text || photo.caption || item.title} className="h-28 w-full rounded object-cover" /> : null)}</div>}
                            {(item.details ?? []).length > 0 && (
                              <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                                {(item.details ?? []).map((detail, detailIndex) => <li key={`${detail}-${detailIndex}`}>{detail}</li>)}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No itinerary items for this day yet.</p>
                    )}
                  </div>
                ))}
                {previewData.template.id === "package" && previewData.days.some((day) => day.items.some((item) => item.item_type === "ACCOMMODATION")) && (
                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="mb-3 text-lg font-semibold text-slate-900">Accommodation</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {previewData.days.flatMap((day) => day.items.filter((item) => item.item_type === "ACCOMMODATION").map((item, index) => (
                        <article key={`${day.day_number}-${item.title}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="font-medium text-slate-900">{item.title}</p>
                          {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
                          {(item.details ?? []).length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{(item.details ?? []).map((detail, detailIndex) => <li key={`${detail}-${detailIndex}`}>{detail}</li>)}</ul>}
                        </article>
                      )))}
                    </div>
                  </section>
                )}
              </div>

              <aside className="space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Package</h4>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{previewData.selectedPackage?.name ?? "No package selected"}</p>
                  {previewData.selectedPackage?.description && <p className="mt-1 text-sm text-slate-600">{previewData.selectedPackage.description}</p>}
                </div>

                {(previewData.pricing || previewData.template.id === "package") && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Pricing</h4>
                    <p className="mt-2 font-medium text-slate-900">{previewData.selectedPackage?.name ?? "Land Package"}</p>
                    {previewData.pricing ? <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <div className="flex justify-between"><span>Adults</span><span>{previewData.pricing.adults}</span></div>
                      <div className="flex justify-between"><span>Children</span><span>{previewData.pricing.children}</span></div>
                      <div className="flex justify-between"><span>Package subtotal</span><span>{previewData.pricing.subtotal} {previewData.pricing.currency}</span></div>
                      {previewData.pricing.adult_price != null && <div className="flex justify-between"><span>Adult price</span><span>{previewData.pricing.adult_price} {previewData.pricing.currency}</span></div>}
                      {previewData.pricing.child_price != null && <div className="flex justify-between"><span>Child price</span><span>{previewData.pricing.child_price} {previewData.pricing.currency}</span></div>}
                      {previewData.pricing.per_person_price != null && <div className="flex justify-between"><span>Per person</span><span>{previewData.pricing.per_person_price} {previewData.pricing.currency}</span></div>}
                      <div className="flex justify-between"><span>Tax</span><span>{previewData.pricing.tax} {previewData.pricing.currency}</span></div>
                      <div className="flex justify-between font-semibold text-slate-900"><span>Final customer price</span><span>{previewData.pricing.final_customer_price} {previewData.pricing.currency}</span></div>
                    </div> : <p className="mt-2 text-sm font-medium text-amber-800">Quote to be confirmed</p>}
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Inclusions</h4>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                    {(form.inclusions.filter((value) => value.trim()).length > 0 ? form.inclusions.filter((value) => value.trim()) : ["Included on request"]).map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Exclusions</h4>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                    {(form.exclusions.filter((value) => value.trim()).length > 0 ? form.exclusions.filter((value) => value.trim()) : ["Not listed"]).map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}
                  </ul>
                </div>

                {form.cancellation_info && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Cancellation</h4>
                    <p className="mt-2 text-sm text-slate-600">{form.cancellation_info}</p>
                  </div>
                )}
                {form.terms_conditions.trim() && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Terms and Conditions</h4>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{form.terms_conditions}</p>
                  </div>
                )}
              </aside>
            </div>

            {previewData.branding.signature_text && (
              <div className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-700 whitespace-pre-line">
                {previewData.branding.signature_text}
              </div>
            )}

            {previewData.branding.footer_text && (
              <div className="mt-6 border-t border-slate-200 pt-4 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
                {previewData.branding.footer_text}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      </aside>
      <main className="order-1 flex min-w-0 flex-col gap-3 xl:order-1">
      <Card className="order-3 border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Validation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium text-foreground">{validation.valid ? "Ready to save" : `${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"} need attention`}</p>
          {validation.errors.length > 0 && (
            <ul className="space-y-1 text-sm text-destructive">
              {validation.errors.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  <span className="font-medium">{issue.code}</span>: {issue.message}
                  {issue.path ? ` (${issue.path})` : ""}
                </li>
              ))}
            </ul>
          )}
          {validation.warnings.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {validation.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="builder-costing" className="order-4 border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Internal costing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Internal supplier cost only. No selling price, margin, GST or payment logic.</p>
            <Button type="button" variant="outline" onClick={addCostLine}>Add cost line</Button>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total Land Package</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">₹{costSummary.totalLandPackage.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Activities &amp; Transfers</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">₹{costSummary.activitiesTransfers.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total Hotels</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">₹{costSummary.totalHotels.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total Visa</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">₹{costSummary.totalVisa.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total Supplier Cost</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">₹{costSummary.totalSupplierCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Margin</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">₹{costSummary.margin.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3 sm:col-span-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Taxes</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">₹{costSummary.taxes.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {costLines.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No internal cost lines yet. Add a hotel, transfer, activity, flight, visa or other service cost.</p>
          ) : (
            <div className="space-y-3">
              {costLines.map((line, index) => (
                <div key={line.id ?? `cost-${index}`} className="grid gap-3 rounded-md border p-3 md:grid-cols-7">
                  <div className="md:col-span-1">
                    <Label>Category</Label>
                    <Select value={line.cost_category} onValueChange={(value) => updateCostLineById(line.id ?? `cost-${index}`, { cost_category: value as ItineraryCostLine["cost_category"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ITINERARY_COST_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description</Label>
                    <Input value={line.description} onChange={(event) => updateCostLineById(line.id ?? `cost-${index}`, { description: event.target.value })} />
                  </div>
                  <div>
                    <Label>Qty</Label>
                    <Input type="number" min="0" step="0.01" value={line.quantity} onChange={(event) => updateCostLineById(line.id ?? `cost-${index}`, { quantity: Number(event.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Input value={line.unit} onChange={(event) => updateCostLineById(line.id ?? `cost-${index}`, { unit: event.target.value })} />
                  </div>
                  <div>
                    <Label>Unit cost</Label>
                    <Input type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => updateCostLineById(line.id ?? `cost-${index}`, { unit_cost: Number(event.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Input value={line.currency} maxLength={3} onChange={(event) => updateCostLineById(line.id ?? `cost-${index}`, { currency: event.target.value.toUpperCase() })} />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>Total</Label>
                      <Input value={Number(line.total_cost).toFixed(2)} readOnly />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => deleteCostLineById(line.id)} aria-label="Delete cost line">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="md:col-span-7">
                    <Label>Notes</Label>
                    <Textarea value={line.notes ?? ""} onChange={(event) => updateCostLineById(line.id ?? `cost-${index}`, { notes: event.target.value || null })} rows={2} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="builder-details" className="order-2 border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Itinerary details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </div>

            <div>
              <Label>Customer</Label>
              <Select value={form.customer_id} onValueChange={(value) => setForm((current) => ({ ...current, customer_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>{customer.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Destination</Label>
              <Select value={form.destination_id} onValueChange={(value) => setForm((current) => ({ ...current, destination_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                <SelectContent>
                  {destinations.map((destination) => (
                    <SelectItem key={destination.id} value={destination.id}>{destination.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Lead</Label>
              <Input value={form.lead_id} onChange={(event) => setForm((current) => ({ ...current, lead_id: event.target.value }))} placeholder="Lead UUID" />
            </div>

            <div>
              <Label>Enquiry</Label>
              <Input value={form.enquiry_id} onChange={(event) => setForm((current) => ({ ...current, enquiry_id: event.target.value }))} placeholder="Enquiry UUID" />
            </div>

            <div>
              <Label>Travel start</Label>
              <Input type="date" value={form.travel_start_date} onChange={(event) => setForm((current) => ({ ...current, travel_start_date: event.target.value }))} />
            </div>

            <div>
              <Label>Travel end</Label>
              <Input type="date" value={form.travel_end_date} onChange={(event) => setForm((current) => ({ ...current, travel_end_date: event.target.value }))} />
            </div>

            <div>
              <Label>Adults</Label>
              <Input type="number" min={0} value={form.adults} onChange={(event) => setForm((current) => ({ ...current, adults: event.target.value }))} />
            </div>

            <div>
              <Label>Children</Label>
              <Input type="number" min={0} value={form.children} onChange={(event) => setForm((current) => ({ ...current, children: event.target.value }))} />
            </div>

            <div>
              <Label>Assigned employee</Label>
              <Select value={form.assigned_to} onValueChange={(value) => setForm((current) => ({ ...current, assigned_to: value }))}>
                <SelectTrigger><SelectValue placeholder="Assigned employee" /></SelectTrigger>
                <SelectContent>
                  {form.assigned_to &&
                  !profiles.some((profile) => profile.id === form.assigned_to) ? (
                    <SelectItem value={form.assigned_to} disabled>
                      Existing assignee
                    </SelectItem>
                  ) : null}
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as "DRAFT" | "READY" }))}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="READY">READY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="builder-day" className="order-1 border-slate-200 shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Day-by-day content editor</CardTitle>
            <Button variant="outline" size="sm" onClick={addDay}>
              <Plus className="mr-2 size-4" /> Add day
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {sortedDays.map((day, index) => (
            <div key={`${day.day_number}-${index}`} className="rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-medium">Day {day.day_number}</h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => moveDay(index, "up")}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => moveDay(index, "down")}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteDay(index)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={day.date} onChange={(event) => updateDay(index, { date: event.target.value })} />
                </div>
                <div>
                  <Label>Title</Label>
                  <Input value={day.title} onChange={(event) => updateDay(index, { title: event.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label>Summary</Label>
                  <Textarea value={day.description} onChange={(event) => updateDay(index, { description: event.target.value })} rows={3} />
                </div>
                <div className="md:col-span-2">
                  <Label>Day notes</Label>
                  <Textarea value={day.notes} onChange={(event) => updateDay(index, { notes: event.target.value })} rows={2} />
                </div>
              </div>

              {form.photos.filter((photo) => photo.day_id === day.id).map((photo) => {
                const imageUrl = photo.storage_path ? photoDisplayUrls[photo.storage_path] ?? "" : photo.url;
                if (!imageUrl) return null;
                const authors = Array.isArray(photo.attribution)
                  ? photo.attribution.flatMap((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry["displayName"] === "string" ? [entry["displayName"]] : [])
                  : [];
                return <figure key={photo.id ?? `day-image-${day.day_number}`} className="mt-3 max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <img src={imageUrl} alt={photo.alt_text || photo.caption || `Day ${day.day_number} destination`} className="h-48 w-full object-cover" />
                  <figcaption className="p-2 text-xs text-slate-600">{photo.place_name || photo.caption || `Day ${day.day_number} photo`}{photo.source === "GOOGLE_PLACES" ? ` · Google Maps${authors.length ? ` · Photo by ${authors.join(", ")}` : ""}` : ""}</figcaption>
                </figure>;
              })}

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {ITINERARY_CONTENT_ITEM_TYPES.map((itemType) => {
                    const checkoutOnlyDay = !hotelCheckInAllowed(day, index, days, form.travel_end_date);
                    const hotelCheckInBlocked = itemType === "ACCOMMODATION" && checkoutOnlyDay;
                    return (
                      <Button key={itemType} variant="outline" size="sm" disabled={hotelCheckInBlocked} title={hotelCheckInBlocked ? "The final trip day is checkout-only." : undefined} onClick={() => addItemToDay(index, itemType)}>
                        + Add {itemType}
                      </Button>
                    );
                  })}
                </div>

                {day.items.length === 0 && <p className="text-sm text-muted-foreground">No content items yet for this day.</p>}

                {day.items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => item.item_type !== "FLIGHT").map(({ item, itemIndex }) => (
                  <div key={`${item.item_type}-${itemIndex}`} data-builder-type={item.item_type} className="rounded-lg border bg-muted/20 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.item_type}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => moveItem(index, itemIndex, "up")}>Move up</Button>
                        <Button variant="outline" size="sm" onClick={() => moveItem(index, itemIndex, "down")}>Move down</Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteItem(index, itemIndex)}>Delete</Button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Type</Label>
                        <Select value={item.item_type} onValueChange={(value) => updateItem(index, itemIndex, { item_type: value as TripDayItemState["item_type"] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ITINERARY_CONTENT_ITEM_TYPES.map((value) => (
                              <SelectItem key={value} value={value}>{value}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Title</Label>
                        <Input value={item.title} onChange={(event) => updateItem(index, itemIndex, { title: event.target.value })} />
                      </div>

                      {(item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING") && (
                        <>
                          <div>
                            <Label>Location</Label>
                            <Input value={item.location ?? ""} onChange={(event) => updateItem(index, itemIndex, { location: event.target.value })} />
                          </div>
                          <div>
                            <Label>Duration</Label>
                            <Input value={item.duration ?? ""} onChange={(event) => updateItem(index, itemIndex, { duration: event.target.value })} />
                          </div>
                        </>
                      )}

                      {item.item_type === "TRANSPORT" && (
                        <>
                          <div>
                            <Label>Pickup</Label>
                            <Input value={item.pickup ?? ""} onChange={(event) => updateItem(index, itemIndex, { pickup: event.target.value })} />
                          </div>
                          <div>
                            <Label>Drop</Label>
                            <Input value={item.dropoff ?? ""} onChange={(event) => updateItem(index, itemIndex, { dropoff: event.target.value })} />
                          </div>
                          <div>
                            <Label>Departure</Label>
                            <Input value={item.departure_time ?? ""} onChange={(event) => updateItem(index, itemIndex, { departure_time: event.target.value })} />
                          </div>
                          <div>
                            <Label>Arrival</Label>
                            <Input value={item.arrival_time ?? ""} onChange={(event) => updateItem(index, itemIndex, { arrival_time: event.target.value })} />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Vehicle / details</Label>
                            <Input value={item.vehicle_details ?? ""} onChange={(event) => updateItem(index, itemIndex, { vehicle_details: event.target.value })} />
                          </div>
                        </>
                      )}

                      {item.item_type === "MEAL" && (
                        <div>
                          <Label>Meal type</Label>
                          <Select value={item.meal_type ?? "BREAKFAST"} onValueChange={(value) => updateItem(index, itemIndex, { meal_type: value as "BREAKFAST" | "LUNCH" | "DINNER" })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BREAKFAST">Breakfast</SelectItem>
                              <SelectItem value="LUNCH">Lunch</SelectItem>
                              <SelectItem value="DINNER">Dinner</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {item.item_type === "ACCOMMODATION" && (
                        <>
                          <div>
                            <Label>Hotel name</Label>
                            <Input required value={item.hotel_name ?? ""} onChange={(event) => updateItem(index, itemIndex, { hotel_name: event.target.value })} />
                          </div>
                          <div>
                            <Label>City</Label>
                            <Input value={item.hotel_city ?? ""} onChange={(event) => updateItem(index, itemIndex, { hotel_city: event.target.value })} />
                          </div>
                          <div>
                            <Label>Address / location</Label>
                            <Input value={item.hotel_address ?? ""} onChange={(event) => updateItem(index, itemIndex, { hotel_address: event.target.value })} />
                          </div>
                          <div>
                            <Label>Country</Label>
                            <Input value={item.hotel_country ?? ""} onChange={(event) => updateItem(index, itemIndex, { hotel_country: event.target.value })} />
                          </div>
                          <div>
                            <Label>Star category</Label>
                            <Select value={item.star_category ?? "3 Star"} onValueChange={(value) => updateItem(index, itemIndex, { star_category: value })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{HOTEL_STAR_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Check-in</Label>
                            <Input type="date" min={form.travel_start_date || undefined} max={item.check_out || form.travel_end_date || undefined} value={item.check_in ?? ""} onChange={(event) => updateItem(index, itemIndex, { check_in: event.target.value, nights: nightsBetween(event.target.value, item.check_out) })} />
                          </div>
                          <div>
                            <Label>Check-out</Label>
                            <Input type="date" min={item.check_in || form.travel_start_date || undefined} max={form.travel_end_date || undefined} value={item.check_out ?? ""} onChange={(event) => updateItem(index, itemIndex, { check_out: event.target.value, nights: nightsBetween(item.check_in, event.target.value) })} />
                          </div>
                          <div>
                            <Label>Nights</Label>
                            <Input type="number" value={nightsBetween(item.check_in, item.check_out)} readOnly />
                          </div>
                          <div>
                            <Label>Room type</Label>
                            <Select value={item.room_type ?? "Standard"} onValueChange={(value) => updateItem(index, itemIndex, { room_type: value })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{ROOM_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Rooms</Label>
                            <Input type="number" min={1} value={item.rooms ?? 1} onChange={(event) => updateItem(index, itemIndex, { rooms: Number(event.target.value) })} />
                          </div>
                          <div>
                            <Label>Adults</Label>
                            <Input type="number" min={0} value={item.adults ?? 0} onChange={(event) => updateItem(index, itemIndex, { adults: Number(event.target.value) })} />
                          </div>
                          <div>
                            <Label>Children</Label>
                            <Input type="number" min={0} value={item.children ?? 0} onChange={(event) => updateItem(index, itemIndex, { children: Number(event.target.value) })} />
                          </div>
                          <div>
                            <Label>Extra beds</Label>
                            <Input type="number" min={0} value={item.extra_beds ?? 0} onChange={(event) => updateItem(index, itemIndex, { extra_beds: Number(event.target.value) })} />
                          </div>
                          <div>
                            <Label>Meal plan</Label>
                            <Select value={item.meal_plan ?? "Breakfast"} onValueChange={(value) => updateItem(index, itemIndex, { meal_plan: value })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{HOTEL_MEAL_PLANS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Option</Label>
                            <Select value={getItineraryOption(item)} onValueChange={(value) => updateItem(index, itemIndex, { hotel_option_label: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ITINERARY_OPTION_VALUES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
                          </div>
                          <div>
                            <Label>Option group</Label>
                            <Input value={item.hotel_option_group ?? ""} onChange={(event) => updateItem(index, itemIndex, { hotel_option_group: event.target.value })} placeholder="Main stay options" />
                          </div>
                          <div>
                            <Label>Option order</Label>
                            <Input type="number" min={0} value={item.hotel_option_sequence ?? 0} onChange={(event) => updateItem(index, itemIndex, { hotel_option_sequence: Number(event.target.value) })} />
                          </div>
                          <div className="md:col-span-2">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <Label className="text-base font-medium">Rooms</Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const currentRooms = Array.isArray(item.metadata?.room_details)
                                    ? (item.metadata?.room_details as HotelRoomDetail[])
                                    : [{ id: crypto.randomUUID(), room_type: item.room_type ?? "Room Type", adults: Number(item.adults ?? 0), kids: Number(item.children ?? 0), breakfast: false, lunch: false, dinner: false, room_rate_per_night: 0, free_cancellation_date: "" }];
                                  const nextRooms = [...currentRooms, { id: crypto.randomUUID(), room_type: "Room Type", adults: 0, kids: 0, breakfast: false, lunch: false, dinner: false, room_rate_per_night: 0, free_cancellation_date: "" }];
                                  updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), room_details: nextRooms } });
                                }}
                              >
                                + Add Room
                              </Button>
                            </div>

                            {(Array.isArray(item.metadata?.room_details) ? (item.metadata?.room_details as HotelRoomDetail[]) : [{ id: crypto.randomUUID(), room_type: item.room_type ?? "Room Type", adults: Number(item.adults ?? 0), kids: Number(item.children ?? 0), breakfast: Boolean(item.meal_plan?.toLowerCase().includes("breakfast")), lunch: false, dinner: false, room_rate_per_night: 0, free_cancellation_date: "" }]).map((room, roomIndex) => (
                              <div key={room.id ?? roomIndex} className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
                                <div className="mb-3 flex items-center justify-end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Remove room"
                                    onClick={() => {
                                      const currentRooms = Array.isArray(item.metadata?.room_details)
                                        ? (item.metadata?.room_details as HotelRoomDetail[])
                                        : [];
                                      const nextRooms = currentRooms.filter((_, currentIndex) => currentIndex !== roomIndex);
                                      updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), room_details: nextRooms.length > 0 ? nextRooms : [{ id: crypto.randomUUID(), room_type: item.room_type ?? "Room Type", adults: Number(item.adults ?? 0), kids: Number(item.children ?? 0), breakfast: false, lunch: false, dinner: false, room_rate_per_night: 0, free_cancellation_date: "" }] } });
                                    }}
                                    className="text-rose-600 hover:text-rose-700"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="md:col-span-2">
                                    <Label>Room Type</Label>
                                    <Input
                                      value={room.room_type}
                                      onChange={(event) => {
                                        const currentRooms = Array.isArray(item.metadata?.room_details) ? (item.metadata?.room_details as HotelRoomDetail[]) : [];
                                        const nextRooms = currentRooms.map((entry, currentIndex) => currentIndex === roomIndex ? { ...entry, room_type: event.target.value } : entry);
                                        updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), room_details: nextRooms } });
                                      }}
                                      placeholder="Room Type"
                                    />
                                  </div>
                                  <div>
                                    <Label>Adults</Label>
                                    <Input type="number" min={0} value={room.adults} onChange={(event) => {
                                      const currentRooms = Array.isArray(item.metadata?.room_details) ? (item.metadata?.room_details as HotelRoomDetail[]) : [];
                                      const nextRooms = currentRooms.map((entry, currentIndex) => currentIndex === roomIndex ? { ...entry, adults: Number(event.target.value) || 0 } : entry);
                                      updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), room_details: nextRooms } });
                                    }} />
                                  </div>
                                  <div>
                                    <Label>Kids</Label>
                                    <Input type="number" min={0} value={room.kids} onChange={(event) => {
                                      const currentRooms = Array.isArray(item.metadata?.room_details) ? (item.metadata?.room_details as HotelRoomDetail[]) : [];
                                      const nextRooms = currentRooms.map((entry, currentIndex) => currentIndex === roomIndex ? { ...entry, kids: Number(event.target.value) || 0 } : entry);
                                      updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), room_details: nextRooms } });
                                    }} />
                                  </div>
                                  <div className="md:col-span-2 flex flex-wrap gap-4">
                                    {([
                                      { key: "breakfast", label: "Breakfast" },
                                      { key: "lunch", label: "Lunch" },
                                      { key: "dinner", label: "Dinner" },
                                    ] as const).map((meal) => (
                                      <label key={meal.key} className="flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                          type="checkbox"
                                          checked={room[meal.key]}
                                          onChange={(event) => {
                                            const currentRooms = Array.isArray(item.metadata?.room_details) ? (item.metadata?.room_details as HotelRoomDetail[]) : [];
                                            const nextRooms = currentRooms.map((entry, currentIndex) => currentIndex === roomIndex ? { ...entry, [meal.key]: event.target.checked } : entry);
                                            updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), room_details: nextRooms } });
                                          }}
                                        />
                                        {meal.label}
                                      </label>
                                    ))}
                                  </div>
                                  <div>
                                    <Label>Room Rate Per Night ({room.currency || "INR"})</Label>
                                    <Input type="number" min={0} step="0.01" value={room.room_rate_per_night} onChange={(event) => updateRoomRate(index, itemIndex, item, roomIndex, event.target.value)} />
                                    <Select value={room.currency || "INR"} onValueChange={(currency) => updateRoomCurrency(index, itemIndex, item, roomIndex, currency)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{POPULAR_CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select>
                                    <InrEquivalent amount={room.room_rate_per_night} currency={room.currency || "INR"} className="mt-2" />
                                  </div>
                                  <div>
                                    <Label>Free Cancellation Date</Label>
                                    <Input type="date" value={room.free_cancellation_date} onChange={(event) => {
                                      const currentRooms = Array.isArray(item.metadata?.room_details) ? (item.metadata?.room_details as HotelRoomDetail[]) : [];
                                      const nextRooms = currentRooms.map((entry, currentIndex) => currentIndex === roomIndex ? { ...entry, free_cancellation_date: event.target.value } : entry);
                                      updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), room_details: nextRooms } });
                                    }} />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="md:col-span-2"><Label>Room / occupancy information</Label><Input value={item.room_details ?? ""} onChange={(event) => updateItem(index, itemIndex, { room_details: event.target.value })} /></div>
                          <div className="md:col-span-2"><Label>Hotel description</Label><Textarea value={item.hotel_description ?? ""} onChange={(event) => updateItem(index, itemIndex, { hotel_description: event.target.value })} rows={2} /></div>
                          <div className="md:col-span-2"><Label>Customer-facing hotel information</Label><Textarea value={item.customer_facing_info ?? ""} onChange={(event) => updateItem(index, itemIndex, { customer_facing_info: event.target.value })} rows={2} /></div>
                        </>
                      )}

                      {item.item_type === "FLIGHT" && item.metadata?.flight_saved === true ? (
                        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1 text-sm text-slate-700">
                              <p className="font-semibold text-slate-900">{item.flight_airline || "Flight"}{item.flight_number ? ` ${item.flight_number}` : ""}</p>
                              <p>{item.departure_city || item.departure_airport || "Departure"} → {item.arrival_city || item.arrival_airport || "Arrival"}</p>
                              <p>{item.flight_departure_date || "Date pending"}{item.flight_departure_time ? ` ${item.flight_departure_time}` : ""} → {item.flight_arrival_date || "Date pending"}{item.flight_arrival_time ? ` ${item.flight_arrival_time}` : ""}</p>
                              <p>{item.flight_cabin || "Economy"}{item.baggage_information ? ` · ${item.baggage_information}` : ""}{item.flight_price != null ? ` · ${item.flight_currency || "INR"} ${item.flight_price.toLocaleString("en-IN")}` : ""}</p>
                              {validateFlightTimeOrder(item) && <p className="font-medium text-rose-600">{validateFlightTimeOrder(item)}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), flight_saved: false } })}>Edit</Button>
                              <Button type="button" size="sm" disabled={saving || Boolean(validateFlightTimeOrder(item))} onClick={() => void saveItinerary(false)}>{saving ? "Saving…" : "Save Flight"}</Button>
                            </div>
                          </div>
                        </div>
                      ) : item.item_type === "FLIGHT" && (
                        <>
                          <div><Label>Airline</Label><Input required value={item.flight_airline ?? ""} onChange={(event) => updateItem(index, itemIndex, { flight_airline: event.target.value })} /></div>
                          <div><Label>Flight number</Label><Input value={item.flight_number ?? ""} onChange={(event) => updateItem(index, itemIndex, { flight_number: event.target.value })} /></div>
                          <div><Label>Departure airport</Label><Input value={item.departure_airport ?? ""} onChange={(event) => updateItem(index, itemIndex, { departure_airport: event.target.value })} /></div>
                          <div><Label>Departure city</Label><Input value={item.departure_city ?? ""} onChange={(event) => updateItem(index, itemIndex, { departure_city: event.target.value })} /></div>
                          <div><Label>Arrival airport</Label><Input value={item.arrival_airport ?? ""} onChange={(event) => updateItem(index, itemIndex, { arrival_airport: event.target.value })} /></div>
                          <div><Label>Arrival city</Label><Input value={item.arrival_city ?? ""} onChange={(event) => updateItem(index, itemIndex, { arrival_city: event.target.value })} /></div>
                          <div><Label>Departure date</Label><Input required type="date" value={item.flight_departure_date ?? ""} onChange={(event) => updateItem(index, itemIndex, { flight_departure_date: event.target.value })} /></div>
                          <div><Label>Departure time</Label><Input required type="time" value={item.flight_departure_time ?? ""} onChange={(event) => updateItem(index, itemIndex, { flight_departure_time: event.target.value })} /></div>
                          <div><Label>Departure time zone</Label><Select value={getFlightTimeZone(item, "departure")} onValueChange={(value) => updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), departure_timezone: value } })}><SelectTrigger><SelectValue placeholder="Select country / GMT" /></SelectTrigger><SelectContent>{FLIGHT_TIME_ZONE_OPTIONS.map(([country, offset]) => <SelectItem key={`${country}-${offset}`} value={`${country} (${offset})`}>{country} ({offset})</SelectItem>)}</SelectContent></Select></div>
                          <div><Label>Arrival date</Label><Input required type="date" min={getFlightTimeZone(item, "departure") === getFlightTimeZone(item, "arrival") ? item.flight_departure_date ?? undefined : undefined} value={item.flight_arrival_date ?? ""} onChange={(event) => updateItem(index, itemIndex, { flight_arrival_date: event.target.value })} /></div>
                          <div><Label>Arrival time</Label><Input required type="time" value={item.flight_arrival_time ?? ""} onChange={(event) => updateItem(index, itemIndex, { flight_arrival_time: event.target.value })} /></div>
                          <div><Label>Arrival time zone</Label><Select value={getFlightTimeZone(item, "arrival")} onValueChange={(value) => updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), arrival_timezone: value } })}><SelectTrigger><SelectValue placeholder="Select country / GMT" /></SelectTrigger><SelectContent>{FLIGHT_TIME_ZONE_OPTIONS.map(([country, offset]) => <SelectItem key={`${country}-${offset}`} value={`${country} (${offset})`}>{country} ({offset})</SelectItem>)}</SelectContent></Select></div>
                          <div><Label>Cabin / class</Label><Input value={item.flight_cabin ?? ""} onChange={(event) => updateItem(index, itemIndex, { flight_cabin: event.target.value })} /></div>
                          <div><Label>Option</Label><Select value={getItineraryOption(item)} onValueChange={(value) => updateItem(index, itemIndex, { metadata: { ...(item.metadata ?? {}), flight_option: value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ITINERARY_OPTION_VALUES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
                          <div><Label>Baggage</Label><Input value={item.baggage_information ?? ""} onChange={(event) => updateItem(index, itemIndex, { baggage_information: event.target.value })} /></div>
                          <div><Label>Flight duration</Label><Input value={item.flight_duration ?? ""} onChange={(event) => updateItem(index, itemIndex, { flight_duration: event.target.value })} /></div>
                          <div><Label>Price (optional)</Label><Input type="number" min={0} step="0.01" value={item.flight_price ?? ""} onChange={(event) => updateFlightPrice(index, itemIndex, item, event.target.value)} /><InrEquivalent amount={item.flight_price ?? ""} currency={item.flight_currency || "INR"} className="mt-1.5" /></div>
                          <div><Label>Currency</Label><Select value={item.flight_currency || "INR"} onValueChange={(value) => updateFlightCurrency(index, itemIndex, item, value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FLIGHT_CURRENCY_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                          <div className="md:col-span-2"><Label>Customer-facing flight information</Label><Textarea value={item.description} onChange={(event) => updateItem(index, itemIndex, { description: event.target.value })} rows={2} /></div>
                        </>
                      )}

                      {item.item_type === "VISA" && (
                        <>
                          <div><Label>Country</Label><Input required value={item.visa_country ?? ""} onChange={(event) => updateItem(index, itemIndex, { visa_country: event.target.value })} /></div>
                          <div><Label>Visa type</Label><Input required value={item.visa_type ?? ""} onChange={(event) => updateItem(index, itemIndex, { visa_type: event.target.value })} /></div>
                          <div><Label>Visa validity</Label><Input value={item.visa_validity ?? ""} onChange={(event) => updateItem(index, itemIndex, { visa_validity: event.target.value })} /></div>
                          <div><Label>Processing time</Label><Input value={item.visa_processing_time ?? ""} onChange={(event) => updateItem(index, itemIndex, { visa_processing_time: event.target.value })} /></div>
                          <div className="md:col-span-2"><Label>Required documents / details</Label><Textarea value={item.visa_required_documents ?? ""} onChange={(event) => updateItem(index, itemIndex, { visa_required_documents: event.target.value })} rows={2} /></div>
                          <div className="md:col-span-2"><Label>Entry / exit information</Label><Textarea value={item.visa_entry_exit_information ?? ""} onChange={(event) => updateItem(index, itemIndex, { visa_entry_exit_information: event.target.value })} rows={2} /></div>
                          <div className="md:col-span-2"><Label>Customer-facing visa information</Label><Textarea value={item.visa_customer_information ?? ""} onChange={(event) => updateItem(index, itemIndex, { visa_customer_information: event.target.value })} rows={2} /></div>
                        </>
                      )}

                      {item.item_type === "EXTRA_TRANSPORT" && (
                        <>
                          <div><Label>Transport type</Label><Select value={item.extra_transport_type ?? "Airport Transfer"} onValueChange={(value) => updateItem(index, itemIndex, { extra_transport_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRANSPORT_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                          <div><Label>Pickup location</Label><Input required value={item.pickup ?? ""} onChange={(event) => updateItem(index, itemIndex, { pickup: event.target.value })} /></div>
                          <div><Label>Drop location</Label><Input required value={item.dropoff ?? ""} onChange={(event) => updateItem(index, itemIndex, { dropoff: event.target.value })} /></div>
                          <div><Label>Date</Label><Input type="date" min={form.travel_start_date || undefined} max={form.travel_end_date || undefined} value={item.extra_transport_date ?? ""} onChange={(event) => updateItem(index, itemIndex, { extra_transport_date: event.target.value })} /></div>
                          <div><Label>Pickup time</Label><Input required type="time" value={item.extra_transport_pickup_time ?? ""} onChange={(event) => updateItem(index, itemIndex, { extra_transport_pickup_time: event.target.value })} /></div>
                          <div><Label>Drop / arrival time</Label><Input required type="time" value={item.extra_transport_drop_time ?? ""} onChange={(event) => updateItem(index, itemIndex, { extra_transport_drop_time: event.target.value })} /></div>
                          <div><Label>Vehicle type</Label><Select value={item.extra_transport_vehicle_type ?? "Sedan"} onValueChange={(value) => updateItem(index, itemIndex, { extra_transport_vehicle_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VEHICLE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                          <div><Label>Passengers</Label><Input type="number" min={0} value={item.extra_transport_passengers ?? 0} onChange={(event) => updateItem(index, itemIndex, { extra_transport_passengers: Number(event.target.value) })} /></div>
                          <div className="md:col-span-2"><Label>Vehicle / driver details</Label><Input value={item.extra_transport_vehicle_details ?? ""} onChange={(event) => updateItem(index, itemIndex, { extra_transport_vehicle_details: event.target.value })} /></div>
                          <div className="md:col-span-2"><Label>Driver details</Label><Input value={item.extra_transport_driver_details ?? ""} onChange={(event) => updateItem(index, itemIndex, { extra_transport_driver_details: event.target.value })} /></div>
                          <div className="md:col-span-2"><Label>Customer-facing transport notes</Label><Textarea value={item.extra_transport_customer_notes ?? ""} onChange={(event) => updateItem(index, itemIndex, { extra_transport_customer_notes: event.target.value })} rows={2} /></div>
                        </>
                      )}

                      <div className="md:col-span-2">
                        <Label>Description</Label>
                        <Textarea value={item.description} onChange={(event) => updateItem(index, itemIndex, { description: event.target.value })} rows={3} />
                      </div>

                      <div className="md:col-span-2">
                        <Label>Notes</Label>
                        <Textarea value={item.notes ?? ""} onChange={(event) => updateItem(index, itemIndex, { notes: event.target.value })} rows={2} />
                      </div>
                      {item.item_type === "ACCOMMODATION" && item.hotel_name && (
                        <div className="md:col-span-2 rounded-md bg-muted/40 p-3 text-sm">
                          <strong>{item.hotel_name}</strong> · {item.hotel_city || "Location pending"} · {item.star_category || "Category pending"}<br />
                          {item.check_in || "Check-in pending"} → {item.check_out || "Check-out pending"} · {nightsBetween(item.check_in, item.check_out)} nights · {item.room_type || "Room pending"} · {item.rooms ?? 0} rooms · {item.meal_plan || "Meal plan pending"}
                        </div>
                      )}
                      {item.item_type === "FLIGHT" && item.flight_airline && <div className="md:col-span-2 rounded-md bg-muted/40 p-3 text-sm"><strong>{item.flight_airline}{item.flight_number ? ` ${item.flight_number}` : ""}</strong> · {item.departure_city || "Departure"} → {item.arrival_city || "Arrival"} · {item.flight_departure_date || "Date pending"}{item.flight_departure_time ? ` ${item.flight_departure_time}` : ""} → {item.flight_arrival_date || "Date pending"}{item.flight_arrival_time ? ` ${item.flight_arrival_time}` : ""}{item.flight_cabin ? ` · ${item.flight_cabin}` : ""}{item.baggage_information ? ` · ${item.baggage_information}` : ""}</div>}
                      {item.item_type === "VISA" && item.visa_country && <div className="md:col-span-2 rounded-md bg-muted/40 p-3 text-sm"><strong>{item.visa_country} · {item.visa_type || "Visa"}</strong> · {item.visa_validity || "Validity pending"} · {item.visa_processing_time || "Processing time pending"}<br />{item.visa_customer_information || item.notes || ""}</div>}
                      {item.item_type === "EXTRA_TRANSPORT" && item.extra_transport_type && <div className="md:col-span-2 rounded-md bg-muted/40 p-3 text-sm"><strong>{item.extra_transport_type}</strong> · {item.pickup || "Pickup"} → {item.dropoff || "Drop"} · {item.extra_transport_date || "Date pending"}{item.extra_transport_pickup_time ? ` ${item.extra_transport_pickup_time}` : ""} · {item.extra_transport_vehicle_type || "Vehicle pending"} · {item.extra_transport_passengers ?? 0} passengers</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div id="builder-inclusions" className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border p-4">
              <h3 className="font-medium">Inclusions</h3>
              {form.inclusions.map((value, idx) => (
                <div key={`inclusion-${idx}`} className="flex gap-2">
                  <Input value={value} onChange={(event) => setForm((current) => ({ ...current, inclusions: current.inclusions.map((item, itemIndex) => itemIndex === idx ? event.target.value : item) }))} />
                  <Button variant="ghost" size="icon" onClick={() => setForm((current) => ({ ...current, inclusions: current.inclusions.filter((_, itemIndex) => itemIndex !== idx) }))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, inclusions: [...current.inclusions, ""] }))}>+ Add inclusion</Button>
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <h3 className="font-medium">Exclusions</h3>
              {form.exclusions.map((value, idx) => (
                <div key={`exclusion-${idx}`} className="flex gap-2">
                  <Input value={value} onChange={(event) => setForm((current) => ({ ...current, exclusions: current.exclusions.map((item, itemIndex) => itemIndex === idx ? event.target.value : item) }))} />
                  <Button variant="ghost" size="icon" onClick={() => setForm((current) => ({ ...current, exclusions: current.exclusions.filter((_, itemIndex) => itemIndex !== idx) }))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, exclusions: [...current.exclusions, ""] }))}>+ Add exclusion</Button>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <h3 className="font-medium">Cancellation information</h3>
            <Textarea value={form.cancellation_info} onChange={(event) => setForm((current) => ({ ...current, cancellation_info: event.target.value }))} rows={3} />
            <Label htmlFor="inline-terms-conditions">Terms and Conditions</Label>
            <Textarea id="inline-terms-conditions" value={form.terms_conditions} onChange={(event) => setForm((current) => ({ ...current, terms_conditions: event.target.value }))} rows={5} placeholder="Add booking, payment, validity, and other applicable terms and conditions." />
          </div>

          <div id="builder-tables" className="space-y-3 rounded-xl border p-4">
            <h3 className="font-medium">Custom table</h3>
            {form.custom_tables.map((table, tableIndex) => (
              <div key={table.id ?? `table-${tableIndex}`} className="space-y-2 rounded-lg border p-3">
                <div className="flex gap-2">
                  <Input value={table.title} onChange={(event) => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex ? { ...entry, title: event.target.value } : entry) }))} placeholder="Table title" />
                  <Button variant="outline" size="icon" onClick={() => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex - 1 ? current.custom_tables[tableIndex]! : index === tableIndex ? current.custom_tables[tableIndex - 1]! : entry) }))} disabled={tableIndex === 0}><ArrowUp className="size-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex + 1 ? current.custom_tables[tableIndex]! : index === tableIndex ? current.custom_tables[tableIndex + 1]! : entry) }))} disabled={tableIndex === form.custom_tables.length - 1}><ArrowDown className="size-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setForm((current) => ({ ...current, custom_tables: current.custom_tables.filter((_, index) => index !== tableIndex) }))}><Trash2 className="size-4" /></Button>
                </div>
                {table.columns.map((column, columnIndex) => (
                  <div key={`column-${tableIndex}-${columnIndex}`} className="flex gap-2">
                    <Input value={column} onChange={(event) => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex ? { ...entry, columns: entry.columns.map((value, valueIndex) => valueIndex === columnIndex ? event.target.value : value) } : entry) }))} />
                    <Button variant="ghost" size="icon" onClick={() => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex ? { ...entry, columns: entry.columns.filter((_, valueIndex) => valueIndex !== columnIndex), rows: entry.rows.map((row) => row.filter((_, valueIndex) => valueIndex !== columnIndex)) } : entry) }))}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex ? { ...entry, columns: [...entry.columns, `Column ${entry.columns.length + 1}`], rows: entry.rows.map((row) => [...row, ""]) } : entry) }))}>+ Add column</Button>
                {table.rows.map((row, rowIndex) => (
                  <div key={`row-${tableIndex}-${rowIndex}`} className="flex gap-2">
                    {row.map((cell, cellIndex) => <Input key={`${tableIndex}-${rowIndex}-${cellIndex}`} value={cell} onChange={(event) => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex ? { ...entry, rows: entry.rows.map((existingRow, existingRowIndex) => existingRowIndex === rowIndex ? existingRow.map((value, valueIndex) => valueIndex === cellIndex ? event.target.value : value) : existingRow) } : entry) }))} />)}
                    <Button variant="ghost" size="icon" onClick={() => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex ? { ...entry, rows: entry.rows.filter((_, valueIndex) => valueIndex !== rowIndex) } : entry) }))}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, custom_tables: current.custom_tables.map((entry, index) => index === tableIndex ? { ...entry, rows: [...entry.rows, new Array(entry.columns.length).fill("")] } : entry) }))}>+ Add row</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, custom_tables: [...current.custom_tables, { title: "New table", columns: ["Column 1"], rows: [[""]] }] }))}>+ Add table</Button>
          </div>

          <div id="builder-photos" className="space-y-3 rounded-xl border p-4">
            <h3 className="font-medium">Photos</h3>
            {form.photos.map((photo, idx) => (
              <div key={`photo-${idx}`} className="space-y-2 rounded-md border p-2">
                {photo.storage_path && photoDisplayUrls[photo.storage_path] && <img src={photoDisplayUrls[photo.storage_path]} alt={photo.alt_text || photo.caption || "Itinerary photo"} className="h-40 w-full rounded object-cover" />}
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={photo.day_item_id ? `item:${photo.day_item_id}` : photo.day_id ? `day:${photo.day_id}` : "itinerary"}
                  onChange={(event) => setForm((current) => ({ ...current, photos: current.photos.map((item, itemIndex) => itemIndex === idx ? {
                    ...item,
                    day_id: event.target.value.startsWith("day:") ? event.target.value.slice(4) : null,
                    day_item_id: event.target.value.startsWith("item:") ? event.target.value.slice(5) : null,
                  } : item) }))}
                >
                  <option value="itinerary">Itinerary-level photo</option>
                  {days.map((day, dayIndex) => (
                    <optgroup key={`photo-day-${dayIndex}`} label={`Day ${day.day_number}`}>
                      <option value={`day:${day.id ?? `draft-day-${dayIndex}`}`}>Day-level photo</option>
                      {day.items.map((item, itemIndex) => <option key={`photo-item-${dayIndex}-${itemIndex}`} value={`item:${item.id ?? `draft-item-${dayIndex}-${itemIndex}`}`}>{item.title || "Content item"}</option>)}
                    </optgroup>
                  ))}
                </select>
                {!photo.storage_path && <Input value={photo.url} onChange={(event) => setForm((current) => ({ ...current, photos: current.photos.map((item, itemIndex) => itemIndex === idx ? { ...item, url: event.target.value } : item) }))} placeholder="Image URL" />}
                <Input value={photo.caption} onChange={(event) => setForm((current) => ({ ...current, photos: current.photos.map((item, itemIndex) => itemIndex === idx ? { ...item, caption: event.target.value } : item) }))} placeholder="Caption" />
                <Input value={photo.alt_text} onChange={(event) => setForm((current) => ({ ...current, photos: current.photos.map((item, itemIndex) => itemIndex === idx ? { ...item, alt_text: event.target.value } : item) }))} placeholder="Alt text" />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => movePhoto(idx, "up")} disabled={idx === 0}><ArrowUp className="size-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => movePhoto(idx, "down")} disabled={idx === form.photos.length - 1}><ArrowDown className="size-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setForm((current) => ({ ...current, photos: current.photos.filter((_, itemIndex) => itemIndex !== idx) }))}>Remove photo</Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, photos: [...current.photos, { url: "", caption: "", alt_text: "", sequence: current.photos.length + 1 }] }))}>+ Add photo</Button>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => void saveItinerary()} disabled={saving}>{saving ? "Saving…" : "Save itinerary content"}</Button>
            <Button variant="outline" onClick={() => {
              setForm(EMPTY_FORM);
              setDays([{ ...EMPTY_DAY }]);
              setMessage(null);
            }}>
              Reset
            </Button>
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>
      </main>
      </div>
    </div>
  );
  */
}
