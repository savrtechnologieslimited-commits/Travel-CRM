import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type AuthedSupabase = SupabaseClient<Database>;
type ImageCacheRow = Database["public"]["Tables"]["itinerary_place_image_cache"]["Row"];
type SavedItineraryPhoto = Database["public"]["Tables"]["itinerary_photos"]["Row"];
type GooglePhotoAttribution = { displayName: string; uri: string | null; photoUri: string | null };

export type ItineraryImageDayResult = {
  dayId: string;
  dayNumber: number;
  status: "added" | "existing" | "not_found" | "failed";
  placeName?: string | null;
  photo?: Pick<SavedItineraryPhoto, "id" | "day_id" | "day_item_id" | "url" | "storage_path" | "caption" | "alt_text" | "sequence" | "source" | "selection_type" | "is_primary" | "google_place_id" | "place_name" | "google_photo_reference" | "attribution">;
  message?: string;
};

export type ItineraryImageEnrichmentResult = {
  days: ItineraryImageDayResult[];
  added: number;
  existing: number;
  notFound: number;
  failed: number;
};

export type ItineraryImageDaySource = {
  id?: string;
  day_number?: number;
  date?: string | null;
  city?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  items?: PlaceItemSource[];
};

type DayPlaceSource = ItineraryImageDaySource;

type PlaceItemSource = {
  item_type?: string | null;
  title?: string | null;
  location?: string | null;
  description?: string | null;
  hotel_city?: string | null;
  dropoff?: string | null;
};

type PlaceSearchCandidate = { place: string; locality: string };

type GooglePlaceImage = {
  placeId: string;
  placeName: string;
  photoReference: string;
  attribution: GooglePhotoAttribution[];
  bytes: Uint8Array;
  contentType: string;
};

const GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1";
const IMAGE_STORAGE_BUCKET = "itineraries";
const IMAGE_STORAGE_PREFIX = "itinerary-place-images/cache";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const PLACE_SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.photos.name,places.photos.authorAttributions";
const ATTRACTION_SUFFIX = "Temple|Green|Fort|Museum|Palace|Park|Falls|Waterfall|Lake|Beach|Garden|Sanctuary|Monastery|Church|Mosque|Tower|Bridge|Cave|Viewpoint|Plantation|Factory|Reserve|Zoo|Market|Square|Cathedral|Shrine|Peak|Rock|Gorge|River|Hill|Village";

