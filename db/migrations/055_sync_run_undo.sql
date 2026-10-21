-- Undo for Sync with TMS.
-- undo keeps the raw values a run replaced, so the latest run can be put back exactly.
-- undone_at / undone_by mark a run that was undone, so it cannot be undone twice.

ALTER TABLE public.integration_sync_runs
  ADD COLUMN IF NOT EXISTS undo jsonb,
  ADD COLUMN IF NOT EXISTS undone_at timestamptz,
  ADD COLUMN IF NOT EXISTS undone_by text;

-- Commission Tracker Write can already record a run (037); it also marks the run it undoes.
DROP POLICY IF EXISTS "Commission tracker write can mark sync runs undone" ON public.integration_sync_runs;
CREATE POLICY "Commission tracker write can mark sync runs undone" ON public.integration_sync_runs
  FOR UPDATE TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

-- Undo puts back the field locks the run released.
DROP POLICY IF EXISTS "Commission tracker write can restore field protections" ON public.transaction_field_protections;
CREATE POLICY "Commission tracker write can restore field protections" ON public.transaction_field_protections
  FOR INSERT TO public
  WITH CHECK (public.can_write_commission_tracker(client_id));
