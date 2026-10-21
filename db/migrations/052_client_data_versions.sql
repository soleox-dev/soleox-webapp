-- A per-client data version. It goes up whenever data the Transactions page shows or calculates from
-- changes, through the app, the hourly TMS sync, or anything else that writes these tables. The page keeps
-- what it loaded and, on return, asks only for this number: if it has not moved and the page is under an
-- hour old, nothing is reloaded or recalculated.

CREATE TABLE IF NOT EXISTS public.client_data_versions (
  client_id text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_data_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read their client data version" ON public.client_data_versions;
CREATE POLICY "Members can read their client data version" ON public.client_data_versions
  FOR SELECT TO public
  USING (public.is_client_member(client_id));

-- One bump per statement and client, so a sync that writes thousands of rows moves the version once.
-- Runs as the table owner so the counter updates no matter who wrote the data.
CREATE OR REPLACE FUNCTION public.bump_client_data_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
    SELECT DISTINCT o.client_id::text, 1, now() FROM old_rows o WHERE o.client_id IS NOT NULL
    ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now();
  ELSE
    INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
    SELECT DISTINCT n.client_id::text, 1, now() FROM new_rows n WHERE n.client_id IS NOT NULL
    ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now();
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  tracked text;
BEGIN
  FOREACH tracked IN ARRAY ARRAY[
    'transactions',
    'transaction_commission_items',
    'payments',
    'transaction_team_caps',
    'transaction_agent_allocations',
    'transaction_field_protections',
    'commission_templates',
    'commission_template_rules',
    'commission_template_parameters',
    'commission_template_submissions',
    'commission_entities',
    'agents',
    'client_field_configurations',
    'client_lookup_values',
    'client_caps',
    'client_sales_volume_assignments',
    'integration_connections',
    'integration_sync_runs'
  ]
  LOOP
    -- Only tables that exist and carry client_id; a trigger elsewhere would make every write fail.
    IF to_regclass('public.' || tracked) IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tracked AND column_name = 'client_id'
    ) THEN
      RAISE NOTICE 'client_data_versions: skipped %', tracked;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS bump_data_version_insert ON public.%I', tracked);
    EXECUTE format('DROP TRIGGER IF EXISTS bump_data_version_update ON public.%I', tracked);
    EXECUTE format('DROP TRIGGER IF EXISTS bump_data_version_delete ON public.%I', tracked);
    EXECUTE format('CREATE TRIGGER bump_data_version_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
    EXECUTE format('CREATE TRIGGER bump_data_version_update AFTER UPDATE ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
    EXECUTE format('CREATE TRIGGER bump_data_version_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
  END LOOP;
END;
$$;

-- The views and scorecards are stored on the client row.
DROP TRIGGER IF EXISTS bump_data_version_clients ON public.clients;
CREATE OR REPLACE FUNCTION public.bump_client_data_version_for_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
  SELECT DISTINCT n.id::text, 1, now() FROM new_rows n WHERE n.id IS NOT NULL
  ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now();
  RETURN NULL;
END;
$$;
CREATE TRIGGER bump_data_version_clients AFTER UPDATE ON public.clients
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version_for_client();

NOTIFY pgrst, 'reload schema';

-- Data API access. Supabase stops granting it automatically to new tables on 2026-10-30, so a rebuild from
-- these files (new project, preview branch, db reset) needs it spelled out. Row level security still decides
-- which rows each user reaches; these grants only let the API reach the table at all.
-- Users only read it; the triggers that bump it write it.
GRANT SELECT ON public.client_data_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_data_versions TO service_role;
