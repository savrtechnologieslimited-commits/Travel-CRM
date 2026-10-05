import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CitySuggestion = {
  id: string;
  name: string;
  country: string;
  admin1: string | null;
  population: number;
  scope: "domestic" | "international";
};

export const searchCitySuggestionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<CitySuggestion[]> => {
    const { searchWorldCities } = await import("./city-suggestions.server");
    return searchWorldCities(data.query);
  });
