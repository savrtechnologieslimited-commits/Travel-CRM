import { describe, expect, spyOn, test } from "bun:test";
import {
  getGoogleActivityPlaceDetails,
  getGoogleActivityPlaceDetailsWithCache,
  getGoogleActivityPlacePhoto,
  searchGoogleActivityPlaces,
  searchGoogleActivityPlacesWithCache,
  type GoogleActivityPlace,
} from "./google-places-activities.server";

const placeResponse = {
  id: "ChIJplace123",
  displayName: { text: "Emerald Pool Tour" },
  formattedAddress: "Krabi, Thailand",
  rating: 4.7,
  userRatingCount: 918,
  googleMapsUri: "https://maps.google.com/?cid=123",
  websiteUri: "https://example.test/tour",
  nationalPhoneNumber: "+66 123 456 789",
  editorialSummary: { text: "Guided visit to the Emerald Pool." },
  regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 4:00 PM"] },
  types: ["tourist_attraction"],
};

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Google activity place lookup", () => {
  test("searches in the trip destination and normalizes editable place details", async () => {
    let requestedUrl = "";
    let requestedBody = "";
    let requestedFieldMask = "";
    const fetcher: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = String(init?.body ?? "");
      requestedFieldMask = new Headers(init?.headers).get("X-Goog-FieldMask") ?? "";
      return jsonResponse({ places: [placeResponse] });
    };

    const places = await searchGoogleActivityPlaces("Emerald Pool", "Krabi", "test-key", fetcher);
    expect(requestedUrl).toContain("places:searchText");
    expect(requestedFieldMask).not.toContain("photos");
    expect(JSON.parse(requestedBody)).toMatchObject({ textQuery: "Emerald Pool, Krabi", pageSize: 8 });
    expect(places[0]).toMatchObject({
      id: "ChIJplace123",
      name: "Emerald Pool Tour",
      address: "Krabi, Thailand",
      rating: 4.7,
      reviews: 918,
      website: "https://example.test/tour",
      phone: "+66 123 456 789",
      description: "Guided visit to the Emerald Pool.",
      openingHours: ["Monday: 9:00 AM – 4:00 PM"],
    });
  });

  test("saves places returned by a Google search to the cache", async () => {
    const saved: GoogleActivityPlace[][] = [];
    let savedSearch: GoogleActivityPlace[] = [];
    const result = await searchGoogleActivityPlacesWithCache(
      "Emerald Pool",
      "Krabi",
      {
        find: async () => null,
        save: async (places) => { saved.push(places); },
        findSearchResults: async () => null,
        saveSearchResults: async (_query, _destination, places) => { savedSearch = places; },
      },
      async () => [{ id: "ChIJplace123", name: "Emerald Pool Tour", address: "Krabi, Thailand", rating: null, mapsUrl: null, website: null, phone: "", description: "", openingHours: [], types: [], photos: [] }],
    );

    expect(result).toHaveLength(1);
    expect(saved).toEqual([result]);
    expect(savedSearch).toEqual(result);
  });

  test("keeps hotel search results separate from activity searches in memory and persistent cache keys", async () => {
    const searchTypes: string[] = [];
    const cache = {
      find: async () => null,
      save: async () => undefined,
      findSearchResults: async (_query: string, _destination: string, placeType = "activity") => {
        searchTypes.push(`read:${placeType}`);
        return null;
      },
      saveSearchResults: async (_query: string, _destination: string, _places: GoogleActivityPlace[], placeType = "activity") => {
        searchTypes.push(`write:${placeType}`);
      },
    };
    const search = async () => [placeResponse as unknown as GoogleActivityPlace];

    await searchGoogleActivityPlacesWithCache("Bangalore central 4 star", "Bangalore", cache, search, "hotel");
    await searchGoogleActivityPlacesWithCache("Bangalore central 4 star", "Bangalore", cache, search, "activity");

    expect(searchTypes).toEqual(["read:hotel", "write:hotel", "read:activity", "write:activity"]);
  });

  test("returns cached search results without calling Google", async () => {
    const cachedPlace: GoogleActivityPlace = {
      id: "ChIJcached123", name: "Cached Waterfall", address: "Unique Valley", rating: 4.2,
      mapsUrl: null, website: null, phone: "", description: "", openingHours: [], types: [], photos: [],
    };
    let googleCalls = 0;
    const result = await searchGoogleActivityPlacesWithCache(
      "Persistent-cache-unique-waterfall",
      "Unique Valley",
      {
        find: async () => null,
        save: async () => undefined,
        findSearchResults: async () => [cachedPlace],
      },
      async () => { googleCalls += 1; return []; },
    );

    expect(result).toEqual([cachedPlace]);
    expect(googleCalls).toBe(0);
  });

  test("deduplicates simultaneous identical searches within the same request lifecycle", async () => {
    const cache = {
      find: async () => null,
      save: async () => undefined,
      findSearchResults: async () => null,
      saveSearchResults: async () => undefined,
    };
    let googleCalls = 0;

    const [first, second] = await Promise.all([
      searchGoogleActivityPlacesWithCache(
        "Simultaneous search unique activity",
        "Goa",
        cache,
        async () => {
          googleCalls += 1;
          return [{ id: "ChIJsimultaneous1", name: "Unique Activity", address: "Goa", rating: 4.5, mapsUrl: null, website: null, phone: "", description: "", openingHours: [], types: [], photos: [] }];
        },
      ),
      searchGoogleActivityPlacesWithCache(
        "Simultaneous search unique activity",
        "Goa",
        cache,
        async () => {
          googleCalls += 1;
          return [{ id: "ChIJsimultaneous2", name: "Unique Activity 2", address: "Goa", rating: 4.4, mapsUrl: null, website: null, phone: "", description: "", openingHours: [], types: [], photos: [] }];
        },
      ),
    ]);

    expect(first).toEqual(second);
    expect(googleCalls).toBe(1);
  });

  test("uses cached selected-place details before Google and caches Google fallback", async () => {
    const cachedPlace: GoogleActivityPlace = {
      id: "ChIJplace123", name: "Cached Pool", address: "Krabi", rating: 4.5,
      mapsUrl: null, website: null, phone: "", description: "", openingHours: [], types: [], photos: [],
    };
    let googleCalls = 0;
    const cache = { find: async () => cachedPlace, save: async () => undefined };
    const cachedResult = await getGoogleActivityPlaceDetailsWithCache("ChIJplace123", cache, async () => {
      googleCalls += 1;
      return cachedPlace;
    });
    expect(cachedResult).toEqual(cachedPlace);
    expect(googleCalls).toBe(0);

    let saved: GoogleActivityPlace[] = [];
    const fetchedPlace = { ...cachedPlace, name: "Fresh Pool" };
    const fallback = await getGoogleActivityPlaceDetailsWithCache(
      "ChIJplace123",
      { find: async () => null, save: async (places) => { saved = places; } },
      async () => { googleCalls += 1; return fetchedPlace; },
    );
    expect(fallback).toEqual(fetchedPlace);
    expect(saved).toEqual([fetchedPlace]);
    expect(googleCalls).toBe(1);
  });

  test("continues with Google results when the database cache is unavailable", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const place: GoogleActivityPlace = {
        id: "ChIJplace123", name: "Emerald Pool", address: "Krabi", rating: null,
        mapsUrl: null, website: null, phone: "", description: "", openingHours: [], types: [], photos: [],
      };
      const result = await searchGoogleActivityPlacesWithCache(
        "Cache-write-failure-waterfall-unique",
        "Cache-failure-test-location",
        { find: async () => null, save: async () => { throw { message: "cache table unavailable" }; } },
        async () => [place],
      );
      expect(result).toEqual([place]);
    } finally {
      warn.mockRestore();
    }
  });

  test("falls back to Google when the database cache read fails", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const place: GoogleActivityPlace = {
        id: "ChIJplace123", name: "Emerald Pool", address: "Krabi", rating: null,
        mapsUrl: null, website: null, phone: "", description: "", openingHours: [], types: [], photos: [],
      };
      let googleCalls = 0;
      const result = await getGoogleActivityPlaceDetailsWithCache(
        place.id,
        {
          find: async () => { throw { message: "cache table unavailable" }; },
          save: async () => { throw { message: "cache table unavailable" }; },
        },
        async () => { googleCalls += 1; return place; },
      );
      expect(result).toEqual(place);
      expect(googleCalls).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  test("fetches selected place details and rejects unsupported or unconfigured requests", async () => {
    let requestedUrl = "";
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return jsonResponse(placeResponse);
    };
    const details = await getGoogleActivityPlaceDetails("places/ChIJplace123", "test-key", fetcher);
    expect(requestedUrl).toContain("/places/ChIJplace123");
    expect(details.mapsUrl).toBe("https://maps.google.com/?cid=123");
    await expect(searchGoogleActivityPlaces("kayak", "Krabi", "", fetcher)).rejects.toThrow("GOOGLE_MAPS_API_KEY");
    await expect(getGoogleActivityPlaceDetails("bad id", "test-key", fetcher)).rejects.toThrow("Place ID is invalid");
  });

  test("fetches Google activity photos on demand with their author and Maps attribution", async () => {
    const requested: Array<{ url: string; fieldMask: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      requested.push({ url, fieldMask: new Headers(init?.headers).get("X-Goog-FieldMask") ?? "" });
      if (url.includes("/media?")) {
        return jsonResponse({ photoUri: "https://lh3.googleusercontent.com/photo" });
      }
      return jsonResponse({
        googleMapsUri: "https://maps.google.com/?cid=123",
        photos: [{
          name: "places/ChIJplace123/photos/fresh-photo-name",
          authorAttributions: [{ displayName: "Photo Contributor", uri: "https://maps.google.com/maps/contrib/123", photoUri: "https://lh3.googleusercontent.com/author" }],
        }],
      });
    };

    const photo = await getGoogleActivityPlacePhoto("ChIJplace123", "test-key", fetcher);
    expect(photo).toEqual({
      photoUri: "https://lh3.googleusercontent.com/photo",
      googleMapsUri: "https://maps.google.com/?cid=123",
      authorAttributions: [{ displayName: "Photo Contributor", uri: "https://maps.google.com/maps/contrib/123", photoUri: "https://lh3.googleusercontent.com/author" }],
    });
    expect(requested).toHaveLength(2);
    expect(requested[0]?.fieldMask).toContain("photos");
    expect(requested[1]?.url).toContain("/photos/fresh-photo-name/media");
    expect(requested[1]?.url).toContain("skipHttpRedirect=true");
  });

  test("returns no photo when Google has no photo resources", async () => {
    const photo = await getGoogleActivityPlacePhoto("ChIJplace123", "test-key", async () => jsonResponse({ photos: [] }));
    expect(photo).toBeNull();
  });

  test("explains when the Google daily search quota is exhausted", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), { status: 429 });
    await expect(searchGoogleActivityPlaces("quota test", "Krabi", "test-key", fetcher))
      .rejects.toThrow("Google Places daily request quota has been exceeded");
  });

  test("includes Google's reason when Places rejects the configured key", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      error: { message: "Places API has not been used in project 123 before or it is disabled." },
    }), { status: 403 });
    await expect(searchGoogleActivityPlaces("rejected request", "Krabi", "test-key", fetcher))
      .rejects.toThrow("Places API has not been used in project 123 before or it is disabled");
  });
});
