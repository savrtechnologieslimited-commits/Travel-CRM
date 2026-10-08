CREATE OR REPLACE FUNCTION private.current_user_can_view_lead(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.leads AS lead
        WHERE lead.id = p_lead_id
          AND lead.assigned_to = auth.uid()
          AND lead.deleted_at IS NULL
      );
$$;

CREATE OR REPLACE FUNCTION private.current_user_can_view_enquiry(p_enquiry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.leads AS lead
        WHERE lead.enquiry_id = p_enquiry_id
          AND lead.assigned_to = auth.uid()
          AND lead.deleted_at IS NULL
      );
$$;

CREATE OR REPLACE FUNCTION private.current_user_can_view_quotation(p_quotation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.quotations AS quotation
        WHERE quotation.id = p_quotation_id
          AND (quotation.lead_id IS NULL OR private.current_user_can_view_lead(quotation.lead_id))
          AND (quotation.enquiry_id IS NULL OR private.current_user_can_view_enquiry(quotation.enquiry_id))
          AND (quotation.lead_id IS NOT NULL OR quotation.enquiry_id IS NOT NULL)
      );
$$;

CREATE OR REPLACE FUNCTION private.current_user_can_view_booking(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.bookings AS booking
        WHERE booking.id = p_booking_id
          AND (booking.enquiry_id IS NULL OR private.current_user_can_view_enquiry(booking.enquiry_id))
          AND (
            booking.quotation_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.quotations AS quotation
              WHERE quotation.id = booking.quotation_id
                AND private.current_user_can_view_quotation(quotation.id)
            )
          )
          AND (booking.enquiry_id IS NOT NULL OR booking.quotation_id IS NOT NULL)
      );
$$;

CREATE OR REPLACE FUNCTION private.current_user_can_view_itinerary(p_itinerary_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.itineraries AS itinerary
        WHERE itinerary.id = p_itinerary_id
          AND (
            (
              itinerary.lead_id IS NULL
              AND itinerary.enquiry_id IS NULL
              AND itinerary.quotation_id IS NULL
              AND itinerary.booking_id IS NULL
              AND itinerary.customer_id IS NULL
            )
            OR (
              (itinerary.lead_id IS NULL OR private.current_user_can_view_lead(itinerary.lead_id))
              AND (itinerary.enquiry_id IS NULL OR private.current_user_can_view_enquiry(itinerary.enquiry_id))
              AND (itinerary.quotation_id IS NULL OR private.current_user_can_view_quotation(itinerary.quotation_id))
              AND (itinerary.booking_id IS NULL OR private.current_user_can_view_booking(itinerary.booking_id))
              AND (
                itinerary.lead_id IS NOT NULL
                OR itinerary.enquiry_id IS NOT NULL
                OR itinerary.quotation_id IS NOT NULL
                OR itinerary.booking_id IS NOT NULL
              )
            )
          )
      );
$$;

CREATE OR REPLACE FUNCTION private.current_user_can_view_quotation_item(p_quotation_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.quotation_items AS item
        WHERE item.id = p_quotation_item_id
          AND private.current_user_can_view_quotation(item.quotation_id)
      );
$$;

CREATE OR REPLACE FUNCTION private.current_user_can_view_booking_item(p_booking_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.booking_items AS item
        WHERE item.id = p_booking_item_id
          AND private.current_user_can_view_booking(item.booking_id)
      );
$$;

