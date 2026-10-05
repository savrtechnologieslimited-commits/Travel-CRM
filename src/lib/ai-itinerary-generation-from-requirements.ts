import { createServerFn } from "@tanstack/react-start";
import type { ItineraryRequirementSource } from "./ai-itinerary-generation-from-requirements.server";

export const generateItineraryFromRequirementsFn = createServerFn({ method: "POST" })
  .validator((input: { source: ItineraryRequirementSource; sourceId: string }) => input)
  .handler(async ({ data }) => {
    const { generateItineraryFromRequirements, loadItineraryRequirements } = await import("./ai-itinerary-generation-from-requirements.server");
    const requirements = await loadItineraryRequirements(data.source, data.sourceId);
    return generateItineraryFromRequirements(requirements);
  });
