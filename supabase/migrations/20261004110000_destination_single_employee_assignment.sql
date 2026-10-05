DROP POLICY IF EXISTS "staff insert destination_employee_assignments"
  ON public.destination_employee_assignments;
DROP POLICY IF EXISTS "staff update destination_employee_assignments"
  ON public.destination_employee_assignments;
DROP POLICY IF EXISTS "manager delete destination_employee_assignments"
  ON public.destination_employee_assignments;

WITH ambiguous_destinations AS (
  SELECT destination_id
  FROM public.destination_employee_assignments
  WHERE is_active
  GROUP BY destination_id
  HAVING count(*) > 1
)
UPDATE public.destination_employee_assignments assignment
   SET is_active = false,
       updated_at = now()
 WHERE assignment.is_active
   AND assignment.destination_id IN (
     SELECT destination_id FROM ambiguous_destinations
   );

CREATE UNIQUE INDEX destination_employee_assignments_one_active_per_destination_idx
  ON public.destination_employee_assignments (destination_id)
  WHERE is_active = true;

CREATE POLICY "managers insert destination_employee_assignments"
  ON public.destination_employee_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.destinations destination
      WHERE destination.id = destination_id AND destination.is_active
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = employee_id AND profile.is_active
    )
  );

CREATE POLICY "managers update destination_employee_assignments"
  ON public.destination_employee_assignments
  FOR UPDATE TO authenticated
  USING (private.is_manager(auth.uid()))
  WITH CHECK (
    private.is_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.destinations destination
      WHERE destination.id = destination_id AND destination.is_active
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = employee_id AND profile.is_active
    )
  );

CREATE POLICY "managers delete destination_employee_assignments"
  ON public.destination_employee_assignments
  FOR DELETE TO authenticated
  USING (private.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_destination_employee_assignment(
  p_destination_id uuid,
  p_employee_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Manager access is required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.destinations destination
  WHERE destination.id = p_destination_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.destinations destination
    WHERE destination.id = p_destination_id
      AND destination.is_active
  ) THEN
    RAISE EXCEPTION 'Active destination not found'
      USING ERRCODE = '22023';
  END IF;

  IF p_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_employee_id
      AND profile.is_active
  ) THEN
    RAISE EXCEPTION 'Active employee not found'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.destination_employee_assignments assignment
     SET is_active = false,
         updated_at = now()
   WHERE assignment.destination_id = p_destination_id
     AND assignment.is_active;

  IF p_employee_id IS NOT NULL THEN
    INSERT INTO public.destination_employee_assignments (
      destination_id,
      employee_id,
      is_active
    )
    VALUES (p_destination_id, p_employee_id, true)
    ON CONFLICT (destination_id, employee_id)
      WHERE is_active
    DO NOTHING;
  END IF;
END;
$$;

ALTER FUNCTION public.set_destination_employee_assignment(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_destination_employee_assignment(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_destination_employee_assignment(uuid, uuid)
  TO authenticated, service_role;
