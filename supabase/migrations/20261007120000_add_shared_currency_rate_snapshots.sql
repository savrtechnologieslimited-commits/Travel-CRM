CREATE TABLE IF NOT EXISTS public.currency_rate_snapshots (
  base_currency text PRIMARY KEY CHECK (base_currency = 'INR'),
  rates jsonb NOT NULL,
  provider_updated_at timestamptz NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.currency_rate_snapshots ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.currency_rate_snapshots TO service_role;
