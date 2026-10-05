import { describe, expect, test } from "bun:test";
import { applyItineraryTermDefaults, buildSupplierItineraryTerms, extractItineraryTermsFromText, type ExtractedItineraryTerms } from "./itinerary-terms-extractor";

describe("itinerary terms extraction", () => {
  test("routes labeled sections into their matching fields", () => {
    expect(extractItineraryTermsFromText(`INCLUSIONS:\n- Breakfast\n- Airport transfer\n\nEXCLUSIONS: Flights\n\nCancellation Policy:\nFree cancellation up to 7 days before travel.\n\nTerms & Conditions\nRates are subject to availability.`)).toEqual({
      inclusions: "Breakfast\nAirport transfer",
      exclusions: "Flights",
      cancellation_info: "Free cancellation up to 7 days before travel.",
      terms_conditions: "Rates are subject to availability.",
    });
  });

  test("leaves categories without a matching heading blank", () => {
    expect(extractItineraryTermsFromText("Inclusions: Accommodation and breakfast")).toEqual({
      inclusions: "Accommodation and breakfast",
      exclusions: "",
      cancellation_info: "",
      terms_conditions: "",
    });
  });

  test("keeps a labeled section active across blank lines in supplier PDFs", () => {
    expect(extractItineraryTermsFromText("INCLUSIONS:\n\n• Breakfast\n• Airport transfers\n\nEXCLUSIONS:\n\n• International flights")).toEqual({
      inclusions: "Breakfast\nAirport transfers",
      exclusions: "International flights",
      cancellation_info: "",
      terms_conditions: "",
    });
  });

  test("routes inclusion and exclusion table cells by their column headers", () => {
    expect(extractItineraryTermsFromText(`TABLE: Package details
| Inclusions | Exclusions |
| --- | --- |
| Breakfast | International flights |
| Airport transfer | Personal expenses |`)).toEqual({
      inclusions: "Breakfast\nAirport transfer",
      exclusions: "International flights\nPersonal expenses",
      cancellation_info: "",
      terms_conditions: "",
    });
  });

  test("returns blank categories when the source has no labeled terms", () => {
    expect(extractItineraryTermsFromText("Plan a relaxed five-night trip to Kyoto.")).toEqual({
      inclusions: "",
      exclusions: "",
      cancellation_info: "",
      terms_conditions: "",
    });
  });

  test("returns null for empty input", () => {
    expect(extractItineraryTermsFromText("  ")).toBeNull();
  });

  test("uses document sections when present and company defaults for missing sections", () => {
    const defaults: ExtractedItineraryTerms = {
      inclusions: "Default stay",
      exclusions: "Default flights",
      cancellation_info: "Default cancellation",
      terms_conditions: "Default terms",
    };
    const extracted = extractItineraryTermsFromText("INCLUSIONS:\nHotel\n\nEXCLUSIONS:\nFlights excluded");

    expect(applyItineraryTermDefaults(extracted, defaults)).toEqual({
      inclusions: "Hotel",
      exclusions: "Flights excluded",
      cancellation_info: "Default cancellation",
      terms_conditions: "Default terms",
    });
  });

  test("uses all company defaults when the document has no labeled terms", () => {
    const defaults: ExtractedItineraryTerms = {
      inclusions: "Default stay",
      exclusions: "Default flights",
      cancellation_info: "Default cancellation",
      terms_conditions: "Default terms",
    };

    expect(applyItineraryTermDefaults(extractItineraryTermsFromText("A seven-night Baku trip"), defaults)).toEqual(defaults);
  });

  test("keeps AI-structured supplier inclusions and exclusions separate when OCR headings share a line", () => {
    const defaults: ExtractedItineraryTerms = {
      inclusions: "Default stay",
      exclusions: "Default flights",
      cancellation_info: "Default cancellation",
      terms_conditions: "Default terms",
    };
    const result = buildSupplierItineraryTerms({
      inclusions: ["7 nights accommodation", "Daily breakfast", "Private airport transfers"],
      exclusions: ["Lunch and dinner", "Personal expenses", "E-visa", "Sightseeing entrance tickets"],
      cancellation_info: null,
    }, "INCLUSIONS: EXCLUSIONS:\n• 7 nights accommodation\n• Daily breakfast\n• Lunch and dinner\n• Personal expenses", defaults);

    expect(result.inclusions).toBe("7 nights accommodation\nDaily breakfast\nPrivate airport transfers");
    expect(result.exclusions).toBe("Lunch and dinner\nPersonal expenses\nE-visa\nSightseeing entrance tickets");
    expect(result.cancellation_info).toBe("Default cancellation");
    expect(result.terms_conditions).toBe("Default terms");
  });

  test("uses AI term classification when OCR headings are adjacent before the table contents", () => {
    const defaults: ExtractedItineraryTerms = {
      inclusions: "Default stay",
      exclusions: "Default flights",
      cancellation_info: "Default cancellation",
      terms_conditions: "Default terms",
    };
    const result = buildSupplierItineraryTerms({
      inclusions: ["Breakfast", "Airport transfer"],
      exclusions: ["International flights", "Personal expenses"],
      cancellation_info: null,
    }, "INCLUSIONS\nEXCLUSIONS\nBreakfast\nAirport transfer\nInternational flights\nPersonal expenses", defaults);

    expect(result.inclusions).toBe("Breakfast\nAirport transfer");
    expect(result.exclusions).toBe("International flights\nPersonal expenses");
  });

  test("ignores OCR font metadata and keeps explicit inclusion/exclusion sections separate", () => {
    const defaults: ExtractedItineraryTerms = {
      inclusions: "Default stay",
      exclusions: "Default flights",
      cancellation_info: "Default cancellation",
      terms_conditions: "Default terms",
    };
    const result = buildSupplierItineraryTerms({
      inclusions: ["7-night accommodation"],
      exclusions: ["7-night accommodation", "Lunch and dinner", "Personal expenses", "Entrance tickets to Heydar Aliyev Centre – Vintage Museum"],
      cancellation_info: null,
    }, `INCLUSIONS:
• 7-night accommodation
• Daily breakfast
• Private airport transfers

EXCLUSIONS:
• Lunch and dinner
• Personal expenses
• E-visa

FontGeorgiaVerdanaTrebuchetSize101214161824

• Heydar Aliyev Centre – Vintage Museum ticket
• Little Venice ticket`, defaults);

    expect(result.inclusions).toBe("7-night accommodation\nDaily breakfast\nPrivate airport transfers");
    expect(result.exclusions).toBe("Lunch and dinner\nPersonal expenses\nE-visa");
    expect(result.exclusions).not.toContain("7-night accommodation");
    expect(result.cancellation_info).toBe("Default cancellation");
    expect(result.terms_conditions).toBe("Default terms");
  });
});
