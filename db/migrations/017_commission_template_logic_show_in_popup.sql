-- Calculation rules can show their result in the template popup.
ALTER TABLE public.commission_template_logic
  ADD COLUMN IF NOT EXISTS show_in_popup boolean NOT NULL DEFAULT false;

UPDATE public.commission_template_logic
SET show_in_popup = true
WHERE COALESCE(archived, false) = false
  AND rule_key IN ('a1_broker_cap_reset_date', 'a1_prior_broker_cap_contribution');

NOTIFY pgrst, 'reload schema';
