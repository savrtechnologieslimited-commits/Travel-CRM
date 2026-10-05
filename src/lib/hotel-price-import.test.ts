import { describe, expect, test } from "bun:test";
import { applyImportedHotelPrices, findImportedHotelPrice } from "./hotel-price-import";

describe("supplier hotel price import", () => {
  test("reads currency and per-night rates next to a hotel", () => {
    expect(findImportedHotelPrice("Day 1\nHotel: ABC Beach Resort\nRate: ₹12,500 per night", "ABC Beach Resort")).toEqual({
      amount: 12500,
      currency: "INR",
      basis: "per_night",
    });
  });

  test("reads a stay total and allocates its rate across the nights", () => {
    const days = [{ items: [{ item_type: "ACCOMMODATION", hotel_name: "Harbor Hotel", nights: 2 }] }];
    const result = applyImportedHotelPrices(days, "Hotel: Harbor Hotel\nStay total USD 600");
    expect(result[0]?.items[0]?.metadata?.["room_details"]).toMatchObject([
      { room_rate_per_night: 300, currency: "USD", imported_price_basis: "stay_total", imported_price_amount: 600 },
    ]);
  });

  test("uses the default INR currency for labeled rates without a currency marker", () => {
    expect(findImportedHotelPrice("Hotel cost: 8,000 per night", "Hotel")).toEqual({
      amount: 8000,
      currency: "INR",
      basis: "per_night",
    });
  });

  test("does not fabricate a rate when no explicit price is present", () => {
    expect(findImportedHotelPrice("Hotel: ABC Beach Resort\nDeluxe room with breakfast", "ABC Beach Resort")).toBeNull();
  });

  test("marks supplier hotels for automatic Google matching even without a stated rate", () => {
    const days = [{ items: [{ item_type: "ACCOMMODATION", hotel_name: "ABC Beach Resort" }] }];
    const result = applyImportedHotelPrices(days, "Hotel: ABC Beach Resort\nDeluxe room with breakfast");
    expect(result[0]?.items[0]).toMatchObject({
      hotel_option_label: "Option 1",
      metadata: {
        hotel_search_query: "ABC Beach Resort",
        auto_select_google_hotel: true,
        supplier_imported_hotel: true,
      },
    });
  });

  test("does not import per-adult package prices as hotel room rates", () => {
    const source = [
      "Inclusions: 6 nights at Baku Marriott Hotel Boulevard, 1 night at Qafqaz Tufandag Mountain Resort.",
      "Hotels Per adult price in SNGL room Per adult price in DBL sharing room Per adult price in TRPL sharing room",
      "Marriott Boulevard hotel 5* (city view room)",
      "Qafqaz Tufandag Resort spa 5* 840 USD 550 USD 535 USD",
    ].join("\n");

    expect(findImportedHotelPrice(source, "Marriott Boulevard hotel 5*")).toBeNull();
    expect(findImportedHotelPrice(source, "Qafqaz Tufandag Resort spa 5*")).toBeNull();
  });
});
