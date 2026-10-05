import { describe, expect, test } from "bun:test";
import { insertInlineItineraryDayPhotos, removeInlineItineraryDayPhotos } from "./itinerary-inline-day-photos";

describe("inline itinerary day photos", () => {
  test("places each saved photo after its matching day and before the next day heading", () => {
    const html = "<h2>DAY 1 — Colombo</h2><p>Day one details.</p><h2>DAY 2 — Ella</h2><p>Day two details.</p>";
    const result = insertInlineItineraryDayPhotos(html, [
      { day_number: 1, url: "https://photos.test/colombo.jpg", alt_text: "Colombo photo", credit: "Google Maps · Photographer A" },
      { day_number: 2, url: "https://photos.test/ella.jpg", alt_text: "Ella photo", credit: "Google Maps · Photographer B" },
    ]);

    expect(result.indexOf("Day one details.")).toBeLessThan(result.indexOf("colombo.jpg"));
    expect(result.indexOf("colombo.jpg")).toBeLessThan(result.indexOf("DAY 2 — Ella"));
    expect(result.indexOf("Day two details.")).toBeLessThan(result.indexOf("ella.jpg"));
    expect(result).toContain("Google Maps · Photographer A");
    expect(result).toContain("Google Maps · Photographer B");
  });

  test("is idempotent and removes display-only photo markup before edited HTML is saved", () => {
    const html = "<h2>DAY 1 — Colombo</h2><p>Day one details.</p>";
    const withPhoto = insertInlineItineraryDayPhotos(html, [{ day_number: 1, url: "https://photos.test/colombo.jpg" }]);

    expect(insertInlineItineraryDayPhotos(withPhoto, [{ day_number: 1, url: "https://photos.test/colombo.jpg" }])).toBe(withPhoto);
    expect(removeInlineItineraryDayPhotos(withPhoto)).toBe(html);
  });
});
