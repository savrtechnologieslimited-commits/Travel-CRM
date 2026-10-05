ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass
      AND conname = 'customers_whatsapp_opt_in_timestamp_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_whatsapp_opt_in_timestamp_check
      CHECK (
        (whatsapp_opt_in AND whatsapp_opt_in_at IS NOT NULL)
        OR (NOT whatsapp_opt_in AND whatsapp_opt_in_at IS NULL)
      );
  END IF;
END;
$$;
