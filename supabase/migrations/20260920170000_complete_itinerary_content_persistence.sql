ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS travel_start_date date,
  ADD COLUMN IF NOT EXISTS travel_end_date date,
  ADD COLUMN IF NOT EXISTS adults integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cancellation_info text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_tables jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.itineraries
  DROP CONSTRAINT IF EXISTS itineraries_travel_dates_valid,
  DROP CONSTRAINT IF EXISTS itineraries_travellers_non_negative,
  DROP CONSTRAINT IF EXISTS itineraries_status_valid;

ALTER TABLE public.itineraries
  ADD CONSTRAINT itineraries_travel_dates_valid CHECK (travel_end_date IS NULL OR travel_start_date IS NULL OR travel_end_date >= travel_start_date),
  ADD CONSTRAINT itineraries_travellers_non_negative CHECK (adults >= 0 AND children >= 0),
  ADD CONSTRAINT itineraries_status_valid CHECK (status IN ('DRAFT', 'READY'));

ALTER TABLE public.itinerary_days
  ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS public.itinerary_day_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_day_id uuid NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('ACTIVITY', 'SIGHTSEEING', 'TRANSPORT', 'MEAL', 'ACCOMMODATION', 'NOTE')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text,
  duration text,
  notes text,
  pickup text,
  dropoff text,
  departure_time text,
  arrival_time text,
  vehicle_details text,
  meal_type text CHECK (meal_type IS NULL OR meal_type IN ('BREAKFAST', 'LUNCH', 'DINNER')),
  hotel_name text,
  hotel_city text,
  check_in text,
  check_out text,
  room_details text,
  sequence integer NOT NULL CHECK (sequence >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itinerary_day_items_day_sequence_idx ON public.itinerary_day_items (itinerary_day_id, sequence);

CREATE TABLE IF NOT EXISTS public.itinerary_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  day_id uuid REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
  day_item_id uuid REFERENCES public.itinerary_day_items(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (length(trim(url)) > 0),
  caption text,
  alt_text text,
  sequence integer NOT NULL CHECK (sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itinerary_photos_single_scope CHECK (NOT (day_id IS NOT NULL AND day_item_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS itinerary_photos_itinerary_sequence_idx ON public.itinerary_photos (itinerary_id, sequence);
CREATE INDEX IF NOT EXISTS itinerary_photos_day_sequence_idx ON public.itinerary_photos (day_id, sequence);
CREATE INDEX IF NOT EXISTS itinerary_photos_item_sequence_idx ON public.itinerary_photos (day_item_id, sequence);

CREATE OR REPLACE FUNCTION private.validate_itinerary_photo_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.day_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.itinerary_days d
    WHERE d.id = NEW.day_id AND d.itinerary_id = NEW.itinerary_id
  ) THEN
    RAISE EXCEPTION 'Photo day must belong to the same itinerary';
  END IF;

  IF NEW.day_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.itinerary_day_items i
    JOIN public.itinerary_days d ON d.id = i.itinerary_day_id
    WHERE i.id = NEW.day_item_id AND d.itinerary_id = NEW.itinerary_id
  ) THEN
    RAISE EXCEPTION 'Photo item must belong to the same itinerary';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_itinerary_photo_scope ON public.itinerary_photos;
CREATE TRIGGER validate_itinerary_photo_scope
  BEFORE INSERT OR UPDATE ON public.itinerary_photos
  FOR EACH ROW EXECUTE FUNCTION private.validate_itinerary_photo_scope();

DROP TRIGGER IF EXISTS set_itinerary_day_items_updated_at ON public.itinerary_day_items;
CREATE TRIGGER set_itinerary_day_items_updated_at
  BEFORE UPDATE ON public.itinerary_day_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_itinerary_photos_updated_at ON public.itinerary_photos;
CREATE TRIGGER set_itinerary_photos_updated_at
  BEFORE UPDATE ON public.itinerary_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.itinerary_day_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff select itinerary day items" ON public.itinerary_day_items;
DROP POLICY IF EXISTS "staff insert itinerary day items" ON public.itinerary_day_items;
DROP POLICY IF EXISTS "staff update itinerary day items" ON public.itinerary_day_items;
DROP POLICY IF EXISTS "manager delete itinerary day items" ON public.itinerary_day_items;
DROP POLICY IF EXISTS "staff select itinerary photos" ON public.itinerary_photos;
DROP POLICY IF EXISTS "staff insert itinerary photos" ON public.itinerary_photos;
DROP POLICY IF EXISTS "staff update itinerary photos" ON public.itinerary_photos;
DROP POLICY IF EXISTS "manager delete itinerary photos" ON public.itinerary_photos;

CREATE POLICY "staff select itinerary day items" ON public.itinerary_day_items
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert itinerary day items" ON public.itinerary_day_items
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update itinerary day items" ON public.itinerary_day_items
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete itinerary day items" ON public.itinerary_day_items
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));

CREATE POLICY "staff select itinerary photos" ON public.itinerary_photos
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert itinerary photos" ON public.itinerary_photos
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update itinerary photos" ON public.itinerary_photos
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete itinerary photos" ON public.itinerary_photos
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));

NOTIFY pgrst, 'reload schema';
