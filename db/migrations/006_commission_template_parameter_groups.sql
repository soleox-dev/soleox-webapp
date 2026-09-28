-- Lets each commission template parameter belong to a named group.
ALTER TABLE public.commission_template_parameters
  ADD COLUMN IF NOT EXISTS section text;

NOTIFY pgrst, 'reload schema';
