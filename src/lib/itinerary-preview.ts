export type ItineraryPresentationTemplateId = "classic" | "modern" | "luxury" | "package";

export type ItineraryPresentationTemplate = {
  id: ItineraryPresentationTemplateId;
  label: string;
  description: string;
};

export type ItineraryPreviewPackageOption = {
  id: string;
  name: string;
  description?: string | null;
  sequence?: number;
  is_active?: boolean;
  pricing?: {
    adult_price?: number | string | null;
    child_price?: number | string | null;
    subtotal?: number | string | null;
    tax?: number | string | null;
    final_customer_price?: number | string | null;
    per_person_price?: number | string | null;
    pricing_mode?: "total" | "per_person" | null;
    currency?: string | null;
  } | null;
};

export type ItineraryPreviewBranding = {
  company_name?: string | null;
  logo_url?: string | null;
  header_text?: string | null;
  footer_text?: string | null;
  signature_text?: string | null;
  cover_image_url?: string | null;
};

export type ItineraryPresentationCustomTable = {
  id?: string | null;
  title?: string | null;
  columns?: string[] | null;
  rows?: string[][] | null;
};

export type ItineraryPresentationPhoto = {
  id?: string | null;
  url?: string | null;
  caption?: string | null;
  alt_text?: string | null;
  sequence?: number | null;
  day_id?: string | null;
  day_item_id?: string | null;
  source?: string | null;
  place_name?: string | null;
  attribution?: Array<{ displayName: string; uri: string | null; photoUri: string | null }> | null;
};

export type ItineraryPresentationInput = {
  itinerary: {
    title?: string | null;
    destination?: string | null;
    customer_name?: string | null;
    travel_start_date?: string | null;
    travel_end_date?: string | null;
    adults?: number | string | null;
    children?: number | string | null;
    inclusions?: string[] | null;
    exclusions?: string[] | null;
    cancellation_info?: string | null;
    terms_conditions?: string | null;
    notes?: string | null;
    editor_content_html?: string | null;
    custom_tables?: ItineraryPresentationCustomTable[] | null;
    photos?: ItineraryPresentationPhoto[] | null;
    days?: Array<{
      day_number?: number | null;
      date?: string | null;
      title?: string | null;
      description?: string | null;
      notes?: string | null;
      photos?: ItineraryPresentationPhoto[] | null;
      items?: Array<Record<string, unknown>>;
    }> | null;
  };
  template?: ItineraryPresentationTemplateId;
  packageOptions?: ItineraryPreviewPackageOption[];
  selectedPackageId?: string | null;
  branding?: ItineraryPreviewBranding | null;
};

export type ItineraryPresentationPreview = {
  template: ItineraryPresentationTemplate;
  selectedPackage: ItineraryPreviewPackageOption | null;
  branding: ItineraryPreviewBranding;
  summary: string;
  trip: {
    start_date: string;
    end_date: string;
    adults: number;
    children: number;
    guest_name: string;
  };
  inclusions: string[];
  exclusions: string[];
  cancellation_info: string;
  terms_conditions: string;
  notes: string;
  editor_content_html: string;
  pricing: {
    adults: number;
    children: number;
    adult_price: number | null;
    child_price: number | null;
    subtotal: number;
    tax: number;
    final_customer_price: number;
    per_person_price: number | null;
    pricing_mode: "total" | "per_person" | null;
    currency: string;
  } | null;
  days: Array<{
    day_number: number;
    date: string;
    title: string;
    description: string;
    notes: string;
    photos: ItineraryPresentationPhoto[];
    items: Array<{ title: string; description?: string; item_type?: string; hotel_booking_scope?: "daywise" | "overall"; details?: string[]; image_url?: string; image_credit?: string; photos?: ItineraryPresentationPhoto[] }>;
  }>;
  customTables: ItineraryPresentationCustomTable[];
  photos: ItineraryPresentationPhoto[];
  pages: Array<{ title: string; type: "overview" | "days" | "details" | "signature"; content: string[] }>;
  renderedText: string;
  internalNotes?: undefined;
};

const TEMPLATE_MAP: Record<ItineraryPresentationTemplateId, ItineraryPresentationTemplate> = {
  classic: { id: "classic", label: "Classic", description: "Traditional editorial itinerary layout" },
  modern: { id: "modern", label: "Modern", description: "Clean contemporary customer layout" },
  luxury: { id: "luxury", label: "Luxury", description: "Premium branded presentation" },
  package: { id: "package", label: "Travel Package", description: "Detailed day plan, stays, pricing, inclusions and terms" },
};

