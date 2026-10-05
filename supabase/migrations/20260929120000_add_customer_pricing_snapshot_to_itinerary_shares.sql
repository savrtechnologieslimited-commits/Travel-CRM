ALTER TABLE public.itinerary_shares
  ADD COLUMN IF NOT EXISTS customer_pricing jsonb;

ALTER TABLE public.itinerary_shares
  ADD CONSTRAINT itinerary_shares_customer_pricing_object_check
  CHECK (customer_pricing IS NULL OR jsonb_typeof(customer_pricing) = 'object');