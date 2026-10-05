CREATE TABLE public.customer_flow_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  wacrm_run_id uuid NOT NULL UNIQUE,
  wacrm_flow_id uuid NOT NULL,
  wacrm_contact_id uuid NOT NULL,
  flow_name text NOT NULL CHECK (length(trim(flow_name)) > 0),
  completed_at timestamptz NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(answers) = 'object'),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_flow_requirements_customer_completed_idx
  ON public.customer_flow_requirements (customer_id, completed_at, wacrm_run_id);

ALTER TABLE public.customer_flow_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_flow_requirements FROM anon, authenticated;
GRANT SELECT ON public.customer_flow_requirements TO authenticated;
GRANT ALL ON public.customer_flow_requirements TO service_role;

CREATE POLICY "Staff can view customer flow requirements"
  ON public.customer_flow_requirements
  FOR SELECT
  TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.record_wacrm_flow_requirement(
  p_wacrm_run_id uuid,
  p_wacrm_flow_id uuid,
  p_wacrm_contact_id uuid,
  p_flow_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_completed_at timestamptz,
  p_answers jsonb,
  p_destination_id uuid DEFAULT NULL
)
RETURNS TABLE (
  customer_id uuid,
  requirement_id uuid,
  created_customer boolean,
  lead_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_customer_id uuid;
  v_requirement_id uuid;
  v_lead_id uuid;
  v_phone_customer_id uuid;
  v_email_customer_id uuid;
  v_destination_scope public.trip_scope;
  v_destination_name text;
  v_assigned_to uuid;
  v_assignment_count integer := 0;
  v_phone text := nullif(private.normalize_whatsapp_phone(p_contact_phone), '');
  v_email text := lower(nullif(trim(p_contact_email), ''));
  v_created_customer boolean := false;
  v_customer_name text := coalesce(nullif(trim(p_contact_name), ''), 'WhatsApp customer');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role is required'
      USING ERRCODE = '42501';
  END IF;
  IF p_wacrm_run_id IS NULL OR p_wacrm_flow_id IS NULL OR p_wacrm_contact_id IS NULL
     OR p_completed_at IS NULL OR p_answers IS NULL
     OR jsonb_typeof(p_answers) <> 'object'
     OR nullif(trim(p_flow_name), '') IS NULL THEN
    RAISE EXCEPTION 'Completed flow data is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^[0-9]{7,15}$' THEN
    RAISE EXCEPTION 'The WhatsApp phone number is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_phone, '') = '' AND v_email IS NULL THEN
    RAISE EXCEPTION 'A phone number or email is required to link a customer'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wacrm-flow-run:' || p_wacrm_run_id::text, 0)
  );

  SELECT requirement.customer_id, requirement.id, requirement.lead_id
    INTO v_customer_id, v_requirement_id, v_lead_id
    FROM public.customer_flow_requirements AS requirement
   WHERE requirement.wacrm_run_id = p_wacrm_run_id;
  IF v_requirement_id IS NOT NULL THEN
    customer_id := v_customer_id;
    requirement_id := v_requirement_id;
    created_customer := false;
    lead_id := v_lead_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF nullif(v_phone, '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('wacrm-flow-phone:' || v_phone, 0)
    );
  END IF;
  IF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('wacrm-flow-email:' || v_email, 0)
    );
  END IF;

  IF nullif(v_phone, '') IS NOT NULL THEN
    SELECT customer.id
      INTO v_phone_customer_id
      FROM public.customers AS customer
     WHERE customer.deleted_at IS NULL
       AND (
         private.normalize_whatsapp_phone(customer.mobile) = v_phone
         OR private.normalize_whatsapp_phone(customer.whatsapp) = v_phone
       )
     ORDER BY customer.updated_at DESC, customer.created_at DESC
     LIMIT 1;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT customer.id
      INTO v_email_customer_id
      FROM public.customers AS customer
     WHERE customer.deleted_at IS NULL
       AND lower(trim(customer.email)) = v_email
     ORDER BY customer.updated_at DESC, customer.created_at DESC
     LIMIT 1;
  END IF;

  IF v_phone_customer_id IS NOT NULL
     AND v_email_customer_id IS NOT NULL
     AND v_phone_customer_id <> v_email_customer_id THEN
    RAISE EXCEPTION 'Phone and email match different CRM customers'
      USING ERRCODE = '23505';
  END IF;

  v_customer_id := coalesce(v_phone_customer_id, v_email_customer_id);
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (full_name, email, mobile, whatsapp)
    VALUES (v_customer_name, v_email, nullif(v_phone, ''), nullif(v_phone, ''))
    RETURNING id, full_name INTO v_customer_id, v_customer_name;
    v_created_customer := true;
  ELSE
    UPDATE public.customers AS customer
       SET email = coalesce(nullif(trim(customer.email), ''), v_email),
           mobile = coalesce(nullif(trim(customer.mobile), ''), nullif(v_phone, '')),
           whatsapp = coalesce(nullif(trim(customer.whatsapp), ''), nullif(v_phone, '')),
           full_name = CASE
             WHEN nullif(trim(customer.full_name), '') IS NULL
               OR lower(trim(customer.full_name)) = 'whatsapp customer'
             THEN v_customer_name
             ELSE customer.full_name
           END,
           updated_at = now()
     WHERE customer.id = v_customer_id
    RETURNING customer.full_name INTO v_customer_name;
  END IF;

  IF p_destination_id IS NOT NULL THEN
    SELECT destination.scope, destination.name
      INTO v_destination_scope, v_destination_name
      FROM public.destinations AS destination
     WHERE destination.id = p_destination_id
       AND destination.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active destination not found'
        USING ERRCODE = '22023';
    END IF;

    SELECT count(*), min(assignment.employee_id::text)::uuid
      INTO v_assignment_count, v_assigned_to
      FROM public.destination_employee_assignments AS assignment
      JOIN public.profiles AS employee
        ON employee.id = assignment.employee_id
       AND employee.is_active
     WHERE assignment.destination_id = p_destination_id
       AND assignment.is_active;

    INSERT INTO public.leads (
      customer_id,
      customer_name,
      mobile,
      whatsapp,
      email,
      source,
      scope,
      destination_id,
      destination_text,
      travel_start,
      travel_end,
      adults,
      children,
      special_requirements,
      assigned_to,
      lead_date,
      currency,
      status,
      notes
    )
    VALUES (
      v_customer_id,
      v_customer_name,
      nullif(v_phone, ''),
      nullif(v_phone, ''),
      v_email,
      'whatsapp',
      v_destination_scope,
      p_destination_id,
      v_destination_name,
      NULL,
      NULL,
      CASE
        WHEN p_answers->>'adults' ~ '^\d{1,4}$'
          THEN LEAST((p_answers->>'adults')::integer, 1000)
        ELSE 0
      END,
      CASE
        WHEN p_answers->>'children' ~ '^\d{1,4}$'
          THEN LEAST((p_answers->>'children')::integer, 1000)
        ELSE 0
      END,
      coalesce(
        nullif(trim(p_answers->>'special_requirements'), ''),
        nullif(trim(p_answers->>'requirements'), '')
      ),
      CASE WHEN v_assignment_count = 1 THEN v_assigned_to ELSE NULL END,
      current_date,
      'INR',
      'new',
      'WhatsApp enquiry received via ' || trim(p_flow_name)
    )
    RETURNING id INTO v_lead_id;
  END IF;

  INSERT INTO public.customer_flow_requirements (
    customer_id, wacrm_run_id, wacrm_flow_id, wacrm_contact_id,
    flow_name, completed_at, answers, lead_id
  )
  VALUES (
    v_customer_id, p_wacrm_run_id, p_wacrm_flow_id, p_wacrm_contact_id,
    trim(p_flow_name), p_completed_at, p_answers, v_lead_id
  )
  ON CONFLICT (wacrm_run_id) DO NOTHING
  RETURNING id, customer_flow_requirements.lead_id
       INTO v_requirement_id, v_lead_id;

  IF v_requirement_id IS NULL THEN
    SELECT requirement.id
      INTO v_requirement_id
      FROM public.customer_flow_requirements AS requirement
     WHERE requirement.wacrm_run_id = p_wacrm_run_id;
    SELECT requirement.lead_id
      INTO v_lead_id
      FROM public.customer_flow_requirements AS requirement
     WHERE requirement.wacrm_run_id = p_wacrm_run_id;
  END IF;

  customer_id := v_customer_id;
  requirement_id := v_requirement_id;
  created_customer := v_created_customer;
  lead_id := v_lead_id;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.record_wacrm_flow_requirement(
  uuid, uuid, uuid, text, text, text, text, timestamptz, jsonb, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_wacrm_flow_requirement(
  uuid, uuid, uuid, text, text, text, text, timestamptz, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_wacrm_flow_requirement(
  uuid, uuid, uuid, text, text, text, text, timestamptz, jsonb, uuid
) TO service_role;
