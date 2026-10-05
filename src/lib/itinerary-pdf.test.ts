import { describe, expect, it } from "bun:test";
import { buildItineraryPdfHtml } from "./itinerary-pdf";

describe("itinerary pdf", () => {
  it("builds a customer-facing printable PDF from the Task 27 presentation model", () => {
    const html = buildItineraryPdfHtml({
      template: { id: "classic", label: "Classic", description: "Traditional editorial itinerary layout" },
      selectedPackage: { id: "pkg-4", name: "4 Star", description: "Premium stay package", pricing: { adult_price: 1800, child_price: 1300, final_customer_price: 3100, tax: 200, currency: "INR" } },
      branding: {
        company_name: "SAVR Travels",
        logo_url: "https://example.com/logo.png",
        header_text: "Tailor-made escapes",
        footer_text: "Thank you for choosing SAVR Travels",
        signature_text: "Regards,\nThe SAVR Travels team",
      },
      summary: "Bali escape",
      trip: { start_date: "2026-11-15", end_date: "2026-11-22", adults: 2, children: 1, guest_name: "A. Customer" },
      inclusions: ["Breakfast"],
      exclusions: ["Flights"],
      cancellation_info: "Cancel 7 days before travel.",
      terms_conditions: "Prices are valid for 7 days.",
      notes: "Keep arrival day relaxed.",
      pricing: {
        adults: 2,
        children: 1,
        adult_price: 1800,
        child_price: 1300,
        subtotal: 3100,
        tax: 200,
        final_customer_price: 3100,
        per_person_price: 1550,
        pricing_mode: "per_person",
        currency: "INR",
      },
      days: [
        {
          day_number: 1,
          date: "2026-11-15",
          title: "Arrival",
          description: "Arrival in Bali",
          notes: "Welcome dinner at sunset.",
          photos: [{ url: "https://example.com/day-1.jpg", caption: "Day 1", alt_text: "Day 1", sequence: 1, source: "GOOGLE_PLACES", place_name: "Galle Face Green", attribution: [{ displayName: "Photo Author", uri: null, photoUri: null }] }],
          items: [
            { title: "Sunset Hotel", item_type: "ACCOMMODATION", details: ["Ubud", "4 Star", "Ocean-view room"] },
            { title: "Coastal Retreat", item_type: "ACCOMMODATION", hotel_booking_scope: "overall", details: ["Goa", "5 Star", "Breakfast"] },
            { title: "Flight", item_type: "FLIGHT", details: ["Indigo 6E 112", "Delhi → Bali"] },
          ],
        },
      ],
      customTables: [{ id: "t-1", title: "Arrival checklist", columns: ["Item", "Value"], rows: [["Pickup", "Airport terminal 2"]] }],
      photos: [{ url: "https://example.com/itinerary-hero.jpg", caption: "Arrival view", alt_text: "Arrival view", sequence: 1 }],
      pages: [
        { title: "Overview", type: "overview", content: ["Bali escape", "Tailor-made escapes"] },
        { title: "Signature", type: "signature", content: ["Regards, The SAVR Travels team"] },
      ],
      renderedText: "Bali escape\nSelected package: 4 Star\nFinal customer price: 3100 INR",
      internalNotes: undefined,
    });

    expect(html).toContain("SAVR Travels");
    expect(html).toContain("Selected package");
    expect(html).toContain("Overall hotel booking");
    const overallSection = html.indexOf("<h2>Overall hotel booking</h2>");
    const firstDaySection = html.indexOf('<section class="day-block">');
    const firstDaySectionEnd = html.indexOf("</section>", firstDaySection);
    expect(overallSection).toBeGreaterThan(-1);
    expect(html.slice(firstDaySection, firstDaySectionEnd)).not.toContain("Coastal Retreat");
    expect(html).toContain("4 Star");
    expect(html).toContain("Final customer price");
    expect(html).toContain("Price per person");
    expect(html).toContain("Sunset Hotel");
    expect(html).toContain("Indigo");
    expect(html).toContain("https://example.com/day-1.jpg");
    expect(html).toContain("Photo Author");
    expect(html).not.toContain("internal_cost");
    expect(html).not.toContain("supplier_cost");
    expect(html).not.toContain("margin");
  });

  it("renders the Travel Package template with accommodation, pricing, and terms sections", () => {
    const html = buildItineraryPdfHtml({
      template: { id: "package", label: "Travel Package", description: "Detailed package itinerary" },
      selectedPackage: { id: "pkg-1", name: "Bangalore Mysore Land Package", description: "3-day package" },
      branding: { company_name: "SAVR Travels", header_text: "Tailor-made travel", footer_text: "Thank you", signature_text: "Regards" },
      summary: "Bangalore Mysore",
      trip: { start_date: "2026-09-30", end_date: "2026-10-03", adults: 3, children: 0, guest_name: "Guest Name" },
      inclusions: ["Accommodation", "Breakfast"],
      exclusions: ["Flights"],
      cancellation_info: "Subject to hotel policy.",
      terms_conditions: "Advance payment confirms booking.",
      notes: "Rooms subject to availability.",
      pricing: null,
      days: [{ day_number: 1, date: "2026-09-30", title: "Arrival in Bangalore", description: "Airport transfer and sightseeing.", notes: "Night stay: Bangalore", photos: [], items: [
        { title: "Townhouse Bommanahalli", item_type: "ACCOMMODATION", details: ["Bangalore", "Stay dates: 2026-09-30 → 2026-10-02", "2 nights", "Standard · Breakfast"] },
        { title: "Coastal Retreat", item_type: "ACCOMMODATION", hotel_booking_scope: "overall", details: ["Goa", "5 Star · Suite · Breakfast", "Guest-facing note"] },
        { title: "Bangalore Palace", item_type: "SIGHTSEEING", details: ["City sightseeing"] },
      ] }],
      customTables: [],
      photos: [],
      pages: [],
      renderedText: "Bangalore Mysore",
      internalNotes: undefined,
    });

    expect(html).toContain("Day-Wise Plan");
    expect(html).toContain("Accommodation");
    expect(html).toContain("Townhouse Bommanahalli");
    expect(html).toContain("OVERALL HOTEL BOOKING");
    expect(html).toContain("Coastal Retreat");
    expect(html).toContain("Pricing Details");
    expect(html).toContain("Quote to be confirmed");
    expect(html).toContain("What's Included &amp; Excluded");
    expect(html).toContain("Cancellation Policy");
    expect(html).toContain("Advance payment confirms booking.");
    expect(html).not.toContain("supplier_cost");
  });

  it("prints the pushed total and per-person amount in the package quote", () => {
    const html = buildItineraryPdfHtml({
      template: { id: "package", label: "Travel Package", description: "Detailed package itinerary" },
      selectedPackage: { id: "pkg-1", name: "Option 1", pricing: { final_customer_price: 57517.5, per_person_price: 19172.5, pricing_mode: "per_person", currency: "INR" } },
      branding: { company_name: "SAVR Travels" }, summary: "Bangalore Mysore",
      trip: { start_date: "2026-09-30", end_date: "2026-10-03", adults: 3, children: 0, guest_name: "" },
      inclusions: [], exclusions: [], cancellation_info: "", terms_conditions: "", notes: "",
      pricing: { adults: 3, children: 0, adult_price: null, child_price: null, subtotal: 57517.5, tax: 0, final_customer_price: 57517.5, per_person_price: 19172.5, pricing_mode: "per_person", currency: "INR" },
      days: [], customTables: [], photos: [], pages: [], renderedText: "", internalNotes: undefined,
    });

    expect(html).toContain("57,517.5");
    expect(html).toContain("19,172.5");
    expect(html).toContain("Price per person");
  });

  it("renders the package preview in the requested order with hero, hotel, service, and quote cards", () => {
    const html = buildItineraryPdfHtml({
      template: { id: "package", label: "Travel Package", description: "Detailed package itinerary" },
      selectedPackage: { id: "pkg-1", name: "Option 1" },
      branding: { company_name: "SAVR Travels" },
      summary: "Gujarat Ahmedabad",
      trip: { start_date: "2026-09-29", end_date: "2026-10-01", adults: 2, children: 0, guest_name: "Narmada" },
      inclusions: ["Breakfast"],
      exclusions: ["International flights"],
      cancellation_info: "Cancel 7 days before travel.",
      terms_conditions: "Prices are valid for 7 days.",
      notes: "Keep arrival day relaxed.",
      editor_content_html: "<h2>DAY 1 — 2026-09-29 — Ahmedabad</h2><p>Customized day-wise itinerary.</p><h2>DAY 2 — 2026-09-30 — Vadodara</h2><p>Continue the journey.</p>",
      pricing: { adults: 2, children: 0, adult_price: null, child_price: null, subtotal: 24000, tax: 2000, final_customer_price: 26000, per_person_price: 13000, pricing_mode: "per_person", currency: "INR" },
      days: [{ day_number: 1, date: "2026-09-29", title: "Ahmedabad arrival", description: "Airport pickup and check-in.", notes: "", photos: [{ url: "https://example.com/day-one.jpg", caption: "Gangaramaya Temple", alt_text: "Gangaramaya Temple", place_name: "Gangaramaya Temple", source: "GOOGLE_PLACES", attribution: [{ displayName: "Travel Photographer", uri: null, photoUri: null }], sequence: 1 }], items: [
        { title: "Heritage Hotel", item_type: "ACCOMMODATION", image_url: "https://example.com/hotel.jpg", details: ["2 nights", "Breakfast"] },
        { title: "Stepwell tour", item_type: "ACTIVITY", details: ["10:00 AM"], image_credit: "Google photographer", photos: [{ url: "https://example.com/stepwell.jpg", alt_text: "Stepwell" }] },
        { title: "Airport pickup", item_type: "TRANSPORT", details: ["Airport → Hotel"] },
        { title: "Flight 6E 112", item_type: "FLIGHT", details: ["Delhi → Ahmedabad"] },
        { title: "Tourist visa", item_type: "VISA", details: ["Visa on arrival"] },
      ] }],
      customTables: [],
      photos: [{ url: "https://example.com/cover.jpg", caption: "Ahmedabad", alt_text: "Ahmedabad", sequence: 1 }],
      pages: [],
      renderedText: "",
      internalNotes: undefined,
    });

    expect(html).toContain("https://example.com/cover.jpg");
    expect(html).toContain("Customized day-wise itinerary.");
    expect(html).toContain("Sep 29, 2026");
    expect(html).toContain("Narmada");
    expect(html).toContain("2 Adults");
    expect(html).toContain("https://example.com/hotel.jpg");
    expect(html).toContain("https://example.com/day-one.jpg");
    expect(html.indexOf("https://example.com/day-one.jpg")).toBeLessThan(html.indexOf("DAY 2 — 2026-09-30 — Vadodara"));
    expect(html).not.toContain("DAY-WISE PHOTOGRAPHY");
    expect(html).toContain("Google Maps");
    expect(html).toContain("Travel Photographer");
    expect(html.indexOf("https://example.com/day-one.jpg")).toBeLessThan(html.indexOf("DAY 2 — 2026-09-30 — Vadodara"));
    expect(html).toContain("Stepwell tour");
    expect(html).toContain("https://example.com/stepwell.jpg");
    expect(html).toContain("Photo: Google photographer · Google Maps");
    expect(html).toContain("Airport pickup");
    expect(html).toContain("Flight 6E 112");
    expect(html).toContain("Tourist visa");
    expect(html).toContain("Price per person");
    expect(html).toContain("13,000 INR");
    expect(html).toContain("What's Included &amp; Excluded");
    expect(html).toContain("Terms &amp; Conditions");
    expect(html).not.toContain("supplier_cost");
  });
});
