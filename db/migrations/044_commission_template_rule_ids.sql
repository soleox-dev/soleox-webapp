-- Rule ids use CTR_ now that the table is commission_template_rules.
-- Existing CTL_ ids keep the same hex and change only the prefix.
-- Foreign keys are updated with the primary key. Text and JSON columns that
-- store one of those ids, without a foreign key, are updated from the same list.

ALTER TABLE public.commission_template_rules
  ALTER COLUMN id SET DEFAULT public.generate_prefixed_id('CTR');

DO $$
DECLARE
  fn record;
  chk record;
  fk record;
  col record;
  rule_id record;
BEGIN
  FOR fn IN
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%generate_prefixed_id(''CTL'')%'
  LOOP
    EXECUTE replace(fn.definition, 'generate_prefixed_id(''CTL'')', 'generate_prefixed_id(''CTR'')');
  END LOOP;

  FOR chk IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    WHERE con.conrelid = 'public.commission_template_rules'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%CTL%'
  LOOP
    EXECUTE format('ALTER TABLE public.commission_template_rules DROP CONSTRAINT %I', chk.conname);
    EXECUTE format(
      'ALTER TABLE public.commission_template_rules ADD CONSTRAINT %I %s',
      chk.conname,
      replace(chk.definition, 'CTL', 'CTR')
    );
  END LOOP;

  CREATE TEMP TABLE rule_id_rename ON COMMIT DROP AS
  SELECT id AS old_id, 'CTR' || substring(id FROM 4) AS new_id
  FROM public.commission_template_rules
  WHERE id ~ '^CTL_[0-9A-Fa-f]{12}$';

  CREATE TEMP TABLE rule_fk_defs ON COMMIT DROP AS
  SELECT con.conrelid::regclass AS table_name,
         con.conname,
         pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  WHERE con.contype = 'f'
    AND con.confrelid = 'public.commission_template_rules'::regclass;

  FOR fk IN SELECT table_name, conname FROM rule_fk_defs LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
  END LOOP;

  FOR col IN
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           a.attname AS column_name,
           t.typname AS type_name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND t.typname IN ('text', 'varchar', 'bpchar', 'citext', 'json', 'jsonb')
      AND NOT (c.relname = 'commission_template_rules' AND a.attname = 'id')
  LOOP
    FOR rule_id IN SELECT old_id, new_id FROM rule_id_rename LOOP
      IF col.type_name IN ('json', 'jsonb') THEN
        EXECUTE format(
          'UPDATE %I.%I SET %I = replace(%I::text, $1, $2)::%s WHERE %I::text LIKE $3',
          col.schema_name,
          col.table_name,
          col.column_name,
          col.column_name,
          col.type_name,
          col.column_name
        )
        USING rule_id.old_id, rule_id.new_id, '%' || rule_id.old_id || '%';
      ELSE
        EXECUTE format(
          'UPDATE %I.%I SET %I = replace(%I::text, $1, $2) WHERE %I::text LIKE $3',
          col.schema_name,
          col.table_name,
          col.column_name,
          col.column_name,
          col.column_name
        )
        USING rule_id.old_id, rule_id.new_id, '%' || rule_id.old_id || '%';
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.commission_template_rules AS rule
  SET id = renamed.new_id
  FROM rule_id_rename AS renamed
  WHERE rule.id = renamed.old_id;

  FOR fk IN SELECT table_name, conname, definition FROM rule_fk_defs LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.table_name, fk.conname, fk.definition);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