export class GoogleItineraryImageError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GoogleItineraryImageError";
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeItineraryImageQuery(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isGenericPlaceLabel(value: string) {
  return /^(?:day\s*\d+|arrival|departure|(?:.+\s+)?sightseeing|(?:.+\s+)?city\s*tour|local\s*sightseeing|leisure|free\s*time|transfer|check[ -]?in|check[ -]?out|explore\s+.+)$/i.test(value.trim());
}

function addCandidate(candidates: PlaceSearchCandidate[], place: string, locality: string) {
  const cleanPlace = cleanText(place).replace(/^(?:visit|explore|sightseeing at|stop at)\s+/i, "").replace(/[.,;:]+$/, "");
  const cleanLocality = cleanText(locality);
  if (!cleanPlace || isGenericPlaceLabel(cleanPlace)) return;
  if (normalizeItineraryImageQuery(cleanPlace) === normalizeItineraryImageQuery(cleanLocality)) return;
  const candidate = { place: cleanPlace, locality: cleanLocality };
  const key = normalizeItineraryImageQuery([candidate.place, candidate.locality].filter(Boolean).join(" "));
  if (key && !candidates.some((entry) => normalizeItineraryImageQuery([entry.place, entry.locality].filter(Boolean).join(" ")) === key)) {
    candidates.push(candidate);
  }
}

export function getItineraryDayPlaceCandidates(
  day: DayPlaceSource,
  items: PlaceItemSource[],
  destinationName: string,
  destinationCountry = "",
): PlaceSearchCandidate[] {
  const structuredCity = items.find((item) => item.item_type === "ACCOMMODATION" && cleanText(item.hotel_city))?.hotel_city
    || items.find((item) => (item.item_type === "TRANSPORT" || item.item_type === "EXTRA_TRANSPORT") && cleanText(item.dropoff))?.dropoff
    || "";
  const titleCity = cleanText(day.title).match(/\b(?:in|to|around|through|from)\s+([A-Z][\p{L}\p{M}'’.-]*(?:\s+[A-Z][\p{L}\p{M}'’.-]*){0,2})/u)?.[1]
    || cleanText(day.title).match(/(?:→|->|–>|—>)\s*([A-Z][\p{L}\p{M}'’.-]*(?:\s+[A-Z][\p{L}\p{M}'’.-]*){0,2})/u)?.[1]
    || cleanText(day.title).match(/^([A-Z][\p{L}\p{M}'’.-]*(?:\s+[A-Z][\p{L}\p{M}'’.-]*){0,1})(?=\s+(?:sightseeing|city\s*tour|[-–—/]))/iu)?.[1]
    || "";
  const city = cleanText(day.city) || cleanText(structuredCity) || cleanText(titleCity) || cleanText(destinationName);
  const country = cleanText(destinationCountry);
  const locality = [city, country].filter(Boolean).join(", ");
  const candidates: PlaceSearchCandidate[] = [];

  for (const item of items) {
    if (item.item_type !== "ACTIVITY" && item.item_type !== "SIGHTSEEING") continue;
    const itemLocation = cleanText(item.location);
    const itemTitle = cleanText(item.title);
    if (itemTitle && !isGenericPlaceLabel(itemTitle)) addCandidate(candidates, itemTitle, itemLocation || locality);
    if (itemLocation && itemTitle && isGenericPlaceLabel(itemTitle)) addCandidate(candidates, itemLocation, locality);
  }

  const sourceText = [cleanText(day.title), cleanText(day.description), ...items
    .filter((item) => item.item_type === "ACTIVITY" || item.item_type === "SIGHTSEEING")
    .map((item) => cleanText(item.description))]
    .filter(Boolean)
    .join(". ");
  const namedPlacePattern = new RegExp(`\\b([A-Z][\\p{L}\\p{M}'’.-]*(?:\\s+[A-Z][\\p{L}\\p{M}'’.-]*){0,4}\\s+(?:${ATTRACTION_SUFFIX}))\\b`, "gu");
  for (const match of sourceText.matchAll(namedPlacePattern)) {
    const placeName = cleanText(match[1]);
    if (placeName) addCandidate(candidates, placeName, locality);
  }

  if (candidates.length === 0 && locality) {
    const fallback = city || cleanText(destinationName);
    addCandidate(candidates, fallback, country && normalizeItineraryImageQuery(country) !== normalizeItineraryImageQuery(fallback) ? country : "");
  }
  return candidates.slice(0, 5);
}

async function googleRequest(url: string, apiKey: string, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      headers: { "X-Goog-Api-Key": apiKey, ...(init.headers ?? {}) },
    });
  } catch {
    throw new GoogleItineraryImageError("Google Places could not be reached. Check the server network connection.");
  }
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    let details = "";
    try {
      const payload = JSON.parse(responseBody) as { error?: { message?: unknown } };
      details = typeof payload.error?.message === "string" ? payload.error.message : "";
    } catch {
      details = responseBody.slice(0, 240);
    }
    const statusMessage = response.status === 429
      ? "Google Places quota was exceeded."
      : response.status === 403
        ? "Google Places rejected the request key. Check Places API (New), billing, and key restrictions for the configured Google project."
        : `Google Places image lookup failed (${response.status}).`;
    throw new GoogleItineraryImageError(`${statusMessage}${details ? ` ${details}` : ""}`, response.status);
  }
  return response;
}

