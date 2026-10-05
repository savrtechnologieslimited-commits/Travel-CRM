CREATE TABLE public.google_activity_place_search_cache (
  search_key text PRIMARY KEY,
  place_ids jsonb NOT NULL CHECK (jsonb_typeof(place_ids) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX google_activity_place_search_cache_updated_at_idx
  ON public.google_activity_place_search_cache (updated_at);

ALTER TABLE public.google_activity_place_search_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_activity_place_search_cache FROM anon, authenticated;
GRANT ALL ON public.google_activity_place_search_cache TO service_role;