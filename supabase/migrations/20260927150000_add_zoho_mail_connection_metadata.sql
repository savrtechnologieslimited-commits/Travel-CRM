ALTER TABLE public.gmail_connections
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS api_domain text;

COMMENT ON COLUMN public.gmail_connections.account_id IS
  'Provider account identifier required for Zoho Mail API operations.';
COMMENT ON COLUMN public.gmail_connections.api_domain IS
  'Provider API base URL for Zoho data-center routing.';
