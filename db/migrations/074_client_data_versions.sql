-- When each client's report data last changed, so Owner Reports can keep a downloaded copy in the browser and download
-- again only when something changed (GET /api/owner-reports/version).
--
-- One row per client. Triggers on every table the reports read set changed_at to now() after any insert, update or
-- delete, once per statement (a bulk sync of hundreds of rows touches the row once). Nobody writes the table directly;
-- members can read their client's row.

CREATE TABLE IF NOT EXISTS public.client_data_versions (
  client_id text PRIMARY KEY REFERENCES public.clients (id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_data_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view data versions" ON public.client_data_versions;
CREATE POLICY "Members can view data versions" ON public.client_data_versions
  FOR SELECT TO public
  USING (public.is_client_member(client_id) OR public.is_platform_super_admin());

-- Read only: the triggers below write it as the table owner.
GRANT SELECT ON public.client_data_versions TO authenticated, service_role;

-- Marks every client a statement touched as changed now. Statement-level, reading the statement's transition tables;
-- rows without a client (Commission Plan presets) are skipped.
CREATE OR REPLACE FUNCTION public.touch_client_data_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.client_data_versions (client_id, changed_at)
    SELECT DISTINCT client_id::text, now() FROM changed_old WHERE client_id IS NOT NULL
    ON CONFLICT (client_id) DO UPDATE SET changed_at = excluded.changed_at;
  ELSE
    INSERT INTO public.client_data_versions (client_id, changed_at)
    SELECT DISTINCT client_id::text, now() FROM changed_new WHERE client_id IS NOT NULL
    ON CONFLICT (client_id) DO UPDATE SET changed_at = excluded.changed_at;
  END IF;
  RETURN NULL;
END;
$$;

-- The tables Owner Reports downloads: deals, waterfall lines, payments, agents, caps, plans, fields and options.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'transactions',
    'transaction_commission_items',
    'payments',
    'agents',
    'client_caps',
    'transaction_team_caps',
    'client_sales_volume_assignments',
    'commission_entities',
    'commission_plans',
    'commission_plan_versions',
    'client_commission_plan_settings',
    'client_field_configurations',
    'client_lookup_values'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_data_version_insert', table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_data_version_update', table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_data_version_delete', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT ON public.%I REFERENCING NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION public.touch_client_data_version()',
      table_name || '_data_version_insert', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER UPDATE ON public.%I REFERENCING NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION public.touch_client_data_version()',
      table_name || '_data_version_update', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER DELETE ON public.%I REFERENCING OLD TABLE AS changed_old FOR EACH STATEMENT EXECUTE FUNCTION public.touch_client_data_version()',
      table_name || '_data_version_delete', table_name);
  END LOOP;
END;
$$;

-- Every existing client starts as changed now, so the first visit after this migration downloads fresh data.
INSERT INTO public.client_data_versions (client_id, changed_at)
SELECT id, now() FROM public.clients
ON CONFLICT (client_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
