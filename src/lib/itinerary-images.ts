import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const addImagesToItineraryFn = createServerFn({ method: "POST" })
  .validator((input: {
    itineraryId?: string;
    draft?: {
      title: string;
      destinationName?: string;
      destinationCountry?: string;
      existingPhotoDayIds?: string[];
      existingGooglePlaceIds?: string[];
      days: import("./itinerary-image-service.server").ItineraryImageDaySource[];
    };
  }) => {
    if (input.itineraryId) return input;
    if (input.draft && typeof input.draft.title === "string" && Array.isArray(input.draft.days)) return input;
    throw new Error("An itinerary or an unsaved itinerary draft is required for image search.");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { addGoogleImagesToSavedItinerary, addGoogleImagesToUnsavedItinerary } = await import("./itinerary-image-service.server");
    if (data.itineraryId) return addGoogleImagesToSavedItinerary(context.supabase, data.itineraryId);
    return addGoogleImagesToUnsavedItinerary(context.supabase, data.draft!);
  });