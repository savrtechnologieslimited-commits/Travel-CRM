import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CompleteItineraryInput } from "./ai-complete-itinerary.server";

export const generateCompleteItineraryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CompleteItineraryInput) => input)
  .handler(async ({ data }) => {
    const { generateCompleteItinerary } = await import("./ai-complete-itinerary.server");
    return generateCompleteItinerary(data);
  });
