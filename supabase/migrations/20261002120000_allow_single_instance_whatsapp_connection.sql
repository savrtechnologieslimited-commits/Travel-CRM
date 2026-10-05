-- A CRM deployment owns its Supabase database and WhatsApp business
-- connection. Do not require internal CRM tenant data isolation to activate
-- that connection; continue to require the Meta phone, WABA, and server-side
-- access-token reference.
CREATE OR REPLACE FUNCTION private.guard_whatsapp_connection_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.connection_status <> 'connected' THEN
    RETURN NEW;
  END IF;

  IF NEW.phone_number_id IS NULL OR NEW.waba_id IS NULL OR NEW.access_token_secret_ref IS NULL THEN
    RAISE EXCEPTION 'Connected WhatsApp connection requires WABA, phone number, and server-side token reference'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
