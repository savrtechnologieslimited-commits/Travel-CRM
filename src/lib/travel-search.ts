import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildFlightSearchLink, flightSearchProviders } from "@/lib/travel-search-providers";

type FlightSearchInput = {
  from: string;
  to: string;
  departure: string;
  returnDate?: string;
  adults: number;
  children: number;
  infants: number;
  cabin: string;
  tripType?: string;
  currency?: string;
  directFlight?: boolean;
};

function validateDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
}

function validatePassengers(adults: number, children: number, infants = 0) {
  if (![adults, children, infants].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error("Passenger counts must be non-negative whole numbers.");
  }
  if (adults < 1) throw new Error("At least one adult is required.");
}

export const searchFlightsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: FlightSearchInput) => input)
  .handler(async ({ data }) => {
    const from = data.from.trim();
    const to = data.to.trim();
    if (!from || !to) throw new Error("Origin and destination are required.");
    validateDate(data.departure, "Departure date");
    if (data.returnDate) {
      validateDate(data.returnDate, "Return date");
      if (data.returnDate < data.departure) throw new Error("Return date cannot be before departure.");
    }
    validatePassengers(data.adults, data.children, data.infants);

    return flightSearchProviders.map((provider) => ({
      provider: provider.name,
      url: buildFlightSearchLink(provider, {
        from,
        to,
        departure: data.departure,
        returnDate: data.returnDate,
        adults: data.adults,
        children: data.children,
        infants: data.infants,
        cabin: data.cabin,
        tripType: data.tripType,
        currency: data.currency,
        directFlight: data.directFlight,
      }),
    }));
  });

