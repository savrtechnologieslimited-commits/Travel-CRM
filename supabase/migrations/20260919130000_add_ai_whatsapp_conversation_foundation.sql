ALTER TABLE public.whatsapp_conversations
  ADD COLUMN conversation_mode text NOT NULL DEFAULT 'HUMAN_ACTIVE',
  ADD COLUMN ai_processing_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN ai_last_processed_message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  ADD COLUMN ai_last_processed_at timestamptz,
  ADD COLUMN ai_processing_error text;

ALTER TABLE public.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_conversation_mode_check
  CHECK (conversation_mode IN ('AI_ACTIVE', 'HUMAN_ACTIVE')),
  ADD CONSTRAINT whatsapp_conversations_ai_processing_status_check
  CHECK (ai_processing_status IN ('idle', 'processing', 'completed', 'failed'));

CREATE INDEX whatsapp_conversations_ai_processing_idx
  ON public.whatsapp_conversations (ai_processing_status, last_message_at DESC);

CREATE INDEX whatsapp_conversations_ai_last_processed_message_idx
  ON public.whatsapp_conversations (ai_last_processed_message_id)
  WHERE ai_last_processed_message_id IS NOT NULL;

CREATE TABLE public.whatsapp_travel_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL,
  destination_text text,
  destination_id uuid REFERENCES public.destinations(id) ON DELETE SET NULL,
  travel_start_date date,
  travel_end_date date,
  travel_month text,
  adults integer,
  children integer,
  departure_city text,
  approximate_budget numeric,
  hotel_preference text,
  special_requirements text,
  trip_type text,
  extraction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_travel_requirements_extraction_metadata_object_check
    CHECK (jsonb_typeof(extraction_metadata) = 'object'),
  CONSTRAINT whatsapp_travel_requirements_adults_nonnegative_check
    CHECK (adults IS NULL OR adults >= 0),
  CONSTRAINT whatsapp_travel_requirements_children_nonnegative_check
    CHECK (children IS NULL OR children >= 0),
  CONSTRAINT whatsapp_travel_requirements_budget_nonnegative_check
    CHECK (approximate_budget IS NULL OR approximate_budget >= 0)
);

CREATE INDEX whatsapp_travel_requirements_customer_idx
  ON public.whatsapp_travel_requirements (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX whatsapp_travel_requirements_lead_idx
  ON public.whatsapp_travel_requirements (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX whatsapp_travel_requirements_enquiry_idx
  ON public.whatsapp_travel_requirements (enquiry_id)
  WHERE enquiry_id IS NOT NULL;

CREATE INDEX whatsapp_travel_requirements_destination_idx
  ON public.whatsapp_travel_requirements (destination_id)
  WHERE destination_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_travel_requirements TO authenticated;
GRANT ALL ON public.whatsapp_travel_requirements TO service_role;
ALTER TABLE public.whatsapp_travel_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select whatsapp_travel_requirements"
  ON public.whatsapp_travel_requirements
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert whatsapp_travel_requirements"
  ON public.whatsapp_travel_requirements
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff update whatsapp_travel_requirements"
  ON public.whatsapp_travel_requirements
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "manager delete whatsapp_travel_requirements"
  ON public.whatsapp_travel_requirements
  FOR DELETE TO authenticated
  USING (private.is_manager(auth.uid()));

CREATE TRIGGER set_whatsapp_travel_requirements_updated_at
  BEFORE UPDATE ON public.whatsapp_travel_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
