import { describe, expect, test } from "bun:test";
import { resolveFlightAirportCode, searchAirports } from "./airports";
import { buildFlightSearchLink, flightSearchProviders } from "./travel-search-providers";

describe("airport search", () => {
  test("finds an airport by city, airport name, and IATA code", () => {
    expect(searchAirports("Hyderabad")[0]).toMatchObject({
      city: "Hyderabad",
      code: "HYD",
    });
    expect(searchAirports("Rajiv Gandhi")[0]?.code).toBe("HYD");
    expect(searchAirports("BOM")[0]).toMatchObject({
      city: "Mumbai",
      code: "BOM",
    });
  });

  test("supports common former city names and multiple airports in a city", () => {
    expect(searchAirports("Bangalore")[0]?.code).toBe("BLR");
    expect(searchAirports("Mumbai").map((airport) => airport.code)).toEqual(["BOM"]);
    expect(searchAirports("London").map((airport) => airport.code)).toEqual(["LHR", "LGW"]);
  });

  test("resolves flight airport codes from saved airport and city labels", () => {
    expect(resolveFlightAirportCode("HYD")).toBe("HYD");
    expect(resolveFlightAirportCode("Rajiv Gandhi International Airport (HYD)")).toBe("HYD");
    expect(resolveFlightAirportCode("Hyderabad, India")).toBe("HYD");
    expect(resolveFlightAirportCode("London")).toBeNull();
    expect(resolveFlightAirportCode("unknown destination")).toBeNull();
  });

  test("uses selected airport codes, not city labels, in flight search links", () => {
    const origin = searchAirports("Hyderabad")[0]!;
    const destination = searchAirports("Mumbai")[0]!;
    const params = {
      from: origin.code,
      to: destination.code,
      departure: "2026-10-15",
      adults: 1,
      children: 0,
      infants: 0,
      tripType: "one-way",
      currency: "INR",
    };

    const googleQuery = new URL(
      buildFlightSearchLink(flightSearchProviders[2]!, params),
    ).searchParams.get("q");
    expect(googleQuery).toContain("from HYD to BOM");
    expect(googleQuery).not.toContain("Hyderabad");
    expect(googleQuery).not.toContain("Mumbai");

    const goibiboItinerary = new URL(
      buildFlightSearchLink(flightSearchProviders[0]!, params),
    ).searchParams.get("itinerary");
    expect(goibiboItinerary).toBe("HYD-BOM-15/10/2026");
  });
});
