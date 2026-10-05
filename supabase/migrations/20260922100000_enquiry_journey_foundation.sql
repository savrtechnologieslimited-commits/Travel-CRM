-- Enquiries are the parent journey identity. Existing `code` values remain
-- untouched because they are part of the legacy CRM contract.

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS enquiry_number text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL';

ALTER TABLE public.enquiries
  ADD CONSTRAINT enquiries_source_check
  CHECK (source IN ('WHATSAPP', 'WEBSITE', 'PHONE', 'EMAIL', 'WALK_IN', 'MANUAL', 'OTHER'));

CREATE UNIQUE INDEX IF NOT EXISTS enquiries_enquiry_number_key
  ON public.enquiries (enquiry_number)
  WHERE enquiry_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS enquiries_customer_idx
  ON public.enquiries (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS enquiries_destination_idx
  ON public.enquiries (destination_id)
  WHERE destination_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS enquiries_assignee_idx
  ON public.enquiries (assigned_to)
  WHERE assigned_to IS NOT NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enquiry_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_enquiry_id_fkey'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_enquiry_id_fkey
      FOREIGN KEY (enquiry_id) REFERENCES public.enquiries(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS leads_enquiry_idx
  ON public.leads (enquiry_id)
  WHERE enquiry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.current_fin_year(p_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM p_at) >= 4
      THEN format('%s-%s', to_char(p_at, 'YYYY'), to_char(p_at + interval '1 year', 'YY'))
    ELSE format('%s-%s', to_char(p_at - interval '1 year', 'YYYY'), to_char(p_at, 'YY'))
  END;
$$;

CREATE OR REPLACE FUNCTION private.next_enquiry_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_fin_year text := private.current_fin_year(now());
  v_next_number integer;
BEGIN
  -- The advisory lock serializes creation of a missing yearly series; the
  -- row lock serializes increments once the series exists.
  PERFORM pg_advisory_xact_lock(hashtextextended('ENQ:' || v_fin_year, 0));

  SELECT next_number
    INTO v_next_number
    FROM public.document_series
   WHERE doc_type = 'ENQ'
     AND fin_year = v_fin_year
   FOR UPDATE;

  IF NOT FOUND THEN
    v_next_number := 1;
    INSERT INTO public.document_series (doc_type, prefix, fin_year, next_number)
    VALUES ('ENQ', 'ENQ', v_fin_year, 2);
  ELSE
    UPDATE public.document_series
       SET next_number = v_next_number + 1,
           updated_at = now()
     WHERE doc_type = 'ENQ'
       AND fin_year = v_fin_year;
  END IF;

  RETURN format('ENQ/%s/%s', v_fin_year, lpad(v_next_number::text, 6, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_enquiry_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.enquiry_number IS NULL THEN
    NEW.enquiry_number := private.next_enquiry_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_enquiry_number_on_insert ON public.enquiries;
CREATE TRIGGER assign_enquiry_number_on_insert
  BEFORE INSERT ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.assign_enquiry_number();

CREATE OR REPLACE FUNCTION public.create_enquiry(
  p_customer_id uuid DEFAULT NULL,
  p_source text DEFAULT 'MANUAL',
  p_destination_id uuid DEFAULT NULL,
  p_assigned_employee_id uuid DEFAULT NULL,
  p_status text DEFAULT 'new'
)
RETURNS TABLE (id uuid, enquiry_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF p_source NOT IN ('WHATSAPP', 'WEBSITE', 'PHONE', 'EMAIL', 'WALK_IN', 'MANUAL', 'OTHER') THEN
    RAISE EXCEPTION 'Unsupported enquiry source: %', p_source;
  END IF;

  RETURN QUERY
  INSERT INTO public.enquiries (
    customer_id,
    source,
    destination_id,
    assigned_to,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_customer_id,
    p_source,
    p_destination_id,
    p_assigned_employee_id,
    p_status,
    auth.uid(),
    auth.uid()
  )
  RETURNING public.enquiries.id, public.enquiries.enquiry_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_enquiry(uuid, text, uuid, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_enquiry(uuid, text, uuid, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_enquiry_number() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.current_fin_year(timestamptz) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.next_enquiry_number() FROM anon, authenticated, PUBLIC;