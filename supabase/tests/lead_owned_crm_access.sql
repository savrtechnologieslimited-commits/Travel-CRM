BEGIN;

SELECT plan(29);

SELECT has_function(
  'private',
  'current_user_can_view_lead',
  ARRAY['uuid'],
  'lead ownership helper exists'
);
SELECT has_function(
  'private',
  'current_user_can_view_quotation',
  ARRAY['uuid'],
  'quotation ownership helper exists'
);
SELECT has_function(
  'private',
  'current_user_can_view_booking',
  ARRAY['uuid'],
  'booking ownership helper exists'
);
SELECT has_function(
  'private',
  'current_user_can_view_itinerary',
  ARRAY['uuid'],
  'itinerary ownership and shared-library helper exists'
);
SELECT has_function(
  'private',
  'current_user_can_view_traveller',
  ARRAY['uuid'],
  'traveller visibility follows booking ownership'
);
SELECT has_function(
  'private',
  'current_user_can_view_service_details',
  ARRAY['uuid', 'uuid'],
  'nested booking and quotation service details follow ownership'
);
SELECT has_policy(
  'public',
  'leads',
  'leads follow assigned lead ownership',
  'staff lead reads are restricted to assigned leads'
);
SELECT has_policy(
  'public',
  'quotations',
  'quotations follow assigned lead ownership',
  'quotation visibility follows lead ownership'
);
SELECT has_policy(
  'public',
  'bookings',
  'bookings follow assigned lead ownership',
  'booking visibility follows lead ownership'
);
SELECT has_policy(
  'public',
  'payments',
  'payments follow assigned lead ownership',
  'payment visibility follows linked booking ownership'
);
SELECT has_policy(
  'public',
  'itineraries',
  'itineraries follow assigned lead ownership',
  'client itineraries are scoped while unlinked catalog entries remain shared'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quotations'
      AND policyname = 'quotations follow assigned lead ownership'
      AND with_check LIKE '%current_user_can_view_lead(lead_id)%'
  ),
  'new quotations must link to a lead or enquiry the user can access'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bookings'
      AND policyname = 'bookings follow assigned lead ownership'
      AND with_check LIKE '%current_user_can_view_enquiry(enquiry_id)%'
  ),
  'new bookings must link to an enquiry or quotation the user can access'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'itineraries'
      AND policyname = 'itineraries follow assigned lead ownership'
      AND with_check LIKE '%current_user_can_view_lead(lead_id)%'
  ),
  'new client itineraries must link to a lead the user can access'
);
SELECT has_policy(
  'public',
  'quotation_items',
  'quotation items follow assigned lead ownership',
  'quotation details follow their quotation'
);
SELECT has_policy(
  'public',
  'booking_items',
  'booking items follow assigned lead ownership',
  'booking details follow their booking'
);
SELECT has_policy(
  'public',
  'itinerary_days',
  'itinerary days follow assigned lead ownership',
  'itinerary day details follow their itinerary'
);
SELECT has_policy(
  'public',
  'itinerary_drafts',
  'itinerary drafts follow assigned lead ownership',
  'itinerary drafts cannot expose another lead'
);
SELECT has_policy(
  'public',
  'booking_travellers',
  'booking travellers follow assigned lead ownership',
  'booking traveller links follow their booking'
);
SELECT has_policy(
  'public',
  'documents',
  'booking documents follow assigned lead ownership',
  'booking document visibility follows booking ownership'
);
SELECT has_policy(
  'public',
  'quotations',
  'staff access quotations',
  'quotation staff access is gated by the ownership restriction'
);
SELECT has_policy(
  'public',
  'quotation_items',
  'staff access quotation items',
  'quotation item staff access is gated by the ownership restriction'
);
SELECT has_policy(
  'public',
  'booking_items',
  'staff access booking items',
  'booking item staff access is gated by the ownership restriction'
);
SELECT has_policy(
  'public',
  'booking_travellers',
  'staff access booking travellers',
  'booking traveller staff access is gated by the ownership restriction'
);
SELECT has_policy(
  'public',
  'travellers',
  'staff access travellers',
  'traveller staff access is gated by the ownership restriction'
);
SELECT has_policy(
  'public',
  'documents',
  'staff access booking documents',
  'document staff access is gated by the ownership restriction'
);
SELECT has_policy(
  'public',
  'hotel_bookings',
  'staff access hotel details',
  'hotel detail staff access is gated by the ownership restriction'
);
SELECT has_policy(
  'public',
  'transport_services',
  'staff access transport details',
  'transport detail staff access is gated by the ownership restriction'
);
SELECT has_policy(
  'public',
  'activity_services',
  'staff access activity details',
  'activity detail staff access is gated by the ownership restriction'
);

SELECT * FROM finish();
ROLLBACK;
