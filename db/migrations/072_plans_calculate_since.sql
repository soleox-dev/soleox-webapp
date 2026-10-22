-- When a client's Commission Plans switch was turned on. Deals created after it calculate with plans; deals that
-- existed before keep their saved lines until someone chooses Calculate With Plans on that deal. Settings set it
-- when the switch turns on and clear it when it turns off. calculate_from (070) is no longer used.

ALTER TABLE public.client_commission_plan_settings
  ADD COLUMN IF NOT EXISTS calculate_since timestamptz;

NOTIFY pgrst, 'reload schema';
