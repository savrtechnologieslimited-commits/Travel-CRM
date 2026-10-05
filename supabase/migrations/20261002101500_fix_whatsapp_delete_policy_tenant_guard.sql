BEGIN;

DROP POLICY IF EXISTS "tenant manager delete whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "tenant manager delete whatsapp_messages" ON public.whatsapp_messages
  FOR DELETE TO authenticated
  USING (
    private.is_manager(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_conversations conversation
      WHERE conversation.id = whatsapp_messages.conversation_id
        AND private.can_access_whatsapp_tenant(conversation.tenant_id)
    )
  );

DROP POLICY IF EXISTS "tenant manager delete whatsapp_travel_requirements" ON public.whatsapp_travel_requirements;
CREATE POLICY "tenant manager delete whatsapp_travel_requirements" ON public.whatsapp_travel_requirements
  FOR DELETE TO authenticated
  USING (
    private.is_manager(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_conversations conversation
      WHERE conversation.id = whatsapp_travel_requirements.conversation_id
        AND private.can_access_whatsapp_tenant(conversation.tenant_id)
    )
  );

COMMIT;
