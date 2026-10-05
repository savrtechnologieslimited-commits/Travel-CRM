BEGIN;

SELECT plan(12);

SELECT has_table('public', 'enquiries', 'canonical enquiry table exists');
SELECT has_column('public', 'enquiries', 'enquiry_number', 'ENQ number column exists');
SELECT has_column('public', 'enquiries', 'source', 'enquiry source column exists');
SELECT col_is_fk('public', 'leads', 'enquiry_id', 'leads belong to enquiries');
SELECT col_is_fk('public', 'whatsapp_conversations', 'enquiry_id', 'WhatsApp conversations belong to enquiries');
SELECT col_is_fk('public', 'itineraries', 'enquiry_id', 'itineraries belong to enquiries');
SELECT col_is_fk('public', 'quotations', 'enquiry_id', 'quotations belong to enquiries');
SELECT col_is_fk('public', 'bookings', 'enquiry_id', 'bookings belong to enquiries');
SELECT has_function('public', 'create_enquiry', ARRAY['uuid', 'text', 'uuid', 'uuid', 'text'], 'atomic enquiry RPC exists');

SELECT matches(
  private.next_enquiry_number(),
  '^ENQ/[0-9]{4}-[0-9]{2}/[0-9]{6}$',
  'ENQ number uses Indian financial-year format'
);
SELECT isnt(
  private.next_enquiry_number(),
  private.next_enquiry_number(),
  'consecutive ENQ numbers are unique'
);
SELECT has_index('public', 'enquiries', 'enquiries_enquiry_number_key', 'ENQ numbers are unique');

SELECT * FROM finish();
ROLLBACK;
