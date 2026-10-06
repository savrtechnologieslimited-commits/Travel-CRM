import { describe, expect, test } from "bun:test";
import { createQuickItineraryPreview } from "./quick-itinerary";
import { buildItineraryPdfHtml } from "./itinerary-pdf";
import type { SupplierImportResult } from "./ai-supplier-itinerary-import.server";

describe("quick itinerary preview", () => {
  test("shows imported hotels in the overall booking summary without prices", () => {
    const result: SupplierImportResult = {
      draft: {
        title: "Baku Tour",
        destination: "Baku",
        inclusions: [],
        exclusions: [],
        days: [
          {
            title: "Arrival in Baku",
            description: "Arrive and transfer to the hotel.",
            items: [
              {
                item_type: "ACCOMMODATION",
                sequence: 1,
                title: "Baku Marriott Hotel Boulevard",
                hotel_name: "Baku Marriott Hotel Boulevard",
              },
            ],
          },
        ],
      },
      photo_attachments: [],
      extracted_text: "",
      extracted_text_length: 0,
      tables: [],
      destination_resolution: {
        status: "resolved",
        destination_id: "baku",
        candidate_ids: ["baku"],
      },
      provenance: "AI_SUPPLIER_IMPORT",
    };

    const preview = createQuickItineraryPreview(result, []);
    const hotel = preview.days[0]?.items[0];

    expect(hotel).toMatchObject({
      title: "Baku Marriott Hotel Boulevard",
      item_type: "ACCOMMODATION",
      hotel_booking_scope: "overall",
    });
    expect(preview.pricing).toBeNull();
    const html = buildItineraryPdfHtml(preview);
    expect(html).toContain("Baku Marriott Hotel Boulevard");
    expect(html).toContain("OVERALL HOTEL BOOKING");
  });
});
