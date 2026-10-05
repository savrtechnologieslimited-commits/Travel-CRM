-- CRM identity metadata and WhatsApp connection registry foundation.
-- A deployed CRM instance represents one client/business and one database;
-- connection readiness depends on Meta identifiers and a server-side token
-- reference, not internal CRM tenant-data isolation.

CREATE TABLE IF NOT EXISTS public.crm_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  crm_data_isolation_status text NOT NULL DEFAULT 'legacy_shared'
    CHECK (crm_data_isolation_status IN ('legacy_shared', 'isolated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.crm_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.crm_tenants(id) ON DELETE CASCADE,
  business_name text,
  meta_business_id text,
  meta_app_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  connection_status text NOT NULL DEFAULT 'not_connected'
    CHECK (connection_status IN ('not_connected', 'pending', 'connected', 'error', 'disconnected')),
  onboarding_status text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started', 'pending', 'completed', 'failed')),
  webhook_status text NOT NULL DEFAULT 'unknown'
    CHECK (webhook_status IN ('unknown', 'pending', 'active', 'error')),
  -- Reference to a server-side secret manager entry only. Never store a
  -- Meta access token in this table or return this reference to the browser.
  access_token_secret_ref text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_connected_at timestamptz,
  last_webhook_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_phone_number_id_key
  ON public.whatsapp_connections (phone_number_id)
  WHERE phone_number_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_tenant_waba_key
  ON public.whatsapp_connections (tenant_id, waba_id)
  WHERE waba_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenant_memberships_user_status_idx
  ON public.tenant_memberships (user_id, status, tenant_id);
CREATE INDEX IF NOT EXISTS whatsapp_connections_tenant_status_idx
  ON public.whatsapp_connections (tenant_id, connection_status);
CREATE INDEX IF NOT EXISTS whatsapp_connections_waba_idx
  ON public.whatsapp_connections (waba_id)
  WHERE waba_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.is_crm_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships membership
    JOIN public.crm_tenants tenant ON tenant.id = membership.tenant_id
    WHERE membership.tenant_id = p_tenant_id
      AND membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND tenant.status = 'active'
  );
$$;

ALTER FUNCTION private.is_crm_tenant_member(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_crm_tenant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_crm_tenant_member(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_crm_tenant(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to create a CRM tenant'
      USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 OR length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'Tenant name must contain 1–120 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' THEN
    RAISE EXCEPTION 'Tenant slug must be 3–64 lowercase letters, numbers, or hyphens'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.crm_tenants (name, slug, crm_data_isolation_status)
  VALUES (trim(p_name), p_slug, 'legacy_shared')
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, auth.uid(), 'owner', 'active');

  RETURN v_tenant_id;
END;
$$;

ALTER FUNCTION public.create_crm_tenant(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_crm_tenant(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_crm_tenant(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_access_whatsapp_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.crm_tenants tenant
     WHERE tenant.id = p_tenant_id
       AND private.is_crm_tenant_member(tenant.id)
       AND (
         tenant.slug = 'legacy-savr-travels'
         OR tenant.crm_data_isolation_status = 'isolated'
       )
  );
$$;

ALTER FUNCTION private.can_access_whatsapp_tenant(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_access_whatsapp_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_whatsapp_tenant(uuid) TO authenticated, service_role;

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

DROP TRIGGER IF EXISTS guard_whatsapp_connection_ready ON public.whatsapp_connections;
CREATE TRIGGER guard_whatsapp_connection_ready
  BEFORE INSERT OR UPDATE OF connection_status, tenant_id, waba_id, phone_number_id, access_token_secret_ref
  ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION private.guard_whatsapp_connection_ready();

DROP TRIGGER IF EXISTS set_crm_tenants_updated_at ON public.crm_tenants;
CREATE TRIGGER set_crm_tenants_updated_at
  BEFORE UPDATE ON public.crm_tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_tenant_memberships_updated_at ON public.tenant_memberships;
CREATE TRIGGER set_tenant_memberships_updated_at
  BEFORE UPDATE ON public.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_whatsapp_connections_updated_at ON public.whatsapp_connections;
CREATE TRIGGER set_whatsapp_connections_updated_at
  BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crm_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.crm_tenants, public.tenant_memberships, public.whatsapp_connections FROM anon;
REVOKE ALL ON public.crm_tenants, public.tenant_memberships, public.whatsapp_connections FROM authenticated;
GRANT SELECT ON public.crm_tenants TO authenticated;
GRANT SELECT ON public.tenant_memberships TO authenticated;
-- Column grants deliberately omit access_token_secret_ref.
GRANT SELECT (
  id, tenant_id, business_name, meta_business_id, meta_app_id, waba_id,
  phone_number_id, display_phone_number, connection_status, onboarding_status,
  webhook_status, token_expires_at, connected_at, last_connected_at,
  last_webhook_at, last_error, created_at, updated_at
) ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.crm_tenants, public.tenant_memberships, public.whatsapp_connections TO service_role;

DROP POLICY IF EXISTS "tenant members read active tenants" ON public.crm_tenants;
CREATE POLICY "tenant members read active tenants" ON public.crm_tenants
  FOR SELECT TO authenticated USING (private.is_crm_tenant_member(id));
DROP POLICY IF EXISTS "tenant members read memberships" ON public.tenant_memberships;
CREATE POLICY "tenant members read memberships" ON public.tenant_memberships
  FOR SELECT TO authenticated USING (private.is_crm_tenant_member(tenant_id));
DROP POLICY IF EXISTS "tenant members read WhatsApp connection metadata" ON public.whatsapp_connections;
CREATE POLICY "tenant members read WhatsApp connection metadata" ON public.whatsapp_connections
  FOR SELECT TO authenticated USING (private.is_crm_tenant_member(tenant_id));

-- Seed the existing single-company CRM as an explicitly legacy/shared tenant.
-- The flag prevents the new connection registry being mistaken for an
-- already tenant-isolated CRM or allowing live connection state prematurely.
INSERT INTO public.crm_tenants (id, slug, name, status, crm_data_isolation_status)
VALUES (
  '6f09f7c5-6402-4d11-9c2c-b4b2cda90001',
  'legacy-savr-travels',
  COALESCE(
    NULLIF((SELECT setting.value ->> 'name' FROM public.app_settings setting WHERE setting.key = 'agency'), ''),
    'SAVR Travels'
  ),
  'active',
  'legacy_shared'
)
ON CONFLICT (slug) DO NOTHING;

-- The chatbot already reads destinations from this master and obtains
-- destination PDFs from the itinerary library. Add stable ordering without
-- introducing a parallel destination/document model.
ALTER TABLE public.destinations
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS destinations_whatsapp_scope_order_idx
  ON public.destinations (scope, is_active, display_order, name);

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_message_text text;

CREATE OR REPLACE FUNCTION public.whatsapp_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_conversations conversation
     SET last_message_at = GREATEST(COALESCE(conversation.last_message_at, NEW.message_timestamp), NEW.message_timestamp),
         last_message_text = NEW.body,
         unread_count = CASE
           WHEN NEW.direction = 'inbound' THEN conversation.unread_count + 1
           ELSE 0
         END,
         updated_at = now()
   WHERE conversation.id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
SELECT tenant.id,
       profile.id,
       CASE
         WHEN bool_or(user_role.role::text IN ('admin', 'manager')) THEN 'admin'
         WHEN bool_or(user_role.role::text = 'read_only') THEN 'viewer'
         ELSE 'agent'
       END,
       'active'
  FROM public.crm_tenants tenant
  CROSS JOIN public.profiles profile
  LEFT JOIN public.user_roles user_role ON user_role.user_id = profile.id
 WHERE tenant.slug = 'legacy-savr-travels'
   AND profile.is_active = true
 GROUP BY tenant.id, profile.id
ON CONFLICT (tenant_id, user_id) DO NOTHING;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.crm_tenants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE RESTRICT;

UPDATE public.whatsapp_conversations
   SET tenant_id = '6f09f7c5-6402-4d11-9c2c-b4b2cda90001'
 WHERE tenant_id IS NULL;

ALTER TABLE public.whatsapp_conversations
  ALTER COLUMN tenant_id SET DEFAULT '6f09f7c5-6402-4d11-9c2c-b4b2cda90001',
  ALTER COLUMN tenant_id SET NOT NULL;

DROP INDEX IF EXISTS public.whatsapp_conversations_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_legacy_tenant_phone_key
  ON public.whatsapp_conversations (tenant_id, phone_number)
  WHERE whatsapp_connection_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_connection_phone_key
  ON public.whatsapp_conversations (whatsapp_connection_id, phone_number)
  WHERE whatsapp_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_conversations_tenant_last_msg_idx
  ON public.whatsapp_conversations (tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_connection_idx
  ON public.whatsapp_conversations (whatsapp_connection_id)
  WHERE whatsapp_connection_id IS NOT NULL;

DROP POLICY IF EXISTS "staff select whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "staff insert whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "staff update whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "manager delete whatsapp_conversations" ON public.whatsapp_conversations;
CREATE POLICY "tenant staff select whatsapp_conversations" ON public.whatsapp_conversations
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) AND private.can_access_whatsapp_tenant(tenant_id));
CREATE POLICY "tenant staff insert whatsapp_conversations" ON public.whatsapp_conversations
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND private.can_access_whatsapp_tenant(tenant_id));
CREATE POLICY "tenant staff update whatsapp_conversations" ON public.whatsapp_conversations
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()) AND private.can_access_whatsapp_tenant(tenant_id))
  WITH CHECK (private.is_staff(auth.uid()) AND private.can_access_whatsapp_tenant(tenant_id));
CREATE POLICY "tenant manager delete whatsapp_conversations" ON public.whatsapp_conversations
  FOR DELETE TO authenticated
  USING (private.is_manager(auth.uid()) AND private.can_access_whatsapp_tenant(tenant_id));

DROP POLICY IF EXISTS "staff select whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "staff insert whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "staff update whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "manager delete whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "tenant staff select whatsapp_messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_messages.conversation_id
      AND private.can_access_whatsapp_tenant(conversation.tenant_id)
  ));
