CREATE TABLE IF NOT EXISTS public.itinerary_package_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itinerary_package_options_itinerary_sequence_idx
  ON public.itinerary_package_options (itinerary_id, sequence);

ALTER TABLE public.itinerary_day_items
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.itinerary_package_options(id) ON DELETE SET NULL;

ALTER TABLE public.itinerary_cost_lines
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.itinerary_package_options(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.validate_itinerary_package_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.itinerary_package_options pkg
    WHERE pkg.id = NEW.package_id AND pkg.itinerary_id = NEW.itinerary_id
  ) THEN
    RAISE EXCEPTION 'Package option must belong to the same itinerary';
  END IF;

  IF NEW.package_id IS NOT NULL AND NEW.itinerary_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.itinerary_day_items item
    JOIN public.itinerary_days day ON day.id = item.itinerary_day_id
    JOIN public.itinerary_package_options pkg ON pkg.id = NEW.package_id
    WHERE item.id = NEW.itinerary_item_id
      AND day.itinerary_id = pkg.itinerary_id
      AND day.itinerary_id = NEW.itinerary_id
  ) THEN
    RAISE EXCEPTION 'Cost line package and item must belong to the same itinerary';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_itinerary_package_scope ON public.itinerary_cost_lines;
CREATE TRIGGER validate_itinerary_package_scope
  BEFORE INSERT OR UPDATE ON public.itinerary_cost_lines
  FOR EACH ROW EXECUTE FUNCTION private.validate_itinerary_package_scope();

CREATE OR REPLACE FUNCTION private.validate_itinerary_item_package_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.itinerary_day_items item
    JOIN public.itinerary_days day ON day.id = item.itinerary_day_id
    JOIN public.itinerary_package_options pkg ON pkg.id = NEW.package_id
    WHERE item.id = NEW.id
      AND day.itinerary_id = pkg.itinerary_id
  ) THEN
    RAISE EXCEPTION 'Package option must belong to the same itinerary as the itinerary item';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_itinerary_item_package_scope ON public.itinerary_day_items;
CREATE TRIGGER validate_itinerary_item_package_scope
  BEFORE INSERT OR UPDATE ON public.itinerary_day_items
  FOR EACH ROW EXECUTE FUNCTION private.validate_itinerary_item_package_scope();

CREATE TRIGGER set_itinerary_package_options_updated_at
  BEFORE UPDATE ON public.itinerary_package_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.itinerary_package_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_day_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_cost_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select itinerary package options" ON public.itinerary_package_options
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert itinerary package options" ON public.itinerary_package_options
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update itinerary package options" ON public.itinerary_package_options
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete itinerary package options" ON public.itinerary_package_options
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));
