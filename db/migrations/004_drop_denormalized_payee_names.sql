-- Link existing splits and payments to commission entities and agents, then
-- drop the copied name columns. Names are read from commission_entities and agents.

-- Commission items: entity name -> payee_entity_id
UPDATE public.transaction_commission_items AS item
SET payee_entity_id = entity.id
FROM public.commission_entities AS entity
WHERE item.payee_entity_id IS NULL
  AND item.entity_name IS NOT NULL
  AND btrim(item.entity_name) <> ''
  AND item.client_id = entity.client_id
  AND lower(btrim(item.entity_name)) = lower(btrim(entity.entity_name))
  AND COALESCE(entity.archived, false) = false;

-- Commission items: agent name -> agent_id
UPDATE public.transaction_commission_items AS item
SET agent_id = agent.id
FROM public.agents AS agent
WHERE item.agent_id IS NULL
  AND item.agent_name IS NOT NULL
  AND btrim(item.agent_name) <> ''
  AND item.client_id = agent.client_id
  AND lower(btrim(item.agent_name)) = lower(btrim(agent.agent_name))
  AND COALESCE(agent.archived, false) = false;

-- Payments: entity payee name -> payee_entity_id
UPDATE public.payments AS payment
SET payee_entity_id = entity.id
FROM public.commission_entities AS entity
WHERE payment.payee_entity_id IS NULL
  AND payment.payee_type IN ('ENTITY', 'BROKERAGE')
  AND payment.payee_name IS NOT NULL
  AND btrim(payment.payee_name) <> ''
  AND payment.client_id = entity.client_id
  AND lower(btrim(payment.payee_name)) = lower(btrim(entity.entity_name))
  AND COALESCE(entity.archived, false) = false;

-- Payments: agent payee name -> agent_id
UPDATE public.payments AS payment
SET agent_id = agent.id
FROM public.agents AS agent
WHERE payment.agent_id IS NULL
  AND payment.payee_type = 'AGENT'
  AND payment.payee_name IS NOT NULL
  AND btrim(payment.payee_name) <> ''
  AND payment.client_id = agent.client_id
  AND lower(btrim(payment.payee_name)) = lower(btrim(agent.agent_name))
  AND COALESCE(agent.archived, false) = false;

ALTER TABLE public.transaction_commission_items
  DROP COLUMN IF EXISTS entity_name,
  DROP COLUMN IF EXISTS agent_name;

ALTER TABLE public.payments
  DROP COLUMN IF EXISTS payee_name;
