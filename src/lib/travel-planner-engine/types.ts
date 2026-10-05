/** Inputs to the planner. Nothing here is CRM-specific. */

export interface TravellerRequirements {
  destination?: string;
  cities?: string[];
  days?: number;
  nights?: number;
  /** YYYY-MM-DD */
  startDate?: string;
  adults?: number;
  children?: number;
  childrenAges?: number[];
  departureCity?: string;
  arrivalCity?: string;
  returnCity?: string;
  travelStyle?: string;
  hotelCategory?: string;
  interests?: string[];
  specialRequirements?: string[];
  tripType?: string;
  budgetCategory?: string;
}

export interface TransportFact {
  id: string;
  mode: "flight" | "train";
  carrier?: string;
  number?: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  travelClass?: string;
  role?: "arrival" | "departure" | "intercity";
}

export interface HotelFact {
  reference: string;
  name?: string;
  city: string;
  checkIn: string;
  checkOut: string;
}

export interface FixedServices {
  transport?: TransportFact[];
  hotels?: HotelFact[];
  servicesConfirmed?: boolean;
}

export interface ResearchItem {
  source: string;
  content: string;
}

export interface TripRequest {
  request: string;
  requirements?: TravellerRequirements;
  fixedServices?: FixedServices;
  research?: ResearchItem[];
}
