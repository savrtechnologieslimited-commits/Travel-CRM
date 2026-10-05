ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL;

CREATE TABLE public.whatsapp_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_tags_name_key
  ON public.whatsapp_tags (LOWER(name))
  WHERE active = true;

CREATE INDEX IF NOT EXISTS whatsapp_tags_active_idx
  ON public.whatsapp_tags (active, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_tags TO authenticated;
GRANT ALL ON public.whatsapp_tags TO service_role;
ALTER TABLE public.whatsapp_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select whatsapp_tags"
  ON public.whatsapp_tags FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert whatsapp_tags"
  ON public.whatsapp_tags FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff update whatsapp_tags"
  ON public.whatsapp_tags FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "manager delete whatsapp_tags"
  ON public.whatsapp_tags FOR DELETE TO authenticated
  USING (private.is_manager(auth.uid()));

CREATE TRIGGER set_whatsapp_tags_updated_at
  BEFORE UPDATE ON public.whatsapp_tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.whatsapp_contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.whatsapp_tags(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((customer_id IS NOT NULL) OR (lead_id IS NOT NULL) OR (enquiry_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contact_tags_customer_tag_key
  ON public.whatsapp_contact_tags (tag_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contact_tags_lead_tag_key
  ON public.whatsapp_contact_tags (tag_id, lead_id)
  WHERE lead_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contact_tags_enquiry_tag_key
  ON public.whatsapp_contact_tags (tag_id, enquiry_id)
  WHERE enquiry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_contact_tags_customer_idx
  ON public.whatsapp_contact_tags (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_contact_tags_tag_idx
  ON public.whatsapp_contact_tags (tag_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_contact_tags TO authenticated;
GRANT ALL ON public.whatsapp_contact_tags TO service_role;
ALTER TABLE public.whatsapp_contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select whatsapp_contact_tags"
  ON public.whatsapp_contact_tags FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert whatsapp_contact_tags"
  ON public.whatsapp_contact_tags FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff update whatsapp_contact_tags"
  ON public.whatsapp_contact_tags FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff delete whatsapp_contact_tags"
  ON public.whatsapp_contact_tags FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE TABLE public.whatsapp_contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((customer_id IS NOT NULL) OR (lead_id IS NOT NULL) OR (enquiry_id IS NOT NULL) OR (conversation_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS whatsapp_contact_notes_customer_idx
  ON public.whatsapp_contact_notes (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_contact_notes_conversation_idx
  ON public.whatsapp_contact_notes (conversation_id)
  WHERE conversation_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_contact_notes TO authenticated;
GRANT ALL ON public.whatsapp_contact_notes TO service_role;
ALTER TABLE public.whatsapp_contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select whatsapp_contact_notes"
  ON public.whatsapp_contact_notes FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert whatsapp_contact_notes"
  ON public.whatsapp_contact_notes FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff update whatsapp_contact_notes"
  ON public.whatsapp_contact_notes FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff delete whatsapp_contact_notes"
  ON public.whatsapp_contact_notes FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE TRIGGER set_whatsapp_contact_notes_updated_at
  BEFORE UPDATE ON public.whatsapp_contact_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.whatsapp_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcut text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_quick_replies_shortcut_key
  ON public.whatsapp_quick_replies (LOWER(shortcut))
  WHERE active = true;

CREATE INDEX IF NOT EXISTS whatsapp_quick_replies_active_idx
  ON public.whatsapp_quick_replies (active, category, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_quick_replies TO authenticated;
GRANT ALL ON public.whatsapp_quick_replies TO service_role;
ALTER TABLE public.whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select whatsapp_quick_replies"
  ON public.whatsapp_quick_replies FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert whatsapp_quick_replies"
  ON public.whatsapp_quick_replies FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff update whatsapp_quick_replies"
  ON public.whatsapp_quick_replies FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "manager delete whatsapp_quick_replies"
  ON public.whatsapp_quick_replies FOR DELETE TO authenticated
  USING (private.is_manager(auth.uid()));

CREATE TRIGGER set_whatsapp_quick_replies_updated_at
  BEFORE UPDATE ON public.whatsapp_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.whatsapp_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, actor_profile_id, emoji)
);

CREATE INDEX IF NOT EXISTS whatsapp_message_reactions_message_idx
  ON public.whatsapp_message_reactions (message_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_reactions TO authenticated;
GRANT ALL ON public.whatsapp_message_reactions TO service_role;
ALTER TABLE public.whatsapp_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select whatsapp_message_reactions"
  ON public.whatsapp_message_reactions FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert whatsapp_message_reactions"
  ON public.whatsapp_message_reactions FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff delete whatsapp_message_reactions"
  ON public.whatsapp_message_reactions FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE FUNCTION public.whatsapp_contact_summary(
  p_customer_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_enquiry_id uuid DEFAULT NULL
)
RETURNS TABLE (
  customer_id uuid,
  lead_id uuid,
  enquiry_id uuid,
  tag_count bigint,
  note_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT
    p_customer_id AS customer_id,
    p_lead_id AS lead_id,
    p_enquiry_id AS enquiry_id,
    (
      SELECT count(*)
      FROM public.whatsapp_contact_tags AS ctags
      WHERE ctags.customer_id = p_customer_id
         OR ctags.lead_id = p_lead_id
         OR ctags.enquiry_id = p_enquiry_id
    )::bigint AS tag_count,
    (
      SELECT count(*)
      FROM public.whatsapp_contact_notes AS notes
      WHERE notes.customer_id = p_customer_id
         OR notes.lead_id = p_lead_id
         OR notes.enquiry_id = p_enquiry_id
    )::bigint AS note_count;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_contact_summary(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_contact_summary(uuid, uuid, uuid) TO service_role;
