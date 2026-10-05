CREATE TABLE public.user_tab_permissions (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tab_path text NOT NULL CHECK (
    tab_path IN (
      '/dashboard',
      '/leads',
      '/customers',
      '/itinerary-proposals',
      '/itinerary-library',
      '/quotations',
      '/bookings',
      '/payments',
      '/suppliers',
      '/packages',
      '/groups',
      '/wacrm',
      '/gmail',
      '/operations',
      '/team-tasks',
      '/reports',
      '/activity',
      '/team',
      '/settings',
      '/payables',
      '/invoices',
      '/finance'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tab_path)
);

ALTER TABLE public.user_tab_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own tab permissions"
  ON public.user_tab_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Administrators can read all tab permissions"
  ON public.user_tab_permissions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.user_tab_permissions TO authenticated;
GRANT ALL ON public.user_tab_permissions TO service_role;

CREATE OR REPLACE FUNCTION public.replace_user_tab_permissions(
  p_user_id uuid,
  p_tab_paths text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_tab_paths IS NULL OR cardinality(p_tab_paths) = 0 THEN
    RAISE EXCEPTION 'At least one tab must be selected.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_tab_paths) AS requested(path)
    WHERE requested.path NOT IN (
      '/dashboard',
      '/leads',
      '/customers',
      '/itinerary-proposals',
      '/itinerary-library',
      '/quotations',
      '/bookings',
      '/payments',
      '/suppliers',
      '/packages',
      '/groups',
      '/wacrm',
      '/gmail',
      '/operations',
      '/team-tasks',
      '/reports',
      '/activity',
      '/team',
      '/settings',
      '/payables',
      '/invoices',
      '/finance'
    )
  ) THEN
    RAISE EXCEPTION 'One or more selected tabs are invalid.';
  END IF;

  DELETE FROM public.user_tab_permissions
  WHERE user_id = p_user_id;

  INSERT INTO public.user_tab_permissions (user_id, tab_path)
  SELECT p_user_id, requested.path
  FROM (SELECT DISTINCT unnest(p_tab_paths) AS path) AS requested;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_user_tab_permissions(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_user_tab_permissions(uuid, text[])
  TO service_role;

UPDATE public.user_roles
SET role = 'operations'::public.app_role
WHERE role::text IN ('sales_executive', 'accounts', 'visa_executive');

INSERT INTO public.user_tab_permissions (user_id, tab_path)
SELECT profile.id, tab.path
FROM public.profiles AS profile
CROSS JOIN unnest(
  ARRAY[
    '/dashboard',
    '/leads',
    '/customers',
    '/itinerary-proposals',
    '/itinerary-library',
    '/quotations',
    '/bookings',
    '/payments',
    '/suppliers',
    '/packages',
    '/groups',
    '/wacrm',
    '/gmail',
    '/operations',
    '/team-tasks',
    '/reports',
    '/activity',
    '/team',
    '/settings',
    '/payables',
    '/invoices',
    '/finance'
  ]::text[]
) AS tab(path)
ON CONFLICT (user_id, tab_path) DO NOTHING;