CREATE OR REPLACE FUNCTION private.current_user_can_view_service_details(
  p_quotation_item_id uuid,
  p_booking_item_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR (
        (p_quotation_item_id IS NULL OR private.current_user_can_view_quotation_item(p_quotation_item_id))
        AND (p_booking_item_id IS NULL OR private.current_user_can_view_booking_item(p_booking_item_id))
        AND (p_quotation_item_id IS NOT NULL OR p_booking_item_id IS NOT NULL)
      );
$$;

CREATE OR REPLACE FUNCTION private.current_user_can_view_traveller(p_traveller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.is_manager(auth.uid())
      OR NOT EXISTS (
        SELECT 1
        FROM public.booking_travellers AS booking_traveller
        WHERE booking_traveller.traveller_id = p_traveller_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.booking_travellers AS booking_traveller
        WHERE booking_traveller.traveller_id = p_traveller_id
          AND private.current_user_can_view_booking(booking_traveller.booking_id)
      );
$$;

REVOKE ALL ON FUNCTION private.current_user_can_view_lead(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_can_view_enquiry(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_can_view_quotation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_can_view_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_can_view_itinerary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_can_view_quotation_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_can_view_booking_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_can_view_service_details(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_can_view_traveller(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_lead(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_enquiry(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_quotation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_booking(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_itinerary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_quotation_item(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_booking_item(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_service_details(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_can_view_traveller(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "assigned destination leads only" ON public.leads;
CREATE POLICY "leads follow assigned lead ownership"
  ON public.leads
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (private.current_user_can_view_lead(id));
CREATE POLICY "lead updates follow assigned lead ownership"
  ON public.leads
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.current_user_can_view_lead(id))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "lead deletes follow assigned lead ownership"
  ON public.leads
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.current_user_can_view_lead(id));

DROP POLICY IF EXISTS "bookings follow destination access" ON public.bookings;
CREATE POLICY "bookings follow assigned lead ownership"
  ON public.bookings
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_booking(id))
  WITH CHECK (
    private.is_manager(auth.uid())
    OR (
      (enquiry_id IS NULL OR private.current_user_can_view_enquiry(enquiry_id))
      AND (
        quotation_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.quotations AS quotation
          WHERE quotation.id = bookings.quotation_id
            AND private.current_user_can_view_quotation(quotation.id)
        )
      )
      AND (enquiry_id IS NOT NULL OR quotation_id IS NOT NULL)
    )
  );

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access quotations"
  ON public.quotations
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "quotations follow assigned lead ownership"
  ON public.quotations
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_quotation(id))
  WITH CHECK (
    private.is_manager(auth.uid())
    OR (
      (lead_id IS NULL OR private.current_user_can_view_lead(lead_id))
      AND (enquiry_id IS NULL OR private.current_user_can_view_enquiry(enquiry_id))
      AND (lead_id IS NOT NULL OR enquiry_id IS NOT NULL)
    )
  );

DROP POLICY IF EXISTS "payments follow destination access" ON public.payments;
CREATE POLICY "payments follow assigned lead ownership"
  ON public.payments
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR (
      booking_id IS NOT NULL
      AND private.current_user_can_view_booking(booking_id)
    )
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR (
      booking_id IS NOT NULL
      AND private.current_user_can_view_booking(booking_id)
    )
  );

DROP POLICY IF EXISTS "itineraries follow destination access" ON public.itineraries;
CREATE POLICY "itineraries follow assigned lead ownership"
  ON public.itineraries
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_itinerary(id))
  WITH CHECK (
    private.is_manager(auth.uid())
    OR (
      (
        lead_id IS NULL
        AND enquiry_id IS NULL
        AND quotation_id IS NULL
        AND booking_id IS NULL
        AND customer_id IS NULL
      )
      OR (
        (lead_id IS NULL OR private.current_user_can_view_lead(lead_id))
        AND (enquiry_id IS NULL OR private.current_user_can_view_enquiry(enquiry_id))
        AND (quotation_id IS NULL OR private.current_user_can_view_quotation(quotation_id))
        AND (booking_id IS NULL OR private.current_user_can_view_booking(booking_id))
        AND (
          lead_id IS NOT NULL
          OR enquiry_id IS NOT NULL
          OR quotation_id IS NOT NULL
          OR booking_id IS NOT NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "lead notes follow destination access" ON public.lead_note_entries;
CREATE POLICY "lead notes follow assigned lead ownership"
  ON public.lead_note_entries
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_lead(lead_id))
  WITH CHECK (private.current_user_can_view_lead(lead_id));

DROP POLICY IF EXISTS "itinerary days follow destination access" ON public.itinerary_days;
CREATE POLICY "itinerary days follow assigned lead ownership"
  ON public.itinerary_days
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_itinerary(itinerary_id))
  WITH CHECK (private.current_user_can_view_itinerary(itinerary_id));

DROP POLICY IF EXISTS "itinerary day items follow destination access" ON public.itinerary_day_items;
CREATE POLICY "itinerary day items follow assigned lead ownership"
  ON public.itinerary_day_items
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.itinerary_days AS day
      WHERE day.id = itinerary_day_items.itinerary_day_id
        AND private.current_user_can_view_itinerary(day.itinerary_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.itinerary_days AS day
      WHERE day.id = itinerary_day_items.itinerary_day_id
        AND private.current_user_can_view_itinerary(day.itinerary_id)
    )
  );

DROP POLICY IF EXISTS "itinerary photos follow destination access" ON public.itinerary_photos;
CREATE POLICY "itinerary photos follow assigned lead ownership"
  ON public.itinerary_photos
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_itinerary(itinerary_id))
  WITH CHECK (private.current_user_can_view_itinerary(itinerary_id));

DROP POLICY IF EXISTS "itinerary cost lines follow destination access" ON public.itinerary_cost_lines;
CREATE POLICY "itinerary cost lines follow assigned lead ownership"
  ON public.itinerary_cost_lines
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_itinerary(itinerary_id))
  WITH CHECK (private.current_user_can_view_itinerary(itinerary_id));

DROP POLICY IF EXISTS "itinerary package options follow destination access" ON public.itinerary_package_options;
CREATE POLICY "itinerary package options follow assigned lead ownership"
  ON public.itinerary_package_options
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_itinerary(itinerary_id))
  WITH CHECK (private.current_user_can_view_itinerary(itinerary_id));

DROP POLICY IF EXISTS "itinerary shares follow destination access" ON public.itinerary_shares;
CREATE POLICY "itinerary shares follow assigned lead ownership"
  ON public.itinerary_shares
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_itinerary(itinerary_id))
  WITH CHECK (private.current_user_can_view_itinerary(itinerary_id));

CREATE POLICY "itinerary drafts follow assigned lead ownership"
  ON public.itinerary_drafts
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR (
      (lead_id IS NULL OR private.current_user_can_view_lead(lead_id))
      AND (itinerary_id IS NULL OR private.current_user_can_view_itinerary(itinerary_id))
    )
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR (
      (lead_id IS NULL OR private.current_user_can_view_lead(lead_id))
      AND (itinerary_id IS NULL OR private.current_user_can_view_itinerary(itinerary_id))
    )
  );

ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access quotation items"
  ON public.quotation_items
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "quotation items follow assigned lead ownership"
  ON public.quotation_items
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_quotation(quotation_id))
  WITH CHECK (private.current_user_can_view_quotation(quotation_id));

ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access booking items"
  ON public.booking_items
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "booking items follow assigned lead ownership"
  ON public.booking_items
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_booking(booking_id))
  WITH CHECK (private.current_user_can_view_booking(booking_id));

