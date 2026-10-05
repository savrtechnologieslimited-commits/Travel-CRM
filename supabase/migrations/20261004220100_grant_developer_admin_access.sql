CREATE OR REPLACE FUNCTION public.has_role("_user_id" uuid, "_role" public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = "_user_id"
      AND (
        role = "_role"
        OR ("_role" = 'admin'::public.app_role AND role = 'developer'::public.app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.is_manager("_user_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role("_user_id", 'admin'::public.app_role)
      OR public.has_role("_user_id", 'manager'::public.app_role);
$$;

NOTIFY pgrst, 'reload schema';
