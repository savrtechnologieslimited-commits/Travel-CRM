CREATE OR REPLACE FUNCTION public.get_business_visible_profiles(p_include_inactive boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  login_id text,
  job_title text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    profile.id,
    profile.full_name,
    profile.email,
    profile.phone,
    profile.login_id,
    profile.job_title,
    profile.is_active,
    profile.created_at
  FROM public.profiles AS profile
  WHERE (p_include_inactive OR profile.is_active)
    AND NOT public.has_role(profile.id, 'developer'::public.app_role)
  ORDER BY profile.full_name;
$$;

REVOKE ALL ON FUNCTION public.get_business_visible_profiles(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_visible_profiles(boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
