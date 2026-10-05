BEGIN;

SELECT plan(64);

SELECT has_table('public', 'crm_tenants', 'CRM tenant registry exists');
SELECT has_table('public', 'tenant_memberships', 'tenant membership registry exists');
SELECT has_table('public', 'whatsapp_connections', 'WhatsApp connection registry exists');
SELECT col_is_fk('public', 'tenant_memberships', 'tenant_id', 'membership belongs to a tenant');
SELECT col_is_fk('public', 'tenant_memberships', 'user_id', 'membership belongs to an auth user');
SELECT col_is_fk('public', 'whatsapp_connections', 'tenant_id', 'WhatsApp connection belongs to a tenant');
SELECT has_index('public', 'whatsapp_connections', 'whatsapp_connections_phone_number_id_key', 'business phone IDs resolve uniquely');
SELECT has_index('public', 'tenant_memberships', 'tenant_memberships_tenant_id_user_id_key', 'tenant membership is unique per user');
SELECT has_column('public', 'whatsapp_connections', 'access_token_secret_ref', 'connection stores server secret reference only');
SELECT has_column('public', 'whatsapp_connections', 'token_expires_at', 'connection tracks token expiry');
SELECT has_column('public', 'whatsapp_connections', 'last_webhook_at', 'connection tracks webhook activity');
SELECT has_column('public', 'destinations', 'display_order', 'destination master supports configurable order');
SELECT has_column('public', 'whatsapp_conversations', 'last_message_text', 'canonical conversation supports latest message preview');
SELECT has_column('public', 'whatsapp_conversations', 'tenant_id', 'existing conversations are assigned to a CRM tenant');
SELECT col_is_fk('public', 'whatsapp_conversations', 'tenant_id', 'conversations belong to a tenant');
SELECT has_function('public', 'create_crm_tenant', ARRAY['text', 'text'], 'tenant creation RPC exists');
SELECT has_function('private', 'is_crm_tenant_member', ARRAY['uuid'], 'membership RLS helper exists');
SELECT has_function('private', 'can_access_whatsapp_tenant', ARRAY['uuid'], 'WhatsApp access is blocked until the tenant is safe');
SELECT has_function('private', 'guard_whatsapp_connection_ready', ARRAY[], 'unsafe legacy connection state is blocked');
SELECT has_policy('public', 'whatsapp_connections', 'tenant members read WhatsApp connection metadata', 'tenant-scoped connection metadata policy exists');
SELECT has_policy('public', 'tenant_memberships', 'tenant members read memberships', 'tenant-scoped membership policy exists');
SELECT has_policy('public', 'whatsapp_conversations', 'tenant staff select whatsapp_conversations', 'conversation access is tenant scoped');
SELECT has_policy('public', 'whatsapp_messages', 'tenant staff select whatsapp_messages', 'message access derives tenant from parent conversation');
SELECT has_policy('public', 'whatsapp_travel_requirements', 'tenant staff select whatsapp_travel_requirements', 'travel requirement access derives tenant from parent conversation');
SELECT has_column('public', 'whatsapp_messages', 'media_meta_id', 'inbound media retains the Meta media reference');
SELECT has_column('public', 'whatsapp_messages', 'media_filename', 'messages retain attachment filenames');
SELECT has_column('public', 'whatsapp_messages', 'media_storage_path', 'private attachment object paths are retained');
SELECT has_column('public', 'whatsapp_messages', 'media_download_status', 'attachment mirror state is retained');
SELECT has_column('public', 'whatsapp_messages', 'status_updated_at', 'Meta status updates record their event time');
SELECT has_column('public', 'whatsapp_messages', 'delivery_error', 'Meta failure details are retained');
SELECT has_column('public', 'customers', 'wa_user_id', 'customer identity retains business-scoped user IDs');
SELECT has_column('public', 'customers', 'wa_parent_user_id', 'customer identity retains parent business-scoped user IDs');
SELECT has_column('public', 'customers', 'wa_username', 'customer identity retains WhatsApp usernames');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'whatsapp-media'), false, 'inbound WhatsApp media is stored in a private bucket');
SELECT has_index('public', 'whatsapp_messages', 'whatsapp_messages_meta_media_id_idx', 'Meta media references can be resolved efficiently');
SELECT has_function('private', 'normalize_whatsapp_phone', ARRAY['text'], 'WhatsApp phone normalization is server-side');
SELECT has_function('public', 'resolve_whatsapp_crm_identity', ARRAY['text', 'text', 'text', 'text', 'text'], 'phone and BSUID resolve to SAVR CRM entities');
SELECT has_function('public', 'find_or_create_whatsapp_conversation', ARRAY['text', 'uuid', 'uuid', 'uuid'], 'conversation reuse and creation is atomic');
SELECT has_function('public', 'apply_whatsapp_message_status', ARRAY['text', 'text', 'timestamp with time zone', 'text'], 'Meta status callbacks update messages by provider ID');
SELECT is(private.normalize_whatsapp_phone('+91 (98888) 88888'), '919888888888', 'formatted Indian mobile normalizes consistently');
SELECT is(private.normalize_whatsapp_phone('09888888888'), '919888888888', 'Indian mobile with trunk zero normalizes consistently');
SELECT ok(NOT public.apply_whatsapp_message_status('wamid.not-found', 'delivered', now()), 'unknown Meta message IDs are not reported as updated');

