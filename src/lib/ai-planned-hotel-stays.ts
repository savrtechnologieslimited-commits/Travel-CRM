import type { CompleteItineraryPlan } from "./ai-complete-itinerary.server";

export type PlannedHotelRoomDetail = {
  id: string;
  room_type: string;
  adults: number;
  kids: number;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  room_rate_per_night: number;
  free_cancellation_date: string;
};

export type PlannedHotelStay = {
  day_number: number;
  date: string;
  city: string;
  check_in: string;
  check_out: string;
  nights: number;
  hotel_requirement: string;
  star_category: string | null;
  rooms: number;
  room_type: string;
  adults: number;
  children: number;
  extra_beds: number;
  meal_plan: string | null;
  room_details: PlannedHotelRoomDetail[];
};

export type ExistingHotelDate = { item_type?: string; check_in?: string | null; check_out?: string | null };

export function buildPlannedHotelStays(plan: CompleteItineraryPlan, requirements: string, existingItemsByDate: Map<string, ExistingHotelDate[]> = new Map()): PlannedHotelStay[] {
  const dayNumberByDate = new Map(plan.days.filter((day) => day.date).map((day) => [day.date!, day.day_number]));
  const parsedStars = /\b([3-5])\s*[- ]?star\b/i.exec(requirements)?.[1];
  const starCategory = parsedStars ? `${parsedStars} Star` : null;
  const roomCount = Math.max(1, Number(/\b(\d+)\s+rooms?\b/i.exec(requirements)?.[1] ?? 1) || 1);
  const extraBeds = Math.max(0, Number(/\b(\d+)\s+extra\s+beds?\b/i.exec(requirements)?.[1] ?? 0) || 0);
  const roomTypeMatch = /\b(super deluxe|standard|deluxe|premium|suite|villa|cottage|dormitory)\b/i.exec(requirements)?.[1];
  const roomType = roomTypeMatch ? roomTypeMatch.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Standard";
  const mealMatch = /\b(room only|breakfast|MAP|AP|all inclusive)\b/i.exec(requirements)?.[1];
  const mealPlan = mealMatch ? (
    /^room only$/i.test(mealMatch) ? "Room Only"
      : /^all inclusive$/i.test(mealMatch) ? "All Inclusive"
        : /^breakfast$/i.test(mealMatch) ? "Breakfast"
          : /^MAP$/i.test(mealMatch) ? "MAP"
            : /^AP$/i.test(mealMatch) ? "AP"
              : mealMatch
  ) : null;
  const adults = plan.trip_summary.adults ?? 2;
  const children = plan.trip_summary.children ?? 0;
  const stays: PlannedHotelStay[] = [];
  let previousCheckOut: string | null = null;
  let currentStart: string | null = null;
  let currentCity: string | null = null;
  let currentRequirement: string | null = null;
  let currentLastDate: string | null = null;
  let currentDayNumber = 1;

  function flushCurrent(checkOutDate: string) {
    if (!currentStart || !currentLastDate) return;
    const effectiveCheckIn = previousCheckOut ?? currentStart;
    const effectiveCheckOut = checkOutDate;
    const stayDayNumber = dayNumberByDate.get(effectiveCheckIn) ?? currentDayNumber;
    if (!existingItemsByDate.get(effectiveCheckIn)?.some((item) => item.item_type === "ACCOMMODATION" && item.check_in === effectiveCheckIn)) {
      const roomDetails: PlannedHotelRoomDetail[] = Array.from({ length: roomCount }, (_, roomIndex) => ({
        id: crypto.randomUUID(), room_type: roomType,
        adults: Math.floor(adults / roomCount) + (roomIndex < adults % roomCount ? 1 : 0),
        kids: roomIndex === 0 ? children : 0,
        breakfast: mealPlan === "Breakfast" || mealPlan === "MAP" || mealPlan === "AP" || mealPlan === "All Inclusive",
        lunch: mealPlan === "AP" || mealPlan === "All Inclusive",
        dinner: mealPlan === "AP" || mealPlan === "All Inclusive",
        room_rate_per_night: 0, free_cancellation_date: "",
      }));
      stays.push({
        day_number: stayDayNumber, date: effectiveCheckIn, city: currentCity ?? "",
        check_in: effectiveCheckIn, check_out: effectiveCheckOut, nights: daysBetween(effectiveCheckIn, effectiveCheckOut),
        hotel_requirement: currentRequirement ?? "", star_category: starCategory, rooms: roomCount, room_type: roomType,
        adults, children, extra_beds: extraBeds, meal_plan: mealPlan, room_details: roomDetails,
      });
    }
    previousCheckOut = effectiveCheckOut;
    currentStart = null;
    currentCity = null;
    currentRequirement = null;
    currentLastDate = null;
    currentDayNumber = 1;
  }

  if (!plan.days.some((day) => day.date) && plan.trip_summary.nights > 0) {
    const segments: Array<{
      day_number: number;
      city: string;
      hotel_requirement: string;
      nights: number;
      hasExistingHotel: boolean;
    }> = [];
    for (const day of plan.days.slice(0, plan.trip_summary.nights)) {
      const existingHotel = existingItemsByDate.get(`day:${day.day_number}`)
        ?.some((item) => item.item_type === "ACCOMMODATION") ?? false;
      const overnightCity = day.overnight_city ?? day.city;
      const requirement = day.hotel_requirement ?? "";
      const previousSegment = segments.at(-1);
      if (!requirement && !existingHotel) continue;
      if (previousSegment && previousSegment.city === overnightCity
        && (previousSegment.hotel_requirement === requirement || existingHotel || previousSegment.hasExistingHotel)) {
        previousSegment.nights += 1;
        previousSegment.hasExistingHotel ||= existingHotel;
        continue;
      }

      segments.push({
        day_number: day.day_number,
        city: overnightCity,
        hotel_requirement: requirement,
        nights: 1,
        hasExistingHotel: existingHotel,
      });
    }

    for (const segment of segments) {
      if (segment.hasExistingHotel) continue;
      const roomDetails: PlannedHotelRoomDetail[] = Array.from({ length: roomCount }, (_, roomIndex) => ({
        id: crypto.randomUUID(), room_type: roomType,
        adults: Math.floor(adults / roomCount) + (roomIndex < adults % roomCount ? 1 : 0),
        kids: roomIndex === 0 ? children : 0,
        breakfast: mealPlan === "Breakfast" || mealPlan === "MAP" || mealPlan === "AP" || mealPlan === "All Inclusive",
        lunch: mealPlan === "AP" || mealPlan === "All Inclusive",
        dinner: mealPlan === "AP" || mealPlan === "All Inclusive",
        room_rate_per_night: 0, free_cancellation_date: "",
      }));
      stays.push({
        day_number: segment.day_number, date: "", city: segment.city,
        check_in: "", check_out: "", nights: segment.nights,
        hotel_requirement: segment.hotel_requirement, star_category: starCategory, rooms: roomCount, room_type: roomType,
        adults, children, extra_beds: extraBeds, meal_plan: mealPlan, room_details: roomDetails,
      });
    }
    return stays;
  }

  for (const day of plan.days) {
    if (!day.date || !day.hotel_requirement) {
      if (currentStart && currentLastDate && !day.hotel_requirement && day.date) {
        flushCurrent(day.date);
      }
      continue;
    }

    if (!currentStart) {
      currentStart = day.date;
      currentCity = day.overnight_city ?? day.city;
      currentRequirement = day.hotel_requirement;
      currentLastDate = day.date;
      currentDayNumber = day.day_number;
      continue;
    }

    const previousDay = day.date ? plan.days.find((candidate) => candidate.date === addDays(day.date!, -1)) : null;
    const sameSegment = previousDay
      && (previousDay.overnight_city ?? previousDay.city) === (day.overnight_city ?? day.city)
      && previousDay.hotel_requirement === day.hotel_requirement;
    if (sameSegment) {
      currentLastDate = day.date;
      continue;
    }

    flushCurrent(day.date);
    currentStart = day.date;
    currentCity = day.overnight_city ?? day.city;
    currentRequirement = day.hotel_requirement;
    currentLastDate = day.date;
    currentDayNumber = day.day_number;
  }

  if (currentStart && currentLastDate) {
    flushCurrent(addDays(currentLastDate, 1));
  }

  return stays;
}

function addDays(value: string, count: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000));
}
