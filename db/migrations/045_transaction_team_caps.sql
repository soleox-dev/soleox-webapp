-- Per-deal team cap amounts move to transaction_team_caps (TTC_).
-- transaction_agent_allocations keeps the agent allocation rows, previously stored as sales volume.

CREATE TABLE IF NOT EXISTS public.transaction_team_caps (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('TTC'),
  client_id text NOT NULL,
  transaction_id text NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  team_cap_id text REFERENCES public.client_team_caps (id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  calculated_amount numeric NOT NULL DEFAULT 0,
  is_override boolean NOT NULL DEFAULT false,
  period_start date,
  created_at timestamptz DEFAULT now(),
  created_by text,
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS transaction_team_caps_uidx
  ON public.transaction_team_caps (transaction_id, agent_id, team_cap_id)
  WHERE team_cap_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transaction_team_caps_client_agent_idx
  ON public.transaction_team_caps (client_id, agent_id);

INSERT INTO public.transaction_team_caps (
  client_id,
  transaction_id,
  agent_id,
  team_cap_id,
  amount,
  calculated_amount,
  is_override,
  period_start,
  created_at,
  created_by,
  updated_at,
  updated_by
)
SELECT
  client_id,
  transaction_id,
  agent_id,
  team_cap_id,
  amount,
  calculated_amount,
  is_override,
  period_start,
  created_at,
  created_by,
  updated_at,
  updated_by
FROM public.transaction_agent_allocations
WHERE kind = 'team_cap'
  AND team_cap_id IS NOT NULL
  AND COALESCE(archived, false) = false;

DELETE FROM public.transaction_agent_allocations
WHERE kind = 'team_cap'
   OR COALESCE(archived, false) = true;

UPDATE public.client_sales_volume_assignments
SET name = 'Agent Allocation'
WHERE name = 'Sales Volume';

DROP INDEX IF EXISTS public.transaction_agent_allocations_team_cap_uidx;
DROP INDEX IF EXISTS public.transaction_agent_allocations_volume_uidx;
DROP INDEX IF EXISTS public.transaction_agent_allocations_client_kind_idx;
DROP INDEX IF EXISTS public.transaction_agent_allocations_agent_kind_uidx;

ALTER TABLE public.transaction_agent_allocations
  DROP CONSTRAINT IF EXISTS transaction_agent_allocations_kind_check;

ALTER TABLE public.transaction_agent_allocations
  DROP COLUMN IF EXISTS kind,
  DROP COLUMN IF EXISTS team_cap_id,
  DROP COLUMN IF EXISTS period_start,
  DROP COLUMN IF EXISTS archived;

CREATE UNIQUE INDEX IF NOT EXISTS transaction_agent_allocations_agent_uidx
  ON public.transaction_agent_allocations (transaction_id, agent_id);

CREATE INDEX IF NOT EXISTS transaction_agent_allocations_client_agent_idx
  ON public.transaction_agent_allocations (client_id, agent_id);

ALTER TABLE public.transaction_team_caps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view transaction team caps" ON public.transaction_team_caps;
CREATE POLICY "Members can view transaction team caps" ON public.transaction_team_caps
  FOR SELECT TO public
  USING (public.is_client_member(client_id));

DROP POLICY IF EXISTS "Commission tracker write can manage transaction team caps" ON public.transaction_team_caps;
CREATE POLICY "Commission tracker write can manage transaction team caps" ON public.transaction_team_caps
  FOR ALL TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

NOTIFY pgrst, 'reload schema';

-- Data API access. Supabase stops granting it automatically to new tables on 2026-10-30, so a rebuild from
-- these files (new project, preview branch, db reset) needs it spelled out. Row level security still decides
-- which rows each user reaches; these grants only let the API reach the table at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_team_caps TO authenticated, service_role;
