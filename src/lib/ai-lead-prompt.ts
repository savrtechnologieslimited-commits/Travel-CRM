import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ItineraryRequirementSource } from "./ai-itinerary-generation-from-requirements.server";

export const generateLeadItineraryPromptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { leadId: string; prompt: string }) => input)
  .handler(async ({ data }) => {
    const prompt = data.prompt.trim();
    if (!data.leadId || !prompt) throw new Error("Choose a lead and describe the trip before generating.");
    if (prompt.length > 4000) throw new Error("Trip description must be under 4,000 characters.");
    const { generateItineraryFromRequirements, loadItineraryRequirements } = await import("./ai-itinerary-generation-from-requirements.server");
    const requirements = await loadItineraryRequirements("lead" as ItineraryRequirementSource, data.leadId);
    const combinedRequirements = [requirements.special_requirements, prompt].filter(Boolean).join("\n\nAdditional itinerary instructions: ");
    return generateItineraryFromRequirements({ ...requirements, special_requirements: combinedRequirements });
  });

export const generateItineraryPromptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { prompt: string; leadId?: string; destination?: string; adults?: number; children?: number }) => input)
  .handler(async ({ data }) => {
    const prompt = data.prompt.trim();
    if (!prompt) throw new Error("Describe the itinerary you want to prepare.");
    if (prompt.length > 16000) throw new Error("Itinerary details, including saved activities and transfers, must be under 16,000 characters.");

    const { generateItineraryFromRequirements, loadItineraryRequirements } = await import("./ai-itinerary-generation-from-requirements.server");
    const firstRoute = prompt.split(/[,;\n]/, 1)[0]?.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const destination = data.destination?.trim() || firstRoute;
    if (!destination) throw new Error("Add a destination to the itinerary details.");

    const requirements = data.leadId
      ? await loadItineraryRequirements("lead", data.leadId)
      : {
          destination,
          destination_text: destination,
          travel_start_date: null,
          travel_end_date: null,
          travel_month: null,
          adults: data.adults ?? null,
          children: data.children ?? null,
          departure_city: null,
          approximate_budget: null,
          hotel_preference: null,
          special_requirements: null,
          trip_type: null,
          lead_id: null,
          enquiry_id: null,
          customer_id: null,
          assigned_to: null,
        };

    const combinedRequirements = [requirements.special_requirements, prompt].filter(Boolean).join("\n\nAdditional itinerary instructions: ");
    return generateItineraryFromRequirements({ ...requirements, special_requirements: combinedRequirements });
  });
