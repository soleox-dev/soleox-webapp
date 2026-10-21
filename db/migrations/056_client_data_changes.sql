-- Which transactions each data version step (052/053) touched, so the Transactions page can refresh only
-- those rows when it comes back to a list it already has. Each bump writes one row here in the same
-- statement. transaction_ids is NULL when the change is not limited to a few known transactions (agents,
-- templates, fields, settings, a large sync, ...); the page then reloads everything as before.
-- Rows are kept for two hours, longer than the page keeps its saved list.

CREATE TABLE IF NOT EXISTS public.client_data_changes (
  client_id text NOT NULL,
  version bigint NOT NULL,
  table_name text NOT NULL,
  transaction_ids text[],
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, version)
);

CREATE INDEX IF NOT EXISTS client_data_changes_changed_at_idx
  ON public.client_data_changes (changed_at);

ALTER TABLE public.client_data_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read their client data changes" ON public.client_data_changes;
CREATE POLICY "Members can read their client data changes" ON public.client_data_changes
  FOR SELECT TO public
  USING (public.is_client_member(client_id));

-- The transaction a changed row belongs to, for tables whose rows hang off one transaction. NULL otherwise.
CREATE OR REPLACE FUNCTION public.data_change_transaction_id(table_name text, row_data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN table_name = 'transactions' THEN row_data->>'id'
    WHEN table_name IN (
      'transaction_commission_items',
      'payments',
      'transaction_team_caps',
      'transaction_agent_allocations',
      'transaction_field_protections',
      'commission_template_submissions'
    ) THEN row_data->>'transaction_id'
    ELSE NULL
  END;
$$;

-- Same rules as 053, and each bump also records the transactions it touched.
-- Up to 200 transactions are listed; a bigger change records NULL so the page reloads in full.
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
      SELECT DISTINCT client_id, 1, now() FROM changed
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
      SELECT DISTINCT client_id, 1, now() FROM changed
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
      SELECT DISTINCT client_id, 1, now() FROM changed
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

-- The clients row (views and scorecards live in settings_json) is never limited to some transactions.
CREATE OR REPLACE FUNCTION public.bump_client_data_version_for_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH changed AS (
    SELECT DISTINCT x.id AS client_id
    FROM (
      SELECT n.id::text AS id, to_jsonb(n) - 'updated_at' - 'updated_by' AS content FROM new_rows n
      EXCEPT
      SELECT o.id::text, to_jsonb(o) - 'updated_at' - 'updated_by' FROM old_rows o
    ) AS x
    WHERE x.id IS NOT NULL
  ), bumped AS (
    INSERT INTO public.client_data_versions AS v (client_id, version, changed_at)
    SELECT client_id, 1, now() FROM changed
    ON CONFLICT (client_id) DO UPDATE SET version = v.version + 1, changed_at = now()
    RETURNING v.client_id, v.version
  )
  INSERT INTO public.client_data_changes (client_id, version, table_name, transaction_ids, changed_at)
  SELECT client_id, version, TG_TABLE_NAME, NULL, now() FROM bumped
  ON CONFLICT (client_id, version) DO NOTHING;
  RETURN NULL;
END;
$$;
