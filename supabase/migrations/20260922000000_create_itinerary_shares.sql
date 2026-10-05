CREATE TABLE IF NOT EXISTS public.itinerary_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.itinerary_package_options(id) ON DELETE SET NULL,
  template text NOT NULL DEFAULT 'classic',
  token_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS itinerary_shares_itinerary_created_idx
  ON public.itinerary_shares (itinerary_id, created_at DESC);

CREATE INDEX IF NOT EXISTS itinerary_shares_token_hash_idx
  ON public.itinerary_shares (token_hash);

CREATE OR REPLACE FUNCTION private.validate_itinerary_share_package_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.itinerary_package_options pkg
    WHERE pkg.id = NEW.package_id AND pkg.itinerary_id = NEW.itinerary_id
  ) THEN
    RAISE EXCEPTION 'Shared package must belong to the same itinerary';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_itinerary_share_package_scope ON public.itinerary_shares;
CREATE TRIGGER validate_itinerary_share_package_scope
  BEFORE INSERT OR UPDATE ON public.itinerary_shares
  FOR EACH ROW EXECUTE FUNCTION private.validate_itinerary_share_package_scope();

CREATE TRIGGER set_itinerary_shares_updated_at
  BEFORE UPDATE ON public.itinerary_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.itinerary_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select itinerary shares" ON public.itinerary_shares
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert itinerary shares" ON public.itinerary_shares
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update itinerary shares" ON public.itinerary_shares
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete itinerary shares" ON public.itinerary_shares
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));
