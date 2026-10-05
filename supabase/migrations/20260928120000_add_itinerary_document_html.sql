ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS document_html text NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
