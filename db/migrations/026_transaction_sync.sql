-- Per-client transaction sync from a Google Sheet integration tab.
-- IDs: INC_ connection, IFM_ field mapping, TFP_ field protection, ISR_ sync run.

CREATE TABLE IF NOT EXISTS public.integration_connections (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  provider text NOT NULL DEFAULT 'google_sheets',
  spreadsheet_id text,
  tab_name text NOT NULL DEFAULT 'SOLEOX Integration',
  enabled boolean NOT NULL DEFAULT false,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by text,
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_client_provider_uidx
  ON public.integration_connections (client_id, provider)
  WHERE COALESCE(archived, false) = false;

CREATE TABLE IF NOT EXISTS public.integration_field_mappings (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  connection_id text NOT NULL REFERENCES public.integration_connections (id) ON DELETE CASCADE,
  source_header text NOT NULL,
  field_key text,
  policy text NOT NULL DEFAULT 'disconnected',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT integration_field_mappings_policy_check CHECK (
    policy IN ('tms_wins', 'lock_on_edit', 'keep_until_tms', 'disconnected')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_field_mappings_header_uidx
  ON public.integration_field_mappings (connection_id, lower(source_header));

CREATE UNIQUE INDEX IF NOT EXISTS integration_field_mappings_field_uidx
  ON public.integration_field_mappings (connection_id, field_key)
  WHERE field_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.transaction_field_protections (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  transaction_id text NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
  field_key text NOT NULL,
  protection text NOT NULL,
  protected_by text,
  protected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_field_protections_kind_check CHECK (
    protection IN ('locked', 'keep_until_tms')
  ),
  CONSTRAINT transaction_field_protections_field_key UNIQUE (transaction_id, field_key)
);

CREATE INDEX IF NOT EXISTS transaction_field_protections_client_idx
  ON public.transaction_field_protections (client_id);

CREATE TABLE IF NOT EXISTS public.integration_sync_runs (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  connection_id text REFERENCES public.integration_connections (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  message text,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT integration_sync_runs_status_check CHECK (
    status IN ('succeeded', 'failed', 'blocked')
  )
);

CREATE INDEX IF NOT EXISTS integration_sync_runs_client_started_idx
  ON public.integration_sync_runs (client_id, started_at DESC);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_field_protections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage integration connections" ON public.integration_connections;
CREATE POLICY "Admins can manage integration connections" ON public.integration_connections
  FOR ALL TO public
  USING (client_id IN (SELECT public.get_admin_tenant_ids()))
  WITH CHECK (client_id IN (SELECT public.get_admin_tenant_ids()));

DROP POLICY IF EXISTS "Members can view integration connections" ON public.integration_connections;
CREATE POLICY "Members can view integration connections" ON public.integration_connections
  FOR SELECT TO public
  USING (client_id IN (SELECT public.get_member_tenant_ids()));

DROP POLICY IF EXISTS "Admins can manage integration field mappings" ON public.integration_field_mappings;
CREATE POLICY "Admins can manage integration field mappings" ON public.integration_field_mappings
  FOR ALL TO public
  USING (client_id IN (SELECT public.get_admin_tenant_ids()))
  WITH CHECK (client_id IN (SELECT public.get_admin_tenant_ids()));

DROP POLICY IF EXISTS "Members can view integration field mappings" ON public.integration_field_mappings;
CREATE POLICY "Members can view integration field mappings" ON public.integration_field_mappings
  FOR SELECT TO public
  USING (client_id IN (SELECT public.get_member_tenant_ids()));

DROP POLICY IF EXISTS "Admins can manage transaction field protections" ON public.transaction_field_protections;
CREATE POLICY "Admins can manage transaction field protections" ON public.transaction_field_protections
  FOR ALL TO public
  USING (client_id IN (SELECT public.get_admin_tenant_ids()))
  WITH CHECK (client_id IN (SELECT public.get_admin_tenant_ids()));

DROP POLICY IF EXISTS "Members can view transaction field protections" ON public.transaction_field_protections;
CREATE POLICY "Members can view transaction field protections" ON public.transaction_field_protections
  FOR SELECT TO public
  USING (client_id IN (SELECT public.get_member_tenant_ids()));

DROP POLICY IF EXISTS "Admins can manage integration sync runs" ON public.integration_sync_runs;
CREATE POLICY "Admins can manage integration sync runs" ON public.integration_sync_runs
  FOR ALL TO public
  USING (client_id IN (SELECT public.get_admin_tenant_ids()))
  WITH CHECK (client_id IN (SELECT public.get_admin_tenant_ids()));

DROP POLICY IF EXISTS "Members can view integration sync runs" ON public.integration_sync_runs;
CREATE POLICY "Members can view integration sync runs" ON public.integration_sync_runs
  FOR SELECT TO public
  USING (client_id IN (SELECT public.get_member_tenant_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_field_mappings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_field_protections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_sync_runs TO authenticated, service_role;

-- One external id per brokerage. Blank TMS ids stay out of the index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT client_id, tms_id
      FROM public.transactions
      WHERE tms_id IS NOT NULL AND btrim(tms_id) <> ''
      GROUP BY client_id, tms_id
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate TMS IDs exist. Resolve them before adding transactions_client_tms_id_uidx.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_client_tms_id_uidx
  ON public.transactions (client_id, tms_id)
  WHERE tms_id IS NOT NULL AND btrim(tms_id) <> '';

NOTIFY pgrst, 'reload schema';