INSERT INTO public.whatsapp_conversations (id, phone_number, tenant_id)
VALUES ('b1b93d4c-6514-48f5-a6ab-c3c2f976a101', '919999000001', '6f09f7c5-6402-4d11-9c2c-b4b2cda90001');
INSERT INTO public.whatsapp_messages (conversation_id, wa_message_id, direction, delivery_status)
VALUES ('b1b93d4c-6514-48f5-a6ab-c3c2f976a101', 'wamid.foundation-status', 'outbound', 'accepted');

SELECT ok(public.apply_whatsapp_message_status('wamid.foundation-status', 'sent', now()), 'Meta sent callback matches the outbound message ID');
SELECT is((SELECT delivery_status FROM public.whatsapp_messages WHERE wa_message_id = 'wamid.foundation-status'), 'sent', 'sent state is persisted from Meta');
SELECT ok(public.apply_whatsapp_message_status('wamid.foundation-status', 'delivered', now()), 'Meta delivered callback matches the same outbound message');
SELECT ok(public.apply_whatsapp_message_status('wamid.foundation-status', 'read', now()), 'Meta read callback matches the same outbound message');
SELECT ok(NOT public.apply_whatsapp_message_status('wamid.foundation-status', 'delivered', now()), 'a late delivered callback cannot regress read state');

INSERT INTO public.whatsapp_messages (conversation_id, wa_message_id, direction, delivery_status)
VALUES ('b1b93d4c-6514-48f5-a6ab-c3c2f976a101', 'wamid.foundation-failed', 'outbound', 'accepted');
SELECT ok(public.apply_whatsapp_message_status('wamid.foundation-failed', 'failed', now(), 'Meta failure'), 'Meta failed callback matches the outbound message ID');
SELECT is((SELECT delivery_error FROM public.whatsapp_messages WHERE wa_message_id = 'wamid.foundation-failed'), 'Meta failure', 'Meta failure detail is persisted');

INSERT INTO public.customers (id, full_name, mobile, whatsapp)
VALUES ('b1b93d4c-6514-48f5-a6ab-c3c2f976a102', 'Existing WA Customer', '+91 (98888) 80001', '919888880001');
INSERT INTO public.customers (id, full_name)
VALUES ('b1b93d4c-6514-48f5-a6ab-c3c2f976a103', 'Lead Linked Customer');
INSERT INTO public.enquiries (id, customer_id, source, status)
VALUES ('b1b93d4c-6514-48f5-a6ab-c3c2f976a104', 'b1b93d4c-6514-48f5-a6ab-c3c2f976a103', 'WHATSAPP', 'new');
INSERT INTO public.leads (id, customer_id, enquiry_id, customer_name, mobile, whatsapp)
VALUES ('b1b93d4c-6514-48f5-a6ab-c3c2f976a105', 'b1b93d4c-6514-48f5-a6ab-c3c2f976a103', 'b1b93d4c-6514-48f5-a6ab-c3c2f976a104', 'Copied Lead Name', '09888880002', '+91 98888 80002');

