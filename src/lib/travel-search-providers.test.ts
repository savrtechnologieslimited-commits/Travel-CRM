import { describe, expect, test } from "bun:test";
import {
  buildFlightSearchLink,
  buildMakeMyTripHotelSearchLink,
  buildTravelSearchProvider,
  buildTravelSearchUrl,
  buildTrainSearchLink,
  flightSearchProviders,
  generateFlightSearchQuery,
  generateHotelSearchQuery,
  getTravelSearchConfigMessage,
  getTrainSearchValidationError,
  resolveTravelSearchProvider,
  trainSearchProviders,
} from "./travel-search-providers";
import { TRAIN_STATIONS } from "./train-stations";

describe("travel research providers", () => {
  test("builds a MakeMyTrip hotel results link for a specific hotel and stay", () => {
    const link = buildMakeMyTripHotelSearchLink({
      hotelName: "Marasa Sarovar Premiere Hotel",
      city: "Bodhgaya",
      checkIn: "2026-10-16",
      checkOut: "2026-10-18",
      adults: 2,
      children: 0,
      rooms: 1,
    });

    expect(link).not.toBeNull();
    const url = new URL(link!);
    expect(url.pathname).toBe("/hotels/hotel-listing/");
    expect(url.searchParams.get("searchText")).toBe("Marasa Sarovar Premiere Hotel, Bodhgaya");
    expect(url.searchParams.get("checkin")).toBe("20261016");
    expect(url.searchParams.get("checkout")).toBe("20261018");
    expect(url.searchParams.get("roomStayQualifier")).toBe("2e0e");
  });

  test("does not build a category-only MakeMyTrip hotel link", () => {
    expect(buildMakeMyTripHotelSearchLink({})).toBeNull();
  });

  test("hotel search fields pre-populate correctly", () => {
    const query = generateHotelSearchQuery({
      destination: "Dubai",
      checkIn: "2026-10-10",
      checkOut: "2026-10-14",
      adults: 2,
      children: 1,
      rooms: 2,
    });

    expect(query).toContain("Dubai hotels");
    expect(query).toContain("10 Oct 2026");
    expect(query).toContain("2 adults");
    expect(query).toContain("1 child");
  });

  test("hotel search fields remain editable", () => {
    const query = generateHotelSearchQuery({
      destination: "Dubai",
      checkIn: "2026-10-10",
      checkOut: "2026-10-14",
      adults: "3",
      children: "2",
      rooms: "1",
    });

    expect(query).toContain("3 adults");
    expect(query).toContain("2 children");
    expect(query).toContain("1 room");
  });

  test("flight search fields pre-populate correctly", () => {
    const query = generateFlightSearchQuery({
      from: "Hyderabad",
      to: "Dubai",
      departure: "2026-10-10",
      returnDate: "2026-10-14",
      adults: 2,
      children: 1,
      infants: 0,
      cabin: "Economy",
    });

    expect(query).toContain("Hyderabad to Dubai flights");
    expect(query).toContain("10 Oct 2026");
    expect(query).toContain("2 adults");
    expect(query).toContain("economy");
  });

  test("flight search fields remain editable", () => {
    const query = generateFlightSearchQuery({
      from: "Hyderabad",
      to: "Dubai",
      departure: "2026-10-10",
      returnDate: "2026-10-14",
      adults: "2",
      children: "1",
      infants: "1",
      cabin: "Business",
    });

    expect(query).toContain("2 adults");
    expect(query).toContain("1 child");
    expect(query).toContain("1 infant");
    expect(query).toContain("business");
  });

  test("hotel search URL/query is generated correctly", () => {
    const actions = buildTravelSearchUrl("hotel", {
      destination: "Dubai",
      checkIn: "2026-10-10",
      checkOut: "2026-10-14",
      adults: 2,
      children: 0,
      rooms: 1,
    }, { hotel: "https://www.goibibo.com/hotels/" });

    expect(actions).toBe("https://www.goibibo.com/hotels/");
    const query = generateHotelSearchQuery({
      destination: "Dubai",
      checkIn: "2026-10-10",
      checkOut: "2026-10-14",
      adults: 2,
      children: 0,
      rooms: 1,
    });
    expect(query).toContain("Dubai hotels");
    expect(query).toContain("2 adults");
  });

  test("flight search URL/query is generated correctly", () => {
    const actions = buildTravelSearchUrl("flight", {
      from: "Hyderabad",
      to: "Dubai",
      departure: "2026-10-10",
      returnDate: "2026-10-14",
      adults: 2,
      children: 0,
      infants: 0,
      cabin: "Economy",
      tripType: "Round trip",
    }, { flight: "https://www.goibibo.com/flights/" });

    const parsedUrl = new URL(actions!);
    expect(parsedUrl.pathname).toBe("/flight/search");
    expect(parsedUrl.searchParams.get("itinerary")).toBe("HYD-DXB-10/10/2026_DXB-HYD-14/10/2026");
    expect(parsedUrl.searchParams.get("tripType")).toBe("R");
    expect(parsedUrl.searchParams.get("paxType")).toBe("A-2_C-0_I-0");
    expect(parsedUrl.searchParams.get("intl")).toBe("true");
    expect(parsedUrl.searchParams.get("cabinClass")).toBe("E");

    const query = generateFlightSearchQuery({
      from: "Hyderabad",
      to: "Dubai",
      departure: "2026-10-10",
      returnDate: "2026-10-14",
      adults: 2,
      children: 0,
      infants: 0,
      cabin: "Economy",
    });
    expect(query).toContain("Hyderabad to Dubai flights");
    expect(query).toContain("economy");
  });

  test("flight deep link resolves Kerala to Kochi", () => {
    const url = buildTravelSearchUrl("flight", {
      from: "Hyderabad",
      to: "Kerala",
      departure: "2026-09-22",
      returnDate: "2026-09-23",
      adults: 2,
      children: 0,
      infants: 0,
      cabin: "Economy",
      tripType: "Round trip",
    }, { flight: "https://www.goibibo.com/flights/" });

    expect(new URL(url!).searchParams.get("itinerary")).toBe("HYD-COK-22/09/2026_COK-HYD-23/09/2026");
  });

  test("configured provider is used", () => {
    const provider = resolveTravelSearchProvider("flight", { flight: "https://www.goibibo.com/flights/" });
    expect(provider?.url).toBe("https://www.goibibo.com/flights/");

    const instance = buildTravelSearchProvider("flight", "https://www.goibibo.com/flights/");
    expect(instance?.label).toBe("Flight search");
  });

  test("flight search providers generate external search links without API usage", () => {
    const params = {
      from: "HYD",
      to: "AMD",
      departure: "2026-09-30",
      adults: 2,
      children: 0,
      infants: 0,
      cabin: "Economy",
      tripType: "one-way",
      currency: "INR",
    };

    const goibibo = buildFlightSearchLink(flightSearchProviders[0], params);
    expect(goibibo).toContain("https://www.goibibo.com/flight/search");
    expect(goibibo).toContain("itinerary=HYD-AMD-30%2F09%2F2026");
    expect(goibibo).toContain("paxType=A-2_C-0_I-0");
    expect(goibibo).toContain("intl=false");
    expect(goibibo).toContain("cabinClass=E");

    const mmT = buildFlightSearchLink(flightSearchProviders[1], params);
    expect(mmT).toContain("https://www.makemytrip.com/flight/search");
    expect(mmT).toContain("itinerary=HYD-AMD-30%2F09%2F2026");
    expect(mmT).toContain("paxType=A-2_C-0_I-0");

    const google = buildFlightSearchLink(flightSearchProviders[2], params);
    const googleUrl = new URL(google);
    expect(googleUrl.origin + googleUrl.pathname).toBe("https://www.google.com/travel/flights");
    expect(googleUrl.searchParams.get("q")).toContain("Flights from HYD to AMD on 2026-09-30");
    expect(googleUrl.searchParams.get("q")).toContain("one way");
    expect(googleUrl.searchParams.get("q")).toContain("2 adults");
    expect(googleUrl.searchParams.get("q")).toContain("economy");
    expect(googleUrl.searchParams.get("curr")).toBe("INR");

    const googleRoundTrip = buildFlightSearchLink(flightSearchProviders[2], {
      ...params,
      returnDate: "2026-10-04",
      tripType: "round-trip",
    });
    const googleRoundTripUrl = new URL(googleRoundTrip);
    expect(googleRoundTripUrl.searchParams.get("q")).toContain("Flights from HYD to AMD on 2026-09-30 return 2026-10-04");
    expect(googleRoundTripUrl.searchParams.get("q")).not.toContain("one way");
  });

  test("builds the expected Goibibo station search URL", () => {
    const from = TRAIN_STATIONS.find((station) => station.code === "SC")!;
    const to = TRAIN_STATIONS.find((station) => station.code === "ADI")!;
    expect(buildTrainSearchLink(trainSearchProviders[0]!, { from, to, departure: "2026-09-28" }))
      .toBe("https://www.goibibo.com/trains/dsrp/SC/ADI/20260928/");
  });

  test("includes the complete bundled station directory with required station codes", () => {
    expect(TRAIN_STATIONS.length).toBeGreaterThanOrEqual(13_000);
    expect(TRAIN_STATIONS.find((station) => station.code === "SC")).toMatchObject({ city: "Hyderabad" });
    expect(TRAIN_STATIONS.find((station) => station.code === "ADI")).toMatchObject({ city: "Ahmedabad" });
    expect(TRAIN_STATIONS.find((station) => station.code === "NDLS")).toMatchObject({ city: "New Delhi" });
    expect(TRAIN_STATIONS.find((station) => station.code === "CNB")).toMatchObject({ city: "Kanpur" });
  });

  test("builds the expected MakeMyTrip station search URL with encoded cities and blank class", () => {
    const from = TRAIN_STATIONS.find((station) => station.code === "NDLS")!;
    const to = TRAIN_STATIONS.find((station) => station.code === "CNB")!;
    expect(buildTrainSearchLink(trainSearchProviders[1]!, { from, to, departure: "2026-09-29", travelClass: "Sleeper Class" }))
      .toBe("https://www.makemytrip.com/railways/listing?date=20260929&srcStn=NDLS&srcCity=New%20Delhi&destStn=CNB&destCity=Kanpur&classCode=");
  });

  test("updates both train provider URLs when route or date changes", () => {
    const secunderabad = TRAIN_STATIONS.find((station) => station.code === "SC")!;
    const ahmedabad = TRAIN_STATIONS.find((station) => station.code === "ADI")!;
    const newDelhi = TRAIN_STATIONS.find((station) => station.code === "NDLS")!;
    const kanpur = TRAIN_STATIONS.find((station) => station.code === "CNB")!;

    expect(buildTrainSearchLink(trainSearchProviders[0]!, { from: secunderabad, to: ahmedabad, departure: "2026-09-28" }))
      .toContain("/SC/ADI/20260928/");
    expect(buildTrainSearchLink(trainSearchProviders[1]!, { from: newDelhi, to: kanpur, departure: "2026-09-29" }))
      .toContain("date=20260929&srcStn=NDLS");
  });

  test("validates train stations, distinct routes, and journey dates without API access", () => {
    const from = TRAIN_STATIONS.find((station) => station.code === "SC")!;
    const to = TRAIN_STATIONS.find((station) => station.code === "ADI")!;
    expect(getTrainSearchValidationError(null, to, "2026-09-28")).toBe("Select a valid From Station.");
    expect(getTrainSearchValidationError(from, from, "2026-09-28")).toBe("From and To stations must be different.");
    expect(getTrainSearchValidationError(from, to, "")).toBe("Select a valid Journey Date.");
    expect(getTrainSearchValidationError(from, to, "2026-02-31")).toBe("Select a valid Journey Date.");
    expect(getTrainSearchValidationError(from, to, "2026-09-28")).toBeNull();
  });

  test("unconfigured provider gives a clear configuration message", () => {
    expect(getTravelSearchConfigMessage("hotel")).toContain("VITE_TRAVEL_HOTEL_SEARCH_URL");
    expect(getTravelSearchConfigMessage("flight")).toContain("VITE_TRAVEL_FLIGHT_SEARCH_URL");
  });
});
