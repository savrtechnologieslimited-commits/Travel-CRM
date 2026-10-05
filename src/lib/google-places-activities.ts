import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GoogleActivityPlace = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  reviews?: number | null;
  mapsUrl: string | null;
  website: string | null;
  phone: string;
  description: string;
  openingHours: string[];
  types: string[];
  photos: Array<{ name: string }>;
};

export type GoogleActivityPhoto = {
  photoUri: string;
  googleMapsUri: string | null;
  authorAttributions: Array<{ displayName: string; uri: string | null; photoUri: string | null }>;
};

export const lookupGoogleActivityPlacesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { action: "search" | "details" | "photo"; query?: string; destination?: string; placeId?: string; placeType?: "activity" | "hotel" }) => input)
  .handler(async ({ data }): Promise<GoogleActivityPlace[] | GoogleActivityPlace | GoogleActivityPhoto | null> => {
    const { getGoogleActivityPlaceDetails, getGoogleActivityPlaceDetailsWithCache, getGoogleActivityPlacePhoto, searchGoogleActivityPlacesWithCache } = await import("./google-places-activities.server");
    if (data.action === "search") {
      const { googleActivityPlaceCache } = await import("./google-places-cache.server");
      return searchGoogleActivityPlacesWithCache(data.query ?? "", data.destination ?? "", googleActivityPlaceCache, undefined, data.placeType ?? "activity");
    }
    if (!data.placeId) throw new Error("Select an activity before requesting its details.");
    if (data.action === "photo") return getGoogleActivityPlacePhoto(data.placeId);
    const { googleActivityPlaceCache } = await import("./google-places-cache.server");
    return getGoogleActivityPlaceDetailsWithCache(data.placeId, googleActivityPlaceCache, getGoogleActivityPlaceDetails);
  });
