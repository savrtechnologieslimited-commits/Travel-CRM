ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS city_nights jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_city_nights_array_check
  CHECK (jsonb_typeof(city_nights) = 'array');
