-- Stores the rules a user defines for each commission template parameter.
ALTER TABLE public.commission_template_parameters
  ADD COLUMN IF NOT EXISTS is_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_rule text,
  ADD COLUMN IF NOT EXISTS notes text;

NOTIFY pgrst, 'reload schema';
