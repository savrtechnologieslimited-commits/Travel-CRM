CREATE TABLE IF NOT EXISTS public.lead_note_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('internal', 'client_requirement')),
  content text NOT NULL CHECK (length(btrim(content)) > 0),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS lead_note_entries_lead_kind_created_idx
  ON public.lead_note_entries (lead_id, kind, created_at, id);

GRANT SELECT, INSERT, UPDATE ON public.lead_note_entries TO authenticated;
ALTER TABLE public.lead_note_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select lead note entries" ON public.lead_note_entries
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert lead note entries" ON public.lead_note_entries
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "staff update lead note entries" ON public.lead_note_entries
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

INSERT INTO public.lead_note_entries (lead_id, kind, content, created_by, created_at)
SELECT id, 'internal', notes, COALESCE(updated_by, created_by), COALESCE(updated_at, created_at)
FROM public.leads
WHERE NULLIF(btrim(notes), '') IS NOT NULL;

INSERT INTO public.lead_note_entries (lead_id, kind, content, created_by, created_at)
SELECT id, 'client_requirement', special_requirements, COALESCE(updated_by, created_by), COALESCE(updated_at, created_at)
FROM public.leads
WHERE NULLIF(btrim(special_requirements), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_lead_note_entry_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
    NEW.deleted_by := NULL;
    NEW.deleted_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Lead note content and author cannot be changed';
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    NEW.deleted_by := auth.uid();
    NEW.deleted_at := now();
  ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    RAISE EXCEPTION 'Lead note deletion attribution cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_lead_note_entry_attribution
  BEFORE INSERT OR UPDATE ON public.lead_note_entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_lead_note_entry_attribution();

CREATE OR REPLACE FUNCTION public.sync_lead_note_entries_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_lead_id uuid := COALESCE(NEW.lead_id, OLD.lead_id);
  target_kind text := COALESCE(NEW.kind, OLD.kind);
  combined_content text;
BEGIN
  SELECT string_agg(content, E'\n\n' ORDER BY created_at, id)
  INTO combined_content
  FROM public.lead_note_entries
  WHERE lead_id = target_lead_id
    AND kind = target_kind
    AND deleted_at IS NULL;

  IF target_kind = 'internal' THEN
    UPDATE public.leads SET notes = combined_content WHERE id = target_lead_id;
  ELSE
    UPDATE public.leads SET special_requirements = combined_content WHERE id = target_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_lead_note_entries_to_lead
  AFTER INSERT OR UPDATE ON public.lead_note_entries
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_note_entries_to_lead();

CREATE OR REPLACE FUNCTION public.capture_initial_lead_note_entries()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(NEW.notes), '') IS NOT NULL THEN
    INSERT INTO public.lead_note_entries (lead_id, kind, content)
    VALUES (NEW.id, 'internal', NEW.notes);
  END IF;

  IF NULLIF(btrim(NEW.special_requirements), '') IS NOT NULL THEN
    INSERT INTO public.lead_note_entries (lead_id, kind, content)
    VALUES (NEW.id, 'client_requirement', NEW.special_requirements);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER capture_initial_lead_note_entries
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.capture_initial_lead_note_entries();
