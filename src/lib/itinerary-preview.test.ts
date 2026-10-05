import { describe, expect, it } from "bun:test";
import { buildItineraryPresentation, type ItineraryPresentationTemplateId } from "./itinerary-preview";

describe("itinerary presentation preview", () => {
  const itinerary = {
    title: "Bali Escape",
    destination: "Bali",
    travel_start_date: "2026-11-15",
    travel_end_date: "2026-11-22",
    adults: 2,
    children: 1,
    inclusions: ["Breakfast", "Airport transfer"],
    exclusions: ["Flights"],
    cancellation_info: "Free cancellation up to 7 days before departure.",
    terms_conditions: "Prices are valid for 7 days. Full payment is due before departure.",
    days: [
      {
        day_number: 1,
        date: "2026-11-15",
        title: "Arrival",
        description: "Arrival in Bali",
        items: [
          {
            item_type: "ACCOMMODATION",
            title: "Sunset Hotel",
            hotel_name: "Sunset Hotel",
            hotel_city: "Ubud",
            star_category: "4 Star",
            room_type: "Deluxe Room",
            meal_plan: "Breakfast",
            customer_facing_info: "Ocean-view room",
            hotel_description: "Boutique hideaway in the hills.",
            check_in: "2026-11-15",
            check_out: "2026-11-17",
            nights: 2,
            rooms: 1,
            adults: 2,
            children: 1,
            sequence: 1,
          },
          {
            item_type: "FLIGHT",
            title: "Flight",
            flight_airline: "Indigo",
            flight_number: "6E 112",
            departure_city: "Delhi",
            arrival_city: "Bali",
            flight_departure_date: "2026-11-15",
            flight_arrival_date: "2026-11-15",
            flight_departure_time: "18:30",
            flight_arrival_time: "23:15",
            flight_cabin: "Economy",
            baggage_information: "1 checked bag",
            sequence: 2,
          },
        ],
      },
      {
        day_number: 2,
        date: "2026-11-16",
        title: "Ubud exploration",
        description: "Culture and nature",
        items: [],
      },
    ],
  } as const;

  it("builds a customer-facing preview using the selected package and hides internal costing", () => {
    const preview = buildItineraryPresentation({
      itinerary,
      template: "classic",
      packageOptions: [
        {
          id: "pkg-3",
          name: "3 Star",
          description: "Balanced value package",
          pricing: { adult_price: 1200, child_price: 900, final_customer_price: 2100, currency: "INR" },
        },
        {
          id: "pkg-4",
          name: "4 Star",
          description: "Premium stay package",
          pricing: { adult_price: 1800, child_price: 1300, final_customer_price: 3100, currency: "INR" },
        },
      ],
      selectedPackageId: "pkg-4",
      branding: {
        company_name: "SAVR Travels",
        logo_url: "https://example.com/logo.png",
        header_text: "Tailor-made escapes",
        footer_text: "Thank you for choosing SAVR Travels",
        signature_text: "Regards,\nThe SAVR Travels team",
      },
    });

    expect(preview.selectedPackage?.name).toBe("4 Star");
    expect(preview.pricing?.final_customer_price).toBe(3100);
    expect(preview.days[0]?.items.some((item) => item.title === "Sunset Hotel")).toBe(true);
    expect(preview.days[0]?.items.some((item) => item.title === "Flight")).toBe(true);
    expect(preview.summary).toContain("Bali");
    expect(preview.branding.company_name).toBe("SAVR Travels");
    expect(preview.template.id).toBe("classic");
    expect(preview.renderedText).toContain("Terms and Conditions: Prices are valid for 7 days.");
    expect(preview.pages.find((page) => page.title === "Details")?.content.join(" ")).toContain("Terms and Conditions:");
    expect(preview.internalNotes).toBeUndefined();
  });

  it("requires an explicit selected package when multiple package options exist", () => {
    expect(() =>
      buildItineraryPresentation({
        itinerary,
        template: "classic",
        packageOptions: [
          { id: "pkg-3", name: "3 Star", description: "Base" },
          { id: "pkg-5", name: "5 Star", description: "Luxury" },
        ],
      }),
    ).toThrow("multiple package options");
  });

  it("marks accommodation without stay dates as an overall hotel booking", () => {
    const preview = buildItineraryPresentation({
      itinerary: {
        ...itinerary,
        days: [{
          ...itinerary.days[0],
          items: [{
            item_type: "ACCOMMODATION",
            title: "Coastal Retreat",
            hotel_name: "Coastal Retreat",
            hotel_city: "Goa",
            star_category: "5 Star",
            room_type: "Suite",
            meal_plan: "Breakfast",
          }],
        }],
      },
    });

    expect(preview.days[0]?.items[0]?.hotel_booking_scope).toBe("overall");
  });

  it("keeps dated overall hotel bookings in the overall summary", () => {
    const preview = buildItineraryPresentation({
      itinerary: {
        ...itinerary,
        days: [{
          ...itinerary.days[0],
          items: [{
            item_type: "ACCOMMODATION",
            title: "Coastal Retreat",
            hotel_name: "Coastal Retreat",
            check_in: "2026-11-16",
            check_out: "2026-11-19",
            metadata: {
              overall_hotel_booking: true,
              room_details: [{
                room_type: "Standard",
                adults: 2,
                kids: 0,
                breakfast: true,
                lunch: false,
                dinner: false,
                room_rate_per_night: 499.99,
                currency: "INR",
                free_cancellation_date: "2026-11-10",
              }],
            },
          }],
        }],
      },
    });

    expect(preview.days[0]?.items[0]?.hotel_booking_scope).toBe("overall");
    expect(preview.days[0]?.items[0]?.details).toContain("Stay dates: 2026-11-16 → 2026-11-19");
    expect(preview.days[0]?.items[0]?.details).toContain(
      "Room 1: Standard · 2 adults · 0 kids · Breakfast · Free cancellation until 2026-11-10",
    );
    expect(preview.days[0]?.items[0]?.details?.join(" ")).not.toContain("499.99");
  });

  it("keeps the underlying itinerary data unchanged when switching templates", () => {
    const before = JSON.stringify(itinerary);
    const preview = buildItineraryPresentation({
      itinerary,
      template: "luxury",
      packageOptions: [{ id: "pkg-3", name: "3 Star", pricing: { final_customer_price: 2000 } }],
      selectedPackageId: "pkg-3",
    });

    expect(JSON.stringify(itinerary)).toBe(before);
    expect(preview.template.id).toBe("luxury");
    expect(preview.selectedPackage?.name).toBe("3 Star");
  });

  it("renders a pricing section without exposing internal cost fields", () => {
    const preview = buildItineraryPresentation({
      itinerary,
      template: "modern",
      packageOptions: [{ id: "pkg-3", name: "3 Star", pricing: { adult_price: 1500, child_price: 1000, final_customer_price: 2500, tax: 200 } }],
      selectedPackageId: "pkg-3",
    });

    expect(preview.pricing?.final_customer_price).toBe(2500);
    expect(preview.pricing?.tax).toBe(200);
    expect(preview.renderedText).not.toContain("internal_cost");
    expect(preview.renderedText).not.toContain("supplier_cost");
    expect(preview.renderedText).not.toContain("margin");
  });

  it("surfaces structured hotel, flight, visa, notes, photos, and custom tables without leaking internal data", () => {
    const preview = buildItineraryPresentation({
      itinerary: {
        ...itinerary,
        notes: "Keep the schedule light on arrival.",
        custom_tables: [{ title: "Arrival checklist", columns: ["Item", "Value"], rows: [["Pickup", "Airport terminal 2"]] }],
        photos: [{ url: "https://example.com/itinerary-hero.jpg", caption: "Arrival view", alt_text: "Arrival view", sequence: 1 }],
        days: [
          {
            ...itinerary.days[0],
            notes: "Welcome dinner at sunset.",
            photos: [{ url: "https://example.com/day-1.jpg", caption: "Day 1", alt_text: "Day 1", sequence: 1 }],
            items: [
              {
                item_type: "ACCOMMODATION",
                title: "Sunset Hotel",
                hotel_name: "Sunset Hotel",
                hotel_city: "Ubud",
                hotel_address: "Jalan Raya, Ubud",
                hotel_country: "Indonesia",
                star_category: "4 Star",
                room_type: "Deluxe Room",
                meal_plan: "Breakfast",
                check_in: "2026-11-15",
                check_out: "2026-11-17",
                nights: 2,
                rooms: 1,
                adults: 2,
                children: 1,
                customer_facing_info: "Ocean-view room",
                image_url: "https://example.com/google-hotel-photo.jpg",
                image_credit: "Google photographer",
                metadata: { custom_hotel_photo_url: "" },
                notes: "Quiet room away from the lobby.",
                sequence: 1,
              },
              {
                item_type: "FLIGHT",
                title: "Flight",
                flight_airline: "Indigo",
                flight_number: "6E 112",
                departure_city: "Delhi",
                arrival_city: "Bali",
                flight_cabin: "Economy",
                baggage_information: "1 checked bag",
                sequence: 2,
              },
              {
                item_type: "VISA",
                title: "Visa support",
                visa_country: "Indonesia",
                visa_type: "Tourist Visa",
                visa_customer_information: "Visa on arrival eligible for eligible passport holders.",
                sequence: 3,
              },
            ],
          },
        ],
      },
      template: "classic",
      packageOptions: [{ id: "pkg-3", name: "3 Star", pricing: { final_customer_price: 2100, currency: "INR" } }],
      selectedPackageId: "pkg-3",
      branding: { company_name: "SAVR Travels", header_text: "Tailor-made escapes", footer_text: "Thank you for choosing SAVR Travels", signature_text: "Regards,\nThe SAVR Travels team" },
    });

    expect(preview.days[0]?.items.some((item) => item.title === "Sunset Hotel")).toBe(true);
    expect(preview.days[0]?.items.some((item) => item.details?.some((detail) => detail.includes("Ubud")))).toBe(true);
    expect(preview.days[0]?.items.find((item) => item.title === "Sunset Hotel")?.image_url).toBe("https://example.com/google-hotel-photo.jpg");
    expect(preview.renderedText).toContain("Sunset Hotel");
    expect(preview.renderedText).toContain("Indigo");
    expect(preview.renderedText).toContain("Indonesia");
    expect(preview.customTables[0]?.title).toBe("Arrival checklist");
    expect(preview.photos[0]?.url).toContain("itinerary-hero");
    expect(preview.renderedText).not.toContain("internal_cost");
    expect(preview.renderedText).not.toContain("supplier_cost");
    expect(preview.renderedText).not.toContain("database_id");
  });

  it("filters package-specific hotel or content while keeping shared itinerary content visible", () => {
    const preview = buildItineraryPresentation({
      itinerary: {
        ...itinerary,
        days: [
          {
            ...itinerary.days[0],
            items: [
              { item_type: "ACCOMMODATION", title: "Shared stay", hotel_name: "Shared Resort", hotel_city: "Bali", customer_facing_info: "Base plan", sequence: 1 },
              { item_type: "ACCOMMODATION", title: "Luxury room", hotel_name: "Luxury Resort", hotel_city: "Bali", package_id: "pkg-4", hotel_option_group: "stay", hotel_option_label: "4 Star", customer_facing_info: "Package-only room", sequence: 2 },
              { item_type: "NOTE", title: "Shared note", description: "General note for all packages", sequence: 3 },
            ],
          },
        ],
      },
      template: "modern",
      packageOptions: [
        { id: "pkg-3", name: "3 Star", description: "Balanced package", pricing: { final_customer_price: 2100, currency: "INR" } },
        { id: "pkg-4", name: "4 Star", description: "Premium package", pricing: { final_customer_price: 3100, currency: "INR" } },
      ],
      selectedPackageId: "pkg-4",
    });

    expect(preview.days[0]?.items.some((item) => item.title === "Shared stay")).toBe(true);
    expect(preview.days[0]?.items.some((item) => item.title === "Luxury room")).toBe(true);
    expect(preview.days[0]?.items.some((item) => item.title === "Shared note")).toBe(true);
    expect(preview.days[0]?.items.some((item) => item.title === "Package-only room" || item.title === "Luxury resort")).toBe(false);
  });

  it("rejects preview generation for invalid itinerary state and does not auto-pick a cheapest package", () => {
    expect(() => buildItineraryPresentation({
      itinerary: {
        title: "",
        destination: "",
        travel_start_date: "",
        travel_end_date: "",
        adults: 0,
        children: 0,
        days: [],
      },
      packageOptions: [
        { id: "cheap", name: "Cheapest", pricing: { final_customer_price: 1500 } },
        { id: "premium", name: "Premium", pricing: { final_customer_price: 3000 } },
      ],
      selectedPackageId: null,
    })).toThrow("valid itinerary");

    const preview = buildItineraryPresentation({
      itinerary,
      template: "classic",
      packageOptions: [
        { id: "cheap", name: "Cheapest", pricing: { final_customer_price: 1500 } },
        { id: "premium", name: "Premium", pricing: { final_customer_price: 3000 } },
      ],
      selectedPackageId: "premium",
    });

    expect(preview.selectedPackage?.name).toBe("Premium");
    expect(preview.selectedPackage?.name).not.toBe("Cheapest");
  });
});
