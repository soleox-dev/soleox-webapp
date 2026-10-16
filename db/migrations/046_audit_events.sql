-- Who changed a permission, a template, a transaction, or a sync,
-- and who exported or deleted a client's data.
-- Rows are added only. They are not updated or deleted through the app.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('AUD'),
  client_id text NOT NULL,
  actor_email text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_client_created_idx
  ON public.audit_events (client_id, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings can read audit events" ON public.audit_events;
CREATE POLICY "Settings can read audit events" ON public.audit_events
  FOR SELECT TO public
  USING (
    public.is_platform_super_admin()
    OR public.can_manage_tracker_settings(client_id)
    OR public.is_client_admin(client_id)
  );

DROP POLICY IF EXISTS "Members can append their own audit events" ON public.audit_events;
CREATE POLICY "Members can append their own audit events" ON public.audit_events
  FOR INSERT TO public
  WITH CHECK (
    lower(actor_email) = lower(public.get_request_email())
    AND (
      public.is_platform_super_admin()
      OR public.can_write_commission_tracker(client_id)
      OR public.can_manage_tracker_settings(client_id)
      OR public.is_client_admin(client_id)
    )
  );

NOTIFY pgrst, 'reload schema';
