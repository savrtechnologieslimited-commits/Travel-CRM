CREATE OR REPLACE FUNCTION private.normalize_whatsapp_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  WITH digits AS (
    SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') AS value
  )
  SELECT CASE
    WHEN length(value) = 10 THEN '91' || value
    WHEN length(value) = 11 AND left(value, 1) = '0' THEN '91' || right(value, 10)
    ELSE value
  END
  FROM digits;
$$;

REVOKE ALL ON FUNCTION private.normalize_whatsapp_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.normalize_whatsapp_phone(text) TO service_role;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS wa_user_id text,
  ADD COLUMN IF NOT EXISTS wa_parent_user_id text,
  ADD COLUMN IF NOT EXISTS wa_username text;

CREATE UNIQUE INDEX IF NOT EXISTS customers_wa_user_id_key
  ON public.customers (wa_user_id)
  WHERE wa_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_mobile_normalized_whatsapp_idx
  ON public.customers (private.normalize_whatsapp_phone(mobile))
  WHERE mobile IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS customers_whatsapp_normalized_idx
  ON public.customers (private.normalize_whatsapp_phone(whatsapp))
  WHERE whatsapp IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_mobile_normalized_whatsapp_idx
  ON public.leads (private.normalize_whatsapp_phone(mobile))
  WHERE mobile IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_whatsapp_normalized_idx
  ON public.leads (private.normalize_whatsapp_phone(whatsapp))
  WHERE whatsapp IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS whatsapp_conversations_phone_normalized_idx
  ON public.whatsapp_conversations (private.normalize_whatsapp_phone(phone_number));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_conversations'
      AND column_name = 'tenant_id'
  ) THEN
    DROP INDEX IF EXISTS public.whatsapp_conversations_legacy_tenant_phone_key;
    CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_legacy_tenant_phone_key
      ON public.whatsapp_conversations (tenant_id, phone_number)
      WHERE phone_number <> '';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_conversations'
      AND column_name = 'whatsapp_connection_id'
  ) THEN
    DROP INDEX IF EXISTS public.whatsapp_conversations_connection_phone_key;
    CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_connection_phone_key
      ON public.whatsapp_conversations (whatsapp_connection_id, phone_number)
      WHERE whatsapp_connection_id IS NOT NULL AND phone_number <> '';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.resolve_whatsapp_crm_identity(text, text, text, text, text);
