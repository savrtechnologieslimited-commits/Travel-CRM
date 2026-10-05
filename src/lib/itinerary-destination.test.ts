import { describe, expect, test } from "bun:test";
import { matchItineraryDestinationId } from "./itinerary-destination";

describe("itinerary destination matching", () => {
  const destinations = [
    { id: "blr", name: "Bengaluru" },
    { id: "mys", name: "Mysuru" },
    { id: "par", name: "Paris" },
  ];

  test("resolves the first city in an ordered multi-city route", () => {
    expect(matchItineraryDestinationId(
      "Bangalore-Mysore trip",
      "Visit these cities in order: Bangalore: 2 nights → Mysore: 1 night.",
      destinations,
    )).toBe("blr");
  });

  test("matches a single destination title and leaves unknown destinations unassigned", () => {
    expect(matchItineraryDestinationId("Paris, France itinerary", "", destinations)).toBe("par");
    expect(matchItineraryDestinationId("Unknown destination trip", "", destinations)).toBeNull();
  });
});
