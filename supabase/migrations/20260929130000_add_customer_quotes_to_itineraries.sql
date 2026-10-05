ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS customer_quotes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.itineraries
  ADD CONSTRAINT itineraries_customer_quotes_object_check
  CHECK (jsonb_typeof(customer_quotes) = 'object');
