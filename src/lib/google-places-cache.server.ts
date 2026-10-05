import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { googleActivitySearchCacheKey, type GoogleActivityPlace, type GoogleActivityPlaceCache } from "./google-places-activities.server";

const SEARCH_CACHE_TTL_DAYS = Number(process.env["GOOGLE_PLACES_SEARCH_CACHE_DAYS"] ?? 7);
const DETAILS_CACHE_TTL_DAYS = Number(process.env["GOOGLE_PLACES_DETAILS_CACHE_DAYS"] ?? 30);

function getCacheWindowsInMs(envKey: string, fallbackDays: number) {
  const value = Number(process.env[envKey]);
  return (Number.isFinite(value) && value > 0 ? value : fallbackDays) * 24 * 60 * 60 * 1000;
}

function asCachedPlace(value: Json, expectedId: string): GoogleActivityPlace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const place = value as Record<string, Json | undefined>;
  if (
    place["id"] !== expectedId ||
    typeof place["name"] !== "string" ||
    typeof place["address"] !== "string" ||
    typeof place["phone"] !== "string" ||
    typeof place["description"] !== "string" ||
    !Array.isArray(place["openingHours"]) ||
    !Array.isArray(place["types"])
  ) return null;
  return { ...value, photos: [] } as unknown as GoogleActivityPlace;
}

export const googleActivityPlaceCache: GoogleActivityPlaceCache = {
  async find(placeId) {
    const validSince = new Date(Date.now() - getCacheWindowsInMs("GOOGLE_PLACES_DETAILS_CACHE_DAYS", DETAILS_CACHE_TTL_DAYS)).toISOString();
    const { data, error } = await supabaseAdmin
      .from("google_activity_places_cache")
      .select("place_data")
      .eq("place_id", placeId)
      .gt("updated_at", validSince)
      .maybeSingle();
    if (error) throw error;
    return data ? asCachedPlace(data.place_data, placeId) : null;
  },
  async save(places) {
    if (places.length === 0) return;
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("google_activity_places_cache")
      .upsert(
        places.map((place) => {
          const { photos: _photos, ...placeData } = place;
          return {
            place_id: place.id,
            place_data: placeData as unknown as Json,
            updated_at: updatedAt,
          };
        }),
        { onConflict: "place_id" },
      );
    if (error) throw error;
  },
  async findSearchResults(query, destination, placeType = "activity") {
    const searchKey = googleActivitySearchCacheKey(query, destination, placeType);
    const validSince = new Date(Date.now() - getCacheWindowsInMs("GOOGLE_PLACES_SEARCH_CACHE_DAYS", SEARCH_CACHE_TTL_DAYS)).toISOString();
    const { data: cachedSearch, error: searchError } = await supabaseAdmin
      .from("google_activity_place_search_cache")
      .select("place_ids")
      .eq("search_key", searchKey)
      .gt("updated_at", validSince)
      .maybeSingle();
    if (searchError) throw searchError;
    if (!cachedSearch) return null;

    const placeIds = Array.isArray(cachedSearch.place_ids)
      ? cachedSearch.place_ids.filter((value): value is string => typeof value === "string")
      : [];
    if (placeIds.length === 0) return [];

    const { data: cachedPlaces, error: placesError } = await supabaseAdmin
      .from("google_activity_places_cache")
      .select("place_id,place_data")
      .in("place_id", placeIds)
      .gt("updated_at", validSince);
    if (placesError) throw placesError;

    const placesById = new Map((cachedPlaces ?? []).map((row) => [row.place_id, asCachedPlace(row.place_data, row.place_id)]));
    const results = placeIds.map((placeId) => placesById.get(placeId));
    return results.every((place): place is GoogleActivityPlace => Boolean(place)) ? results : null;
  },
  async saveSearchResults(query, destination, places, placeType = "activity") {
    const { error } = await supabaseAdmin
      .from("google_activity_place_search_cache")
      .upsert({
        search_key: googleActivitySearchCacheKey(query, destination, placeType),
        place_ids: places.map((place) => place.id),
        updated_at: new Date().toISOString(),
      }, { onConflict: "search_key" });
    if (error) throw error;
  },
};
