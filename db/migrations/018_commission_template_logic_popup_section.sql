-- Groups calculation results in the template popup, separate from the waterfall section.
ALTER TABLE public.commission_template_logic
  ADD COLUMN IF NOT EXISTS popup_section text;

NOTIFY pgrst, 'reload schema';
