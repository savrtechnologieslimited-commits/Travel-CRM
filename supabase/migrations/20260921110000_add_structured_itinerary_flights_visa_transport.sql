ALTER TABLE public.itinerary_day_items
  DROP CONSTRAINT IF EXISTS itinerary_day_items_item_type_check;

ALTER TABLE public.itinerary_day_items
  ADD CONSTRAINT itinerary_day_items_item_type_check
  CHECK (item_type IN ('ACTIVITY', 'SIGHTSEEING', 'TRANSPORT', 'MEAL', 'ACCOMMODATION', 'FLIGHT', 'VISA', 'EXTRA_TRANSPORT', 'NOTE'));

ALTER TABLE public.itinerary_day_items
  ADD COLUMN IF NOT EXISTS flight_airline text,
  ADD COLUMN IF NOT EXISTS flight_number text,
  ADD COLUMN IF NOT EXISTS departure_airport text,
  ADD COLUMN IF NOT EXISTS departure_city text,
  ADD COLUMN IF NOT EXISTS arrival_airport text,
  ADD COLUMN IF NOT EXISTS arrival_city text,
  ADD COLUMN IF NOT EXISTS flight_departure_date date,
  ADD COLUMN IF NOT EXISTS flight_departure_time time,
  ADD COLUMN IF NOT EXISTS flight_arrival_date date,
  ADD COLUMN IF NOT EXISTS flight_arrival_time time,
  ADD COLUMN IF NOT EXISTS flight_cabin text,
  ADD COLUMN IF NOT EXISTS baggage_information text,
  ADD COLUMN IF NOT EXISTS flight_duration text,
  ADD COLUMN IF NOT EXISTS flight_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS flight_currency text,
  ADD COLUMN IF NOT EXISTS visa_country text,
  ADD COLUMN IF NOT EXISTS visa_type text,
  ADD COLUMN IF NOT EXISTS visa_validity text,
  ADD COLUMN IF NOT EXISTS visa_processing_time text,
  ADD COLUMN IF NOT EXISTS visa_required_documents text,
  ADD COLUMN IF NOT EXISTS visa_entry_exit_information text,
  ADD COLUMN IF NOT EXISTS visa_customer_information text,
  ADD COLUMN IF NOT EXISTS extra_transport_type text,
  ADD COLUMN IF NOT EXISTS extra_transport_date date,
  ADD COLUMN IF NOT EXISTS extra_transport_pickup_time time,
  ADD COLUMN IF NOT EXISTS extra_transport_drop_time time,
  ADD COLUMN IF NOT EXISTS extra_transport_vehicle_type text,
  ADD COLUMN IF NOT EXISTS extra_transport_vehicle_details text,
  ADD COLUMN IF NOT EXISTS extra_transport_driver_details text,
  ADD COLUMN IF NOT EXISTS extra_transport_passengers integer,
  ADD COLUMN IF NOT EXISTS extra_transport_customer_notes text;

ALTER TABLE public.itinerary_day_items
  ADD CONSTRAINT itinerary_day_items_flight_price_non_negative CHECK (flight_price IS NULL OR flight_price >= 0),
  ADD CONSTRAINT itinerary_day_items_flight_currency_valid CHECK (flight_currency IS NULL OR flight_currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT itinerary_day_items_extra_transport_passengers_non_negative CHECK (extra_transport_passengers IS NULL OR extra_transport_passengers >= 0);

CREATE INDEX IF NOT EXISTS itinerary_day_items_flight_date_idx
  ON public.itinerary_day_items (item_type, flight_departure_date, flight_arrival_date);

CREATE INDEX IF NOT EXISTS itinerary_day_items_visa_country_idx
  ON public.itinerary_day_items (item_type, visa_country);

CREATE INDEX IF NOT EXISTS itinerary_day_items_extra_transport_date_idx
  ON public.itinerary_day_items (item_type, extra_transport_date);
