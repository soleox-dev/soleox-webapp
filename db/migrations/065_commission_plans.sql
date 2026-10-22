-- Commission Plans (design: Commission Plans, phase 2). A plan is an ordered list of lines (lib/commission-engine/plans.ts)
-- run for every team agent on a deal. Nothing reads these tables yet, so no payout moves.
-- IDs: CPL_ plan, CPV_ plan version, CPS_ client plan settings.
--
-- commission_plans: client_id NULL is a platform preset (super admins keep the library; every client reads it).
--   A client copies a preset into its own plan; agents are assigned client plans only.
-- commission_plan_versions: the plan's lines from effective_from on. A deal uses the latest version on or
--   before its Cap Date, so a changed eXp amount applies from its date and earlier deals keep theirs.
-- client_commission_plan_settings: which transaction field orders deals for caps (Cap Date), and which agent
--   fields hold Cap Year Start, the opt-ins, the starting balances and agent cap overrides (by plan line key).
--   TATH keeps its eXp Cap Date field this way, as team caps keep their fields (039).
-- agents.commission_plan_id: the agent's plan, always one of the same client's plans.
-- transactions.fee_share_percent: a typed Fee Share %; NULL means the default rule.
-- commission_entities.is_brokerage_agent: a share paid to this entity reduces the default Fee Share
--   (an External eXp Agent is one; Referral and Zillow Preferred are not).
-- transaction_commission_items.commission_plan_version_id / plan_line_key: a saved plan line records the plan
--   version it was calculated with and its line key, which is also how year-to-date totals are read.

