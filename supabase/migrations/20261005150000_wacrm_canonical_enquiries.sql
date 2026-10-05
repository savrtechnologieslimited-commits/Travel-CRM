ALTER TABLE public.customer_flow_requirements
  ADD COLUMN IF NOT EXISTS enquiry_id uuid
    REFERENCES public.enquiries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_id uuid
    REFERENCES public.destinations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wacrm_conversation_id uuid,
  ADD COLUMN IF NOT EXISTS is_partial boolean NOT NULL DEFAULT false;

ALTER TABLE public.enquiries
  DROP CONSTRAINT IF EXISTS enquiries_status_check;

ALTER TABLE public.enquiries
  ADD CONSTRAINT enquiries_status_check
  CHECK (status IN ('new', 'open', 'quoted', 'converted', 'closed'));

CREATE INDEX IF NOT EXISTS customer_flow_requirements_enquiry_idx
  ON public.customer_flow_requirements (enquiry_id)
  WHERE enquiry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_wacrm_flow_enquiry(
  p_wacrm_run_id uuid,
  p_wacrm_flow_id uuid,
  p_wacrm_contact_id uuid,
  p_wacrm_conversation_id uuid,
  p_flow_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_completed_at timestamptz,
  p_is_partial boolean,
  p_handoff_requested boolean,
  p_answers jsonb,
  p_destination_id uuid DEFAULT NULL,
  p_assigned_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  customer_id uuid,
  requirement_id uuid,
  created_customer boolean,
  lead_id uuid,
  enquiry_id uuid,
  enquiry_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_created record;
  v_destination_id uuid;
  v_destination_scope public.trip_scope;
  v_destination_name text;
  v_scope public.trip_scope;
  v_assigned_to uuid;
  v_fallback_setting text;
  v_assignment_count integer := 0;
  v_current_assignee uuid;
  v_customer_name text;
  v_adults integer := 1;
  v_children integer := 0;
  v_budget numeric;
  v_budget_currency text := 'INR';
  v_travel_date date;
  v_date_text text;
  v_budget_text text;
  v_clean_answers jsonb;
  v_enquiry_number text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role is required' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'WhatsApp enquiry answers must be an object'
      USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(p_flow_name), '') IS NULL OR p_completed_at IS NULL THEN
    RAISE EXCEPTION 'WhatsApp enquiry metadata is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wacrm-flow-run:' || p_wacrm_run_id::text, 0)
  );

  v_customer_name := coalesce(
    nullif(trim(p_answers->>'customer_name'), ''),
    nullif(trim(p_contact_name), ''),
    'WhatsApp customer'
  );

  SELECT result.customer_id, result.requirement_id, result.created_customer, result.lead_id
    INTO v_created
    FROM public.record_wacrm_flow_requirement(
      p_wacrm_run_id,
      p_wacrm_flow_id,
      p_wacrm_contact_id,
      p_flow_name,
      v_customer_name,
      p_contact_email,
      p_contact_phone,
      p_completed_at,
      p_answers,
      p_destination_id
    ) AS result;

  customer_id := v_created.customer_id;
  requirement_id := v_created.requirement_id;
  created_customer := v_created.created_customer;
  lead_id := v_created.lead_id;
  IF customer_id IS NULL OR requirement_id IS NULL THEN
    RAISE EXCEPTION 'WACRM customer requirement could not be recorded'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT requirement.destination_id, requirement.enquiry_id, requirement.lead_id
    INTO v_destination_id, enquiry_id, lead_id
    FROM public.customer_flow_requirements AS requirement
   WHERE requirement.id = requirement_id
   FOR UPDATE;

  v_destination_id := coalesce(p_destination_id, v_destination_id);
  IF v_destination_id IS NOT NULL THEN
    SELECT destination.scope, destination.name
      INTO v_destination_scope, v_destination_name
      FROM public.destinations AS destination
     WHERE destination.id = v_destination_id
       AND destination.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active destination not found'
        USING ERRCODE = '22023';
    END IF;

    SELECT count(*), min(assignment.employee_id::text)::uuid
      INTO v_assignment_count, v_current_assignee
      FROM public.destination_employee_assignments AS assignment
      JOIN public.profiles AS employee
        ON employee.id = assignment.employee_id
       AND employee.is_active
     WHERE assignment.destination_id = v_destination_id
       AND assignment.is_active;

    IF p_assigned_employee_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.destination_employee_assignments AS assignment
      JOIN public.profiles AS employee
        ON employee.id = assignment.employee_id
       AND employee.is_active
      WHERE assignment.destination_id = v_destination_id
        AND assignment.employee_id = p_assigned_employee_id
        AND assignment.is_active
    ) THEN
      v_assigned_to := p_assigned_employee_id;
    ELSIF v_assignment_count = 1 THEN
      v_assigned_to := v_current_assignee;
    ELSE
      v_assigned_to := NULL;
    END IF;
    v_scope := v_destination_scope;
  ELSE
    v_scope := CASE lower(coalesce(p_answers->>'travel_type', ''))
      WHEN 'international' THEN 'international'::public.trip_scope
      ELSE 'domestic'::public.trip_scope
    END;
    IF p_handoff_requested THEN
      SELECT setting.value->>'default_assignee_id'
        INTO v_fallback_setting
        FROM public.app_settings AS setting
       WHERE setting.key = 'wacrm_integration';
      IF nullif(trim(v_fallback_setting), '') IS NOT NULL THEN
        IF v_fallback_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'The configured WhatsApp fallback employee is invalid'
            USING ERRCODE = '22023';
        END IF;
        SELECT profile.id
          INTO v_assigned_to
          FROM public.profiles AS profile
         WHERE profile.id = v_fallback_setting::uuid
           AND profile.is_active;
        IF v_assigned_to IS NULL THEN
          RAISE EXCEPTION 'The configured WhatsApp fallback employee is inactive'
            USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
  END IF;

  v_date_text := nullif(trim(p_answers->>'__wacrm_travel_date_iso'), '');
  IF v_date_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      v_travel_date := v_date_text::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      v_travel_date := NULL;
    END;
  END IF;

  IF p_answers->>'adults' ~ '^\d{1,4}$' THEN
    v_adults := LEAST((p_answers->>'adults')::integer, 1000);
  END IF;
  IF p_answers->>'children' ~ '^\d{1,4}$' THEN
    v_children := LEAST((p_answers->>'children')::integer, 1000);
  END IF;

  v_budget_text := nullif(trim(p_answers->>'__wacrm_budget_amount'), '');
  IF v_budget_text ~ '^\d{1,12}(\.\d{1,2})?$' THEN
    v_budget := v_budget_text::numeric;
  END IF;
  v_budget_currency := upper(coalesce(
    nullif(trim(p_answers->>'__wacrm_budget_currency'), ''),
    'INR'
  ));
  IF v_budget_currency !~ '^[A-Z]{3}$' THEN
    v_budget_currency := 'INR';
  END IF;

  v_clean_answers := p_answers
    - '__wacrm_travel_date_iso'
    - '__wacrm_budget_amount'
    - '__wacrm_budget_currency';

  IF lead_id IS NULL THEN
    INSERT INTO public.leads (
      customer_id, customer_name, mobile, whatsapp, email, source, scope,
      destination_id, destination_text, travel_start, adults, children,
      budget, currency, special_requirements, assigned_to, lead_date, status,
      notes
    )
    VALUES (
      customer_id,
      v_customer_name,
      nullif(private.normalize_whatsapp_phone(p_contact_phone), ''),
      nullif(private.normalize_whatsapp_phone(p_contact_phone), ''),
      nullif(lower(trim(p_contact_email)), ''),
      'whatsapp',
      v_scope,
      v_destination_id,
      v_destination_name,
      v_travel_date,
      v_adults,
      v_children,
      v_budget,
      v_budget_currency,
      nullif(trim(p_answers->>'special_requirements'), ''),
      v_assigned_to,
      current_date,
      'new',
      'WhatsApp enquiry received via ' || trim(p_flow_name)
    )
    RETURNING id INTO lead_id;
  ELSE
    UPDATE public.leads AS lead
       SET customer_id = record_wacrm_flow_enquiry.customer_id,
           customer_name = v_customer_name,
           mobile = coalesce(nullif(private.normalize_whatsapp_phone(p_contact_phone), ''), lead.mobile),
           whatsapp = coalesce(nullif(private.normalize_whatsapp_phone(p_contact_phone), ''), lead.whatsapp),
           email = coalesce(nullif(lower(trim(p_contact_email)), ''), lead.email),
           source = 'whatsapp',
           scope = v_scope,
           destination_id = v_destination_id,
           destination_text = coalesce(v_destination_name, lead.destination_text),
           travel_start = coalesce(v_travel_date, lead.travel_start),
           adults = v_adults,
           children = v_children,
           budget = coalesce(v_budget, lead.budget),
           currency = CASE WHEN v_budget IS NULL THEN lead.currency ELSE v_budget_currency END,
           special_requirements = coalesce(
             nullif(trim(p_answers->>'special_requirements'), ''),
             lead.special_requirements
           ),
           assigned_to = v_assigned_to,
           updated_at = now()
     WHERE lead.id = lead_id;
  END IF;

  IF enquiry_id IS NULL THEN
    SELECT created.id, created.enquiry_number
      INTO enquiry_id, v_enquiry_number
      FROM public.create_enquiry(
        p_customer_id => customer_id,
        p_source => 'WHATSAPP',
        p_destination_id => v_destination_id,
        p_assigned_employee_id => v_assigned_to,
        p_status => 'new'
      ) AS created;
  ELSE
    SELECT enquiry.enquiry_number
      INTO v_enquiry_number
      FROM public.enquiries AS enquiry
     WHERE enquiry.id = enquiry_id;
  END IF;

  UPDATE public.enquiries AS enquiry
     SET lead_id = record_wacrm_flow_enquiry.lead_id,
         customer_id = record_wacrm_flow_enquiry.customer_id,
         source = 'WHATSAPP',
         destination_id = v_destination_id,
         scope = v_scope,
         departure_date = coalesce(v_travel_date, enquiry.departure_date),
         departure_city = coalesce(
           nullif(trim(p_answers->>'departure_city'), ''),
           enquiry.departure_city
         ),
         adults = v_adults,
         children = v_children,
         total_budget = coalesce(v_budget, enquiry.total_budget),
         total_budget_inr = CASE
           WHEN v_budget IS NULL THEN enquiry.total_budget_inr
           WHEN v_budget_currency = 'INR' THEN v_budget
           ELSE NULL
         END,
         currency = CASE WHEN v_budget IS NULL THEN enquiry.currency ELSE v_budget_currency END,
         requirements = coalesce(
           nullif(trim(p_answers->>'special_requirements'), ''),
           enquiry.requirements
         ),
         status = 'new',
         assigned_to = v_assigned_to,
         updated_at = now()
   WHERE enquiry.id = record_wacrm_flow_enquiry.enquiry_id;

  UPDATE public.leads AS lead
     SET enquiry_id = record_wacrm_flow_enquiry.enquiry_id,
         assigned_to = v_assigned_to,
         destination_id = v_destination_id,
         scope = v_scope,
         updated_at = now()
   WHERE lead.id = record_wacrm_flow_enquiry.lead_id;

  UPDATE public.customer_flow_requirements AS requirement
     SET answers = v_clean_answers,
         completed_at = p_completed_at,
         flow_name = trim(p_flow_name),
         wacrm_conversation_id = p_wacrm_conversation_id,
         is_partial = coalesce(p_is_partial, false),
         destination_id = v_destination_id,
         lead_id = record_wacrm_flow_enquiry.lead_id,
         enquiry_id = record_wacrm_flow_enquiry.enquiry_id
   WHERE requirement.id = requirement_id;

  enquiry_number := v_enquiry_number;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.record_wacrm_flow_enquiry(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, boolean,
  boolean, jsonb, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_wacrm_flow_enquiry(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, boolean,
  boolean, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_wacrm_flow_enquiry(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, boolean,
  boolean, jsonb, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION private.user_has_customer_destination_access(
  p_customer_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND NOT private.is_manager(auth.uid()) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.leads AS lead
    WHERE lead.customer_id = p_customer_id
      AND lead.deleted_at IS NULL
      AND (
        lead.assigned_to = p_user_id
        OR (
          lead.destination_id IS NOT NULL
          AND private.user_has_destination_access(lead.destination_id, p_user_id)
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.enquiries AS enquiry
    WHERE enquiry.customer_id = p_customer_id
      AND enquiry.deleted_at IS NULL
      AND (
        enquiry.assigned_to = p_user_id
        OR (
          enquiry.destination_id IS NOT NULL
          AND private.user_has_destination_access(enquiry.destination_id, p_user_id)
        )
      )
  );
END;
$$;

DROP POLICY IF EXISTS "assigned destination leads only" ON public.leads;
CREATE POLICY "assigned destination leads only"
  ON public.leads
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR (
      deleted_at IS NULL
      AND (
        assigned_to = auth.uid()
        OR private.user_has_destination_access(destination_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "assigned destination enquiries only" ON public.enquiries;
CREATE POLICY "assigned destination enquiries only"
  ON public.enquiries
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR (
      deleted_at IS NULL
      AND (
        assigned_to = auth.uid()
        OR private.user_has_destination_access(destination_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "customer flow requirements follow destination access"
  ON public.customer_flow_requirements;
CREATE POLICY "customer flow requirements follow destination access"
  ON public.customer_flow_requirements
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = customer_flow_requirements.lead_id
        AND (
          lead.assigned_to = auth.uid()
          OR private.user_has_destination_access(lead.destination_id, auth.uid())
        )
    )
  );
