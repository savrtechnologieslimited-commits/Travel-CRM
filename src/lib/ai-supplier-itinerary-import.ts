import { createServerFn } from "@tanstack/react-start";
import type { SupplierDocumentInput } from "./ai-supplier-itinerary-import.server";

export const extractSupplierDocumentTextFn = createServerFn({ method: "POST" })
  .validator((input: SupplierDocumentInput) => input)
  .handler(async ({ data }) => {
    const { extractSupplierDocumentText } = await import("./ai-supplier-itinerary-import.server");
    return { text: await extractSupplierDocumentText(data) };
  });

export const extractItineraryFromSupplierDocumentFn = createServerFn({ method: "POST" })
  .validator((input: SupplierDocumentInput) => input)
  .handler(async ({ data }) => {
    const { extractItineraryFromSupplierDocument } = await import("./ai-supplier-itinerary-import.server");
    return extractItineraryFromSupplierDocument(data);
  });
