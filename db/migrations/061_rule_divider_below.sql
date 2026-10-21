-- A calculation rule shown in the Commission Template form can draw a horizontal line below it in its
-- section's calculations list, to group related results (a cap, its prior contribution, what remains).
ALTER TABLE public.commission_template_rules
  ADD COLUMN IF NOT EXISTS divider_below boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
