ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS destination_id uuid,
  ADD COLUMN IF NOT EXISTS duration_nights integer,
  ADD COLUMN IF NOT EXISTS duration_days integer,
  ADD COLUMN IF NOT EXISTS price numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS hotel_category text,
  ADD COLUMN IF NOT EXISTS trip_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS document_path text,
  ADD COLUMN IF NOT EXISTS document_name text,
  ADD COLUMN IF NOT EXISTS document_mime_type text,
  ADD COLUMN IF NOT EXISTS document_size bigint,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.itineraries
  ALTER COLUMN name SET DEFAULT '',
  ALTER COLUMN currency SET DEFAULT 'INR',
  ALTER COLUMN is_active SET DEFAULT true;

UPDATE public.itineraries
SET name = COALESCE(name, title, 'Untitled itinerary'),
    currency = COALESCE(currency, 'INR'),
    is_active = COALESCE(is_active, true)
WHERE name IS NULL OR currency IS NULL OR is_active IS NULL;

ALTER TABLE public.itineraries
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN duration_nights SET DEFAULT 0,
  ALTER COLUMN duration_days SET DEFAULT 0,
  ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE public.itineraries
  DROP CONSTRAINT IF EXISTS itineraries_duration_nights_non_negative,
  DROP CONSTRAINT IF EXISTS itineraries_duration_days_non_negative,
  DROP CONSTRAINT IF EXISTS itineraries_price_non_negative,
  DROP CONSTRAINT IF EXISTS itineraries_validity_window,
  DROP CONSTRAINT IF EXISTS itineraries_destination_required;

ALTER TABLE public.itineraries
  ADD CONSTRAINT itineraries_duration_nights_non_negative
    CHECK (duration_nights IS NULL OR duration_nights >= 0),
  ADD CONSTRAINT itineraries_duration_days_non_negative
    CHECK (duration_days IS NULL OR duration_days >= 0),
  ADD CONSTRAINT itineraries_price_non_negative
    CHECK (price IS NULL OR price >= 0),
  ADD CONSTRAINT itineraries_validity_window
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from),
  ADD CONSTRAINT itineraries_destination_required
    CHECK (destination_id IS NOT NULL OR title IS NOT NULL);

CREATE INDEX IF NOT EXISTS itineraries_destination_idx
  ON public.itineraries (destination_id);
CREATE INDEX IF NOT EXISTS itineraries_active_idx
  ON public.itineraries (is_active);
CREATE INDEX IF NOT EXISTS itineraries_validity_idx
  ON public.itineraries (valid_from, valid_until);
CREATE INDEX IF NOT EXISTS itineraries_created_at_idx
  ON public.itineraries (created_at DESC);

ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff select itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "staff insert itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "staff update itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "manager delete itineraries" ON public.itineraries;

CREATE POLICY "staff select itineraries" ON public.itineraries
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert itineraries" ON public.itineraries
  FOR INSERT TO authenticated WITH CHECK (
    private.is_staff(auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );

CREATE POLICY "staff update itineraries" ON public.itineraries
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "manager delete itineraries" ON public.itineraries
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));

DROP TRIGGER IF EXISTS set_itineraries_updated_at ON public.itineraries;
CREATE TRIGGER set_itineraries_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('itineraries', 'itineraries', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff select itinerary documents" ON storage.objects;
DROP POLICY IF EXISTS "staff upload itinerary documents" ON storage.objects;
DROP POLICY IF EXISTS "staff update itinerary documents" ON storage.objects;
DROP POLICY IF EXISTS "manager delete itinerary documents" ON storage.objects;

CREATE POLICY "staff select itinerary documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'itineraries' AND private.is_staff(auth.uid())
  );

CREATE POLICY "staff upload itinerary documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'itineraries' AND private.is_staff(auth.uid())
  );

CREATE POLICY "staff update itinerary documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'itineraries' AND private.is_staff(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'itineraries' AND private.is_staff(auth.uid())
  );

CREATE POLICY "manager delete itinerary documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'itineraries' AND private.is_manager(auth.uid())
  );

NOTIFY pgrst, 'reload schema';
