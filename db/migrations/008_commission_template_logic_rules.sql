-- Flexible logic-step fields. None of these store a built-in rule.
-- apply_condition: optional formula; blank means the step always applies.
-- payee_formula: optional formula whose result is the payee name.
-- custom_baseline: optional formula for the amount the step starts from.
ALTER TABLE public.commission_template_logic
  ADD COLUMN IF NOT EXISTS apply_condition text,
  ADD COLUMN IF NOT EXISTS payee_formula text,
  ADD COLUMN IF NOT EXISTS custom_baseline text;

NOTIFY pgrst, 'reload schema';