export async function fetchGooglePlaceImage(query: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<GooglePlaceImage | null> {
  const textQuery = cleanText(query);
  if (!textQuery) return null;
  const searchResponse = await googleRequest(`${GOOGLE_PLACES_BASE_URL}/places:searchText`, apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-FieldMask": PLACE_SEARCH_FIELD_MASK },
    body: JSON.stringify({ textQuery, pageSize: 5 }),
  }, fetcher);
  const searchPayload = record(await searchResponse.json());
  const places = Array.isArray(searchPayload["places"]) ? searchPayload["places"] : [];

  for (const rawPlace of places) {
    const place = record(rawPlace);
    const placeId = cleanText(place["id"]);
    const displayName = record(place["displayName"]);
    const placeName = cleanText(displayName["text"]);
    const photoRows = Array.isArray(place["photos"]) ? place["photos"] : [];
    const photo = photoRows.map(record).find((entry) => cleanText(entry["name"]));
    const photoReference = photo ? cleanText(photo["name"]) : "";
    if (!placeId || !placeName || !photoReference) continue;

    const photoResponse = await googleRequest(`${GOOGLE_PLACES_BASE_URL}/${photoReference}/media?maxWidthPx=1280`, apiKey, { method: "GET" }, fetcher);
    const contentType = (photoResponse.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.toLowerCase();
    if (!contentType.startsWith("image/")) throw new GoogleItineraryImageError("Google Places returned a non-image response for the selected place.");
    const bytes = new Uint8Array(await photoResponse.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new GoogleItineraryImageError("The selected Google Places image is empty or exceeds the 15 MB limit.");
    }
    const authorAttributions = photo
      ? (Array.isArray(photo["authorAttributions"]) ? photo["authorAttributions"] : []).flatMap((entry) => {
          const author = record(entry);
          const displayName = cleanText(author["displayName"]);
          if (!displayName) return [];
          return [{ displayName, uri: cleanText(author["uri"]) || null, photoUri: cleanText(author["photoUri"]) || null }];
        })
      : [];

    return { placeId, placeName, photoReference, attribution: authorAttributions, bytes, contentType };
  }
  return null;
}

export async function fetchGooglePlaceImageWithFallback(
  query: string,
  apiKeys: string[],
  fetcher: typeof fetch = fetch,
): Promise<GooglePlaceImage | null> {
  const keys = [...new Set(apiKeys.map((key) => key.trim()).filter(Boolean))];
  if (!keys.length) throw new Error("Itinerary destination images are not configured. Set GOOGLE_ITINERARY_IMAGES_API_KEY or the existing server-side GOOGLE_MAPS_API_KEY.");

  let lastProviderError: GoogleItineraryImageError | null = null;
  for (const apiKey of keys) {
    try {
      return await fetchGooglePlaceImage(query, apiKey, fetcher);
    } catch (error) {
      if (!(error instanceof GoogleItineraryImageError) || (error.status !== 403 && error.status !== 429)) throw error;
      lastProviderError = error;
    }
  }
  throw lastProviderError ?? new GoogleItineraryImageError("Google Places could not find a usable image.");
}

function storageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/avif") return "avif";
  return "jpg";
}

function imageStoragePath(normalizedQuery: string, contentType: string) {
  const digest = createHash("sha256").update(normalizedQuery).digest("hex");
  return `${IMAGE_STORAGE_PREFIX}/${digest}.${storageExtension(contentType)}`;
}

function cacheToImage(cache: ImageCacheRow): GooglePlaceImage {
  return {
    placeId: cache.google_place_id,
    placeName: cache.place_name,
    photoReference: cache.google_photo_reference,
    attribution: (Array.isArray(cache.attribution) ? cache.attribution : []) as unknown as GooglePhotoAttribution[],
    bytes: new Uint8Array(),
    contentType: "image/jpeg",
  };
}

export async function findCachedImage(supabase: AuthedSupabase, normalizedQuery: string) {
  const { data, error } = await supabase.from("itinerary_place_image_cache")
    .select("*")
    .eq("normalized_query", normalizedQuery)
    .maybeSingle();
  if (error) {
    console.warn("[Itinerary images] Cache lookup failed; searching Google Places.", error);
    return null;
  }
  return data;
}

