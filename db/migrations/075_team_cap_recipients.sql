-- A team cap can pay several agents, each a share of what the cap collects (Dylan 50%, Yvonne 35%, Paul 15%).
-- recipients holds [{ "agent_id": "AGT_…", "share": 50 }, …] and the shares add up to 100. recipient_agent_id
-- keeps the first recipient for older readers. Caps that exist pay their one recipient 100%.
--
-- progress_cap_id makes a cap count toward another cap's amount: what an agent paid into either one counts
-- toward the same yearly cap, so an agent who moves from one team to another keeps what they already paid.
-- It has no foreign key: Settings saves caps one at a time, and a cap may name one saved after it.

ALTER TABLE public.client_caps
  ADD COLUMN IF NOT EXISTS recipients jsonb,
  ADD COLUMN IF NOT EXISTS progress_cap_id text;

UPDATE public.client_caps
SET recipients = jsonb_build_array(jsonb_build_object('agent_id', recipient_agent_id, 'share', 100))
WHERE recipients IS NULL
  AND recipient_agent_id IS NOT NULL
  AND COALESCE(cap_type, 'TEAM') = 'TEAM';

NOTIFY pgrst, 'reload schema';
