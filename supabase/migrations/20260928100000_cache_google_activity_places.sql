CREATE TABLE public.google_activity_places_cache (
  place_id text PRIMARY KEY,
  place_data jsonb NOT NULL CHECK (jsonb_typeof(place_data) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX google_activity_places_cache_updated_at_idx
  ON public.google_activity_places_cache (updated_at);

ALTER TABLE public.google_activity_places_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_activity_places_cache FROM anon, authenticated;
GRANT ALL ON public.google_activity_places_cache TO service_role;