SELECT is((SELECT customer_id FROM public.resolve_whatsapp_crm_identity('919888880001')), 'b1b93d4c-6514-48f5-a6ab-c3c2f976a102'::uuid, 'normalized duplicate phone representations resolve to the existing customer');
SELECT is((SELECT display_name FROM public.resolve_whatsapp_crm_identity('+91 98888 80001')), 'Existing WA Customer', 'existing customer display name is preserved');
SELECT is((SELECT customer_id FROM public.resolve_whatsapp_crm_identity('09888880002')), 'b1b93d4c-6514-48f5-a6ab-c3c2f976a103'::uuid, 'lead phone resolves to its linked customer');
SELECT is((SELECT lead_id FROM public.resolve_whatsapp_crm_identity('919888880002')), 'b1b93d4c-6514-48f5-a6ab-c3c2f976a105'::uuid, 'lead phone resolves to the existing lead');
SELECT is((SELECT enquiry_id FROM public.resolve_whatsapp_crm_identity('919888880002')), 'b1b93d4c-6514-48f5-a6ab-c3c2f976a104'::uuid, 'lead phone resolves to its existing enquiry');
SELECT is((SELECT display_name FROM public.resolve_whatsapp_crm_identity('919888880002')), 'Lead Linked Customer', 'linked customer name is preferred over a copied lead name');
SELECT is((SELECT customer_id FROM public.resolve_whatsapp_crm_identity('+91 98888 80001', 'US.1234567890', 'US.ENT.1234567890', 'asha_travels', 'New Meta Name')), 'b1b93d4c-6514-48f5-a6ab-c3c2f976a102'::uuid, 'BSUID backfills onto a phone-matched customer');
SELECT is((SELECT wa_user_id FROM public.customers WHERE id = 'b1b93d4c-6514-48f5-a6ab-c3c2f976a102'), 'US.1234567890', 'phone-matched customer keeps the BSUID for future no-phone messages');
SELECT is((SELECT display_name FROM public.resolve_whatsapp_crm_identity('', 'US.1234567890')), 'Existing WA Customer', 'no-phone BSUID lookup preserves the existing CRM display name');
SELECT is((SELECT wa_username FROM public.customers WHERE id = 'b1b93d4c-6514-48f5-a6ab-c3c2f976a102'), 'asha_travels', 'WhatsApp username is stored without the leading at-sign');
SELECT ok((SELECT customer_id IS NOT NULL FROM public.resolve_whatsapp_crm_identity('+91 98888 70003')), 'unknown WhatsApp numbers receive a SAVR customer identity');
SELECT is((SELECT display_name FROM public.resolve_whatsapp_crm_identity('919888870003')), 'WhatsApp customer', 'unknown identity uses the neutral fallback name');
SELECT is((SELECT count(*)::integer FROM public.customers WHERE private.normalize_whatsapp_phone(mobile) = '919888870003'), 1, 'unknown identity creates one canonical customer');
SELECT is((SELECT display_name FROM public.resolve_whatsapp_crm_identity('', 'US.9876543210', NULL, 'maya', 'Maya Rao')), 'Maya Rao', 'unknown BSUID creates a customer with the supplied profile name');
SELECT is((SELECT wa_user_id FROM public.customers WHERE wa_user_id = 'US.9876543210'), 'US.9876543210', 'unknown BSUID is stored as a unique SAVR identity');
SELECT is((SELECT id FROM public.find_or_create_whatsapp_conversation('+91 99990 00001', 'b1b93d4c-6514-48f5-a6ab-c3c2f976a102', NULL, NULL)), 'b1b93d4c-6514-48f5-a6ab-c3c2f976a101'::uuid, 'formatted phone reuses an existing conversation');
SELECT is((SELECT count(*)::integer FROM public.whatsapp_conversations WHERE private.normalize_whatsapp_phone(phone_number) = '919999000001'), 1, 'formatted phone reuse does not duplicate the conversation');
SELECT ok((SELECT id IS NOT NULL FROM public.find_or_create_whatsapp_conversation('09888870004', 'b1b93d4c-6514-48f5-a6ab-c3c2f976a102', NULL, NULL)), 'unknown conversation identity creates a new thread');
SELECT is((SELECT customer_id FROM public.find_or_create_whatsapp_conversation('09888870004', 'b1b93d4c-6514-48f5-a6ab-c3c2f976a102', NULL, NULL)), 'b1b93d4c-6514-48f5-a6ab-c3c2f976a102'::uuid, 'new thread links its SAVR customer');

SELECT * FROM finish();
ROLLBACK;