const FORBIDDEN_RENDER_KEYS = new Set([
  "id",
  "itinerary_id",
  "itinerary_day_id",
  "day_id",
  "day_item_id",
  "source",
  "source_reference",
  "metadata",
  "internal_cost",
  "supplier_cost",
  "margin",
  "employee_notes",
  "internal_notes",
  "supplier_ref",
  "created_at",
  "updated_at",
  "package_id",
  "cost_category",
  "database_id",
]);

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePackageOptions(packageOptions: ItineraryPreviewPackageOption[] | undefined) {
  return (packageOptions ?? []).map((option) => ({
    id: option.id,
    name: option.name || "Package option",
    description: option.description ?? null,
    pricing: option.pricing ?? null,
  }));
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanSummaryValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function sanitizeRenderText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/\b(?:internal|supplier)\s*[_ -]?(?:cost|margin|notes?)\b/gi, "")
    .replace(/\b(?:employee|internal)\s+notes?\b/gi, "")
    .replace(/\bsource[_ -]?metadata\b/gi, "")
    .replace(/\b(?:db|database)[\s_-]*id\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function recordValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (FORBIDDEN_RENDER_KEYS.has(key)) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  return null;
}

function isPackageScopedItem(record: Record<string, unknown>, selectedPackageId: string | null) {
  if (selectedPackageId && typeof record["package_id"] === "string") {
    return record["package_id"] === selectedPackageId;
  }
  if (!selectedPackageId && typeof record["package_id"] === "string") {
    return false;
  }
  return true;
}