CREATE POLICY "tenant staff insert whatsapp_messages" ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_messages.conversation_id
      AND private.can_access_whatsapp_tenant(conversation.tenant_id)
  ));
CREATE POLICY "tenant staff update whatsapp_messages" ON public.whatsapp_messages
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_messages.conversation_id
      AND private.can_access_whatsapp_tenant(conversation.tenant_id)
  ))
  WITH CHECK (private.is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_messages.conversation_id
      AND private.can_access_whatsapp_tenant(conversation.tenant_id)
  ));
CREATE POLICY "tenant manager delete whatsapp_messages" ON public.whatsapp_messages
  FOR DELETE TO authenticated
  USING (private.is_manager(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_messages.conversation_id
      AND private.is_crm_tenant_member(conversation.tenant_id)
  ));

DROP POLICY IF EXISTS "staff select whatsapp_travel_requirements" ON public.whatsapp_travel_requirements;
DROP POLICY IF EXISTS "staff insert whatsapp_travel_requirements" ON public.whatsapp_travel_requirements;
DROP POLICY IF EXISTS "staff update whatsapp_travel_requirements" ON public.whatsapp_travel_requirements;
DROP POLICY IF EXISTS "manager delete whatsapp_travel_requirements" ON public.whatsapp_travel_requirements;
CREATE POLICY "tenant staff select whatsapp_travel_requirements" ON public.whatsapp_travel_requirements
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_travel_requirements.conversation_id
      AND private.can_access_whatsapp_tenant(conversation.tenant_id)
  ));
CREATE POLICY "tenant staff insert whatsapp_travel_requirements" ON public.whatsapp_travel_requirements
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_travel_requirements.conversation_id
      AND private.can_access_whatsapp_tenant(conversation.tenant_id)
  ));
CREATE POLICY "tenant staff update whatsapp_travel_requirements" ON public.whatsapp_travel_requirements
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_travel_requirements.conversation_id
      AND private.can_access_whatsapp_tenant(conversation.tenant_id)
  ))
  WITH CHECK (private.is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_travel_requirements.conversation_id
      AND private.can_access_whatsapp_tenant(conversation.tenant_id)
  ));
CREATE POLICY "tenant manager delete whatsapp_travel_requirements" ON public.whatsapp_travel_requirements
  FOR DELETE TO authenticated
  USING (private.is_manager(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations conversation
    WHERE conversation.id = whatsapp_travel_requirements.conversation_id
      AND private.is_crm_tenant_member(conversation.tenant_id)
  ));

NOTIFY pgrst, 'reload schema';
