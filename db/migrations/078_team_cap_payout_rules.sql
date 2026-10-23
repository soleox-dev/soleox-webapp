-- A team cap pays out by rule: each deal uses the first payout rule whose condition is true (a blank condition is
-- true), and that rule's recipients split what the cap collects by share. One cap can then pay Dylan 50%, Yvonne
-- 35% and Paul 15% on Las Vegas deals and Dylan 100% on the others, while each agent keeps one cap total.
--
-- payout_rules holds [{ "condition": "…" | null, "recipients": [{ "agent_id": "AGT_…", "share": 50 }, …] }, …].
-- recipients and recipient_agent_id keep the first rule's recipients for older readers. Caps that exist get one
-- rule with no condition that pays their current recipients.

ALTER TABLE public.client_caps
  ADD COLUMN IF NOT EXISTS payout_rules jsonb;

UPDATE public.client_caps
SET payout_rules = jsonb_build_array(jsonb_build_object(
  'condition', NULL,
  'recipients', COALESCE(
    recipients,
    jsonb_build_array(jsonb_build_object('agent_id', recipient_agent_id, 'share', 100))
  )
))
WHERE payout_rules IS NULL
  AND COALESCE(cap_type, 'TEAM') = 'TEAM'
  AND (recipients IS NOT NULL OR recipient_agent_id IS NOT NULL);

NOTIFY pgrst, 'reload schema';
