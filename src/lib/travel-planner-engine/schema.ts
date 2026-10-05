import { z } from "zod";

const Period = z.enum(["morning", "afternoon", "evening"]);
export const UnderstoodRequestSchema = z.object({
  destination: z.string(), cities_requested: z.array(z.string()), duration_days: z.number().int(), nights: z.number().int(), start_date: z.string().nullable(),
  adults: z.number().int().nullable(), children: z.number().int().nullable(), children_ages: z.array(z.number().int()), departure_city: z.string().nullable(),
  arrival_city: z.string().nullable(), return_city: z.string().nullable(), traveller_type: z.string(), trip_purpose: z.string().nullable(),
  travel_style: z.string(), hotel_category: z.string().nullable(), interests: z.array(z.string()), special_requirements: z.array(z.string()),
});
export const RouteLegSchema = z.object({ city: z.string(), nights: z.number().int(), arrival_day: z.number().int(), departure_day: z.number().int(), rationale: z.string() });
export const DayPlanSchema = z.object({
  day: z.number().int(), date: z.string().nullable(), city: z.string(), title: z.string(), morning: z.array(z.string()), afternoon: z.array(z.string()), evening: z.array(z.string()),
  activity_ids: z.array(z.string()), transfer_ids: z.array(z.string()), overnight_city: z.string().nullable(), hotel_category: z.string().nullable(), why_this_day: z.string(),
});
export const ActivitySchema = z.object({
  id: z.string(), name: z.string(), city: z.string(), day: z.number().int(), time_period: Period, start_time: z.string().nullable(), end_time: z.string().nullable(),
  duration: z.string().nullable(), category: z.enum(["sightseeing", "culture", "nature", "adventure", "leisure", "shopping", "food", "entertainment", "wellness", "other"]), reason: z.string(),
});
export const TransferSchema = z.object({
  id: z.string(), day: z.number().int(), from: z.string(), to: z.string(), purpose: z.enum(["airport_arrival", "airport_departure", "station_arrival", "station_departure", "intercity", "local"]),
  mode: z.enum(["road", "flight", "train", "ferry", "unspecified"]), suggested_time: z.string().nullable(), approx_duration: z.string().nullable(), fixed_service_ref: z.string().nullable(), reason: z.string(),
});
export const HotelStaySchema = z.object({
  id: z.string(), city: z.string(), check_in_day: z.number().int(), check_out_day: z.number().int(), nights: z.number().int(), hotel_category: z.string().nullable(),
  requirement_text: z.string(), hotel_selected: z.boolean(), hotel_reference: z.string().nullable(),
});
export const TripPlanSchema = z.object({
  understood_request: UnderstoodRequestSchema,
  trip_summary: z.object({ title: z.string(), destination: z.string(), duration_days: z.number().int(), nights: z.number().int(), travellers: z.string(), travel_style: z.string(), overview: z.string() }),
  route: z.array(RouteLegSchema), days: z.array(DayPlanSchema), hotel_stays: z.array(HotelStaySchema), activities: z.array(ActivitySchema), transfers: z.array(TransferSchema), assumptions: z.array(z.string()), warnings: z.array(z.string()),
});
export type TripPlan = z.infer<typeof TripPlanSchema>;
export type DayPlan = z.infer<typeof DayPlanSchema>;
export type PlanActivity = z.infer<typeof ActivitySchema>;
export type PlanTransfer = z.infer<typeof TransferSchema>;
export type HotelStay = z.infer<typeof HotelStaySchema>;
