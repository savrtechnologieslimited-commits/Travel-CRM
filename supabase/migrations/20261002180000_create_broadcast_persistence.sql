-- Broadcast persistence layer for rule-based customer/lead WhatsApp outreach.
-- This is intentionally scoped to the existing SAVR CRM data model and the
-- current server-side outbound provider boundary. It does not create duplicate
-- customer/contact/lead tables or introduce a parallel CRM.

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled', 'failed', 'paused')),
  audience_mode text NOT NULL DEFAULT 'all_contacts'
    CHECK (audience_mode IN ('all_contacts', 'customers_only', 'leads_only', 'active_leads')),
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  scheduled_for timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  recipient_type text NOT NULL CHECK (recipient_type IN ('customer', 'lead')),
  recipient_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  phone text NOT NULL CHECK (length(trim(phone)) > 0),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending', 'queued', 'sent', 'accepted', 'delivered', 'read',
        'failed', 'skipped', 'duplicate'
      )
    ),
  failure_reason text,
  meta_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      recipient_type = 'customer'
      AND customer_id IS NOT NULL
      AND recipient_id IS NOT NULL
    )
    OR (
      recipient_type = 'lead'
      AND lead_id IS NOT NULL
      AND recipient_id IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS public.broadcast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcasts_created_at_idx
  ON public.broadcasts (created_at DESC);
CREATE INDEX IF NOT EXISTS broadcasts_status_scheduled_idx
  ON public.broadcasts (status, scheduled_for);
CREATE INDEX IF NOT EXISTS broadcasts_created_by_idx
  ON public.broadcasts (created_by);
CREATE INDEX IF NOT EXISTS broadcast_recipients_broadcast_status_idx
  ON public.broadcast_recipients (broadcast_id, status);
CREATE INDEX IF NOT EXISTS broadcast_recipients_phone_idx
  ON public.broadcast_recipients (phone);
CREATE INDEX IF NOT EXISTS broadcast_recipients_customer_idx
  ON public.broadcast_recipients (customer_id);
CREATE INDEX IF NOT EXISTS broadcast_recipients_lead_idx
  ON public.broadcast_recipients (lead_id);
CREATE INDEX IF NOT EXISTS broadcast_runs_broadcast_idx
  ON public.broadcast_runs (broadcast_id, started_at DESC);

DROP TRIGGER IF EXISTS set_broadcasts_updated_at ON public.broadcasts;
CREATE TRIGGER set_broadcasts_updated_at
  BEFORE UPDATE ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_broadcast_recipients_updated_at ON public.broadcast_recipients;
CREATE TRIGGER set_broadcast_recipients_updated_at
  BEFORE UPDATE ON public.broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_runs TO authenticated;
GRANT ALL ON public.broadcasts, public.broadcast_recipients, public.broadcast_runs TO service_role;

CREATE POLICY "staff select broadcasts" ON public.broadcasts
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert broadcasts" ON public.broadcasts
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_staff(auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );
CREATE POLICY "staff update broadcasts" ON public.broadcasts
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete broadcasts" ON public.broadcasts
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));

CREATE POLICY "staff select broadcast recipients" ON public.broadcast_recipients
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert broadcast recipients" ON public.broadcast_recipients
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update broadcast recipients" ON public.broadcast_recipients
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete broadcast recipients" ON public.broadcast_recipients
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));

CREATE POLICY "staff select broadcast runs" ON public.broadcast_runs
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert broadcast runs" ON public.broadcast_runs
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update broadcast runs" ON public.broadcast_runs
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete broadcast runs" ON public.broadcast_runs
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));
