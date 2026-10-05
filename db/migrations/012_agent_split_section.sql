-- Co-agent splits were stored as PRE_SPLIT rows with payee_type AGENT and no
-- commission entity. Those lines are agent splits. POST_SPLIT rows with a null
-- payee_entity_id do not exist; post-split deductions always point at an entity.

UPDATE public.transaction_commission_items
SET section = 'AGENT_SPLIT'
WHERE section = 'PRE_SPLIT'
  AND payee_type = 'AGENT'
  AND payee_entity_id IS NULL;