async function persistCachedImage(supabase: AuthedSupabase, normalizedQuery: string, queryText: string, image: GooglePlaceImage) {
  const storagePath = imageStoragePath(normalizedQuery, image.contentType);
  const { error: uploadError } = await supabase.storage.from(IMAGE_STORAGE_BUCKET).upload(storagePath, image.bytes, {
    contentType: image.contentType,
    upsert: true,
  });
  if (uploadError) throw new Error(`Google Places photo could not be saved: ${uploadError.message}`);

  const attribution = image.attribution as unknown as Json;
  const { data, error } = await supabase.from("itinerary_place_image_cache").upsert({
    normalized_query: normalizedQuery,
    query_text: queryText,
    google_place_id: image.placeId,
    place_name: image.placeName,
    google_photo_reference: image.photoReference,
    attribution,
    storage_path: storagePath,
  }, { onConflict: "normalized_query" }).select("*").single();
  if (error || !data) throw new Error(`Google Places photo metadata could not be cached: ${error?.message ?? "No row returned."}`);
  return data;
}

function asAttributionJson(attribution: GooglePhotoAttribution[]): Json {
  return attribution as unknown as Json;
}

function buildPhotoInsert(itineraryId: string, dayId: string, dayNumber: number, image: GooglePlaceImage, storagePath: string) {
  return {
    itinerary_id: itineraryId,
    day_id: dayId,
    day_item_id: null,
    url: null,
    storage_path: storagePath,
    caption: image.placeName,
    alt_text: `Photo of ${image.placeName}`,
    sequence: dayNumber,
    source: "GOOGLE_PLACES",
    selection_type: "AUTO",
    is_primary: true,
    google_place_id: image.placeId,
    place_name: image.placeName,
    google_photo_reference: image.photoReference,
    attribution: asAttributionJson(image.attribution),
  };
}

function reportError(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error prevented this day's image from being added.";
}

