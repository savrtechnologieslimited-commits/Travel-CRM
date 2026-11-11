CREATE UNIQUE INDEX IF NOT EXISTS notifications_wacrm_destination_selected_dedupe_idx
  ON public.notifications (user_id, category, link)
  WHERE category = 'wacrm_destination_selected'
    AND link IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_wacrm_flow_destination_selected(
  p_wacrm_run_id uuid,
  p_contact_name text,
  p_destination_id uuid,
  p_destination_name text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_customer_name text := coalesce(nullif(trim(p_contact_name), ''), 'WhatsApp customer');
  v_destination_name text;
  v_assigned_employee_id uuid;
  v_assignment_count integer := 0;
  v_link text;
  v_inserted_count integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role is required' USING ERRCODE = '42501';
  END IF;
  IF p_wacrm_run_id IS NULL THEN
    RAISE EXCEPTION 'WACRM flow run ID is required' USING ERRCODE = '22023';
  END IF;

  IF p_destination_id IS NOT NULL THEN
    SELECT nullif(trim(destination.name), '')
      INTO v_destination_name
      FROM public.destinations AS destination
     WHERE destination.id = p_destination_id
       AND destination.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active destination not found' USING ERRCODE = '22023';
    END IF;

    SELECT
      count(DISTINCT assignment.employee_id),
      min(assignment.employee_id::text)::uuid
      INTO v_assignment_count, v_assigned_employee_id
      FROM public.destination_employee_assignments AS assignment
      JOIN public.profiles AS employee
        ON employee.id = assignment.employee_id
       AND employee.is_active
     WHERE assignment.destination_id = p_destination_id
       AND assignment.is_active;
  END IF;
  v_destination_name := coalesce(
    v_destination_name,
    nullif(trim(p_destination_name), ''),
    'no catalog destination'
  );
  v_link := '/leads?source=wacrm&flowRunId=' || p_wacrm_run_id::text;

  IF v_assignment_count = 1 THEN
    INSERT INTO public.notifications (user_id, title, body, category, link)
    SELECT
      v_assigned_employee_id,
      'New WhatsApp destination interest: ' || v_customer_name,
      'Showed interest in ' || v_destination_name
        || ' through WhatsApp. Please follow up.',
      'wacrm_destination_selected',
      v_link
    ON CONFLICT (user_id, category, link)
      WHERE category = 'wacrm_destination_selected'
        AND link IS NOT NULL
      DO NOTHING;
  ELSE
    INSERT INTO public.notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      user_role.user_id,
      'New WhatsApp destination interest: ' || v_customer_name,
      CASE
        WHEN p_destination_id IS NULL THEN
          'A customer showed interest through WhatsApp without choosing a catalog destination. Please review.'
        ELSE
          'Showed interest in ' || v_destination_name
            || ' through WhatsApp, but no single active assignee could be identified. Please review the assignment.'
      END,
      'wacrm_destination_selected',
      v_link
      FROM public.user_roles AS user_role
      JOIN public.profiles AS profile
        ON profile.id = user_role.user_id
       AND profile.is_active
     WHERE user_role.role IN ('admin'::public.app_role, 'manager'::public.app_role)
    ON CONFLICT (user_id, category, link)
      WHERE category = 'wacrm_destination_selected'
        AND link IS NOT NULL
      DO NOTHING;
  END IF;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$$;

ALTER FUNCTION public.notify_wacrm_flow_destination_selected(uuid, text, uuid, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_wacrm_flow_destination_selected(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_wacrm_flow_destination_selected(uuid, text, uuid, text)
  TO service_role;
