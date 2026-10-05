CREATE TABLE IF NOT EXISTS public.activity_photo_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text NOT NULL CHECK (length(trim(google_place_id)) > 0),
  place_name text NOT NULL CHECK (length(trim(place_name)) > 0),
  place_address text NOT NULL CHECK (length(trim(place_address)) > 0),
  storage_path text NOT NULL UNIQUE CHECK (storage_path LIKE 'activity-photo-library/%'),
  caption text,
  alt_text text,
  display_order integer NOT NULL DEFAULT 1 CHECK (display_order >= 1),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_photo_library_place_order_idx
  ON public.activity_photo_library (google_place_id, display_order, created_at);
CREATE INDEX IF NOT EXISTS activity_photo_library_match_idx
  ON public.activity_photo_library (lower(place_name), lower(place_address));

UPDATE public.google_activity_places_cache
SET place_data = place_data - 'photos'
WHERE place_data ? 'photos';

ALTER TABLE public.activity_photo_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_photo_library FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_photo_library TO authenticated;
GRANT ALL ON public.activity_photo_library TO service_role;

DROP POLICY IF EXISTS "staff select activity photo library" ON public.activity_photo_library;
DROP POLICY IF EXISTS "staff insert activity photo library" ON public.activity_photo_library;
DROP POLICY IF EXISTS "staff update activity photo library" ON public.activity_photo_library;
DROP POLICY IF EXISTS "staff delete activity photo library" ON public.activity_photo_library;
CREATE POLICY "staff select activity photo library" ON public.activity_photo_library
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert activity photo library" ON public.activity_photo_library
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update activity photo library" ON public.activity_photo_library
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff delete activity photo library" ON public.activity_photo_library
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS set_activity_photo_library_updated_at ON public.activity_photo_library;
CREATE TRIGGER set_activity_photo_library_updated_at
  BEFORE UPDATE ON public.activity_photo_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.itinerary_photos
  ADD COLUMN IF NOT EXISTS storage_path text;

ALTER TABLE public.itinerary_photos
  DROP CONSTRAINT IF EXISTS itinerary_photos_url_check,
  DROP CONSTRAINT IF EXISTS itinerary_photos_url_or_storage_path_check,
  DROP CONSTRAINT IF EXISTS itinerary_photos_storage_path_check,
  ALTER COLUMN url DROP NOT NULL,
  ADD CONSTRAINT itinerary_photos_url_or_storage_path_check
    CHECK ((url IS NOT NULL AND length(trim(url)) > 0) OR (storage_path IS NOT NULL AND length(trim(storage_path)) > 0)),
  ADD CONSTRAINT itinerary_photos_storage_path_check
    CHECK (storage_path IS NULL OR storage_path LIKE 'activity-photo-library/%');

DROP POLICY IF EXISTS "staff delete activity photo library objects" ON storage.objects;
CREATE POLICY "staff delete activity photo library objects" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'itineraries'
    AND name LIKE 'activity-photo-library/%'
    AND private.is_staff(auth.uid())
  );

NOTIFY pgrst, 'reload schema';