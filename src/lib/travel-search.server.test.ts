import { describe, expect, test } from "bun:test";
import { normalizeAmadeusFlightOffers, normalizeDuffelFlightOffers, searchDuffelFlightOffers } from "./travel-search.server";

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
});
