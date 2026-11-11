CREATE UNIQUE INDEX IF NOT EXISTS notifications_wacrm_flow_inactivity_dedupe_idx
  ON public.notifications (user_id, category, link)
  WHERE category = 'wacrm_flow_inactive'
    AND link IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_wacrm_flow_inactivity(
  p_wacrm_run_id uuid,
  p_contact_name text,
  p_destination_id uuid,
  p_destination_name text,
  p_inactivity_minutes integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_customer_name text := coalesce(nullif(trim(p_contact_name), ''), 'WhatsApp customer');
  v_destination_name text;
  v_link text;
  v_inserted_count integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role is required' USING ERRCODE = '42501';
  END IF;
  IF p_wacrm_run_id IS NULL THEN
    RAISE EXCEPTION 'WACRM flow run ID is required' USING ERRCODE = '22023';
  END IF;
  IF p_inactivity_minutes IS NULL OR p_inactivity_minutes < 1 OR p_inactivity_minutes > 10080 THEN
    RAISE EXCEPTION 'Inactivity interval must be between 1 and 10080 minutes'
      USING ERRCODE = '22023';
  END IF;

  IF p_destination_id IS NOT NULL THEN
    SELECT nullif(trim(destination.name), '')
      INTO v_destination_name
      FROM public.destinations AS destination
     WHERE destination.id = p_destination_id
       AND destination.is_active;
  END IF;
  v_destination_name := coalesce(
    v_destination_name,
    nullif(trim(p_destination_name), ''),
    'no catalog destination'
  );
  v_link := '/leads?source=wacrm&flowRunId=' || p_wacrm_run_id::text;

  IF p_destination_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.destination_employee_assignments AS assignment
      JOIN public.profiles AS employee
        ON employee.id = assignment.employee_id
       AND employee.is_active
     WHERE assignment.destination_id = p_destination_id
       AND assignment.is_active
  ) THEN
    INSERT INTO public.notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      assignment.employee_id,
      'WhatsApp follow-up needed: ' || v_customer_name,
      'The customer has not completed the flow after selecting ' || v_destination_name
        || ' and has not replied for ' || p_inactivity_minutes::text
        || ' minutes. Please reach out to follow up.',
      'wacrm_flow_inactive',
      v_link
      FROM public.destination_employee_assignments AS assignment
      JOIN public.profiles AS employee
        ON employee.id = assignment.employee_id
       AND employee.is_active
     WHERE assignment.destination_id = p_destination_id
       AND assignment.is_active
    ON CONFLICT (user_id, category, link)
      WHERE category = 'wacrm_flow_inactive'
        AND link IS NOT NULL
      DO NOTHING;
  ELSE
    INSERT INTO public.notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      user_role.user_id,
      'WhatsApp follow-up needed: ' || v_customer_name,
      CASE
        WHEN p_destination_id IS NULL THEN
          'The customer has not completed the flow after selecting ' || v_destination_name
            || ' and has not replied for ' || p_inactivity_minutes::text
            || ' minutes. Please reach out to follow up.'
        ELSE
          'The customer has not completed the flow after selecting ' || v_destination_name
            || ' and has not replied for ' || p_inactivity_minutes::text
            || ' minutes. Please reach out to follow up; no active destination assignee was found.'
      END,
      'wacrm_flow_inactive',
      v_link
      FROM public.user_roles AS user_role
      JOIN public.profiles AS profile
        ON profile.id = user_role.user_id
       AND profile.is_active
     WHERE user_role.role IN ('admin'::public.app_role, 'manager'::public.app_role)
    ON CONFLICT (user_id, category, link)
      WHERE category = 'wacrm_flow_inactive'
        AND link IS NOT NULL
      DO NOTHING;
  END IF;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$$;

ALTER FUNCTION public.notify_wacrm_flow_inactivity(uuid, text, uuid, text, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_wacrm_flow_inactivity(uuid, text, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_wacrm_flow_inactivity(uuid, text, uuid, text, integer)
  TO service_role;
