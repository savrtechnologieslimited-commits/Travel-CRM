import { describe, expect, test } from "bun:test";
import { searchWorldCities } from "./city-suggestions.server";

describe("world city suggestions", () => {
  test("returns matching cities with countries and filters out neighborhoods", async () => {
    let requestedUrl = "";
    const suggestions = await searchWorldCities("Hyde", async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ results: [
        { id: 1, name: "Hyderabad", country: "India", country_code: "IN", admin1: "Telangana", population: 6993262, feature_code: "PPLA" },
        { id: 2, name: "Hyderabad Lines", country: "Pakistan", country_code: "PK", population: 1000, feature_code: "PPLX" },
        { id: 3, name: "Hyderpet", country: "India", country_code: "IN", population: 2000, feature_code: "PPL" },
      ] }), { status: 200 });
    });

    expect(new URL(requestedUrl).searchParams.get("count")).toBe("100");
    expect(suggestions.map(({ name, country }) => `${name}, ${country}`)).toEqual(["Hyderabad, India", "Hyderpet, India"]);
  });

  test("does not request results for fewer than two characters", async () => {
    let called = false;
    const suggestions = await searchWorldCities("C", async () => {
      called = true;
      return new Response("{}", { status: 200 });
    });

    expect(called).toBe(false);
    expect(suggestions).toEqual([]);
  });
});
