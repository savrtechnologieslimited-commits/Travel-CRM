CREATE TABLE IF NOT EXISTS public.itinerary_cost_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  itinerary_item_id uuid REFERENCES public.itinerary_day_items(id) ON DELETE SET NULL,
  cost_category text NOT NULL CHECK (cost_category IN ('HOTEL', 'TRANSPORT', 'ACTIVITY', 'FLIGHT', 'VISA', 'EXTRA_TRANSPORT', 'OTHER')),
  description text NOT NULL CHECK (length(trim(description)) > 0),
  supplier_ref text,
  quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT 'unit' CHECK (length(trim(unit)) > 0),
  unit_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  total_cost numeric(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  notes text,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  source text CHECK (source IS NULL OR source IN ('manual', 'booking', 'supplier', 'derived')),
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itinerary_cost_lines_itinerary_sequence_idx
  ON public.itinerary_cost_lines (itinerary_id, sequence);

CREATE INDEX IF NOT EXISTS itinerary_cost_lines_item_idx
  ON public.itinerary_cost_lines (itinerary_item_id);

CREATE INDEX IF NOT EXISTS itinerary_cost_lines_category_idx
  ON public.itinerary_cost_lines (itinerary_id, cost_category);

CREATE OR REPLACE FUNCTION private.validate_itinerary_cost_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.itinerary_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.itinerary_day_items item
    JOIN public.itinerary_days day ON day.id = item.itinerary_day_id
    WHERE item.id = NEW.itinerary_item_id AND day.itinerary_id = NEW.itinerary_id
  ) THEN
    RAISE EXCEPTION 'Cost line item must belong to the same itinerary';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_itinerary_cost_scope ON public.itinerary_cost_lines;
CREATE TRIGGER validate_itinerary_cost_scope
  BEFORE INSERT OR UPDATE ON public.itinerary_cost_lines
  FOR EACH ROW EXECUTE FUNCTION private.validate_itinerary_cost_scope();

CREATE TRIGGER set_itinerary_cost_lines_updated_at
  BEFORE UPDATE ON public.itinerary_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.itinerary_cost_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select itinerary cost lines" ON public.itinerary_cost_lines
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert itinerary cost lines" ON public.itinerary_cost_lines
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update itinerary cost lines" ON public.itinerary_cost_lines
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete itinerary cost lines" ON public.itinerary_cost_lines
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));