CREATE FUNCTION public.resolve_whatsapp_crm_identity(
  p_phone text,
  p_wa_user_id text DEFAULT NULL,
  p_wa_parent_user_id text DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_display_name text DEFAULT NULL
)
RETURNS TABLE (
  customer_id uuid,
  lead_id uuid,
  enquiry_id uuid,
  display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_phone text := private.normalize_whatsapp_phone(p_phone);
  v_wa_user_id text := CASE WHEN p_wa_user_id ~ '^[A-Za-z]{2}\.(ENT\.)?[A-Za-z0-9]{4,}$' THEN trim(p_wa_user_id) ELSE NULL END;
  v_wa_parent_user_id text := CASE WHEN p_wa_parent_user_id ~ '^[A-Za-z]{2}\.(ENT\.)?[A-Za-z0-9]{4,}$' THEN trim(p_wa_parent_user_id) ELSE NULL END;
  v_customer_id uuid;
  v_phone_customer_id uuid;
  v_phone_customer_name text;
  v_lead_customer_id uuid;
  v_lead_id uuid;
  v_enquiry_id uuid;
  v_display_name text;
  v_lead_display_name text;
BEGIN
  IF v_phone = '' AND v_wa_user_id IS NULL THEN
    RAISE EXCEPTION 'A valid WhatsApp phone number or business-scoped user ID is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('WA-IDENTITY:' || coalesce(v_wa_user_id, v_phone), 0));

  v_display_name := coalesce(nullif(trim(p_display_name), ''), nullif(trim(p_username), ''));

  IF v_wa_user_id IS NOT NULL THEN
    SELECT customer.id, nullif(trim(customer.full_name), '')
      INTO v_customer_id, v_display_name
      FROM public.customers AS customer
     WHERE customer.wa_user_id = v_wa_user_id
       AND customer.deleted_at IS NULL
     ORDER BY customer.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_customer_id IS NULL AND v_phone <> '' THEN
    SELECT customer.id, nullif(trim(customer.full_name), '')
      INTO v_phone_customer_id, v_phone_customer_name
      FROM public.customers AS customer
     WHERE customer.deleted_at IS NULL
       AND (private.normalize_whatsapp_phone(customer.mobile) = v_phone
         OR private.normalize_whatsapp_phone(customer.whatsapp) = v_phone)
     ORDER BY customer.updated_at DESC, customer.created_at DESC
     LIMIT 1;
    v_customer_id := v_phone_customer_id;
    v_display_name := coalesce(v_phone_customer_name, v_display_name);
  END IF;

  SELECT lead.id, lead.customer_id, lead.enquiry_id, nullif(trim(lead.customer_name), '')
    INTO v_lead_id, v_lead_customer_id, v_enquiry_id, v_lead_display_name
    FROM public.leads AS lead
   WHERE lead.deleted_at IS NULL
     AND (lead.id = v_lead_id
       OR lead.customer_id = v_customer_id
       OR (v_phone <> '' AND private.normalize_whatsapp_phone(lead.mobile) = v_phone)
       OR (v_phone <> '' AND private.normalize_whatsapp_phone(lead.whatsapp) = v_phone))
   ORDER BY (lead.customer_id = v_customer_id) DESC NULLS LAST,
            lead.updated_at DESC, lead.created_at DESC
   LIMIT 1;
  v_display_name := coalesce(v_display_name, v_lead_display_name);
  v_customer_id := coalesce(v_customer_id, v_lead_customer_id);

  IF v_customer_id IS NOT NULL THEN
    SELECT coalesce(nullif(trim(customer.full_name), ''), v_display_name)
      INTO v_display_name
      FROM public.customers AS customer
     WHERE customer.id = v_customer_id;
  END IF;

  IF v_enquiry_id IS NULL AND v_customer_id IS NOT NULL THEN
    SELECT enquiry.id
      INTO v_enquiry_id
      FROM public.enquiries AS enquiry
     WHERE enquiry.customer_id = v_customer_id
       AND enquiry.deleted_at IS NULL
     ORDER BY enquiry.updated_at DESC, enquiry.created_at DESC
     LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (full_name, mobile, whatsapp, wa_user_id, wa_parent_user_id, wa_username)
    VALUES (
      coalesce(v_display_name, 'WhatsApp customer'),
      nullif(v_phone, ''), nullif(v_phone, ''),
      v_wa_user_id, v_wa_parent_user_id, nullif(trim(p_username), '')
    )
    RETURNING id INTO v_customer_id;
  END IF;

  UPDATE public.customers AS matched_customer
     SET wa_user_id = coalesce(matched_customer.wa_user_id, v_wa_user_id),
         wa_parent_user_id = coalesce(matched_customer.wa_parent_user_id, v_wa_parent_user_id),
         wa_username = coalesce(nullif(trim(p_username), ''), matched_customer.wa_username),
         mobile = coalesce(nullif(matched_customer.mobile, ''), nullif(v_phone, '')),
         whatsapp = coalesce(nullif(matched_customer.whatsapp, ''), nullif(v_phone, ''))
   WHERE matched_customer.id = v_customer_id;

  IF v_lead_id IS NOT NULL THEN
    UPDATE public.leads AS matched_lead
       SET customer_id = v_customer_id
     WHERE matched_lead.id = v_lead_id AND matched_lead.customer_id IS NULL;
  END IF;
  IF v_enquiry_id IS NOT NULL THEN
    UPDATE public.enquiries AS matched_enquiry
       SET customer_id = v_customer_id
     WHERE matched_enquiry.id = v_enquiry_id AND matched_enquiry.customer_id IS NULL;
  END IF;

  customer_id := v_customer_id;
  lead_id := v_lead_id;
  enquiry_id := v_enquiry_id;
  display_name := coalesce(v_display_name, 'WhatsApp customer');
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_whatsapp_crm_identity(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_crm_identity(text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.find_or_create_whatsapp_conversation(
  p_phone text,
  p_customer_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_enquiry_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  customer_id uuid,
  assigned_employee_id uuid,
  lead_id uuid,
  enquiry_id uuid,
  conversation_mode text,
  current_flow text,
  current_step text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_phone text := private.normalize_whatsapp_phone(p_phone);
  v_conversation public.whatsapp_conversations%ROWTYPE;
BEGIN
  IF v_phone = '' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'A customer identity or WhatsApp phone number is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('WA-CONVERSATION:' || coalesce(p_customer_id::text, v_phone), 0));

  SELECT conversation.*
    INTO v_conversation
    FROM public.whatsapp_conversations AS conversation
  WHERE (p_customer_id IS NOT NULL AND conversation.customer_id = p_customer_id)
    OR (v_phone <> '' AND private.normalize_whatsapp_phone(conversation.phone_number) = v_phone)
  ORDER BY (conversation.customer_id = p_customer_id) DESC NULLS LAST,
        conversation.last_message_at DESC NULLS LAST, conversation.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.whatsapp_conversations AS conversation
       SET customer_id = coalesce(conversation.customer_id, p_customer_id),
           lead_id = coalesce(conversation.lead_id, p_lead_id),
           enquiry_id = coalesce(conversation.enquiry_id, p_enquiry_id)
     WHERE conversation.id = v_conversation.id
     RETURNING conversation.* INTO v_conversation;
  ELSE
    INSERT INTO public.whatsapp_conversations (
      phone_number, customer_id, lead_id, enquiry_id, conversation_mode, current_flow, current_step, status
    ) VALUES (
      v_phone, p_customer_id, p_lead_id, p_enquiry_id, 'HUMAN_ACTIVE', 'WELCOME', 'START', 'open'
    ) RETURNING * INTO v_conversation;
  END IF;

  RETURN QUERY SELECT
    v_conversation.id,
    v_conversation.customer_id,
    v_conversation.assigned_employee_id,
    v_conversation.lead_id,
    v_conversation.enquiry_id,
    v_conversation.conversation_mode,
    v_conversation.current_flow,
    v_conversation.current_step;
END;
$$;

REVOKE ALL ON FUNCTION public.find_or_create_whatsapp_conversation(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_whatsapp_conversation(text, uuid, uuid, uuid) TO service_role;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_meta_id text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_download_status text NOT NULL DEFAULT 'not_media'
    CHECK (media_download_status IN ('not_media', 'pending', 'stored', 'failed', 'too_large', 'unavailable')),
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_error text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media', 'whatsapp-media', false, 16777216,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp',
    'audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/opus',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 16777216,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE INDEX IF NOT EXISTS whatsapp_messages_meta_media_id_idx
  ON public.whatsapp_messages (media_meta_id)
  WHERE media_meta_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_whatsapp_message_status(
  p_wa_message_id text,
  p_status text,
  p_status_timestamp timestamptz,
  p_delivery_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF p_status NOT IN ('sent', 'delivered', 'read', 'failed') THEN
    RAISE EXCEPTION 'Unsupported WhatsApp message status: %', p_status;
  END IF;

  UPDATE public.whatsapp_messages AS message
  SET delivery_status = p_status,
      status_updated_at = p_status_timestamp,
      delivery_error = CASE WHEN p_status = 'failed' THEN p_delivery_error ELSE NULL END
  WHERE message.wa_message_id = p_wa_message_id
    AND message.direction = 'outbound'
    AND (
      (p_status = 'sent' AND message.delivery_status IN ('pending', 'queued', 'accepted', 'sent'))
      OR (p_status = 'delivered' AND message.delivery_status NOT IN ('read', 'failed'))
      OR (p_status = 'read' AND message.delivery_status <> 'failed')
      OR (p_status = 'failed' AND message.delivery_status NOT IN ('delivered', 'read'))
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_whatsapp_message_status(text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_message_status(text, text, timestamptz, text) TO service_role;