async function addGoogleImagesToDays(
  supabase: AuthedSupabase,
  input: { itineraryId: string | null; title: string; destinationName?: string; destinationCountry?: string; days: DayPlaceSource[]; existingPhotoDayIds?: string[]; existingGooglePlaceIds?: string[] },
  fetcher: typeof fetch,
): Promise<ItineraryImageEnrichmentResult> {
  const destinationName = cleanText(input.destinationName) || cleanText(input.title);
  const existingPhotoDayIds = new Set(input.existingPhotoDayIds ?? []);
  const usedGooglePlaceIds = new Set(input.existingGooglePlaceIds ?? []);
  const imagePhotoKey = process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"]?.trim() ?? "";
  const hotelGooglePhotoKey = process.env["GOOGLE_MAPS_API_KEY"]?.trim() ?? "";
  const photoKeys = [...new Set([imagePhotoKey, hotelGooglePhotoKey].filter(Boolean))];
  let unavailableProviderError: string | null = null;
  const results: ItineraryImageDayResult[] = [];

  for (const [index, day] of input.days.entries()) {
    const dayNumber = Number(day.day_number) || index + 1;
    const dayId = cleanText(day.id) || `draft-day-${dayNumber}`;
    if (existingPhotoDayIds.has(dayId)) {
      results.push({ dayId, dayNumber, status: "existing", message: "Existing day image was kept." });
      continue;
    }

    const candidates = getItineraryDayPlaceCandidates(day, day.items ?? [], destinationName, input.destinationCountry ?? "");
    if (candidates.length === 0) {
      results.push({ dayId, dayNumber, status: "not_found", message: "No place or destination could be identified for this day." });
      continue;
    }

    try {
      let selected: { image: GooglePlaceImage; storagePath: string } | null = null;
      for (const candidate of candidates) {
        const query = [candidate.place, candidate.locality].filter(Boolean).join(", ");
        const normalizedQuery = normalizeItineraryImageQuery(query);
        // Always prefer our persistent Supabase photo cache; call Google only for a cache miss.
        const cached = await findCachedImage(supabase, normalizedQuery);
        if (cached) {
          if (usedGooglePlaceIds.has(cached.google_place_id)) continue;
          selected = { image: cacheToImage(cached), storagePath: cached.storage_path };
          break;
        }
        const { data: libraryPhoto, error: libraryPhotoError } = await supabase.from("activity_photo_library")
          .select("google_place_id,place_name,storage_path")
          .eq("place_name", candidate.place)
          .eq("place_address", candidate.locality)
          .order("display_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!libraryPhotoError && libraryPhoto?.storage_path) {
          if (usedGooglePlaceIds.has(libraryPhoto.google_place_id)) continue;
          selected = {
            image: {
              placeId: libraryPhoto.google_place_id,
              placeName: libraryPhoto.place_name,
              photoReference: "",
              attribution: [],
              bytes: new Uint8Array(),
              contentType: "image/jpeg",
            },
            storagePath: libraryPhoto.storage_path,
          };
          break;
        }
        if (unavailableProviderError) throw new Error(unavailableProviderError);
        if (photoKeys.length === 0) {
          throw new Error("Itinerary destination images are not configured. Set GOOGLE_ITINERARY_IMAGES_API_KEY or the existing server-side GOOGLE_MAPS_API_KEY.");
        }
        const fetched = await fetchGooglePlaceImageWithFallback(query, photoKeys, fetcher);
        if (!fetched) continue;
        if (usedGooglePlaceIds.has(fetched.placeId)) continue;
        const savedCache = await persistCachedImage(supabase, normalizedQuery, query, fetched);
        selected = { image: fetched, storagePath: savedCache.storage_path };
        break;
      }

      if (!selected) {
        results.push({ dayId, dayNumber, status: "not_found", message: "Google Places returned no suitable photos for the places in this day." });
        continue;
      }

      let photo: ItineraryImageDayResult["photo"];
      if (input.itineraryId) {
        const { data, error } = await supabase.from("itinerary_photos")
          .insert(buildPhotoInsert(input.itineraryId, dayId, dayNumber, selected.image, selected.storagePath))
          .select("id,day_id,day_item_id,url,storage_path,caption,alt_text,sequence,source,selection_type,is_primary,google_place_id,place_name,google_photo_reference,attribution")
          .single();
        if (error || !data) throw new Error(`Image was found but could not be attached to Day ${dayNumber}: ${error?.message ?? "No photo row returned."}`);
        photo = data;
      } else {
        photo = {
          id: randomUUID(),
          day_id: dayId,
          day_item_id: null,
          url: null,
          storage_path: selected.storagePath,
          caption: selected.image.placeName,
          alt_text: `Photo of ${selected.image.placeName}`,
          sequence: dayNumber,
          source: "GOOGLE_PLACES",
          selection_type: "AUTO",
          is_primary: true,
          google_place_id: selected.image.placeId,
          place_name: selected.image.placeName,
          google_photo_reference: selected.image.photoReference,
          attribution: asAttributionJson(selected.image.attribution),
        };
      }
      if (selected) usedGooglePlaceIds.add(selected.image.placeId);
      results.push({ dayId, dayNumber, status: "added", placeName: selected.image.placeName, photo });
    } catch (error) {
      const message = reportError(error);
      if (error instanceof GoogleItineraryImageError && (error.status === 403 || error.status === 429)) unavailableProviderError = message;
      results.push({ dayId, dayNumber, status: "failed", message });
    }
  }

  return {
    days: results,
    added: results.filter((result) => result.status === "added").length,
    existing: results.filter((result) => result.status === "existing").length,
    notFound: results.filter((result) => result.status === "not_found").length,
    failed: results.filter((result) => result.status === "failed").length,
  };
}

