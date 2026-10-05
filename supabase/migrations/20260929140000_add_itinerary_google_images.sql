ALTER TABLE public.itinerary_photos
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS selection_type text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS place_name text,
  ADD COLUMN IF NOT EXISTS google_photo_reference text,
  ADD COLUMN IF NOT EXISTS attribution jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.itinerary_photos
  DROP CONSTRAINT IF EXISTS itinerary_photos_source_check,
  DROP CONSTRAINT IF EXISTS itinerary_photos_selection_type_check,
  DROP CONSTRAINT IF EXISTS itinerary_photos_storage_path_check,
  ADD CONSTRAINT itinerary_photos_source_check
    CHECK (source IN ('GOOGLE_PLACES', 'MANUAL')),
  ADD CONSTRAINT itinerary_photos_selection_type_check
    CHECK (selection_type IN ('AUTO', 'MANUAL')),
  ADD CONSTRAINT itinerary_photos_storage_path_check
    CHECK (
      storage_path IS NULL
      OR storage_path LIKE 'activity-photo-library/%'
      OR storage_path LIKE 'itinerary-place-images/%'
    );

CREATE UNIQUE INDEX IF NOT EXISTS itinerary_photos_one_primary_per_day_idx
  ON public.itinerary_photos (day_id)
  WHERE day_id IS NOT NULL AND is_primary;

CREATE INDEX IF NOT EXISTS itinerary_photos_google_place_idx
  ON public.itinerary_photos (google_place_id)
  WHERE google_place_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.itinerary_place_image_cache (
  normalized_query text PRIMARY KEY CHECK (length(trim(normalized_query)) > 0),
  query_text text NOT NULL,
  google_place_id text NOT NULL,
  place_name text NOT NULL,
  google_photo_reference text NOT NULL,
  attribution jsonb NOT NULL DEFAULT '[]'::jsonb,
  storage_path text NOT NULL UNIQUE CHECK (storage_path LIKE 'itinerary-place-images/cache/%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itinerary_place_image_cache_google_place_idx
  ON public.itinerary_place_image_cache (google_place_id);

ALTER TABLE public.itinerary_place_image_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.itinerary_place_image_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.itinerary_place_image_cache TO authenticated;
GRANT ALL ON public.itinerary_place_image_cache TO service_role;

DROP POLICY IF EXISTS "staff select itinerary place image cache" ON public.itinerary_place_image_cache;
DROP POLICY IF EXISTS "staff insert itinerary place image cache" ON public.itinerary_place_image_cache;
DROP POLICY IF EXISTS "staff update itinerary place image cache" ON public.itinerary_place_image_cache;
CREATE POLICY "staff select itinerary place image cache" ON public.itinerary_place_image_cache
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert itinerary place image cache" ON public.itinerary_place_image_cache
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update itinerary place image cache" ON public.itinerary_place_image_cache
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS set_itinerary_place_image_cache_updated_at ON public.itinerary_place_image_cache;
CREATE TRIGGER set_itinerary_place_image_cache_updated_at
  BEFORE UPDATE ON public.itinerary_place_image_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';