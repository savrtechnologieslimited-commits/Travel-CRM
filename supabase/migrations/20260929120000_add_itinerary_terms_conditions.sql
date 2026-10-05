ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS terms_conditions text NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';