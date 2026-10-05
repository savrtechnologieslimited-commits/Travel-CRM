CREATE TABLE public.wacrm_contact_links (
  crm_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_record_type TEXT NOT NULL CHECK (crm_record_type IN ('lead', 'customer')),
  crm_record_id UUID NOT NULL,
  wacrm_user_id UUID NOT NULL,
  wacrm_contact_id UUID NOT NULL,
  match_method TEXT NOT NULL CHECK (
    match_method IN ('email', 'phone', 'email_and_phone')
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (crm_user_id, crm_record_type, crm_record_id)
);

ALTER TABLE public.wacrm_contact_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.wacrm_contact_links TO authenticated;

CREATE POLICY "Staff manage their own WACRM contact links"
  ON public.wacrm_contact_links
  FOR ALL
  TO authenticated
  USING (
    private.is_staff(auth.uid())
    AND crm_user_id = auth.uid()
  )
  WITH CHECK (
    private.is_staff(auth.uid())
    AND crm_user_id = auth.uid()
  );
