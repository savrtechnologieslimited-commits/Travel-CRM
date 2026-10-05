export type GoogleActivityPlace = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  reviews?: number | null;
  mapsUrl: string | null;
  website: string | null;
  phone: string | null;
  description: string;
  openingHours: string[];
  types: string[];
  photos: Array<{ name: string }>;
};

export type GoogleActivityPlaceCache = {
  find: (placeId: string) => Promise<GoogleActivityPlace | null>;
  save: (places: GoogleActivityPlace[]) => Promise<void>;
  findSearchResults?: (query: string, destination: string, placeType?: string) => Promise<GoogleActivityPlace[] | null>;
  saveSearchResults?: (query: string, destination: string, places: GoogleActivityPlace[], placeType?: string) => Promise<void>;
};

export type GoogleActivityPhoto = {
  photoUri: string;
  googleMapsUri: string | null;
  authorAttributions: Array<{ displayName: string; uri: string | null; photoUri: string | null }>;
};

const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEMORY_SEARCHES = 100;
const memorySearchCache = new Map<string, { expiresAt: number; places: GoogleActivityPlace[] }>();
const inFlightSearches = new Map<string, Promise<GoogleActivityPlace[]>>();

function getConfiguredCacheDays(envKey: string, fallback: number) {
  const value = Number(process.env[envKey]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function logPlaceCacheFailure(operation: string, error: unknown) {
  console.warn(`[Google Places] Cache ${operation} failed; continuing without the cache.`, error);
}

function normalizeSearchToken(value: string) {
  return normalizeSearchText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function googleActivitySearchCacheKey(query: string, destination: string, placeType = "activity") {
  const normalizedQuery = normalizeSearchToken(query);
  const normalizedDestination = normalizeSearchToken(destination);
  const normalizedType = normalizeSearchToken(placeType);
  return `${normalizedDestination}|${normalizedQuery}|${normalizedType}`;
}

function rememberSearchResults(key: string, places: GoogleActivityPlace[]) {
  if (memorySearchCache.size >= MAX_MEMORY_SEARCHES) {
    const oldestKey = memorySearchCache.keys().next().value;
    if (oldestKey) memorySearchCache.delete(oldestKey);
  }
  memorySearchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, places });
}

export async function searchGoogleActivityPlacesWithCache(
  query: string,
  destination: string,
  cache: GoogleActivityPlaceCache,
  search: typeof searchGoogleActivityPlaces = searchGoogleActivityPlaces,
  placeType = "activity",
) {
  const searchKey = googleActivitySearchCacheKey(query, destination, placeType);
  const memoryResult = memorySearchCache.get(searchKey);
  if (memoryResult && memoryResult.expiresAt > Date.now()) {
    console.info("[Google Places] CACHE_HIT", { searchKey, source: "memory" });
    return memoryResult.places;
  }
  memorySearchCache.delete(searchKey);

  if (cache.findSearchResults) {
    try {
      const cachedResults = await cache.findSearchResults(query, destination, placeType);
      if (cachedResults !== null) {
        console.info("[Google Places] CACHE_HIT", { searchKey, source: "database" });
        rememberSearchResults(searchKey, cachedResults);
        return cachedResults;
      }
    } catch (error) {
      logPlaceCacheFailure("read before search", error);
    }
  }

  const existingSearch = inFlightSearches.get(searchKey);
  if (existingSearch) {
    console.info("[Google Places] SEARCH_IN_FLIGHT", { searchKey, source: "deduplicated" });
    return await existingSearch;
  }

  const pendingSearch = (async () => {
    const places = await search(query, destination);
    rememberSearchResults(searchKey, places);

    try {
      await cache.save(places);
    } catch (error) {
      logPlaceCacheFailure("write after search", error);
    }

    if (cache.saveSearchResults) {
      try {
        await cache.saveSearchResults(query, destination, places, placeType);
      } catch (error) {
        logPlaceCacheFailure("write search results", error);
      }
    }

    return places;
  })();

  inFlightSearches.set(searchKey, pendingSearch);
  try {
    console.info("[Google Places] SEARCH", { searchKey, placeType });
    return await pendingSearch;
  } finally {
    inFlightSearches.delete(searchKey);
  }
}

export async function getGoogleActivityPlaceDetailsWithCache(
  placeId: string,
  cache: GoogleActivityPlaceCache,
  fetchDetails: typeof getGoogleActivityPlaceDetails = getGoogleActivityPlaceDetails,
) {
  let cached: GoogleActivityPlace | null = null;
  try {
    cached = await cache.find(placeId);
  } catch (error) {
    logPlaceCacheFailure("read before place selection", error);
  }
  if (cached) return cached;
  const place = await fetchDetails(placeId);
  try {
    await cache.save([place]);
  } catch (error) {
    logPlaceCacheFailure("write after place selection", error);
  }
  return place;
}

const PLACE_FIELD_NAMES = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "websiteUri",
  "nationalPhoneNumber",
  "editorialSummary",
  "regularOpeningHours",
  "types",
];
const PLACE_SEARCH_FIELDS = PLACE_FIELD_NAMES.map((field) => `places.${field}`).join(",");
const PLACE_DETAILS_FIELDS = PLACE_FIELD_NAMES.join(",");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeSearchText(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePlace(value: unknown): GoogleActivityPlace | null {
  const place = asRecord(value);
  const id = typeof place["id"] === "string" ? place["id"] : "";
  const displayName = asRecord(place["displayName"]);
  const editorialSummary = asRecord(place["editorialSummary"]);
  const openingHours = asRecord(place["regularOpeningHours"]);
  if (!id) return null;
  return {
    id,
    name: typeof displayName["text"] === "string" ? displayName["text"] : "Activity",
    address: typeof place["formattedAddress"] === "string" ? place["formattedAddress"] : "",
    rating: typeof place["rating"] === "number" ? place["rating"] : null,
    reviews: typeof place["userRatingCount"] === "number" ? place["userRatingCount"] : null,
    mapsUrl: typeof place["googleMapsUri"] === "string" ? place["googleMapsUri"] : null,
    website: typeof place["websiteUri"] === "string" ? place["websiteUri"] : null,
    phone: typeof place["nationalPhoneNumber"] === "string" ? place["nationalPhoneNumber"] : "",
    description: typeof editorialSummary["text"] === "string" ? editorialSummary["text"] : "",
    openingHours: Array.isArray(openingHours["weekdayDescriptions"])
      ? openingHours["weekdayDescriptions"].filter((entry): entry is string => typeof entry === "string")
      : [],
    types: Array.isArray(place["types"])
      ? place["types"].filter((entry): entry is string => typeof entry === "string")
      : [],
    photos: Array.isArray(place["photos"])
      ? place["photos"]
          .map((photo) => asRecord(photo)["name"])
          .filter((name): name is string => typeof name === "string" && name.length > 0)
          .map((name) => ({ name }))
      : [],
  };
}

async function placesRequest(url: string, apiKey: string, init?: RequestInit, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, {
    ...init,
    headers: {
      "X-Goog-Api-Key": apiKey,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    let providerMessage = "";
    try {
      const parsed = JSON.parse(responseBody) as { error?: { message?: unknown } };
      providerMessage = typeof parsed.error?.message === "string" ? parsed.error.message : "";
    } catch {
      providerMessage = responseBody.trim();
    }
    const message = response.status === 429
      ? `Google Places daily request quota has been exceeded${providerMessage ? `: ${providerMessage}` : "."} Results will use previously cached searches when available. Increase the Places API (New) SearchTextRequest daily quota in Google Cloud or wait for its reset.`
      : response.status === 403
      ? `Google Places rejected the request${providerMessage ? `: ${providerMessage}` : "."} Check that Places API (New) and billing are enabled for the configured key and that the key's API restrictions allow Places API (New).`
      : `Google Places request failed (${response.status})${providerMessage ? `: ${providerMessage}` : "."}`;
    throw new Error(message);
  }
  return response.json() as Promise<unknown>;
}

export async function searchGoogleActivityPlaces(
  query: string,
  destination = "",
  apiKey = process.env["GOOGLE_MAPS_API_KEY"] ?? "",
  fetcher: typeof fetch = fetch,
) {
  const key = apiKey.trim();
  if (!key) throw new Error("Google activity search is not configured. Set GOOGLE_MAPS_API_KEY on the server.");
  const textQuery = [normalizeSearchText(query), normalizeSearchText(destination)].filter(Boolean).join(", ");
  if (textQuery.length < 2) throw new Error("Enter at least two characters to search Google for activities.");
  if (textQuery.length > 250) throw new Error("Activity search must be 250 characters or fewer.");

  const result = asRecord(await placesRequest("https://places.googleapis.com/v1/places:searchText", key, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-FieldMask": PLACE_SEARCH_FIELDS,
    },
    body: JSON.stringify({ textQuery, pageSize: 8 }),
  }, fetcher));
  return Array.isArray(result["places"])
    ? result["places"].map(normalizePlace).filter((place): place is GoogleActivityPlace => Boolean(place))
    : [];
}

