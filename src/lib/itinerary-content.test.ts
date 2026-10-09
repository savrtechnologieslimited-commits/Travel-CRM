import { describe, expect, test } from "bun:test";
import {
  normalizeItineraryItem,
  normalizeItineraryPhoto,
  reorderItineraryItems,
  reorderItineraryPhotos,
  validateAccommodationItem,
  validateExtraTransportItem,
  validateFlightItem,
  validateItineraryDayItem,
  validateItineraryPhoto,
  validateItineraryTable,
  validateVisaItem,
} from "./itinerary-content";

describe("itinerary content editor", () => {
  test("creates a valid itinerary content item", () => {
    const item = normalizeItineraryItem({
      itinerary_day_id: "11111111-1111-4111-8111-111111111111",
      item_type: "ACTIVITY",
      title: "Tea plantation walk",
      description: "Guided visit to the tea gardens.",
      sequence: 1,
      location: "Munnar",
      duration: "90 mins",
      notes: "Wear comfortable shoes.",
    });

    expect(item.item_type).toBe("ACTIVITY");
    expect(item.sequence).toBe(1);
    expect(item.title).toBe("Tea plantation walk");
  });

  test("reorders itinerary items deterministically", () => {
    const ordered = reorderItineraryItems([
      {
        id: "item-2",
        itinerary_day_id: "day-1",
        item_type: "NOTE",
        title: "Second",
        description: "",
        sequence: 2,
      },
      {
        id: "item-1",
        itinerary_day_id: "day-1",
        item_type: "ACTIVITY",
        title: "First",
        description: "",
        sequence: 1,
      },
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["item-1", "item-2"]);
  });

  test("rejects invalid day references", () => {
    expect(() =>
      validateItineraryDayItem({
        itinerary_day_id: "not-a-uuid",
        item_type: "ACTIVITY",
        title: "Garden walk",
        description: "",
        sequence: 1,
      }),
    ).toThrow("Itinerary day reference");
  });

  test("allows an incomplete flight when saving a draft", () => {
    const flight = {
      itinerary_day_id: "11111111-1111-4111-8111-111111111111",
      item_type: "FLIGHT" as const,
      title: "Flight",
      description: "",
      sequence: 1,
    };

    expect(() => validateItineraryDayItem(flight)).toThrow("Airline is required");
    expect(validateItineraryDayItem(flight, { allowIncomplete: true })).toMatchObject({
      item_type: "FLIGHT",
      title: "Flight",
    });
  });

  test("validates custom table structure", () => {
    const table = validateItineraryTable({
      title: "Driver contact",
      columns: ["Name", "Phone"],
      rows: [["Driver", "9999999999"]],
    });

    expect(table.columns).toEqual(["Name", "Phone"]);
    expect(table.rows).toHaveLength(1);
  });

  test("supports itinerary, day, and content-item photo scopes", () => {
    const itineraryId = "11111111-1111-4111-8111-111111111111";
    const dayId = "22222222-2222-4222-8222-222222222222";
    const itemId = "33333333-3333-4333-8333-333333333333";

    expect(
      validateItineraryPhoto({
        itinerary_id: itineraryId,
        url: "https://example.com/trip.jpg",
        sequence: 1,
      }),
    ).toMatchObject({ itinerary_id: itineraryId, day_id: null, day_item_id: null });
    expect(
      validateItineraryPhoto({
        itinerary_id: itineraryId,
        day_id: dayId,
        url: "https://example.com/day.jpg",
        sequence: 1,
      }),
    ).toMatchObject({ day_id: dayId, day_item_id: null });
    expect(
      validateItineraryPhoto({
        itinerary_id: itineraryId,
        day_item_id: itemId,
        url: "https://example.com/item.jpg",
        sequence: 1,
      }),
    ).toMatchObject({ day_id: null, day_item_id: itemId });
    expect(
      validateItineraryPhoto({
        itinerary_id: itineraryId,
        day_item_id: itemId,
        storage_path: "activity-photo-library/place/photo.jpg",
        sequence: 1,
      }),
    ).toMatchObject({
      url: "",
      storage_path: "activity-photo-library/place/photo.jpg",
      day_item_id: itemId,
    });
  });

  test("preserves photo source and attribution metadata when normalizing", () => {
    const attribution = [
      {
        displayName: "Photographer",
        uri: "https://example.com/profile",
        photoUri: "https://example.com/photo",
      },
    ];
    const photo = validateItineraryPhoto({
      itinerary_id: "11111111-1111-4111-8111-111111111111",
      url: "https://example.com/trip.jpg",
      source: "google_places",
      selection_type: "hotel",
      is_primary: true,
      google_place_id: "place-1",
      place_name: "Example Hotel",
      google_photo_reference: "photo-1",
      attribution,
      sequence: 1,
    });

    expect(photo).toMatchObject({
      source: "google_places",
      selection_type: "hotel",
      is_primary: true,
      google_place_id: "place-1",
      place_name: "Example Hotel",
      google_photo_reference: "photo-1",
      attribution,
    });
  });

  test("reorders photos deterministically and preserves CRUD identifiers", () => {
    const photos = reorderItineraryPhotos([
      { id: "22222222-2222-4222-8222-222222222222", sequence: 2 },
      { id: "11111111-1111-4111-8111-111111111111", sequence: 1 },
    ]);

    expect(photos.map((photo) => photo.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(
      normalizeItineraryPhoto({
        id: "11111111-1111-4111-8111-111111111111",
        itinerary_id: "11111111-1111-4111-8111-111111111111",
        url: "https://example.com/a.jpg",
        caption: "Updated",
        alt_text: "Updated alt",
        sequence: 2,
      }).id,
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("rejects invalid photo references and malformed photo data", () => {
    expect(() =>
      validateItineraryPhoto({
        itinerary_id: "not-a-uuid",
        url: "https://example.com/a.jpg",
        sequence: 1,
      }),
    ).toThrow("Itinerary reference");
    expect(() =>
      validateItineraryPhoto({
        itinerary_id: "11111111-1111-4111-8111-111111111111",
        day_id: "not-a-uuid",
        url: "https://example.com/a.jpg",
        sequence: 1,
      }),
    ).toThrow("Day reference");
    expect(() =>
      validateItineraryPhoto({
        itinerary_id: "11111111-1111-4111-8111-111111111111",
        url: "",
        sequence: 1,
      }),
    ).toThrow("Photo URL");
  });

  test("validates a structured accommodation and derives consistent nights", () => {
    const hotel = validateAccommodationItem({
      item_type: "ACCOMMODATION",
      hotel_name: "Green Valley Hotel",
      hotel_city: "Munnar",
      star_category: "3 Star",
      check_in: "2026-10-10",
      check_out: "2026-10-12",
      nights: 2,
      room_type: "Deluxe",
      rooms: 1,
      adults: 2,
      children: 1,
      extra_beds: 0,
      meal_plan: "Breakfast",
      hotel_option_group: "main-stay",
      hotel_option_label: "3-star option",
      hotel_option_sequence: 1,
    });

    expect(hotel.hotel_name).toBe("Green Valley Hotel");
    expect(hotel.nights).toBe(2);
    expect(hotel.meal_plan).toBe("Breakfast");
  });

  test("rejects invalid accommodation fields and dates", () => {
    expect(() =>
      validateAccommodationItem({
        item_type: "ACCOMMODATION",
        check_in: "2026-10-12",
        check_out: "2026-10-10",
        hotel_name: "Hotel",
      }),
    ).toThrow("check-out");
    expect(() =>
      validateAccommodationItem({
        item_type: "ACCOMMODATION",
        check_in: "2026-10-10",
        check_out: "2026-10-10",
        hotel_name: "Hotel",
      }),
    ).toThrow("after check-in");
    expect(() =>
      validateAccommodationItem({
        item_type: "ACCOMMODATION",
        hotel_name: "Hotel",
        check_in: "2026-10-10",
        check_out: "2026-10-12",
        nights: 1,
      }),
    ).toThrow("nights");
    expect(() =>
      validateAccommodationItem({ item_type: "ACCOMMODATION", rooms: 0, hotel_name: "Hotel" }),
    ).toThrow("rooms");
    expect(() =>
      validateAccommodationItem({ item_type: "ACCOMMODATION", adults: -1, hotel_name: "Hotel" }),
    ).toThrow("adults");
    expect(() =>
      validateAccommodationItem({
        item_type: "ACCOMMODATION",
        meal_plan: "Dinner",
        hotel_name: "Hotel",
      }),
    ).toThrow("meal plan");
    expect(() => validateAccommodationItem({ item_type: "ACCOMMODATION", hotel_name: "" })).toThrow(
      "Hotel name",
    );
  });

  test("supports independently ordered hotel options", () => {
    const options = reorderItineraryItems([
      {
        id: "option-b",
        item_type: "ACCOMMODATION",
        title: "4-star",
        sequence: 2,
        hotel_option_group: "stay",
        hotel_option_sequence: 2,
      },
      {
        id: "option-a",
        item_type: "ACCOMMODATION",
        title: "3-star",
        sequence: 1,
        hotel_option_group: "stay",
        hotel_option_sequence: 1,
      },
    ]);

    expect(options.map((option) => option.id)).toEqual(["option-a", "option-b"]);
    expect(options.map((option) => option.hotel_option_group)).toEqual(["stay", "stay"]);
  });

  test("validates multiple flight segments with optional pricing", () => {
    const first = validateFlightItem({
      item_type: "FLIGHT",
      flight_airline: "Example Air",
      departure_city: "Hyderabad",
      arrival_city: "Dubai",
      flight_departure_date: "2026-11-01",
      flight_arrival_date: "2026-11-01",
    });
    const second = validateFlightItem({
      item_type: "FLIGHT",
      flight_airline: "Example Air",
      departure_city: "Dubai",
      arrival_city: "London",
      flight_price: 250,
      flight_currency: "USD",
    });

    expect(first.flight_airline).toBe("Example Air");
    expect(second.flight_price).toBe(250);
    expect(
      reorderItineraryItems([
        { id: "return", item_type: "FLIGHT", title: "Return", sequence: 2 },
        { id: "outbound", item_type: "FLIGHT", title: "Outbound", sequence: 1 },
      ]).map((item) => item.id),
    ).toEqual(["outbound", "return"]);
  });

  test("rejects invalid flight data without requiring airport codes", () => {
    expect(() => validateFlightItem({ item_type: "FLIGHT" })).toThrow("Airline");
    expect(() =>
      validateFlightItem({
        item_type: "FLIGHT",
        flight_airline: "Air",
        flight_departure_date: "2026-11-02",
        flight_departure_time: "10:00",
        flight_arrival_date: "2026-11-01",
        flight_arrival_time: "10:00",
      }),
    ).toThrow("before departure");
    expect(() =>
      validateFlightItem({ item_type: "FLIGHT", flight_airline: "Air", flight_price: -1 }),
    ).toThrow("negative");
    expect(() =>
      validateFlightItem({
        item_type: "FLIGHT",
        flight_airline: "Air",
        flight_price: 10,
        flight_currency: "US",
      }),
    ).toThrow("currency");
  });

  test("validates visa content without inventing eligibility", () => {
    expect(
      validateVisaItem({
        item_type: "VISA",
        visa_country: "United Kingdom",
        visa_type: "Visitor",
        visa_processing_time: "15 days",
      }).visa_country,
    ).toBe("United Kingdom");
    expect(() => validateVisaItem({ item_type: "VISA", visa_type: "Visitor" })).toThrow("country");
    expect(() => validateVisaItem({ item_type: "VISA", visa_country: "United Kingdom" })).toThrow(
      "type",
    );
  });

  test("validates planned extra transport independently from operational services", () => {
    const transport = validateExtraTransportItem({
      item_type: "EXTRA_TRANSPORT",
      extra_transport_type: "Airport Transfer",
      pickup: "Airport",
      dropoff: "Hotel",
      extra_transport_date: "2026-11-01",
      extra_transport_passengers: 3,
    });
    expect(transport.extra_transport_type).toBe("Airport Transfer");
    expect(() =>
      validateExtraTransportItem({
        item_type: "EXTRA_TRANSPORT",
        extra_transport_type: "Airport Transfer",
        pickup: "Airport",
        dropoff: "Hotel",
        extra_transport_passengers: -1,
      }),
    ).toThrow("passengers");
    expect(() =>
      validateExtraTransportItem({
        item_type: "EXTRA_TRANSPORT",
        extra_transport_type: "Airport Transfer",
        pickup: "Airport",
      }),
    ).toThrow("pickup and drop");
  });
});
