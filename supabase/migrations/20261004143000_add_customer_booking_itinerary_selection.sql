ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS show_in_customer_bookings boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
