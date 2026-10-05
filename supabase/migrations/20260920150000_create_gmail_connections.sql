CREATE TABLE public.gmail_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  provider text NOT NULL DEFAULT 'gmail',
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
  scopes text NOT NULL DEFAULT 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
  access_token text,
  refresh_token text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX gmail_connections_user_idx
  ON public.gmail_connections (user_id);

CREATE INDEX gmail_connections_status_idx
  ON public.gmail_connections (status);

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmail connections scoped to owner"
  ON public.gmail_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER set_gmail_connections_updated_at
  BEFORE UPDATE ON public.gmail_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_connections TO authenticated;
GRANT ALL ON public.gmail_connections TO service_role;