export async function addGoogleImagesToSavedItinerary(
  supabase: AuthedSupabase,
  itineraryId: string,
  fetcher: typeof fetch = fetch,
): Promise<ItineraryImageEnrichmentResult> {
  const normalizedItineraryId = cleanText(itineraryId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedItineraryId)) {
    throw new Error("Save this itinerary before adding destination images.");
  }

  const { data: itinerary, error: itineraryError } = await supabase.from("itineraries")
    .select("id,destination_id,title")
    .eq("id", normalizedItineraryId)
    .maybeSingle();
  if (itineraryError || !itinerary) throw new Error("The saved itinerary could not be loaded.");

  const [{ data: days, error: daysError }, { data: destination }] = await Promise.all([
    supabase.from("itinerary_days").select("*").eq("itinerary_id", normalizedItineraryId).order("day_number", { ascending: true }),
    itinerary.destination_id
      ? supabase.from("destinations").select("name,country").eq("id", itinerary.destination_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (daysError) throw new Error("The saved itinerary days could not be loaded.");
  if (!days?.length) throw new Error("Save at least one itinerary day before adding images.");

  const dayIds = days.map((day) => day.id);
  const destinationName = destination?.name ?? itinerary.title ?? "";
  const [{ data: items, error: itemsError }, { data: existingPhotos, error: photosError }] = await Promise.all([
    supabase.from("itinerary_day_items").select("*").in("itinerary_day_id", dayIds).order("sequence", { ascending: true }),
    supabase.from("itinerary_photos").select("*").eq("itinerary_id", normalizedItineraryId).order("sequence", { ascending: true }),
  ]);
  if (itemsError) throw new Error("The saved itinerary activities could not be loaded.");
  if (photosError) throw new Error("Saved itinerary images could not be loaded.");
  const itemDayById = new Map((items ?? []).map((item) => [item.id, item.itinerary_day_id]));
  const daysWithItems = days.map((day) => ({
    ...day,
    items: (items ?? []).filter((item) => item.itinerary_day_id === day.id),
  }));
  return addGoogleImagesToDays(supabase, {
    itineraryId: normalizedItineraryId,
    title: itinerary.title,
    destinationName,
    destinationCountry: destination?.country ?? "",
    days: daysWithItems,
    existingPhotoDayIds: (existingPhotos ?? []).flatMap((photo) => {
      const dayId = photo.day_id ?? (photo.day_item_id ? itemDayById.get(photo.day_item_id) : null);
      return dayId ? [dayId] : [];
    }),
    existingGooglePlaceIds: (existingPhotos ?? []).flatMap((photo) => photo.google_place_id ? [photo.google_place_id] : []),
  }, fetcher);
}

export async function addGoogleImagesToUnsavedItinerary(
  supabase: AuthedSupabase,
  input: { title: string; destinationName?: string; destinationCountry?: string; days: DayPlaceSource[]; existingPhotoDayIds?: string[]; existingGooglePlaceIds?: string[] },
  fetcher: typeof fetch = fetch,
): Promise<ItineraryImageEnrichmentResult> {
  const title = cleanText(input.title);
  if (!title) throw new Error("Add a destination or itinerary title before searching for images.");
  if (!Array.isArray(input.days) || input.days.length === 0 || input.days.length > 30) {
    throw new Error("Add at least one itinerary day before searching for images.");
  }
  const days = input.days.map((day, index) => {
    if (!day || typeof day !== "object" || !cleanText(day.title)) throw new Error(`Day ${index + 1} needs a title before image search.`);
    if (!Array.isArray(day.items) || day.items.length > 100) throw new Error(`Day ${index + 1} contains too many itinerary items.`);
    return {
      id: cleanText(day.id) || `draft-day-${index + 1}`,
      day_number: Number(day.day_number) || index + 1,
      date: cleanText(day.date) || null,
      city: cleanText(day.city) || null,
      title: cleanText(day.title),
      description: cleanText(day.description) || null,
      notes: cleanText(day.notes) || null,
      items: day.items.map((item) => ({
        item_type: cleanText(item.item_type),
        title: cleanText(item.title) || null,
        location: cleanText(item.location) || null,
        description: cleanText(item.description) || null,
        hotel_city: cleanText(item.hotel_city) || null,
        dropoff: cleanText(item.dropoff) || null,
      })),
    };
  });
  return addGoogleImagesToDays(supabase, {
    itineraryId: null,
    title,
    destinationName: cleanText(input.destinationName) || title,
    destinationCountry: cleanText(input.destinationCountry),
    days,
    existingPhotoDayIds: input.existingPhotoDayIds,
    existingGooglePlaceIds: input.existingGooglePlaceIds,
  }, fetcher);
}