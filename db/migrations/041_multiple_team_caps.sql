-- A client can keep more than one team cap. Each allocation row belongs to one cap
-- so the yearly total for that cap stays separate.

DROP INDEX IF EXISTS public.client_team_caps_one_active;

ALTER TABLE public.transaction_agent_allocations
  ADD COLUMN IF NOT EXISTS team_cap_id text REFERENCES public.client_team_caps (id) ON DELETE SET NULL;

UPDATE public.transaction_agent_allocations AS allocation
SET team_cap_id = caps.id
FROM (
  SELECT client_id, min(id) AS id
  FROM public.client_team_caps
  WHERE COALESCE(archived, false) = false
  GROUP BY client_id
  HAVING count(*) = 1
) AS caps
WHERE allocation.client_id = caps.client_id
  AND allocation.kind = 'team_cap'
  AND allocation.team_cap_id IS NULL
  AND COALESCE(allocation.archived, false) = false;

DROP INDEX IF EXISTS public.transaction_agent_allocations_agent_kind_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS transaction_agent_allocations_team_cap_uidx
  ON public.transaction_agent_allocations (transaction_id, agent_id, team_cap_id)
  WHERE kind = 'team_cap'
    AND team_cap_id IS NOT NULL
    AND COALESCE(archived, false) = false;

CREATE UNIQUE INDEX IF NOT EXISTS transaction_agent_allocations_volume_uidx
  ON public.transaction_agent_allocations (transaction_id, agent_id)
  WHERE kind = 'sales_volume'
    AND COALESCE(archived, false) = false;

NOTIFY pgrst, 'reload schema';
