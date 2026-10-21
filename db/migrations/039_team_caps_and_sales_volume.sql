-- Client rules for Team Cap and Sales Volume, plus one allocation row per agent per deal.
-- Agent amounts, split percents, and reset dates stay on agents through field configurations.
-- IDs: CTC_ team cap, SVA_ sales volume, TAA_ allocation.

CREATE TABLE IF NOT EXISTS public.client_team_caps (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('CTC'),
  client_id text NOT NULL,
  name text NOT NULL DEFAULT 'Team Cap',
  enabled boolean NOT NULL DEFAULT false,
  qualifying_field_key text,
  qualifying_value text,
  split_percent_field_key text,
  cap_amount_field_key text,
  reset_date_field_key text,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by text,
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS client_team_caps_one_active
  ON public.client_team_caps (client_id)
  WHERE COALESCE(archived, false) = false;

CREATE TABLE IF NOT EXISTS public.client_sales_volume_assignments (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('SVA'),
  client_id text NOT NULL,
  name text NOT NULL DEFAULT 'Sales Volume',
  enabled boolean NOT NULL DEFAULT false,
  qualifying_field_key text,
  qualifying_value text,
  anchor text NOT NULL DEFAULT 'sales_price',
  assignment text NOT NULL DEFAULT 'agent_share',
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by text,
  updated_at timestamptz DEFAULT now(),
  updated_by text,
  CONSTRAINT client_sales_volume_anchor_check CHECK (anchor IN ('sales_price', 'sales_price_x_units')),
  CONSTRAINT client_sales_volume_assignment_check CHECK (assignment IN ('agent_share', 'primary_agent'))
);

CREATE UNIQUE INDEX IF NOT EXISTS client_sales_volume_one_active
  ON public.client_sales_volume_assignments (client_id)
  WHERE COALESCE(archived, false) = false;

CREATE TABLE IF NOT EXISTS public.transaction_agent_allocations (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('TAA'),
  client_id text NOT NULL,
  transaction_id text NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  kind text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  calculated_amount numeric NOT NULL DEFAULT 0,
  is_override boolean NOT NULL DEFAULT false,
  period_start date,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by text,
  updated_at timestamptz DEFAULT now(),
  updated_by text,
  CONSTRAINT transaction_agent_allocations_kind_check CHECK (kind IN ('team_cap', 'sales_volume'))
);

CREATE UNIQUE INDEX IF NOT EXISTS transaction_agent_allocations_agent_kind_uidx
  ON public.transaction_agent_allocations (transaction_id, agent_id, kind)
  WHERE COALESCE(archived, false) = false;

CREATE INDEX IF NOT EXISTS transaction_agent_allocations_client_kind_idx
  ON public.transaction_agent_allocations (client_id, kind, agent_id);

ALTER TABLE public.client_team_caps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sales_volume_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_agent_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view team caps" ON public.client_team_caps;
CREATE POLICY "Members can view team caps" ON public.client_team_caps
  FOR SELECT TO public
  USING (public.is_client_member(client_id));

DROP POLICY IF EXISTS "Commission tracker settings can manage team caps" ON public.client_team_caps;
CREATE POLICY "Commission tracker settings can manage team caps" ON public.client_team_caps
  FOR ALL TO public
  USING (public.can_manage_tracker_settings(client_id))
  WITH CHECK (public.can_manage_tracker_settings(client_id));

DROP POLICY IF EXISTS "Members can view sales volume assignments" ON public.client_sales_volume_assignments;
CREATE POLICY "Members can view sales volume assignments" ON public.client_sales_volume_assignments
  FOR SELECT TO public
  USING (public.is_client_member(client_id));

DROP POLICY IF EXISTS "Commission tracker settings can manage sales volume assignments" ON public.client_sales_volume_assignments;
CREATE POLICY "Commission tracker settings can manage sales volume assignments" ON public.client_sales_volume_assignments
  FOR ALL TO public
  USING (public.can_manage_tracker_settings(client_id))
  WITH CHECK (public.can_manage_tracker_settings(client_id));

DROP POLICY IF EXISTS "Members can view agent allocations" ON public.transaction_agent_allocations;
CREATE POLICY "Members can view agent allocations" ON public.transaction_agent_allocations
  FOR SELECT TO public
  USING (public.is_client_member(client_id));

DROP POLICY IF EXISTS "Commission tracker write can manage agent allocations" ON public.transaction_agent_allocations;
CREATE POLICY "Commission tracker write can manage agent allocations" ON public.transaction_agent_allocations
  FOR ALL TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

-- Data API access. Supabase stops granting it automatically to new tables on 2026-10-30, so a rebuild from
-- these files (new project, preview branch, db reset) needs it spelled out. Row level security still decides
-- which rows each user reaches; these grants only let the API reach the table at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_team_caps TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_sales_volume_assignments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_agent_allocations TO authenticated, service_role;
