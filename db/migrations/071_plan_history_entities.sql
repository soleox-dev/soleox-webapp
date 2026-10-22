-- Deals saved before Commission Plans calculated them count toward caps (Commission Plans, phase 4). Each plan
-- line key can name the commission entity the client's template paid that line to, for example
-- {"company_dollar": "ENT_...Broker Cap", "post_cap_fee": "ENT_...Flat Cap Fee"}. A saved line to that entity with no
-- plan_line_key counts toward the agent's year-to-date total for that plan line, like a saved plan line.

ALTER TABLE public.client_commission_plan_settings
  ADD COLUMN IF NOT EXISTS history_entity_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.client_commission_plan_settings
  DROP CONSTRAINT IF EXISTS client_commission_plan_settings_history_check;

ALTER TABLE public.client_commission_plan_settings
  ADD CONSTRAINT client_commission_plan_settings_history_check CHECK (jsonb_typeof(history_entity_ids) = 'object');

NOTIFY pgrst, 'reload schema';
