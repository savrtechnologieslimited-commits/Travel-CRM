import { describe, expect, test } from "bun:test";
import { firstGoogleHotelMatch } from "./google-hotel-match";
import type { GoogleActivityPlace } from "./google-places-activities";

const place = (id: string, types: string[]): GoogleActivityPlace => ({
  id, types, name: id, address: "", rating: null, mapsUrl: null, website: null,
  phone: "", description: "", openingHours: [], photos: [],
});

describe("Google hotel result selection", () => {
  test("selects an actual lodging result and skips non-hotel matches", () => {
    expect(firstGoogleHotelMatch([
      place("tour", ["tourist_attraction"]),
      place("property", ["lodging", "establishment"]),
    ])?.id).toBe("property");
  });

  test("does not invent a property when Google returns no lodging result", () => {
    expect(firstGoogleHotelMatch([place("museum", ["museum"])] )).toBeNull();
    expect(firstGoogleHotelMatch([])).toBeNull();
  });
});
