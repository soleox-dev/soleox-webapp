-- A template qualifies for submission on a transaction when this formula is true.
-- Blank means the template does not qualify.
ALTER TABLE public.commission_templates
  ADD COLUMN IF NOT EXISTS eligibility_formula text;

NOTIFY pgrst, 'reload schema';
