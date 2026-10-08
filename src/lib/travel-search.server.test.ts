import { describe, expect, test } from "bun:test";
import {
  normalizeAmadeusFlightOffers,
  normalizeDuffelFlightOffers,
  normalizeSearchApiFlightOffers,
  searchDuffelFlightOffers,
  searchSearchApiFlightOffers,
} from "./travel-search.server";

describe("live travel fare normalization", () => {
  test("normalizes Amadeus flight offers without shifting airport-local times", () => {
    const offers = normalizeAmadeusFlightOffers({
      dictionaries: { carriers: { AI: "Air India" } },
      data: [{
        id: "offer-1",
        itineraries: [{
          duration: "PT2H10M",
          segments: [{
            carrierCode: "AI",
            number: "101",
            departure: { iataCode: "HYD", at: "2026-10-01T08:15:00+05:30" },
            arrival: { iataCode: "DEL", at: "2026-10-01T10:25:00+05:30" },
          }],
        }],
        price: { currency: "INR", grandTotal: "8450.00" },
      }],
    });

    expect(offers).toEqual([{
      id: "offer-1",
      airline: "Air India",
      flight_number: "AI101",
      from: "HYD",
      to: "DEL",
      departure_at: "2026-10-01T08:15:00+05:30",
      arrival_at: "2026-10-01T10:25:00+05:30",
      duration: "2h10m",
      stops: 0,
      price: 8450,
      currency: "INR",
    }]);
  });

  test("keeps the inbound leg on a round-trip fare offer", () => {
    const offers = normalizeAmadeusFlightOffers({ data: [{
      id: "round-trip",
      itineraries: [
        { segments: [{ carrierCode: "AI", number: "101", departure: { iataCode: "HYD", at: "2026-10-01T08:00:00+05:30" }, arrival: { iataCode: "DEL", at: "2026-10-01T10:00:00+05:30" } }] },
        { segments: [{ carrierCode: "AI", number: "102", departure: { iataCode: "DEL", at: "2026-10-05T18:00:00+05:30" }, arrival: { iataCode: "HYD", at: "2026-10-05T20:00:00+05:30" } }] },
      ],
      price: { currency: "INR", total: "9000" },
    }] });

    expect(offers[0]).toMatchObject({
      from: "HYD",
      to: "DEL",
      return_from: "DEL",
      return_to: "HYD",
      return_departure_at: "2026-10-05T18:00:00+05:30",
      return_arrival_at: "2026-10-05T20:00:00+05:30",
      return_flight_number: "AI102",
      price: 9000,
    });
  });

  test("keeps flight normalization helpers available without live API access", async () => {
    await expect(searchDuffelFlightOffers({ from: "HYD", to: "DEL", departure: "2026-10-01", adults: 1, children: 0, infants: 0, cabin: "economy" })).rejects.toThrow("disabled");
    expect(normalizeDuffelFlightOffers({ data: [{ id: "duffel-1", offer: { id: "duffel-offer-1", total_amount: "8450", total_currency: "INR" }, itinerary: { slices: [{ segments: [{ marketing_carrier: { name: "Air India" }, flight_number: "AI101", origin: { airport_code: "HYD" }, destination: { airport_code: "DEL" }, departure: "2026-10-01T08:15:00+05:30", arrival: "2026-10-01T10:25:00+05:30" }] }] } }] })).toEqual([{
      id: "duffel-1",
      airline: "Air India",
      flight_number: "AI101",
      from: "HYD",
      to: "DEL",
      departure_at: "2026-10-01T08:15:00+05:30",
      arrival_at: "2026-10-01T10:25:00+05:30",
      duration: "",
      stops: 0,
      price: 8450,
      currency: "INR",
    }]);
  });

  test("normalizes SearchApi Google Flights offers using local airport times", () => {
    const offers = normalizeSearchApiFlightOffers({
      best_flights: [{
        flights: [{
          departure_airport: { id: "HYD", date: "2026-10-01", time: "08:15" },
          arrival_airport: { id: "DEL", date: "2026-10-01", time: "10:25" },
          airline: "Air India",
          flight_number: "AI 101",
          travel_class: "Economy",
        }],
        total_duration: 130,
        layovers: [],
        price: 8450,
      }],
    }, "INR");
    expect(offers[0]).toMatchObject({
      from: "HYD",
      to: "DEL",
      departure_at: "2026-10-01T08:15",
      arrival_at: "2026-10-01T10:25",
      duration: "2h 10m",
      stops: 0,
      price: 8450,
      currency: "INR",
      cabin: "Economy",
    });
  });

  test("requests validated one-way fares from SearchApi and handles quota errors", async () => {
    const input = {
      from: "HYD",
      to: "DEL",
      departure: "2026-10-01",
      adults: 1,
      children: 0,
      infants: 0,
      cabin: "Economy",
      currency: "INR",
      directFlight: true,
    };
    let requestUrl: URL | undefined;
    const offers = await searchSearchApiFlightOffers(input, "server-only-test-key", async (url) => {
      requestUrl = new URL(String(url));
      return new Response(JSON.stringify({
        best_flights: [{
          flights: [{
            departure_airport: { id: "HYD", date: "2026-10-01", time: "08:15" },
            arrival_airport: { id: "DEL", date: "2026-10-01", time: "10:25" },
            airline: "Air India",
            flight_number: "AI 101",
          }],
          price: 8450,
        }],
      }), { status: 200 });
    });
    expect(requestUrl?.searchParams.get("api_key")).toBe("server-only-test-key");
    expect(requestUrl?.searchParams.get("flight_type")).toBe("one_way");
    expect(requestUrl?.searchParams.get("stops")).toBe("nonstop");
    expect(requestUrl?.searchParams.get("no_cache")).toBe("true");
    expect(offers[0]).toMatchObject({ from: "HYD", to: "DEL", price: 8450, currency: "INR" });

    await expect(searchSearchApiFlightOffers({ ...input, departure: "2026-02-31" }, "test-key")).rejects.toThrow("valid date");
    await expect(searchSearchApiFlightOffers(input, "test-key", async () => new Response(null, { status: 429 })))
      .rejects.toThrow("request limit reached");
  });
});
