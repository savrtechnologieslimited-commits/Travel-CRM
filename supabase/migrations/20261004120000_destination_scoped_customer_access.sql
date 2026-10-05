CREATE OR REPLACE FUNCTION private.user_has_destination_access(
  p_destination_id uuid,
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
    FROM public.destination_employee_assignments assignment
    JOIN public.profiles employee
      ON employee.id = assignment.employee_id
     AND employee.is_active
    WHERE assignment.destination_id = p_destination_id
      AND assignment.employee_id = p_user_id
      AND assignment.is_active
  );
END;
$$;

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
    FROM public.leads lead
    WHERE lead.customer_id = p_customer_id
      AND lead.deleted_at IS NULL
      AND lead.destination_id IS NOT NULL
      AND private.user_has_destination_access(lead.destination_id, p_user_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.enquiries enquiry
    WHERE enquiry.customer_id = p_customer_id
      AND enquiry.deleted_at IS NULL
      AND enquiry.destination_id IS NOT NULL
      AND private.user_has_destination_access(enquiry.destination_id, p_user_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.user_has_itinerary_destination_access(
  p_itinerary_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_destination_id uuid;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND NOT private.is_manager(auth.uid()) THEN
    RETURN false;
  END IF;

  SELECT itinerary.destination_id
    INTO v_destination_id
    FROM public.itineraries itinerary
   WHERE itinerary.id = p_itinerary_id;

  RETURN v_destination_id IS NOT NULL
     AND private.user_has_destination_access(v_destination_id, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.user_has_itinerary_document_access(
  p_object_name text,
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
    FROM public.itineraries itinerary
    WHERE itinerary.document_path = p_object_name
      AND itinerary.destination_id IS NOT NULL
      AND private.user_has_destination_access(itinerary.destination_id, p_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.user_has_destination_access(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.user_has_customer_destination_access(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.user_has_itinerary_destination_access(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.user_has_itinerary_document_access(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_has_destination_access(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.user_has_customer_destination_access(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.user_has_itinerary_destination_access(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.user_has_itinerary_document_access(text, uuid)
  TO authenticated, service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select leads for destination scoping"
  ON public.leads
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "assigned destination leads only"
  ON public.leads
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR (
      deleted_at IS NULL
      AND private.user_has_destination_access(destination_id, auth.uid())
    )
  );

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select enquiries for destination scoping"
  ON public.enquiries
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "assigned destination enquiries only"
  ON public.enquiries
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR (
      deleted_at IS NULL
      AND private.user_has_destination_access(destination_id, auth.uid())
    )
  );

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select customers for destination scoping"
  ON public.customers
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "customers with assigned destination records only"
  ON public.customers
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_customer_destination_access(id, auth.uid())
  );

CREATE POLICY "staff select flow requirements for destination scoping"
  ON public.customer_flow_requirements
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "customer flow requirements follow destination access"
  ON public.customer_flow_requirements
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.leads lead
      WHERE lead.id = customer_flow_requirements.lead_id
        AND private.user_has_destination_access(lead.destination_id, auth.uid())
    )
  );

CREATE POLICY "staff select bookings for destination scoping"
  ON public.bookings
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "bookings follow destination access"
  ON public.bookings
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_destination_access(destination_id, auth.uid())
  );

CREATE POLICY "staff select payments for destination scoping"
  ON public.payments
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "payments follow destination access"
  ON public.payments
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_customer_destination_access(customer_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.bookings booking
      WHERE booking.id = payments.booking_id
        AND booking.destination_id IS NOT NULL
        AND private.user_has_destination_access(booking.destination_id, auth.uid())
    )
  );

CREATE POLICY "staff select itineraries for destination scoping"
  ON public.itineraries
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "itineraries follow destination access"
  ON public.itineraries
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_destination_access(destination_id, auth.uid())
  );

CREATE POLICY "staff select lead notes for destination scoping"
  ON public.lead_note_entries
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "lead notes follow destination access"
  ON public.lead_note_entries
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.leads lead
      WHERE lead.id = lead_note_entries.lead_id
        AND private.user_has_destination_access(lead.destination_id, auth.uid())
    )
  );

ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select itinerary days for destination scoping"
  ON public.itinerary_days
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "staff manage itinerary days for destination scoping"
  ON public.itinerary_days
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "itinerary days follow destination access"
  ON public.itinerary_days;
CREATE POLICY "itinerary days follow destination access"
  ON public.itinerary_days
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  );

ALTER TABLE public.itinerary_day_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select itinerary day items for destination scoping"
  ON public.itinerary_day_items
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "itinerary day items follow destination access"
  ON public.itinerary_day_items
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.itinerary_days day
      WHERE day.id = itinerary_day_items.itinerary_day_id
        AND private.user_has_itinerary_destination_access(day.itinerary_id, auth.uid())
    )
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.itinerary_days day
      WHERE day.id = itinerary_day_items.itinerary_day_id
        AND private.user_has_itinerary_destination_access(day.itinerary_id, auth.uid())
    )
  );

ALTER TABLE public.itinerary_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select itinerary photos for destination scoping"
  ON public.itinerary_photos
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "itinerary photos follow destination access"
  ON public.itinerary_photos
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  );

ALTER TABLE public.itinerary_cost_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select itinerary cost lines for destination scoping"
  ON public.itinerary_cost_lines
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "itinerary cost lines follow destination access"
  ON public.itinerary_cost_lines
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  );

ALTER TABLE public.itinerary_package_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select itinerary package options for destination scoping"
  ON public.itinerary_package_options
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "itinerary package options follow destination access"
  ON public.itinerary_package_options
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  );

ALTER TABLE public.itinerary_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select itinerary shares for destination scoping"
  ON public.itinerary_shares
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "itinerary shares follow destination access"
  ON public.itinerary_shares
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR private.user_has_itinerary_destination_access(itinerary_id, auth.uid())
  );

CREATE POLICY "itinerary documents follow destination access"
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    bucket_id <> 'itineraries'
    OR private.is_manager(auth.uid())
    OR private.user_has_itinerary_document_access(name, auth.uid())
  );
