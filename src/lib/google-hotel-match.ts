import type { GoogleActivityPlace } from "./google-places-activities";

const HOTEL_PLACE_TYPE = /^(?:lodging|hotel|resort|motel|hostel|guest_house|extended_stay_hotel)$/i;

export function firstGoogleHotelMatch(places: GoogleActivityPlace[]): GoogleActivityPlace | null {
  return places.find((place) => place.types.some((type) => HOTEL_PLACE_TYPE.test(type))) ?? null;
}