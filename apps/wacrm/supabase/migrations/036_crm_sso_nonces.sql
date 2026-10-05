-- Single-use markers for the short-lived CRM-to-WACRM sign-in bridge.
CREATE TABLE IF NOT EXISTS public.wacrm_sso_nonces (
  nonce uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wacrm_sso_nonces_expires_at_idx
  ON public.wacrm_sso_nonces (expires_at);

ALTER TABLE public.wacrm_sso_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wacrm_sso_nonces FROM anon, authenticated;
GRANT ALL ON public.wacrm_sso_nonces TO service_role;
