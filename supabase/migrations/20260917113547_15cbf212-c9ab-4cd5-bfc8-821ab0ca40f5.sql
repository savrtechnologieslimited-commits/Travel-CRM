CREATE TABLE public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  assigned_employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX whatsapp_conversations_phone_key ON public.whatsapp_conversations (phone_number);
CREATE INDEX whatsapp_conversations_customer_idx ON public.whatsapp_conversations (customer_id);
CREATE INDEX whatsapp_conversations_assignee_idx ON public.whatsapp_conversations (assigned_employee_id);
CREATE INDEX whatsapp_conversations_last_msg_idx ON public.whatsapp_conversations (last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select whatsapp_conversations" ON public.whatsapp_conversations
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert whatsapp_conversations" ON public.whatsapp_conversations
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update whatsapp_conversations" ON public.whatsapp_conversations
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete whatsapp_conversations" ON public.whatsapp_conversations
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));

CREATE TRIGGER set_whatsapp_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  wa_message_id text,
  direction text NOT NULL DEFAULT 'outbound',
  message_type text NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  media_mime_type text,
  delivery_status text NOT NULL DEFAULT 'pending',
  message_timestamp timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX whatsapp_messages_wa_id_key ON public.whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX whatsapp_messages_conversation_idx ON public.whatsapp_messages (conversation_id, message_timestamp);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select whatsapp_messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert whatsapp_messages" ON public.whatsapp_messages
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update whatsapp_messages" ON public.whatsapp_messages
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "manager delete whatsapp_messages" ON public.whatsapp_messages
  FOR DELETE TO authenticated USING (private.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.whatsapp_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_conversations c
     SET last_message_at = GREATEST(COALESCE(c.last_message_at, NEW.message_timestamp), NEW.message_timestamp),
         unread_count = CASE
           WHEN NEW.direction = 'inbound' THEN c.unread_count + 1
           ELSE 0
         END,
         updated_at = now()
   WHERE c.id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER whatsapp_messages_touch_conversation
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_touch_conversation();