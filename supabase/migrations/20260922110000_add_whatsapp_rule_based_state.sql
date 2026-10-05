ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS current_flow text NOT NULL DEFAULT 'WELCOME',
  ADD COLUMN IF NOT EXISTS current_step text NOT NULL DEFAULT 'START';

ALTER TABLE public.whatsapp_travel_requirements
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'not_checked';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.whatsapp_conversations'::regclass
      AND conname = 'whatsapp_conversations_current_flow_check'
  ) THEN
    ALTER TABLE public.whatsapp_conversations
      ADD CONSTRAINT whatsapp_conversations_current_flow_check
      CHECK (current_flow IN ('WELCOME', 'DESTINATION', 'QUESTIONS', 'COMPLETED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.whatsapp_conversations'::regclass
      AND conname = 'whatsapp_conversations_current_step_check'
  ) THEN
    ALTER TABLE public.whatsapp_conversations
      ADD CONSTRAINT whatsapp_conversations_current_step_check
      CHECK (current_step IN (
        'START',
        'SCOPE',
        'DESTINATION',
        'NAME',
        'TRAVEL_DATE',
        'ADULTS',
        'CHILDREN',
        'DEPARTURE_CITY',
        'BUDGET',
        'SPECIAL_REQUIREMENTS',
        'COMPLETED'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.whatsapp_travel_requirements'::regclass
      AND conname = 'whatsapp_travel_requirements_scope_check'
  ) THEN
    ALTER TABLE public.whatsapp_travel_requirements
      ADD CONSTRAINT whatsapp_travel_requirements_scope_check
      CHECK (scope IS NULL OR scope IN ('domestic', 'international'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.whatsapp_travel_requirements'::regclass
      AND conname = 'whatsapp_travel_requirements_document_status_check'
  ) THEN
    ALTER TABLE public.whatsapp_travel_requirements
      ADD CONSTRAINT whatsapp_travel_requirements_document_status_check
      CHECK (document_status IN ('sent', 'unavailable', 'not_checked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS whatsapp_conversations_flow_idx
  ON public.whatsapp_conversations (current_flow, current_step);