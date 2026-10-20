-- The data version (052) now moves only when a row's content really changes. A save that writes the same
-- values again, such as the cap lines re-saved when a deal is opened or a TMS sync rewriting unchanged rows,
-- only touches updated_at and updated_by, and no longer counts. Inserts and deletes always count.

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
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
    SELECT DISTINCT n.client_id::text, 1, now() FROM new_rows n WHERE n.client_id IS NOT NULL
    ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now();
  ELSE
    -- Updated rows whose content, apart from the audit stamps, is not among the rows before the update.
    INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
    SELECT DISTINCT changed.client_id, 1, now()
    FROM (
      SELECT n.client_id::text AS client_id, to_jsonb(n) - 'updated_at' - 'updated_by' AS content FROM new_rows n
      EXCEPT
      SELECT o.client_id::text, to_jsonb(o) - 'updated_at' - 'updated_by' FROM old_rows o
    ) AS changed
    WHERE changed.client_id IS NOT NULL
    ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now();
  END IF;
  RETURN NULL;
END;
$$;

-- The clients row (views and scorecards live in settings_json): same rule.
CREATE OR REPLACE FUNCTION public.bump_client_data_version_for_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
  SELECT DISTINCT changed.id, 1, now()
  FROM (
    SELECT n.id::text AS id, to_jsonb(n) - 'updated_at' - 'updated_by' AS content FROM new_rows n
    EXCEPT
    SELECT o.id::text, to_jsonb(o) - 'updated_at' - 'updated_by' FROM old_rows o
  ) AS changed
  WHERE changed.id IS NOT NULL
  ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now();
  RETURN NULL;
END;
$$;

-- The update triggers now need the rows from before the update too.
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
    IF to_regclass('public.' || tracked) IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tracked AND column_name = 'client_id'
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS bump_data_version_update ON public.%I', tracked);
    EXECUTE format('CREATE TRIGGER bump_data_version_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS bump_data_version_clients ON public.clients;
CREATE TRIGGER bump_data_version_clients AFTER UPDATE ON public.clients
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version_for_client();