function buildItemDetails(record: Record<string, unknown>) {
  const details: string[] = [];
  const hotelName = recordValue(record, "hotel_name");
  if (hotelName) details.push(hotelName);

  const hotelCity = recordValue(record, "hotel_city");
  const hotelCountry = recordValue(record, "hotel_country");
  const hotelLocation = [hotelCity, hotelCountry].filter(Boolean).join(", ");
  if (hotelLocation) details.push(hotelLocation);

  const hotelAddress = recordValue(record, "hotel_address");
  if (hotelAddress && hotelAddress !== hotelLocation) details.push(hotelAddress);

  const starCategory = recordValue(record, "star_category");
  const roomType = recordValue(record, "room_type");
  const mealPlan = recordValue(record, "meal_plan");
  const hotelSummary = [starCategory, roomType, mealPlan].filter(Boolean).join(" · ");
  if (hotelSummary) details.push(hotelSummary);

  const customerFacingInfo = recordValue(record, "customer_facing_info");
  if (customerFacingInfo) details.push(customerFacingInfo);

  const hotelDescription = recordValue(record, "hotel_description");
  if (hotelDescription && hotelDescription !== customerFacingInfo) details.push(hotelDescription);

  const checkIn = recordValue(record, "check_in");
  const checkOut = recordValue(record, "check_out");
  if (checkIn || checkOut) details.push(`Stay dates: ${checkIn ?? "TBD"} → ${checkOut ?? "TBD"}`);

  const nights = recordValue(record, "nights");
  if (nights) details.push(`${nights} night${nights === "1" ? "" : "s"}`);

  const rooms = recordValue(record, "rooms");
  if (rooms) details.push(`${rooms} room${rooms === "1" ? "" : "s"}`);

  const adults = recordValue(record, "adults");
  const children = recordValue(record, "children");
  if (adults || children) details.push([adults ? `${adults} adults` : "", children ? `${children} children` : ""].filter(Boolean).join(", "));

  const metadata = record["metadata"] && typeof record["metadata"] === "object" && !Array.isArray(record["metadata"])
    ? record["metadata"] as Record<string, unknown>
    : {};
  const roomDetails = Array.isArray(metadata["room_details"]) ? metadata["room_details"] : [];
  roomDetails.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const room = entry as Record<string, unknown>;
    const roomType = typeof room["room_type"] === "string" ? room["room_type"].trim() : "";
    const roomAdults = typeof room["adults"] === "number" ? room["adults"] : null;
    const roomKids = typeof room["kids"] === "number" ? room["kids"] : null;
    const meals = ["breakfast", "lunch", "dinner"]
      .filter((meal) => room[meal] === true)
      .map((meal) => meal[0]?.toUpperCase() + meal.slice(1));
    const cancellationDate = typeof room["free_cancellation_date"] === "string"
      ? room["free_cancellation_date"].trim()
      : "";
    const roomFacts = [
      roomType,
      roomAdults !== null ? `${roomAdults} adults` : "",
      roomKids !== null ? `${roomKids} kids` : "",
      meals.length ? meals.join(", ") : "",
      cancellationDate ? `Free cancellation until ${cancellationDate}` : "",
    ].filter(Boolean);
    if (roomFacts.length) details.push(`Room ${index + 1}: ${roomFacts.join(" · ")}`);
  });

  const flightAirline = recordValue(record, "flight_airline");
  const flightNumber = recordValue(record, "flight_number");
  if (flightAirline || flightNumber) details.push([flightAirline, flightNumber].filter(Boolean).join(" ")); 

  const departureCity = recordValue(record, "departure_city");
  const arrivalCity = recordValue(record, "arrival_city");
  if (departureCity || arrivalCity) details.push([departureCity, arrivalCity].filter(Boolean).join(" → "));

  const departureAirport = recordValue(record, "departure_airport");
  const arrivalAirport = recordValue(record, "arrival_airport");
  if (departureAirport || arrivalAirport) details.push([departureAirport, arrivalAirport].filter(Boolean).join(" → "));

  const flightDeparture = [recordValue(record, "flight_departure_date"), recordValue(record, "flight_departure_time")].filter(Boolean).join(" ");
  const flightArrival = [recordValue(record, "flight_arrival_date"), recordValue(record, "flight_arrival_time")].filter(Boolean).join(" ");
  if (flightDeparture || flightArrival) details.push(`Schedule: ${flightDeparture || "TBD"} → ${flightArrival || "TBD"}`);

  const cabin = recordValue(record, "flight_cabin");
  const baggage = recordValue(record, "baggage_information");
  const flightDuration = recordValue(record, "flight_duration");
  const flightSummary = [cabin ? `Class ${cabin}` : "", baggage, flightDuration].filter(Boolean).join(" · ");
  if (flightSummary) details.push(flightSummary);

  const visaCountry = recordValue(record, "visa_country");
  const visaType = recordValue(record, "visa_type");
  if (visaCountry || visaType) details.push([visaCountry, visaType].filter(Boolean).join(" — "));

  const visaValidity = recordValue(record, "visa_validity");
  const visaProcessing = recordValue(record, "visa_processing_time");
  const visaDocuments = recordValue(record, "visa_required_documents");
  const visaEntry = recordValue(record, "visa_entry_exit_information");
  const visaInfo = [visaValidity ? `Validity: ${visaValidity}` : "", visaProcessing ? `Processing: ${visaProcessing}` : "", visaDocuments, visaEntry].filter(Boolean).join(" · ");
  if (visaInfo) details.push(visaInfo);

  const visaCustomerInformation = recordValue(record, "visa_customer_information");
  if (visaCustomerInformation) details.push(visaCustomerInformation);

  const activityLocation = recordValue(record, "location");
  const activityDuration = recordValue(record, "duration");
  const activitySchedule = [recordValue(record, "departure_time"), recordValue(record, "arrival_time")].filter(Boolean).join(" → ");
  const activityInfo = [activityLocation, activityDuration, activitySchedule].filter(Boolean).join(" · ");
  if (activityInfo) details.push(activityInfo);

  const extraType = recordValue(record, "extra_transport_type");
  const pickup = recordValue(record, "pickup");
  const dropoff = recordValue(record, "dropoff");
  const vehicle = recordValue(record, "extra_transport_vehicle_type") ?? recordValue(record, "vehicle_details");
  const pickupTime = recordValue(record, "extra_transport_pickup_time") ?? recordValue(record, "departure_time");
  const dropoffTime = recordValue(record, "extra_transport_drop_time") ?? recordValue(record, "arrival_time");
  const extraTransportSummary = [extraType, pickup && `Pickup: ${pickup}`, dropoff && `Drop-off: ${dropoff}`, vehicle, [pickupTime, dropoffTime].filter(Boolean).join(" → ")].filter(Boolean).join(" · ");
  if (extraTransportSummary) details.push(extraTransportSummary);

  const description = recordValue(record, "description");
  if (description) details.push(description);

  const notes = recordValue(record, "notes");
  if (notes) details.push(notes);

  return details.filter((detail) => sanitizeRenderText(detail).length > 0);
}

