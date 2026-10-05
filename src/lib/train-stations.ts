import { stations as indianRailwayStations } from "indian-railway-station-codes";
import type { TrainStation } from "@/lib/travel-search-providers";

const TRAIN_STATION_CITY_OVERRIDES: Record<string, string> = {
  SC: "Hyderabad",
  ADI: "Ahmedabad",
  NDLS: "New Delhi",
  CNB: "Kanpur",
};

function stationCityFromName(name: string): string {
  return name
    .replace(/\b(JUNCTION|JN\.?|CENTRAL|TERMINAL|ROAD|STATION)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || name;
}

/** Local static Indian Railways directory (MIT-licensed package); no runtime station API calls. */
export const TRAIN_STATIONS: TrainStation[] = indianRailwayStations.map((station) => ({
  name: station.name,
  code: station.code,
  city: TRAIN_STATION_CITY_OVERRIDES[station.code] ?? stationCityFromName(station.name),
}));
