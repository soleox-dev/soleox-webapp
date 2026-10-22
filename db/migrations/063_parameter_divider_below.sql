-- A template parameter can draw a horizontal line below it in the Commission Template form, ending its group:
-- the next parameter starts a new row. Same idea as divider_below on rules (migration 061).
ALTER TABLE public.commission_template_parameters
  ADD COLUMN IF NOT EXISTS divider_below boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
