ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_id_unique_idx
  ON public.profiles (lower(btrim(login_id)))
  WHERE login_id IS NOT NULL;