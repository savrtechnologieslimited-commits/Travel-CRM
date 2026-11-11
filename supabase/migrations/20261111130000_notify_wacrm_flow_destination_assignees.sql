ALTER TABLE public.customer_flow_requirements
  ADD COLUMN IF NOT EXISTS notify_on_completion boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_wacrm_flow_completion_dedupe_idx
  ON public.notifications (user_id, category, link)
  WHERE category = 'wacrm_flow_completed'
    AND link IS NOT NULL;

CREATE OR REPLACE FUNCTION private.notify_wacrm_flow_completion_assignees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_customer_name text;
  v_destination_name text;
  v_link text;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR NOT NEW.notify_on_completion
     OR NEW.is_partial
     OR NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(
      nullif(trim(lead.customer_name), ''),
      nullif(trim(customer.full_name), ''),
      'A customer'
    ),
    coalesce(
      nullif(trim(destination.name), ''),
      nullif(trim(lead.destination_text), ''),
      nullif(trim(NEW.answers->>'destination_name'), ''),
      'a custom destination'
    )
  INTO v_customer_name, v_destination_name
  FROM public.leads AS lead
  LEFT JOIN public.customers AS customer ON customer.id = lead.customer_id
  LEFT JOIN public.destinations AS destination ON destination.id = NEW.destination_id
  WHERE lead.id = NEW.lead_id
    AND lead.destination_id IS NOT DISTINCT FROM NEW.destination_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_link := '/leads/' || NEW.lead_id::text
    || '?source=wacrm&flowRunId=' || NEW.wacrm_run_id::text;

  IF NEW.destination_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.destination_employee_assignments AS assignment
    JOIN public.profiles AS employee
      ON employee.id = assignment.employee_id
     AND employee.is_active
    WHERE assignment.destination_id = NEW.destination_id
      AND assignment.is_active
  ) THEN
    INSERT INTO public.notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      user_role.user_id,
      'New WhatsApp enquiry: ' || v_customer_name,
      CASE
        WHEN NEW.destination_id IS NULL THEN
          'Completed WhatsApp flow with no catalog destination selected'
          || CASE
            WHEN v_destination_name = 'a custom destination' THEN '.'
            ELSE ' (' || v_destination_name || ').'
          END
        ELSE
          'Completed WhatsApp flow for ' || v_destination_name
            || ' has no active assignee and needs review.'
      END,
      'wacrm_flow_completed',
      v_link
    FROM public.user_roles AS user_role
    JOIN public.profiles AS profile
      ON profile.id = user_role.user_id
     AND profile.is_active
    WHERE user_role.role IN ('admin'::public.app_role, 'manager'::public.app_role)
    ON CONFLICT (user_id, category, link)
      WHERE category = 'wacrm_flow_completed'
        AND link IS NOT NULL
      DO NOTHING;
  ELSE
    INSERT INTO public.notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      assignment.employee_id,
      'New WhatsApp enquiry: ' || v_customer_name,
      'Completed WhatsApp flow for ' || v_destination_name || ' is ready to review.',
      'wacrm_flow_completed',
      v_link
    FROM public.destination_employee_assignments AS assignment
    JOIN public.profiles AS employee
      ON employee.id = assignment.employee_id
     AND employee.is_active
    WHERE assignment.destination_id = NEW.destination_id
      AND assignment.is_active
    ON CONFLICT (user_id, category, link)
      WHERE category = 'wacrm_flow_completed'
        AND link IS NOT NULL
      DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.notify_wacrm_flow_completion_assignees() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.notify_wacrm_flow_completion_assignees()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_wacrm_flow_completion_notify_destination_assignees
  ON public.customer_flow_requirements;
CREATE TRIGGER on_wacrm_flow_completion_notify_destination_assignees
  AFTER UPDATE OF notify_on_completion
  ON public.customer_flow_requirements
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_wacrm_flow_completion_assignees();
