import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TripRequest } from "./travel-planner-engine/types";

export const generateTravelPlannerTripFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: TripRequest) => input)
  .handler(async ({ data }) => {
    const { planTrip } = await import("./travel-planner-engine/planner");
    const apiKey = process.env["OPENAI_API_KEY"]?.trim();
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
    const model = process.env["OPENAI_TRAVEL_PLANNER_MODEL"]?.trim();
    if (!model) throw new Error("Travel planner is not configured. Set OPENAI_TRAVEL_PLANNER_MODEL on the server.");

    console.info("[Travel Planner] OpenAI Responses API request started", {
      model,
      webSearch: false,
    });
    try {
      const result = await planTrip(data, {
        model,
        useWebSearch: false,
        maxOutputTokens: 12_000,
        maxRepairAttempts: 4,
      });
      console.info("[Travel Planner] OpenAI response received", {
        model: result.meta.model,
        responseId: result.meta.responseId,
        validation: result.validation.valid,
        repairAttempts: result.meta.repairAttempts,
      });
      return result;
    } catch (cause) {
      const rawMessage = cause instanceof Error ? cause.message : "Unknown OpenAI request error.";
      const safeMessage = rawMessage.replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]");
      console.error("[Travel Planner] OpenAI Responses API request failed", {
        model,
        error: safeMessage,
      });
      throw new Error(`OpenAI itinerary generation failed: ${safeMessage}`);
    }
  });