function normalizePhoto(photo: Record<string, unknown> | undefined | null): ItineraryPresentationPhoto | null {
  if (!photo) return null;
  const attribution = Array.isArray(photo["attribution"])
    ? photo["attribution"].flatMap((entry) => {
        const author = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
        return typeof author["displayName"] === "string"
          ? [{ displayName: author["displayName"], uri: typeof author["uri"] === "string" ? author["uri"] : null, photoUri: typeof author["photoUri"] === "string" ? author["photoUri"] : null }]
          : [];
      })
    : null;
  const normalized: ItineraryPresentationPhoto = {
    id: typeof photo["id"] === "string" ? photo["id"] : null,
    url: typeof photo["url"] === "string" ? photo["url"] : null,
    caption: typeof photo["caption"] === "string" ? photo["caption"] : null,
    alt_text: typeof photo["alt_text"] === "string" ? photo["alt_text"] : null,
    sequence: typeof photo["sequence"] === "number" ? photo["sequence"] : Number(photo["sequence"] ?? 0),
    day_id: typeof photo["day_id"] === "string" ? photo["day_id"] : null,
    day_item_id: typeof photo["day_item_id"] === "string" ? photo["day_item_id"] : null,
    source: typeof photo["source"] === "string" ? photo["source"] : null,
    place_name: typeof photo["place_name"] === "string" ? photo["place_name"] : null,
    attribution,
  };
  return normalized.url && !normalized.url.includes("images.example.com") ? normalized : null;
}

