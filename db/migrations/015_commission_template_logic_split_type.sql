-- split_type says whether a logic rule is applied as a percent of the
-- commission before its section, or as a dollar amount.
ALTER TABLE public.commission_template_logic
  ADD COLUMN IF NOT EXISTS split_type text;

UPDATE public.commission_template_logic
SET
  split_type = CASE rule_name
    WHEN 'Referral' THEN 'PERCENT'
    WHEN 'Agent 1 Split' THEN 'PERCENT'
    WHEN 'Agent 2 Split' THEN 'PERCENT'
    WHEN 'Agent 3 Split' THEN 'PERCENT'
    WHEN 'Team Lead Split' THEN 'PERCENT'
    ELSE 'AMOUNT'
  END,
  calculation_formula = CASE rule_name
    WHEN 'Agent 1 Split' THEN 'baseline * a1_split_percent + a1_split_amount + a1_adj_amount'
    WHEN 'Agent 2 Split' THEN 'baseline * a2_split_percent + a2_split_amount + a2_adj_amount'
    WHEN 'Agent 3 Split' THEN 'baseline * a3_split_percent + a3_split_amount + a3_adj_amount'
    ELSE calculation_formula
  END
WHERE COALESCE(archived, false) = false
  AND rule_name IN (
    'MLS Fee',
    'Client Credit off the top',
    'Referral',
    'Client Credit after Referral',
    'Agent 1 Split',
    'Agent 2 Split',
    'Agent 3 Split',
    'Team Lead Split'
  );

NOTIFY pgrst, 'reload schema';
