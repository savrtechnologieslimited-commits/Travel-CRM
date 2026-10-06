import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { addGoogleImagesToSavedItinerary, fetchGooglePlaceImage, fetchGooglePlaceImageWithFallback, findCachedImage, getItineraryDayPlaceCandidates, normalizeItineraryImageQuery } from "./itinerary-image-service.server";

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

function fakeSupabase(rowsByTable: Record<string, unknown>) {
  return {
    from(table: string) {
      const rows = rowsByTable[table] ?? [];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "not", "in", "limit", "insert", "upsert"]) {
        builder[method] = () => builder;
      }
      builder["maybeSingle"] = async () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null });
      builder["single"] = async () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null });
      builder["then"] = (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

describe("itinerary image service", () => {
  test("prefers named places in structured day content over a generic city image", () => {
    const candidates = getItineraryDayPlaceCandidates(
      { city: "Colombo", title: "Colombo sightseeing", description: "Visit Gangaramaya Temple and Galle Face Green." },
      [
        { item_type: "SIGHTSEEING", title: "Gangaramaya Temple", location: "Colombo" },
        { item_type: "TRANSPORT", title: "Airport transfer", location: "Colombo" },
      ],
      "Sri Lanka",
      "Sri Lanka",
    );

    expect(candidates[0]).toEqual({ place: "Gangaramaya Temple", locality: "Colombo" });
    expect(candidates.some((candidate) => candidate.place === "Galle Face Green")).toBe(true);
    expect(candidates.some((candidate) => candidate.place === "Sri Lanka")).toBe(false);
  });

  test("falls back to the itinerary day city when no specific place is identifiable", () => {
    expect(getItineraryDayPlaceCandidates(
      { title: "Day 3", description: "Leisure and local exploration." },
      [{ item_type: "TRANSPORT", title: "Transfer", location: "Ella" }],
      "Sri Lanka",
      "Sri Lanka",
    )).toEqual([{ place: "Sri Lanka", locality: "" }]);
  });

  test("uses a city in the structured day title before the itinerary-wide destination", () => {
    expect(getItineraryDayPlaceCandidates(
      { title: "Journey to Ella - Nature's Paradise" },
      [],
      "Sri Lanka",
      "Sri Lanka",
    )).toEqual([{ place: "Ella", locality: "Sri Lanka" }]);
  });

  test("searches named places in day titles that are not structured activity items", () => {
    const gobustan = getItineraryDayPlaceCandidates(
      {
        title: "Day 3 – Gobustan & Mud Volcanoes",
        description: "Tour the mud volcanoes and Gobustan.",
      },
      [],
      "Baku",
    );
    const shahdag = getItineraryDayPlaceCandidates(
      { title: "Day 5 – Shahdag Tour", description: "Cable car ride at Shahdag." },
      [],
      "Baku",
    );

    expect(gobustan.map((candidate) => candidate.place)).toContain("Gobustan");
    expect(gobustan.map((candidate) => candidate.place)).toContain("Mud Volcanoes");
    expect(shahdag.map((candidate) => candidate.place)).toContain("Shahdag");
  });

  test("uses Places API search and photo media with the server key in a header only", async () => {
    const requests: Array<{ url: string; key: string | null; body: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        key: new Headers(init?.headers).get("X-Goog-Api-Key"),
        body: String(init?.body ?? ""),
      });
      if (url.endsWith("/places:searchText")) {
        return jsonResponse({
          places: [{
            id: "ChIJgangaramaya",
            displayName: { text: "Gangaramaya Temple" },
            photos: [{
              name: "places/ChIJgangaramaya/photos/photo-reference",
              authorAttributions: [{ displayName: "Travel Photographer", uri: "https://example.test/author", photoUri: null }],
            }],
          }],
        });
      }
      return new Response(new Uint8Array([255, 216, 255]), { status: 200, headers: { "content-type": "image/jpeg" } });
    };

    const image = await fetchGooglePlaceImage("Gangaramaya Temple, Colombo, Sri Lanka", "separate-image-key", fetcher);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(requests[0]?.key).toBe("separate-image-key");
    expect(requests[0]?.url).not.toContain("separate-image-key");
    expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({ textQuery: "Gangaramaya Temple, Colombo, Sri Lanka", pageSize: 5 });
    expect(requests[1]?.url).toContain("/places/ChIJgangaramaya/photos/photo-reference/media?maxWidthPx=1280");
    expect(requests[1]?.key).toBe("separate-image-key");
    expect(image).toMatchObject({
      placeId: "ChIJgangaramaya",
      placeName: "Gangaramaya Temple",
      photoReference: "places/ChIJgangaramaya/photos/photo-reference",
      attribution: [{ displayName: "Travel Photographer", uri: "https://example.test/author", photoUri: null }],
      contentType: "image/jpeg",
    });
    expect([...image!.bytes]).toEqual([255, 216, 255]);
  });

  test("retries itinerary image lookup with the hotel key when the dedicated image key is rejected", async () => {
    const keys: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      const key = new Headers(init?.headers).get("X-Goog-Api-Key") ?? "";
      keys.push(key);
      if (key === "dedicated-image-key") {
        return new Response(JSON.stringify({ error: { message: "The caller does not have permission" } }), { status: 403 });
      }
      return jsonResponse({ places: [] });
    };

    const image = await fetchGooglePlaceImageWithFallback("Gangaramaya Temple, Colombo", ["dedicated-image-key", "hotel-google-key"], fetcher);

    expect(image).toBeNull();
    expect(keys).toEqual(["dedicated-image-key", "hotel-google-key"]);
  });

  test("normalizes repeated place searches for cache keys", () => {
    expect(normalizeItineraryImageQuery("  Galle Face Green, Colombo  ")).toBe("galle face green colombo");
  });

  test("loads saved Google photo references and storage paths from the persistent database cache", async () => {
    const cached = {
      normalized_query: "gangaramaya temple colombo",
      query_text: "Gangaramaya Temple, Colombo",
      google_place_id: "ChIJgangaramaya",
      place_name: "Gangaramaya Temple",
      google_photo_reference: "places/ChIJgangaramaya/photos/cached-photo",
      attribution: [{ displayName: "Cached Photographer", uri: null, photoUri: null }],
      storage_path: "itinerary-place-images/cache/cached-hash.jpg",
      created_at: "2026-09-29T00:00:00Z",
      updated_at: "2026-09-29T00:00:00Z",
    };

    const result = await findCachedImage(fakeSupabase({ itinerary_place_image_cache: [cached] }), "gangaramaya temple colombo");

    expect(result).toEqual(cached);
    expect(result?.storage_path).toBe("itinerary-place-images/cache/cached-hash.jpg");
    expect(result?.google_photo_reference).toBe("places/ChIJgangaramaya/photos/cached-photo");
  });

  test("searches an unsaved itinerary from the Supabase cache without requiring an API key", async () => {
    const priorKey = process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"];
    const priorHotelKey = process.env["GOOGLE_MAPS_API_KEY"];
    delete process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"];
    delete process.env["GOOGLE_MAPS_API_KEY"];
    let googleCalls = 0;
    try {
      const { addGoogleImagesToUnsavedItinerary } = await import("./itinerary-image-service.server");
      const result = await addGoogleImagesToUnsavedItinerary(fakeSupabase({
        itinerary_place_image_cache: [{
          normalized_query: "gangaramaya temple colombo",
          query_text: "Gangaramaya Temple, Colombo",
          google_place_id: "ChIJgangaramaya",
          place_name: "Gangaramaya Temple",
          google_photo_reference: "places/ChIJgangaramaya/photos/cached-photo",
          attribution: [],
          storage_path: "itinerary-place-images/cache/gangaramaya.jpg",
          created_at: "2026-09-29T00:00:00Z",
          updated_at: "2026-09-29T00:00:00Z",
        }],
        activity_photo_library: [],
      }), {
        title: "Colombo city break",
        destinationName: "Colombo",
        days: [{ id: "draft-day-1", day_number: 1, title: "City tour", items: [{ item_type: "ACTIVITY", title: "Gangaramaya Temple", location: "Colombo" }] }],
      }, async () => {
        googleCalls += 1;
        throw new Error("Google must not be called for a cached image");
      });

      expect(result.added).toBe(1);
      expect(result.days[0]).toMatchObject({ status: "added", dayId: "draft-day-1", placeName: "Gangaramaya Temple" });
      expect(result.days[0]?.photo?.storage_path).toBe("itinerary-place-images/cache/gangaramaya.jpg");
      expect(googleCalls).toBe(0);
    } finally {
      if (priorKey !== undefined) process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"] = priorKey;
      if (priorHotelKey !== undefined) process.env["GOOGLE_MAPS_API_KEY"] = priorHotelKey;
    }
  });

  test("does not reuse the same cached place photo for multiple days", async () => {
    const priorKey = process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"];
    const priorHotelKey = process.env["GOOGLE_MAPS_API_KEY"];
    delete process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"];
    delete process.env["GOOGLE_MAPS_API_KEY"];
    try {
      const { addGoogleImagesToUnsavedItinerary } = await import("./itinerary-image-service.server");
      const result = await addGoogleImagesToUnsavedItinerary(fakeSupabase({
        itinerary_place_image_cache: [{
          normalized_query: "gangaramaya temple colombo",
          query_text: "Gangaramaya Temple, Colombo",
          google_place_id: "ChIJgangaramaya",
          place_name: "Gangaramaya Temple",
          google_photo_reference: "places/ChIJgangaramaya/photos/cached-photo",
          attribution: [],
          storage_path: "itinerary-place-images/cache/gangaramaya.jpg",
          created_at: "2026-09-29T00:00:00Z",
          updated_at: "2026-09-29T00:00:00Z",
        }],
        activity_photo_library: [],
      }), {
        title: "Colombo tour",
        destinationName: "Colombo",
        days: [1, 2].map((dayNumber) => ({
          id: `draft-day-${dayNumber}`,
          day_number: dayNumber,
          title: `Day ${dayNumber} city tour`,
          items: [{ item_type: "ACTIVITY", title: "Gangaramaya Temple", location: "Colombo" }],
        })),
      }, async () => { throw new Error("Google must not be called for the cached place"); });

      expect(result.days.map((day) => day.status)).toEqual(["added", "not_found"]);
      expect(result.days[0]?.photo?.google_place_id).toBe("ChIJgangaramaya");
      expect(result.added).toBe(1);
      expect(result.notFound).toBe(1);
    } finally {
      if (priorKey !== undefined) process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"] = priorKey;
      if (priorHotelKey !== undefined) process.env["GOOGLE_MAPS_API_KEY"] = priorHotelKey;
    }
  });

  test("keeps saved manual and automatic day images and makes no Google request on repeat clicks", async () => {
    const priorKey = process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"];
    delete process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"];
    let googleCalls = 0;
    const itineraryId = "11111111-1111-4111-8111-111111111111";
    const dayIds = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    try {
      const result = await addGoogleImagesToSavedItinerary(fakeSupabase({
        itineraries: { id: itineraryId, destination_id: null, title: "Sri Lanka" },
        itinerary_days: dayIds.map((id, index) => ({ id, day_number: index + 1, city: index === 0 ? "Colombo" : "Ella", title: `Day ${index + 1}` })),
        itinerary_day_items: [],
        itinerary_photos: [
          { id: "44444444-4444-4444-8444-444444444444", day_id: dayIds[0], source: "MANUAL", selection_type: "MANUAL" },
          { id: "55555555-5555-4555-8555-555555555555", day_id: dayIds[1], source: "GOOGLE_PLACES", selection_type: "AUTO" },
        ],
      }), itineraryId, async () => {
        googleCalls += 1;
        throw new Error("Unexpected Google request");
      });

      expect(result.days.map((day) => day.status)).toEqual(["existing", "existing"]);
      expect(result.existing).toBe(2);
      expect(googleCalls).toBe(0);
    } finally {
      if (priorKey !== undefined) process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"] = priorKey;
    }
  });

  test("reports missing image-key configuration per day without failing the itinerary or calling Google", async () => {
    const priorKey = process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"];
    const priorHotelKey = process.env["GOOGLE_MAPS_API_KEY"];
    delete process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"];
    delete process.env["GOOGLE_MAPS_API_KEY"];
    let googleCalls = 0;
    const itineraryId = "11111111-1111-4111-8111-111111111111";
    const dayId = "22222222-2222-4222-8222-222222222222";
    try {
      const result = await addGoogleImagesToSavedItinerary(fakeSupabase({
        itineraries: { id: itineraryId, destination_id: null, title: "Sri Lanka" },
        itinerary_days: [{ id: dayId, day_number: 1, city: "Colombo", title: "Arrival in Colombo" }],
        itinerary_day_items: [],
        itinerary_photos: [],
        itinerary_place_image_cache: [],
      }), itineraryId, async () => {
        googleCalls += 1;
        throw new Error("Unexpected Google request");
      });

      expect(result.failed).toBe(1);
      expect(result.days[0]?.message).toContain("GOOGLE_ITINERARY_IMAGES_API_KEY");
      expect(googleCalls).toBe(0);
    } finally {
      if (priorKey !== undefined) process.env["GOOGLE_ITINERARY_IMAGES_API_KEY"] = priorKey;
      if (priorHotelKey !== undefined) process.env["GOOGLE_MAPS_API_KEY"] = priorHotelKey;
    }
  });
});