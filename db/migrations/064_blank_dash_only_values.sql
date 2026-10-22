-- Transaction values made only of dashes ("-", "- -", "—") came in from the TMS sheet meaning "nothing here", but
-- were stored as text, so formulas, filters, and reports treated them as filled. The sync now stores them blank
-- (coerceSyncValue in lib/transaction-sync.ts); this clears the ones stored before.
--
-- Custom fields: the key is removed from custom_attributes, as for any field never filled in.
-- Built-in text columns: set to NULL.
-- Only values with nothing but dashes and spaces change; "A-1" or "Jo-Ann" stay.

DO $$
DECLARE
  dash_only constant text := '^[[:space:]‐-―−-]+$';
  column_name text;
  changed int;
BEGIN
  UPDATE public.transactions AS t
  SET custom_attributes = COALESCE((
    SELECT jsonb_object_agg(entry.key, entry.value)
    FROM jsonb_each(t.custom_attributes) AS entry
    WHERE NOT (jsonb_typeof(entry.value) = 'string' AND entry.value #>> '{}' ~ dash_only)
  ), '{}'::jsonb)
  WHERE jsonb_typeof(t.custom_attributes) = 'object'
    AND EXISTS (
      SELECT 1 FROM jsonb_each(t.custom_attributes) AS entry
      WHERE jsonb_typeof(entry.value) = 'string' AND entry.value #>> '{}' ~ dash_only
    );
  GET DIAGNOSTICS changed = ROW_COUNT;
  RAISE NOTICE 'custom_attributes: % transactions cleaned', changed;

  FOR column_name IN
    SELECT c.column_name
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'transactions'
      AND c.data_type IN ('text', 'character varying')
      AND c.column_name NOT IN ('id', 'client_id', 'tms_id')
  LOOP
    EXECUTE format('UPDATE public.transactions SET %1$I = NULL WHERE %1$I ~ %2$L', column_name, dash_only);
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed > 0 THEN
      RAISE NOTICE '%: % transactions cleaned', column_name, changed;
    END IF;
  END LOOP;
END;
$$;
