-- Calculation rules choose how a numeric result is shown.
-- Null keeps the previous display: numbers as currency, percent results as percents.
ALTER TABLE public.commission_template_rules
  ADD COLUMN IF NOT EXISTS result_type text;

NOTIFY pgrst, 'reload schema';
