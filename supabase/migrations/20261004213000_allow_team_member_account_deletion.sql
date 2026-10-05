ALTER TABLE public.daily_reports
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.daily_reports
  DROP CONSTRAINT IF EXISTS daily_reports_user_id_fkey,
  ADD CONSTRAINT daily_reports_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_created_by_fkey,
  ADD CONSTRAINT whatsapp_conversations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_created_by_fkey,
  ADD CONSTRAINT whatsapp_messages_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
