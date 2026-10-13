-- Commission Tracker Write can record a sync and clear field locks the sync releases.
-- Transaction inserts and updates already use the write policies from 035.

DROP POLICY IF EXISTS "Commission tracker write can record sync runs" ON public.integration_sync_runs;
CREATE POLICY "Commission tracker write can record sync runs" ON public.integration_sync_runs
  FOR INSERT TO public
  WITH CHECK (public.can_write_commission_tracker(client_id));

DROP POLICY IF EXISTS "Commission tracker write can clear field protections" ON public.transaction_field_protections;
CREATE POLICY "Commission tracker write can clear field protections" ON public.transaction_field_protections
  FOR DELETE TO public
  USING (public.can_write_commission_tracker(client_id));
