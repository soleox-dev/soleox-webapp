-- Each team cap names the agent who receives the payment.
-- The deal pays that agent only when they are already on the agent splits.

ALTER TABLE public.client_team_caps
  ADD COLUMN IF NOT EXISTS recipient_agent_id text;

NOTIFY pgrst, 'reload schema';