ALTER TABLE public.booking_travellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access booking travellers"
  ON public.booking_travellers
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "booking travellers follow assigned lead ownership"
  ON public.booking_travellers
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_booking(booking_id))
  WITH CHECK (private.current_user_can_view_booking(booking_id));

ALTER TABLE public.travellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access travellers"
  ON public.travellers
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "travellers follow assigned booking ownership"
  ON public.travellers
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_traveller(id))
  WITH CHECK (private.current_user_can_view_traveller(id));

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access booking documents"
  ON public.documents
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "booking documents follow assigned lead ownership"
  ON public.documents
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    private.is_manager(auth.uid())
    OR (
      booking_id IS NOT NULL
      AND private.current_user_can_view_booking(booking_id)
    )
    OR (
      booking_id IS NULL
      AND traveller_id IS NOT NULL
      AND private.current_user_can_view_traveller(traveller_id)
    )
  )
  WITH CHECK (
    private.is_manager(auth.uid())
    OR (
      booking_id IS NOT NULL
      AND private.current_user_can_view_booking(booking_id)
    )
    OR (
      booking_id IS NULL
      AND traveller_id IS NOT NULL
      AND private.current_user_can_view_traveller(traveller_id)
    )
  );

ALTER TABLE public.hotel_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access hotel details"
  ON public.hotel_bookings
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "hotel details follow assigned lead ownership"
  ON public.hotel_bookings
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_service_details(quotation_item_id, booking_item_id))
  WITH CHECK (private.current_user_can_view_service_details(quotation_item_id, booking_item_id));

ALTER TABLE public.transport_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access transport details"
  ON public.transport_services
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "transport details follow assigned lead ownership"
  ON public.transport_services
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_service_details(quotation_item_id, booking_item_id))
  WITH CHECK (private.current_user_can_view_service_details(quotation_item_id, booking_item_id));

ALTER TABLE public.activity_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff access activity details"
  ON public.activity_services
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "activity details follow assigned lead ownership"
  ON public.activity_services
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.current_user_can_view_service_details(quotation_item_id, booking_item_id))
  WITH CHECK (private.current_user_can_view_service_details(quotation_item_id, booking_item_id));

DROP POLICY IF EXISTS "itinerary documents follow destination access" ON storage.objects;
CREATE POLICY "itinerary documents follow assigned lead ownership"
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    bucket_id <> 'itineraries'
    OR private.is_manager(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.itineraries AS itinerary
      WHERE itinerary.document_path = storage.objects.name
        AND private.current_user_can_view_itinerary(itinerary.id)
    )
  );

NOTIFY pgrst, 'reload schema';
