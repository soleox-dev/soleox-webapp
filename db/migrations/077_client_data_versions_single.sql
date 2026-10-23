-- One shape and one trigger set for client_data_versions.
--
-- 052 created the table as (client_id, version, changed_at) with the bump_data_version_* triggers (053 made updates
-- count only real content changes, 056 logs each step in client_data_changes, 065 added the plan tables). 074 later
-- meant to create it as (client_id REFERENCES clients, changed_at) for Owner Reports, but its CREATE TABLE IF NOT
-- EXISTS was skipped because 052's table was there. Its second policy and its <table>_data_version_* triggers
-- (touch_client_data_version, which only sets changed_at) still went in, so every write on a shared table ran two
-- triggers against the same row, and the foreign key to clients never existed.
--
-- Both readers use the 052 table: GET /api/data-version reads version (Transactions page) and
-- GET /api/owner-reports/version reads changed_at (Owner Reports). bump_client_data_version already moves both, on
-- every table 074 listed, so 074's triggers only added a second write. Dropping them changes one thing: a save that
-- rewrites the same values (only updated_at/updated_by differ) no longer moves changed_at either, so Owner Reports
-- stops downloading again after a no-op save, the same rule the Transactions page has had since 053.
--
-- Safe to run again.

-- 074's duplicates: its triggers, their function and its policy (is_client_member already lets platform super admins
-- read, so "Members can read their client data version" from 052 covers the same rows).
DO $$
DECLARE
  tracked text;
BEGIN
  FOREACH tracked IN ARRAY ARRAY[
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
    IF to_regclass('public.' || tracked) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', tracked || '_data_version_insert', tracked);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', tracked || '_data_version_update', tracked);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', tracked || '_data_version_delete', tracked);
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.touch_client_data_version();

DROP POLICY IF EXISTS "Members can view data versions" ON public.client_data_versions;

-- The foreign key 074 meant to add. Rows for clients that no longer exist are removed first, or it could not be added.
DELETE FROM public.client_data_versions v
WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = v.client_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_data_versions'::regclass AND conname = 'client_data_versions_client_id_fkey'
  ) THEN
    ALTER TABLE public.client_data_versions
      ADD CONSTRAINT client_data_versions_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients (id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- Same rules as 056, now only for clients that exist. Deleting a client cascades to its deals, agents and so on,
-- and their delete triggers fire while the client row is already gone; without the check they would insert a
-- version row for it and the foreign key would stop the client from being deleted.
CREATE OR REPLACE FUNCTION public.bump_client_data_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    WITH changed AS (
      SELECT o.client_id::text AS client_id, public.data_change_transaction_id(TG_TABLE_NAME, to_jsonb(o)) AS transaction_id
      FROM old_rows o
      WHERE o.client_id IS NOT NULL
    ), bumped AS (
      INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
      SELECT DISTINCT ch.client_id, 1, now() FROM changed ch
      WHERE EXISTS (SELECT 1 FROM public.clients c WHERE c.id = ch.client_id)
      ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now()
      RETURNING v.client_id, v.version
    )
    INSERT INTO public.client_data_changes (client_id, version, table_name, transaction_ids, changed_at)
    SELECT b.client_id, b.version, TG_TABLE_NAME,
      CASE WHEN bool_and(c.transaction_id IS NOT NULL) AND count(DISTINCT c.transaction_id) <= 200
        THEN array_agg(DISTINCT c.transaction_id) END,
      now()
    FROM bumped b JOIN changed c ON c.client_id = b.client_id
    GROUP BY b.client_id, b.version
    ON CONFLICT (client_id, version) DO NOTHING;
  ELSIF TG_OP = 'INSERT' THEN
    WITH changed AS (
      SELECT n.client_id::text AS client_id, public.data_change_transaction_id(TG_TABLE_NAME, to_jsonb(n)) AS transaction_id
      FROM new_rows n
      WHERE n.client_id IS NOT NULL
    ), bumped AS (
      INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
      SELECT DISTINCT ch.client_id, 1, now() FROM changed ch
      WHERE EXISTS (SELECT 1 FROM public.clients c WHERE c.id = ch.client_id)
      ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now()
      RETURNING v.client_id, v.version
    )
    INSERT INTO public.client_data_changes (client_id, version, table_name, transaction_ids, changed_at)
    SELECT b.client_id, b.version, TG_TABLE_NAME,
      CASE WHEN bool_and(c.transaction_id IS NOT NULL) AND count(DISTINCT c.transaction_id) <= 200
        THEN array_agg(DISTINCT c.transaction_id) END,
      now()
    FROM bumped b JOIN changed c ON c.client_id = b.client_id
    GROUP BY b.client_id, b.version
    ON CONFLICT (client_id, version) DO NOTHING;
  ELSE
    -- Updated rows whose content, apart from the audit stamps, is not among the rows before the update.
    WITH changed AS (
      SELECT x.client_id, public.data_change_transaction_id(TG_TABLE_NAME, x.content) AS transaction_id
      FROM (
        SELECT n.client_id::text AS client_id, to_jsonb(n) - 'updated_at' - 'updated_by' AS content FROM new_rows n
        EXCEPT
        SELECT o.client_id::text, to_jsonb(o) - 'updated_at' - 'updated_by' FROM old_rows o
      ) AS x
      WHERE x.client_id IS NOT NULL
    ), bumped AS (
      INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
      SELECT DISTINCT ch.client_id, 1, now() FROM changed ch
      WHERE EXISTS (SELECT 1 FROM public.clients c WHERE c.id = ch.client_id)
      ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now()
      RETURNING v.client_id, v.version
    )
    INSERT INTO public.client_data_changes (client_id, version, table_name, transaction_ids, changed_at)
    SELECT b.client_id, b.version, TG_TABLE_NAME,
      CASE WHEN bool_and(c.transaction_id IS NOT NULL) AND count(DISTINCT c.transaction_id) <= 200
        THEN array_agg(DISTINCT c.transaction_id) END,
      now()
    FROM bumped b JOIN changed c ON c.client_id = b.client_id
    GROUP BY b.client_id, b.version
    ON CONFLICT (client_id, version) DO NOTHING;
  END IF;
  DELETE FROM public.client_data_changes WHERE changed_at < now() - interval '2 hours';
  RETURN NULL;
END;
$$;

-- One trigger set on every tracked table: 052's list, 065's plan tables, and so every table 074 listed. Recreated
-- here so a table that missed one of the earlier loops has it too.
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
    'commission_plans',
    'commission_plan_versions',
    'client_commission_plan_settings',
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
    EXECUTE format('CREATE TRIGGER bump_data_version_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
    EXECUTE format('CREATE TRIGGER bump_data_version_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
  END LOOP;
END;
$$;

-- bump_data_version_clients (052/053/056) on clients stays as it is: it updates only the row of the client being
-- changed, which exists.

NOTIFY pgrst, 'reload schema';
