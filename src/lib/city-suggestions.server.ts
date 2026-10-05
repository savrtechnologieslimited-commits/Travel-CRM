import type { CitySuggestion } from "./city-suggestions";

type OpenMeteoPlace = {
  id?: number;
  name?: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  population?: number;
  feature_code?: string;
};

type OpenMeteoResponse = { results?: OpenMeteoPlace[] };

export async function searchWorldCities(query: string, fetcher: typeof fetch = fetch): Promise<CitySuggestion[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2 || cleanQuery.length > 100) return [];

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", cleanQuery);
  url.searchParams.set("count", "100");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetcher(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`City lookup failed (${response.status}).`);

  const payload = await response.json() as OpenMeteoResponse;
  const prefix = cleanQuery.toLocaleLowerCase();
  const unique = new Map<string, CitySuggestion>();
  for (const place of payload.results ?? []) {
    const name = place.name?.trim();
    const country = place.country?.trim();
    const featureCode = place.feature_code ?? "";
    if (!place.id || !name || !country || !featureCode.startsWith("PPL") || featureCode === "PPLX") continue;
    if (!name.toLocaleLowerCase().startsWith(prefix)) continue;

    const key = `${name}|${country}`.toLocaleLowerCase();
    const suggestion: CitySuggestion = {
      id: `geonames-${place.id}`,
      name,
      country,
      admin1: place.admin1?.trim() || null,
      population: typeof place.population === "number" ? place.population : 0,
      scope: place.country_code?.toUpperCase() === "IN" ? "domestic" : "international",
    };
    const existing = unique.get(key);
    if (!existing || suggestion.population > existing.population) unique.set(key, suggestion);
  }

  return [...unique.values()]
    .sort((left, right) => right.population - left.population || left.name.localeCompare(right.name))
    .slice(0, 8);
}