export function buildItineraryPresentation(input: ItineraryPresentationInput): ItineraryPresentationPreview {
  const templateId = input.template ?? "classic";
  const template = TEMPLATE_MAP[templateId] ?? TEMPLATE_MAP.classic;
  const packageOptions = normalizePackageOptions(input.packageOptions);

  const hasValidContent = Boolean(
    (input.itinerary.title ?? "").trim() ||
    (input.itinerary.destination ?? "").trim() ||
    (input.itinerary.days ?? []).length > 0,
  );

  if (!hasValidContent) {
    throw new Error("Preview is unavailable because the itinerary is not a valid itinerary for customer presentation.");
  }

  if (packageOptions.length > 1 && !input.selectedPackageId) {
    throw new Error("Selected package is required when there are multiple package options.");
  }

  const selectedPackage = packageOptions.length > 0
    ? packageOptions.find((option) => option.id === input.selectedPackageId) ?? packageOptions[0] ?? null
    : null;

  if (packageOptions.length > 1 && input.selectedPackageId && !packageOptions.some((option) => option.id === input.selectedPackageId)) {
    throw new Error("Selected package must match one of the itinerary package options.");
  }

  const summary = [cleanSummaryValue(input.itinerary.destination), cleanSummaryValue(input.itinerary.title)].filter(Boolean).join(" — ") || "Itinerary preview";

  const quotedTotal = toNumber(selectedPackage?.pricing?.final_customer_price, toNumber(selectedPackage?.pricing?.subtotal, 0));
  const pricing = selectedPackage?.pricing && quotedTotal > 0
    ? {
        adults: toNumber(input.itinerary.adults, 0),
        children: toNumber(input.itinerary.children, 0),
        adult_price: selectedPackage.pricing?.adult_price == null ? null : toNumber(selectedPackage.pricing.adult_price, 0),
        child_price: selectedPackage.pricing?.child_price == null ? null : toNumber(selectedPackage.pricing.child_price, 0),
        subtotal: toNumber(selectedPackage.pricing?.subtotal, toNumber(selectedPackage.pricing?.final_customer_price, 0)),
        tax: toNumber(selectedPackage.pricing?.tax, 0),
        final_customer_price: toNumber(selectedPackage.pricing?.final_customer_price, toNumber(selectedPackage.pricing?.subtotal, 0)),
        per_person_price: selectedPackage.pricing?.per_person_price == null ? null : toNumber(selectedPackage.pricing.per_person_price, 0),
        pricing_mode: selectedPackage.pricing?.pricing_mode ?? null,
        currency: selectedPackage.pricing?.currency ?? "INR",
      }
    : null;

  const normalizedDays = (input.itinerary.days ?? []).map((day) => {
    const filteredItems = (day.items ?? []).filter((item) => {
      if (!item || typeof item !== "object") return false;
      return isPackageScopedItem(item as Record<string, unknown>, input.selectedPackageId ?? null);
    });

    return {
      day_number: Number(day.day_number ?? 1),
      date: normalizeText(day.date),
      title: normalizeText(day.title) || `Day ${day.day_number ?? 1}`,
      description: normalizeText(day.description),
      notes: normalizeText(day.notes),
      photos: (day.photos ?? []).map((photo) => normalizePhoto(photo as Record<string, unknown>)).filter((photo): photo is ItineraryPresentationPhoto => Boolean(photo)),
      items: filteredItems.map((item) => {
        const record = (item ?? {}) as Record<string, unknown>;
        const title = normalizeText(record["title"]) || normalizeText(record["hotel_name"]) || "Itinerary item";
        const itemType = typeof record["item_type"] === "string" ? record["item_type"] : undefined;
        const previewItem: { title: string; description?: string; item_type?: string; hotel_booking_scope?: "daywise" | "overall"; details?: string[]; image_url?: string; image_credit?: string; photos?: ItineraryPresentationPhoto[] } = { title };
        const description = normalizeText(record["description"]);
        const itemNotes = normalizeText(record["notes"]);
        if (description) previewItem.description = description;
        if (itemType) previewItem.item_type = itemType;
        if (itemType === "ACCOMMODATION") {
          const metadata =
            record["metadata"] && typeof record["metadata"] === "object" && !Array.isArray(record["metadata"])
              ? record["metadata"] as Record<string, unknown>
              : {};
          previewItem.hotel_booking_scope = metadata["overall_hotel_booking"] === true
            ? "overall"
            : recordValue(record, "check_in") || recordValue(record, "check_out")
              ? "daywise"
              : "overall";
        }
        const details = buildItemDetails(record);
        if (details.length > 0) previewItem.details = details;
        const metadata = record["metadata"] && typeof record["metadata"] === "object" && !Array.isArray(record["metadata"])
          ? record["metadata"] as Record<string, unknown>
          : {};
        const customHotelImage = typeof metadata["custom_hotel_photo_url"] === "string"
          ? metadata["custom_hotel_photo_url"].trim()
          : "";
        const hotelImage = customHotelImage || recordValue(record, "image_url") || "";
        if (itemType === "ACCOMMODATION" && /^https?:\/\//i.test(hotelImage)) previewItem.image_url = hotelImage;
        const imageCredit = typeof record["image_credit"] === "string" ? record["image_credit"] : "";
        if (imageCredit) previewItem.image_credit = sanitizeRenderText(imageCredit);
        const itemPhotos = Array.isArray(record["photos"]) ? record["photos"] : [];
        const safePhotos = itemPhotos
          .map((photo) => normalizePhoto(photo as Record<string, unknown>))
          .filter((photo): photo is ItineraryPresentationPhoto => Boolean(photo));
        if (safePhotos.length > 0) previewItem.photos = safePhotos;
        if (itemNotes && !previewItem.description) previewItem.description = itemNotes;
        return previewItem;
      }),
    };
  });

  const itineraryPhotos = (input.itinerary.photos ?? [])
    .map((photo) => normalizePhoto(photo as Record<string, unknown>))
    .filter((photo): photo is ItineraryPresentationPhoto => Boolean(photo))
    .sort((left, right) => (Number(left.sequence ?? 0) || 0) - (Number(right.sequence ?? 0) || 0));

  const allDayPhotos = normalizedDays.flatMap((day) => day.photos);
  const allItemPhotos = normalizedDays.flatMap((day) => day.items.flatMap((item) => [
    ...(item.photos ?? []),
    ...(item.image_url ? [{ url: item.image_url, caption: item.title, alt_text: item.title, sequence: Number.MAX_SAFE_INTEGER, day_id: null, day_item_id: null }] : []),
  ]));
  const photos = [...itineraryPhotos, ...allDayPhotos, ...allItemPhotos].sort((left, right) => (Number(left.sequence ?? 0) || 0) - (Number(right.sequence ?? 0) || 0)).slice(0, 50);

  const customTables: ItineraryPresentationCustomTable[] = (input.itinerary.custom_tables ?? []).map((table) => ({
    id: typeof table.id === "string" ? table.id : null,
    title: table.title ?? "Custom table",
    columns: Array.isArray(table.columns) ? table.columns.filter((value): value is string => typeof value === "string") : [],
    rows: Array.isArray(table.rows) ? table.rows.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [],
  }));

  const branding = {
    company_name: input.branding?.company_name ?? "SAVR Travels",
    logo_url: input.branding?.logo_url ?? null,
    header_text: input.branding?.header_text ?? null,
    footer_text: input.branding?.footer_text ?? null,
    signature_text: input.branding?.signature_text ?? null,
    cover_image_url: input.branding?.cover_image_url ?? itineraryPhotos.find((photo) => photo.url)?.url ?? allDayPhotos.find((photo) => photo.url)?.url ?? allItemPhotos.find((photo) => photo.url)?.url ?? null,
  };

  const renderableInclusions = safeStringArray(input.itinerary.inclusions);
  const renderableExclusions = safeStringArray(input.itinerary.exclusions);
  const renderableCancellation = sanitizeRenderText(input.itinerary.cancellation_info);
  const renderableTermsConditions = sanitizeRenderText(input.itinerary.terms_conditions);
  const renderableNotes = sanitizeRenderText(input.itinerary.notes);
  const editorContentHtml = normalizeText(input.itinerary.editor_content_html);
  const adults = toNumber(input.itinerary.adults, 0);
  const children = toNumber(input.itinerary.children, 0);
  const startDate = normalizeText(input.itinerary.travel_start_date);
  const endDate = normalizeText(input.itinerary.travel_end_date);
  const guestName = normalizeText(input.itinerary.customer_name);

  const renderedText = [
    branding.company_name,
    summary,
    startDate,
    endDate,
    guestName,
    `${adults} adults, ${children} children`,
    selectedPackage ? `Selected package: ${selectedPackage.name}` : "",
    pricing ? `Final customer price: ${pricing.final_customer_price} ${pricing.currency}` : "",
    ...renderableInclusions.map((value) => `Inclusion: ${value}`),
    ...renderableExclusions.map((value) => `Exclusion: ${value}`),
    ...(renderableCancellation ? [`Cancellation: ${renderableCancellation}`] : []),
    ...(renderableTermsConditions ? [`Terms and Conditions: ${renderableTermsConditions}`] : []),
    ...(renderableNotes ? [renderableNotes] : []),
    ...normalizedDays.flatMap((day) => [
      `${day.title}: ${day.description}`,
      ...day.items
        .filter((item) => item.hotel_booking_scope !== "overall")
        .map((item) => `${item.title}: ${(item.details ?? []).join(" | ")}`),
    ]),
    ...normalizedDays.flatMap((day) =>
      day.items
        .filter((item) => item.hotel_booking_scope === "overall")
        .map((item) => `Overall hotel booking: ${item.title}: ${(item.details ?? []).join(" | ")}`),
    ),
    ...(branding.signature_text ? [branding.signature_text] : []),
  ].filter((value) => sanitizeRenderText(value).length > 0).map((value) => sanitizeRenderText(value)).join("\n");

  const pages = [
    { title: "Overview", type: "overview" as const, content: [summary, branding.header_text ?? "", ...(renderableInclusions.slice(0, 3))] },
    { title: "Itinerary", type: "days" as const, content: normalizedDays.map((day) => `${day.title} — ${day.description || "Day details"}`) },
    { title: "Details", type: "details" as const, content: [...renderableExclusions.slice(0, 3), ...(renderableCancellation ? [`Cancellation: ${renderableCancellation}`] : []), ...(renderableTermsConditions ? [`Terms and Conditions: ${renderableTermsConditions}`] : [])] },
    { title: "Signature", type: "signature" as const, content: branding.signature_text ? [branding.signature_text] : ["Regards", "The team"] },
  ].map((page) => ({ ...page, content: page.content.filter((entry) => sanitizeRenderText(entry).length > 0).slice(0, 5) }));

  return {
    template,
    selectedPackage,
    branding,
    summary,
    trip: { start_date: startDate, end_date: endDate, adults, children, guest_name: guestName },
    inclusions: renderableInclusions,
    exclusions: renderableExclusions,
    cancellation_info: renderableCancellation,
    terms_conditions: renderableTermsConditions,
    notes: renderableNotes,
    editor_content_html: editorContentHtml,
    pricing,
    days: normalizedDays,
    customTables,
    photos,
    pages,
    renderedText,
    internalNotes: undefined,
  };
}