CREATE TABLE IF NOT EXISTS public.commission_plans (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('CPL'),
  client_id text,
  preset_key text,
  name text NOT NULL,
  description text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by text,
  updated_at timestamptz DEFAULT now(),
  updated_by text,
  CONSTRAINT commission_plans_id_client_key UNIQUE (id, client_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_plans_preset_key_uidx
  ON public.commission_plans (preset_key)
  WHERE client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commission_plans_client_name_uidx
  ON public.commission_plans (client_id, lower(name))
  WHERE client_id IS NOT NULL AND archived = false;

CREATE TABLE IF NOT EXISTS public.commission_plan_versions (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('CPV'),
  plan_id text NOT NULL REFERENCES public.commission_plans (id) ON DELETE CASCADE,
  -- Same as the plan's client_id (NULL for presets); kept here for row security and the data version triggers.
  client_id text,
  effective_from date NOT NULL,
  lines jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by text,
  updated_at timestamptz DEFAULT now(),
  updated_by text,
  CONSTRAINT commission_plan_versions_plan_date_key UNIQUE (plan_id, effective_from),
  CONSTRAINT commission_plan_versions_lines_check CHECK (jsonb_typeof(lines) = 'array')
);

CREATE TABLE IF NOT EXISTS public.client_commission_plan_settings (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('CPS'),
  client_id text NOT NULL,
  cap_date_field_key text NOT NULL DEFAULT 'closing_date',
  cap_year_start_field_key text,
  starting_balances_for_field_key text,
  -- {"company_dollar": "custom_starting_company_dollar", ...}: plan line key -> agent field key.
  starting_balance_field_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {"stock": "custom_plan_stock"}: opt-in line key -> agent yes/no field key.
  opt_in_field_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {"company_dollar": "custom_company_comm_cap"}: capped line key -> agent field that overrides the plan's cap.
  cap_amount_field_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by text,
  updated_at timestamptz DEFAULT now(),
  updated_by text,
  CONSTRAINT client_commission_plan_settings_maps_check CHECK (
    jsonb_typeof(starting_balance_field_keys) = 'object'
    AND jsonb_typeof(opt_in_field_keys) = 'object'
    AND jsonb_typeof(cap_amount_field_keys) = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS client_commission_plan_settings_one_active
  ON public.client_commission_plan_settings (client_id)
  WHERE archived = false;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS commission_plan_id text;

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_commission_plan_fkey;

-- The plan must belong to the agent's own client; a preset (client_id NULL) can never match.
ALTER TABLE public.agents
  ADD CONSTRAINT agents_commission_plan_fkey
  FOREIGN KEY (commission_plan_id, client_id) REFERENCES public.commission_plans (id, client_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS agents_commission_plan_idx
  ON public.agents (commission_plan_id)
  WHERE commission_plan_id IS NOT NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fee_share_percent numeric;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_fee_share_percent_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_fee_share_percent_check
  CHECK (fee_share_percent IS NULL OR (fee_share_percent >= 0 AND fee_share_percent <= 100));

ALTER TABLE public.commission_entities
  ADD COLUMN IF NOT EXISTS is_brokerage_agent boolean NOT NULL DEFAULT false;

ALTER TABLE public.transaction_commission_items
  ADD COLUMN IF NOT EXISTS commission_plan_version_id text REFERENCES public.commission_plan_versions (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS plan_line_key text;

ALTER TABLE public.transaction_commission_items
  DROP CONSTRAINT IF EXISTS transaction_commission_items_plan_line_check;

ALTER TABLE public.transaction_commission_items
  ADD CONSTRAINT transaction_commission_items_plan_line_check
  CHECK ((commission_plan_version_id IS NULL) = (plan_line_key IS NULL));

-- Year-to-date totals: an agent's saved plan lines by line key.
CREATE INDEX IF NOT EXISTS transaction_commission_items_plan_line_idx
  ON public.transaction_commission_items (client_id, agent_id, plan_line_key)
  WHERE plan_line_key IS NOT NULL;

-- Row level security.
ALTER TABLE public.commission_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_commission_plan_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view plans and presets" ON public.commission_plans;
CREATE POLICY "Members can view plans and presets" ON public.commission_plans
  FOR SELECT TO public
  USING (client_id IS NULL OR public.is_client_member(client_id));

DROP POLICY IF EXISTS "Super admins manage presets" ON public.commission_plans;
CREATE POLICY "Super admins manage presets" ON public.commission_plans
  FOR ALL TO public
  USING (client_id IS NULL AND public.is_platform_super_admin())
  WITH CHECK (client_id IS NULL AND public.is_platform_super_admin());

DROP POLICY IF EXISTS "Commission tracker settings manage plans" ON public.commission_plans;
CREATE POLICY "Commission tracker settings manage plans" ON public.commission_plans
  FOR ALL TO public
  USING (client_id IS NOT NULL AND public.can_manage_tracker_settings(client_id))
  WITH CHECK (client_id IS NOT NULL AND public.can_manage_tracker_settings(client_id));

DROP POLICY IF EXISTS "Members can view plan versions" ON public.commission_plan_versions;
CREATE POLICY "Members can view plan versions" ON public.commission_plan_versions
  FOR SELECT TO public
  USING (client_id IS NULL OR public.is_client_member(client_id));

-- A version's client_id must be its plan's, so a client plan's lines can only be written by that client.
DROP POLICY IF EXISTS "Plan managers manage plan versions" ON public.commission_plan_versions;
CREATE POLICY "Plan managers manage plan versions" ON public.commission_plan_versions
  FOR ALL TO public
  USING (
    CASE WHEN client_id IS NULL THEN public.is_platform_super_admin()
    ELSE public.can_manage_tracker_settings(client_id) END
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.commission_plans p
      WHERE p.id = plan_id AND p.client_id IS NOT DISTINCT FROM commission_plan_versions.client_id
    )
    AND CASE WHEN client_id IS NULL THEN public.is_platform_super_admin()
    ELSE public.can_manage_tracker_settings(client_id) END
  );

DROP POLICY IF EXISTS "Members can view plan settings" ON public.client_commission_plan_settings;
CREATE POLICY "Members can view plan settings" ON public.client_commission_plan_settings
  FOR SELECT TO public
  USING (public.is_client_member(client_id));

DROP POLICY IF EXISTS "Commission tracker settings manage plan settings" ON public.client_commission_plan_settings;
CREATE POLICY "Commission tracker settings manage plan settings" ON public.client_commission_plan_settings
  FOR ALL TO public
  USING (public.can_manage_tracker_settings(client_id))
  WITH CHECK (public.can_manage_tracker_settings(client_id));

-- Data API access (see 056): row level security still decides which rows each user reaches.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_plans TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_plan_versions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_commission_plan_settings TO authenticated, service_role;

-- Data version (052/053/056): a client's plan changes refresh its open pages. Presets carry no client_id, so
-- editing one bumps nobody; clients use their own copies.
DO $$
DECLARE
  tracked text;
BEGIN
  FOREACH tracked IN ARRAY ARRAY['commission_plans', 'commission_plan_versions', 'client_commission_plan_settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS bump_data_version_insert ON public.%I', tracked);
    EXECUTE format('DROP TRIGGER IF EXISTS bump_data_version_update ON public.%I', tracked);
    EXECUTE format('DROP TRIGGER IF EXISTS bump_data_version_delete ON public.%I', tracked);
    EXECUTE format('CREATE TRIGGER bump_data_version_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
    EXECUTE format('CREATE TRIGGER bump_data_version_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
    EXECUTE format('CREATE TRIGGER bump_data_version_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_client_data_version()', tracked);
  END LOOP;
END;
$$;

-- The four eXp presets. Their lines are lib/commission-engine/presets/exp-plans.json (tests/plans checks they
-- match). One version from 2000-01-01; a later eXp change adds a version with its own date.
INSERT INTO public.commission_plans (client_id, preset_key, name)
SELECT NULL, 'exp-4000', 'eXp $4,000'
WHERE NOT EXISTS (SELECT 1 FROM public.commission_plans WHERE client_id IS NULL AND preset_key = 'exp-4000');

INSERT INTO public.commission_plan_versions (plan_id, client_id, effective_from, lines)
SELECT p.id, NULL, DATE '2000-01-01', '[{"key": "company_dollar", "name": "Company dollar", "type": "capped_percent", "payee": "eXp", "rate": 0.2, "capAmount": 4000}, {"key": "post_cap_fee", "name": "Post-cap fee", "type": "per_deal_fee", "payee": "eXp", "amount": 75, "multiplierFrom": "company_dollar"}, {"key": "risk_management", "name": "Risk management", "type": "per_deal_fee", "payee": "eXp", "amount": 60, "yearlyLimit": 750}, {"key": "broker_review", "name": "Broker review", "type": "per_deal_fee", "payee": "eXp", "amount": 25}, {"key": "stock", "name": "Stock", "type": "percent_of_net", "payee": "eXp Stock", "rate": 0.05, "after": ["company_dollar", "post_cap_fee", "risk_management", "broker_review"], "optIn": true}]'::jsonb
FROM public.commission_plans p
WHERE p.client_id IS NULL AND p.preset_key = 'exp-4000'
ON CONFLICT (plan_id, effective_from) DO NOTHING;

INSERT INTO public.commission_plans (client_id, preset_key, name)
SELECT NULL, 'exp-8000', 'eXp $8,000'
WHERE NOT EXISTS (SELECT 1 FROM public.commission_plans WHERE client_id IS NULL AND preset_key = 'exp-8000');

INSERT INTO public.commission_plan_versions (plan_id, client_id, effective_from, lines)
SELECT p.id, NULL, DATE '2000-01-01', '[{"key": "company_dollar", "name": "Company dollar", "type": "capped_percent", "payee": "eXp", "rate": 0.2, "capAmount": 8000}, {"key": "post_cap_fee", "name": "Post-cap fee", "type": "per_deal_fee", "payee": "eXp", "amount": 75, "multiplierFrom": "company_dollar", "tiers": [{"amount": 250, "untilPaid": 5000}]}, {"key": "risk_management", "name": "Risk management", "type": "per_deal_fee", "payee": "eXp", "amount": 60, "yearlyLimit": 750}, {"key": "broker_review", "name": "Broker review", "type": "per_deal_fee", "payee": "eXp", "amount": 25}, {"key": "stock", "name": "Stock", "type": "percent_of_net", "payee": "eXp Stock", "rate": 0.05, "after": ["company_dollar", "post_cap_fee", "risk_management", "broker_review"], "optIn": true}]'::jsonb
FROM public.commission_plans p
WHERE p.client_id IS NULL AND p.preset_key = 'exp-8000'
ON CONFLICT (plan_id, effective_from) DO NOTHING;

INSERT INTO public.commission_plans (client_id, preset_key, name)
SELECT NULL, 'exp-16000', 'eXp $16,000'
WHERE NOT EXISTS (SELECT 1 FROM public.commission_plans WHERE client_id IS NULL AND preset_key = 'exp-16000');

INSERT INTO public.commission_plan_versions (plan_id, client_id, effective_from, lines)
SELECT p.id, NULL, DATE '2000-01-01', '[{"key": "company_dollar", "name": "Company dollar", "type": "capped_percent", "payee": "eXp", "rate": 0.2, "capAmount": 16000}, {"key": "post_cap_fee", "name": "Post-cap fee", "type": "per_deal_fee", "payee": "eXp", "amount": 75, "multiplierFrom": "company_dollar", "tiers": [{"amount": 250, "untilPaid": 5000}]}, {"key": "risk_management", "name": "Risk management", "type": "per_deal_fee", "payee": "eXp", "amount": 60, "yearlyLimit": 750}, {"key": "broker_review", "name": "Broker review", "type": "per_deal_fee", "payee": "eXp", "amount": 25}, {"key": "stock", "name": "Stock", "type": "percent_of_net", "payee": "eXp Stock", "rate": 0.05, "after": ["company_dollar", "post_cap_fee", "risk_management", "broker_review"], "optIn": true}]'::jsonb
FROM public.commission_plans p
WHERE p.client_id IS NULL AND p.preset_key = 'exp-16000'
ON CONFLICT (plan_id, effective_from) DO NOTHING;

INSERT INTO public.commission_plans (client_id, preset_key, name)
SELECT NULL, 'exp-16000-team-lead', 'eXp $16,000 Team Lead'
WHERE NOT EXISTS (SELECT 1 FROM public.commission_plans WHERE client_id IS NULL AND preset_key = 'exp-16000-team-lead');

INSERT INTO public.commission_plan_versions (plan_id, client_id, effective_from, lines)
SELECT p.id, NULL, DATE '2000-01-01', '[{"key": "company_dollar", "name": "Company dollar", "type": "capped_percent", "payee": "eXp", "rate": 0.2, "capAmount": 16000}, {"key": "post_cap_fee", "name": "Post-cap fee", "type": "per_deal_fee", "payee": "eXp", "amount": 75, "multiplierFrom": "company_dollar"}, {"key": "risk_management", "name": "Risk management", "type": "per_deal_fee", "payee": "eXp", "amount": 60, "yearlyLimit": 750}, {"key": "broker_review", "name": "Broker review", "type": "per_deal_fee", "payee": "eXp", "amount": 25}, {"key": "stock", "name": "Stock", "type": "percent_of_net", "payee": "eXp Stock", "rate": 0.05, "after": ["company_dollar", "post_cap_fee", "risk_management", "broker_review"], "optIn": true}]'::jsonb
FROM public.commission_plans p
WHERE p.client_id IS NULL AND p.preset_key = 'exp-16000-team-lead'
ON CONFLICT (plan_id, effective_from) DO NOTHING;

NOTIFY pgrst, 'reload schema';
