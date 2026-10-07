-- Calculation rules can stay hidden until a formula is true.
ALTER TABLE public.commission_template_rules
  ADD COLUMN IF NOT EXISTS show_when_formula text;

NOTIFY pgrst, 'reload schema';
