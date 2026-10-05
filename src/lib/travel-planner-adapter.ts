import type { TripRequest } from "@/lib/travel-planner-engine";

export function buildTravelPlannerRequest(requirements: string): TripRequest {
  return { request: requirements.trim() };
}
