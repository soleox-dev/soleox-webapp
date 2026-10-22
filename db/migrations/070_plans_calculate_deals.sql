-- The per-client switch for Commission Plans in the deal waterfall. Off by default: a client's deals keep their
-- template's numbers until a Settings user turns it on. calculate_from is the first Cap Date plans calculate;
-- deals before it, and deals in the client's FINISHED view, keep their saved lines untouched.

ALTER TABLE public.client_commission_plan_settings
  ADD COLUMN IF NOT EXISTS calculate_deals boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calculate_from date;

NOTIFY pgrst, 'reload schema';
