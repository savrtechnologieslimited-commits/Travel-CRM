CREATE TABLE public.destination_employee_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX destination_employee_assignments_active_unique_idx
  ON public.destination_employee_assignments (destination_id, employee_id)
  WHERE is_active = true;

CREATE INDEX destination_employee_assignments_destination_idx
  ON public.destination_employee_assignments (destination_id);

CREATE INDEX destination_employee_assignments_employee_idx
  ON public.destination_employee_assignments (employee_id);

CREATE INDEX destination_employee_assignments_active_destination_idx
  ON public.destination_employee_assignments (destination_id)
  WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.destination_employee_assignments TO authenticated;
GRANT ALL ON public.destination_employee_assignments TO service_role;
ALTER TABLE public.destination_employee_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select destination_employee_assignments"
  ON public.destination_employee_assignments
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert destination_employee_assignments"
  ON public.destination_employee_assignments
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff update destination_employee_assignments"
  ON public.destination_employee_assignments
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "manager delete destination_employee_assignments"
  ON public.destination_employee_assignments
  FOR DELETE TO authenticated
  USING (private.is_manager(auth.uid()));

CREATE TRIGGER set_destination_employee_assignments_updated_at
  BEFORE UPDATE ON public.destination_employee_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
