CREATE TABLE IF NOT EXISTS public.itinerary_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  itinerary_id uuid REFERENCES public.itineraries(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  draft_data jsonb NOT NULL CHECK (jsonb_typeof(draft_data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itinerary_drafts_user_updated_idx
  ON public.itinerary_drafts (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS itinerary_drafts_itinerary_idx
  ON public.itinerary_drafts (itinerary_id)
  WHERE itinerary_id IS NOT NULL;

ALTER TABLE public.itinerary_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.itinerary_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itinerary_drafts TO authenticated;
GRANT ALL ON public.itinerary_drafts TO service_role;

DROP POLICY IF EXISTS "staff select own itinerary drafts" ON public.itinerary_drafts;
DROP POLICY IF EXISTS "staff insert own itinerary drafts" ON public.itinerary_drafts;
DROP POLICY IF EXISTS "staff update own itinerary drafts" ON public.itinerary_drafts;
DROP POLICY IF EXISTS "staff delete own itinerary drafts" ON public.itinerary_drafts;

CREATE POLICY "staff select own itinerary drafts" ON public.itinerary_drafts
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "staff insert own itinerary drafts" ON public.itinerary_drafts
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "staff update own itinerary drafts" ON public.itinerary_drafts
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()) AND user_id = auth.uid())
  WITH CHECK (private.is_staff(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "staff delete own itinerary drafts" ON public.itinerary_drafts
  FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()) AND user_id = auth.uid());

DROP TRIGGER IF EXISTS set_itinerary_drafts_updated_at ON public.itinerary_drafts;
CREATE TRIGGER set_itinerary_drafts_updated_at
  BEFORE UPDATE ON public.itinerary_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
