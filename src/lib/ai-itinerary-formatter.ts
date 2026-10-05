import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ItineraryFormatterInput } from "./ai-itinerary-formatter.server";

export const formatItineraryFromSourcesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ItineraryFormatterInput) => input)
  .handler(async ({ data }) => {
    const { formatItineraryFromSources } = await import("./ai-itinerary-formatter.server");
    return formatItineraryFromSources(data);
  });