-- The settings screen calls these rows rules. Keep the table name in step with that.
ALTER TABLE public.commission_template_logic RENAME TO commission_template_rules;

ALTER POLICY "Admins can manage template logic"
  ON public.commission_template_rules
  RENAME TO "Admins can manage template rules";

-- Formulas saved before the rename still say commission_template_logic.
UPDATE public.commission_template_rules
SET
  apply_condition = replace(apply_condition, 'commission_template_logic', 'commission_template_rules'),
  custom_baseline = replace(custom_baseline, 'commission_template_logic', 'commission_template_rules'),
  calculation_formula = replace(calculation_formula, 'commission_template_logic', 'commission_template_rules'),
  payee_formula = replace(payee_formula, 'commission_template_logic', 'commission_template_rules')
WHERE apply_condition LIKE '%commission_template_logic%'
   OR custom_baseline LIKE '%commission_template_logic%'
   OR calculation_formula LIKE '%commission_template_logic%'
   OR payee_formula LIKE '%commission_template_logic%';

UPDATE public.commission_template_parameters
SET autofill_formula = replace(autofill_formula, 'commission_template_logic', 'commission_template_rules')
WHERE autofill_formula LIKE '%commission_template_logic%';

NOTIFY pgrst, 'reload schema';
