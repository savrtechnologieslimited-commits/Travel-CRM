import { describe, expect, test } from "bun:test";
import { extractSelectedFlight } from "./extract-flight.js";

function makeLeg({ type, date, arrivalDate = "Monday, November 2", departure, arrival, from, to, airline, cabin = "Economy", flightNumber, duration }) {
  const label = `Flight details. ${type} flight on ${date}. Leaves ${from} at ${departure} and arrives at ${to} at ${arrival}.`;
  const timeLabels = [
    { getAttribute: () => `Departure time: ${departure}.` },
    { getAttribute: () => `Arrival time: ${arrival} on ${arrivalDate}.` },
  ];
  const card = {
    innerText: `${date}\n${departure} Rajiv Gandhi International Airport (${from})\nTravel time: ${duration}\n${arrival} Indira Gandhi International Airport (${to})\n${airline}\n${cabin}\nAirbus A320neo${flightNumber}`,
    querySelectorAll: () => timeLabels,
  };
  return {
    getAttribute: (name) => name === "aria-label" ? label : "true",
    closest: (selector) => selector === '[role="listitem"]' ? card : null,
    click: () => {},
  };
}

function makePage({ legs, trackLabel, price, currency = "INR" }) {
  const detailButtons = legs.map((leg) => makeLeg(leg));
  const document = {
    querySelectorAll: () => detailButtons,
    querySelector: () => ({ getAttribute: () => trackLabel }),
    body: { innerText: `Selected flights\n₹${price.toLocaleString("en-IN")}\nLowest total price` },
  };
  const location = {
    hostname: "www.google.com",
    pathname: "/travel/flights/booking",
    href: `https://www.google.com/travel/flights/booking?curr=${currency}`,
  };
  return { document, location };
}

describe("Google Flights browser import", () => {
  test("reads a selected one-way itinerary without manual field entry", async () => {
    const result = await extractSelectedFlight(makePage({
      trackLabel: "Track prices for selected flights from Hyderabad to New Delhi departing 2026-11-01",
      price: 19640,
      legs: [{
        type: "Departing",
        date: "Sunday, November 1",
        departure: "10:30 PM",
        arrival: "12:45 AM",
        from: "HYD",
        to: "DEL",
        airline: "Air India",
        flightNumber: "AI 2550",
        duration: "2 hr 15 min",
      }],
    }));

    expect(result.ok).toBe(true);
    expect(result.offer).toMatchObject({
      airline: "Air India",
      flight_number: "AI2550",
      from: "HYD",
      to: "DEL",
      departure_at: "2026-11-01T22:30",
      arrival_at: "2026-11-02T00:45",
      duration: "2h 15m",
      stops: 0,
      price: 19640,
      currency: "INR",
      cabin: "Economy",
    });
  });

  test("reads both selected legs and the round-trip total", async () => {
    const result = await extractSelectedFlight(makePage({
      trackLabel: "Track prices for selected flights from Hyderabad to New Delhi departing 2026-11-01 and returning 2026-11-08",
      price: 38026,
      legs: [
        {
          type: "Return",
          date: "Sunday, November 8",
          arrivalDate: "Sunday, November 8",
          departure: "8:35 AM",
          arrival: "10:55 AM",
          from: "DEL",
          to: "HYD",
          airline: "Air India",
          flightNumber: "AI 2551",
          duration: "2 hr 20 min",
        },
        {
          type: "Departing",
          date: "Sunday, November 1",
          departure: "10:30 PM",
          arrival: "12:45 AM",
          from: "HYD",
          to: "DEL",
          airline: "Air India",
          flightNumber: "AI 2550",
          duration: "2 hr 15 min",
        },
      ],
    }));

    expect(result.ok).toBe(true);
    expect(result.offer).toMatchObject({
      from: "HYD",
      to: "DEL",
      price: 38026,
      return_from: "DEL",
      return_to: "HYD",
      return_departure_at: "2026-11-08T08:35",
      return_arrival_at: "2026-11-08T10:55",
      return_airline: "Air India",
      return_flight_number: "AI2551",
    });
  });

  test("refuses to import before Google shows the selected itinerary", async () => {
    const result = await extractSelectedFlight({
      document: {
        querySelectorAll: () => [],
        querySelector: () => null,
        body: { innerText: "Search results" },
      },
      location: {
        hostname: "www.google.com",
        pathname: "/travel/flights",
        href: "https://www.google.com/travel/flights",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Select a flight");
  });
});
