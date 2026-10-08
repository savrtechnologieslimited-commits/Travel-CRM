import { describe, expect, test } from "bun:test";
import { parseFlightDetailsFromText } from "./flight-details-import";

describe("free flight detail parsing", () => {
  test("extracts a one-way flight, fare, route, date, and local times", () => {
    const result = parseFlightDetailsFromText(
      "Selected flight: Air India AI 2550 from HYD to DEL\n" +
        "Sunday, November 1, 2026 · 10:30 PM – 12:45 AM · 2 hr 15 min · Non-stop\n" +
        "Economy · Lowest total price ₹19,640",
    );

    expect(result).toMatchObject({
      has_return: false,
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
      baggage_information: null,
    });
  });

  test("uses search dates to resolve Google’s yearless round-trip summary", () => {
    const result = parseFlightDetailsFromText(
      "Departing flight on Sunday, November 1. Air India AI 2550 leaves HYD at 10:30 PM and arrives DEL at 12:45 AM. 2 hr 15 min non-stop.\n" +
        "Return flight on Sunday, November 8. Air India AI 2551 leaves DEL at 8:35 AM and arrives HYD at 10:55 AM. 2 hr 20 min non-stop.\n" +
        "Round trip total ₹38,026 Economy",
      { departureDate: "2026-11-01", returnDate: "2026-11-08" },
    );

    expect(result).toMatchObject({
      has_return: true,
      from: "HYD",
      to: "DEL",
      departure_at: "2026-11-01T22:30",
      arrival_at: "2026-11-02T00:45",
      duration: "2h 15m",
      stops: 0,
      price: 38026,
      return_airline: "Air India",
      return_flight_number: "AI2551",
      return_from: "DEL",
      return_to: "HYD",
      return_departure_at: "2026-11-08T08:35",
      return_arrival_at: "2026-11-08T10:55",
      return_duration: "2h 20m",
      return_stops: 0,
      baggage_information: null,
      return_baggage_information: null,
    });
  });

  test("leaves ambiguous fields blank rather than inventing values", () => {
    const result = parseFlightDetailsFromText("Flights available from Hyderabad to New Delhi");

    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
    expect(result.departure_at).toBeNull();
    expect(result.arrival_at).toBeNull();
    expect(result.price).toBeNull();
    expect(result.stops).toBeNull();
  });

  test("recognizes a fare stated in another supported currency", () => {
    expect(parseFlightDetailsFromText("Selected flight fare USD 1,240").price).toBe(1240);
    expect(parseFlightDetailsFromText("Selected flight fare USD 1,240").currency).toBe("USD");
  });

  test("captures baggage wording only when the source states it", () => {
    const parsed = parseFlightDetailsFromText(
      "Air India AI 2550 from HYD to DEL\nDeparture: 10:30 PM, Arrival: 12:45 AM\nCarry-on bag included · 1 checked bag",
    );
    expect(parsed.baggage_information).toContain("Carry-on bag included");
    expect(parsed.baggage_information).toContain("1 checked bag");
    expect(parsed.return_baggage_information).toBeNull();
  });

  test("uses a known search route and disambiguates numeric dates only from that search", () => {
    const result = parseFlightDetailsFromText(
      "Air India AI 2550 · 01/11/2026 · 10:30 PM to 12:45 AM",
      {
        departureDate: "2026-11-01",
        from: "HYD",
        to: "DEL",
      },
    );

    expect(result).toMatchObject({
      from: "HYD",
      to: "DEL",
      departure_at: "2026-11-01T22:30",
      arrival_at: "2026-11-02T00:45",
    });
    expect(parseFlightDetailsFromText("Depart 03/04/2026 at 10:00 AM").departure_at).toBeNull();
  });

  test("extracts the full connecting itinerary and excludes layover time from flight duration", () => {
    const result = parseFlightDetailsFromText(
      "Departing flightTue, Oct 20\n" +
        "342 kg CO2e\n+130% emissions\n" +
        "7:10 AMRajiv Gandhi International Airport (HYD)\n" +
        "Travel time: 50 min\n" +
        "8:00 AMShri Guru Gobind Singh Ji Airport Nanded (NDC)\n" +
        "Star AirEconomy\nEmbraer 175S5 196\n" +
        "- Emissions estimate: 125 kg CO2e\n" +
        "- Contrail warming potential: Low\n" +
        "30 min layoverNanded (NDC)\n" +
        "8:30 AMShri Guru Gobind Singh Ji Airport Nanded (NDC)\n" +
        "Travel time: 1 hr 30 min\n" +
        "10:00 AMSardar Vallabhbhai Patel International Airport (AMD)\n" +
        "Star AirEconomy\nEmbraer 175S5 218",
      {
        departureDate: "2026-10-20",
        from: "HYD",
        to: "AMD",
      },
    );

    expect(result).toMatchObject({
      from: "HYD",
      to: "AMD",
      airline: "Star Air",
      flight_number: "S5196 / S5218",
      departure_at: "2026-10-20T07:10",
      arrival_at: "2026-10-20T10:00",
      duration: "2h 20m",
      stops: 1,
      stop_details: "1 stop via Nanded (NDC) · 30 min layover",
      cabin: "Economy",
    });
  });

  test("keeps segment duration separate from a long layover and preserves the correct arrival date", () => {
    const result = parseFlightDetailsFromText(
      "Departing flightThu, Oct 15\n" +
        "889 kg CO2e\n+115% emissions\n" +
        "₹38,618\n" +
        "5:50 AMRajiv Gandhi International Airport (HYD)\n" +
        "Travel time: 1 hr 55 min\n" +
        "7:45 AMChhatrapati Shivaji Maharaj International Airport Mumbai (BOM)\n" +
        "Air IndiaEconomyAirbus A320neoAI 2872\n" +
        "3 hr 30 min layoverMumbai (BOM)\n" +
        "11:15 AMChhatrapati Shivaji Maharaj International Airport Mumbai (BOM)\n" +
        "Travel time: 2 hr 20 min\n" +
        "1:35 PMChaudhary Charan Singh International Airport (LKO)\n" +
        "Air IndiaEconomyAirbus A320neoAI 2491\n" +
        "- Below average legroom (28 in)\n" +
        "- Emissions estimate: 535 kg CO2e",
      {
        departureDate: "2026-10-15",
        from: "HYD",
        to: "LKO",
      },
    );

    expect(result).toMatchObject({
      from: "HYD",
      to: "LKO",
      airline: "Air India",
      flight_number: "AI2872 / AI2491",
      departure_at: "2026-10-15T05:50",
      arrival_at: "2026-10-15T13:35",
      duration: "4h 15m",
      stops: 1,
      stop_details: "1 stop via Mumbai (BOM) · 3 hr 30 min layover",
      price: 38618,
      currency: "INR",
    });
  });

  test("lists the location and duration of every stop in a multi-stop itinerary", () => {
    const result = parseFlightDetailsFromText(
      "Departing flight Thu, Oct 15\n" +
        "5:50 AM Rajiv Gandhi International Airport (HYD)\n" +
        "Travel time: 1 hr 55 min\n" +
        "7:45 AM Chhatrapati Shivaji Maharaj International Airport Mumbai (BOM)\n" +
        "Air India Economy AI 2872\n" +
        "3 hr 30 min layoverMumbai (BOM)\n" +
        "11:15 AM Chhatrapati Shivaji Maharaj International Airport Mumbai (BOM)\n" +
        "Travel time: 2 hr 20 min\n" +
        "1:35 PM Indira Gandhi International Airport Delhi (DEL)\n" +
        "Air India Economy AI 2491\n" +
        "1 hr 10 min layoverDelhi (DEL)\n" +
        "2:45 PM Indira Gandhi International Airport Delhi (DEL)\n" +
        "Travel time: 1 hr 30 min\n" +
        "4:15 PM Chaudhary Charan Singh International Airport (LKO)\n" +
        "Air India Economy AI 2683",
      { departureDate: "2026-10-15", from: "HYD", to: "LKO" },
    );

    expect(result).toMatchObject({
      flight_number: "AI2872 / AI2491 / AI2683",
      departure_at: "2026-10-15T05:50",
      arrival_at: "2026-10-15T16:15",
      duration: "5h 45m",
      stops: 2,
      stop_details:
        "2 stops via Mumbai (BOM), Delhi (DEL) · 3 hr 30 min layover · 1 hr 10 min layover",
    });
  });

  test("parses a Goibibo result card with total journey time and a named stop", () => {
    const result = parseFlightDetailsFromText(
      "Thu, 15 Oct 26\nAir India\nAI 2872, AI 2491\n05:50 Hyderabad\n07 h 45 m\n" +
        "1 stop via Mumbai\n13:35 Lucknow\n₹8,289 /adult",
      { from: "HYD", to: "LKO" },
    );

    expect(result).toMatchObject({
      airline: "Air India",
      flight_number: "AI2872 / AI2491",
      from: "HYD",
      to: "LKO",
      departure_at: "2026-10-15T05:50",
      arrival_at: "2026-10-15T13:35",
      duration: "7h 45m",
      stops: 1,
      stop_details: "1 stop via Mumbai",
      price: 8289,
      currency: "INR",
    });
  });

  test("calculates stop duration from expanded segment times when the provider omits it", () => {
    const result = parseFlightDetailsFromText(
      "Air India AI 2872, AI 2491\n" +
        "05:50 Hyderabad (HYD)\n" +
        "Travel time: 1 hr 55 min\n" +
        "07:45 Mumbai (BOM)\n" +
        "11:15 Mumbai (BOM)\n" +
        "Travel time: 2 hr 20 min\n" +
        "13:35 Lucknow (LKO)\n" +
        "1 stop via Mumbai",
      { departureDate: "2026-10-15", from: "HYD", to: "LKO" },
    );

    expect(result.stop_details).toBe("1 stop via Mumbai · 3h 30m layover");
  });

  test("parses a MakeMyTrip non-stop result card", () => {
    const result = parseFlightDetailsFromText(
      "One Way\nFrom Hyderabad, India\nTo Lucknow, India\nDepart Thu, 15 Oct 26\n" +
        "IndiGo\n6E-179\n07:15\n02h 05m\nNon stop\n09:20\nHYD\nLKO\n₹9,861 /adult\nEconomy",
      { from: "HYD", to: "LKO" },
    );

    expect(result).toMatchObject({
      airline: "IndiGo",
      flight_number: "6E179",
      from: "HYD",
      to: "LKO",
      departure_at: "2026-10-15T07:15",
      arrival_at: "2026-10-15T09:20",
      duration: "2h 5m",
      stops: 0,
      stop_details: "Non-stop",
      price: 9861,
      currency: "INR",
      cabin: "Economy",
    });
  });
});