export async function getGoogleActivityPlaceDetails(
  placeId: string,
  apiKey = process.env["GOOGLE_MAPS_API_KEY"] ?? "",
  fetcher: typeof fetch = fetch,
) {
  const key = apiKey.trim();
  if (!key) throw new Error("Google activity search is not configured. Set GOOGLE_MAPS_API_KEY on the server.");
  const normalizedId = placeId.trim().replace(/^places\//, "");
  if (!normalizedId || normalizedId.length > 300 || !/^[A-Za-z0-9_-]+$/.test(normalizedId)) {
    throw new Error("The selected Google Place ID is invalid.");
  }
  const result = normalizePlace(await placesRequest(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedId)}`,
    key,
    { headers: { "X-Goog-FieldMask": PLACE_DETAILS_FIELDS } },
    fetcher,
  ));
  if (!result) throw new Error("Google Places returned no details for the selected activity.");
  return result;
}

/** Fetch a current photo URL on demand. Photo names and URLs are never cached or persisted. */
export async function getGoogleActivityPlacePhoto(
  placeId: string,
  apiKey = process.env["GOOGLE_MAPS_API_KEY"] ?? "",
  fetcher: typeof fetch = fetch,
): Promise<GoogleActivityPhoto | null> {
  const key = apiKey.trim();
  if (!key) throw new Error("Google activity search is not configured. Set GOOGLE_MAPS_API_KEY on the server.");
  const normalizedId = placeId.trim().replace(/^places\//, "");
  if (!normalizedId || normalizedId.length > 300 || !/^[A-Za-z0-9_-]+$/.test(normalizedId)) {
    throw new Error("The selected Google Place ID is invalid.");
  }

  const place = asRecord(await placesRequest(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedId)}`,
    key,
    { headers: { "X-Goog-FieldMask": "googleMapsUri,photos" } },
    fetcher,
  ));
  const firstPhoto = Array.isArray(place["photos"]) ? asRecord(place["photos"][0]) : {};
  const photoName = typeof firstPhoto["name"] === "string" ? firstPhoto["name"] : "";
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)) return null;

  const photoResponse = asRecord(await placesRequest(
    `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&skipHttpRedirect=true`,
    key,
    undefined,
    fetcher,
  ));
  const photoUri = typeof photoResponse["photoUri"] === "string" ? photoResponse["photoUri"] : "";
  if (!photoUri || new URL(photoUri).protocol !== "https:") return null;

  const authorAttributions = Array.isArray(firstPhoto["authorAttributions"])
    ? firstPhoto["authorAttributions"].flatMap((raw) => {
        const author = asRecord(raw);
        const displayName = typeof author["displayName"] === "string" ? author["displayName"] : "";
        if (!displayName) return [];
        const uri = typeof author["uri"] === "string" && /^https:\/\//i.test(author["uri"]) ? author["uri"] : null;
        const photoUri = typeof author["photoUri"] === "string" && /^https:\/\//i.test(author["photoUri"]) ? author["photoUri"] : null;
        return [{ displayName, uri, photoUri }];
      })
    : [];

  return {
    photoUri,
    googleMapsUri: typeof place["googleMapsUri"] === "string" ? place["googleMapsUri"] : null,
    authorAttributions,
  };
}

