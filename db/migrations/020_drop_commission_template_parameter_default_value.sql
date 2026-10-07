-- default_value is unused. Parameter defaults come from autofill_formula.

ALTER TABLE public.commission_template_parameters
  DROP COLUMN IF EXISTS default_value;

NOTIFY pgrst, 'reload schema';
