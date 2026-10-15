-- Replace the single field/value qualifier with the same formula used by scorecards and the default view.
-- A blank formula includes every deal.

ALTER TABLE public.client_team_caps
  ADD COLUMN IF NOT EXISTS qualifying_formula text;

ALTER TABLE public.client_sales_volume_assignments
  ADD COLUMN IF NOT EXISTS qualifying_formula text;

UPDATE public.client_team_caps
SET qualifying_formula = qualifying_field_key || '="' || replace(COALESCE(qualifying_value, ''), '"', '""') || '"'
WHERE COALESCE(btrim(qualifying_formula), '') = ''
  AND COALESCE(btrim(qualifying_field_key), '') <> ''
  AND qualifying_field_key ~ '^[A-Za-z_][A-Za-z0-9_]*$';

UPDATE public.client_sales_volume_assignments
SET qualifying_formula = qualifying_field_key || '="' || replace(COALESCE(qualifying_value, ''), '"', '""') || '"'
WHERE COALESCE(btrim(qualifying_formula), '') = ''
  AND COALESCE(btrim(qualifying_field_key), '') <> ''
  AND qualifying_field_key ~ '^[A-Za-z_][A-Za-z0-9_]*$';

ALTER TABLE public.client_team_caps
  DROP COLUMN IF EXISTS qualifying_field_key,
  DROP COLUMN IF EXISTS qualifying_value;

ALTER TABLE public.client_sales_volume_assignments
  DROP COLUMN IF EXISTS qualifying_field_key,
  DROP COLUMN IF EXISTS qualifying_value;

NOTIFY pgrst, 'reload schema';
