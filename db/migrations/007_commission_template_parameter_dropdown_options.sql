-- Stores the choices for a commission template parameter whose type is Select Dropdown.
ALTER TABLE public.commission_template_parameters
  ADD COLUMN IF NOT EXISTS dropdown_options text[];

NOTIFY pgrst, 'reload schema';
