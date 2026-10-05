-- Each deal with commission lines gets an AGENT_SPLIT row for the primary agent
-- at step_number 1. Existing co-agent splits on that deal move up by one step.
-- The primary amount is the commission left after off-the-top, pre-split, and
-- co-agent amounts. Deals with no commission lines are left unchanged.
-- Safe to run again: a primary row already at step 1 is not moved or duplicated.

UPDATE public.transaction_commission_items AS item
SET step_number = item.step_number + 1
WHERE item.section = 'AGENT_SPLIT'
  AND COALESCE(item.archived, false) = false
  AND EXISTS (
    SELECT 1
    FROM public.transactions AS deal
    WHERE deal.id = item.transaction_id
      AND deal.agent_id IS NOT NULL
      AND item.agent_id IS DISTINCT FROM deal.agent_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.transaction_commission_items AS primary_row
        WHERE primary_row.transaction_id = deal.id
          AND primary_row.section = 'AGENT_SPLIT'
          AND primary_row.agent_id = deal.agent_id
          AND COALESCE(primary_row.archived, false) = false
          AND primary_row.step_number = 1
      )
  );

UPDATE public.transaction_commission_items AS item
SET step_number = 1,
    is_primary = true
WHERE item.section = 'AGENT_SPLIT'
  AND COALESCE(item.archived, false) = false
  AND item.step_number IS DISTINCT FROM 1
  AND EXISTS (
    SELECT 1
    FROM public.transactions AS deal
    WHERE deal.id = item.transaction_id
      AND deal.agent_id = item.agent_id
  );

INSERT INTO public.transaction_commission_items (
  client_id,
  transaction_id,
  submission_id,
  step_number,
  rule_name,
  section,
  payee_type,
  payee_entity_id,
  agent_id,
  split_type,
  split_value,
  calculated_amount,
  final_amount,
  is_primary,
  is_manual_override,
  archived
)
SELECT
  deal.client_id,
  deal.id,
  (
    SELECT item.submission_id
    FROM public.transaction_commission_items AS item
    WHERE item.transaction_id = deal.id
      AND COALESCE(item.archived, false) = false
      AND item.submission_id IS NOT NULL
    LIMIT 1
  ),
  1,
  COALESCE(agent.agent_name, 'Primary Agent') || ' Split',
  'AGENT_SPLIT',
  'AGENT',
  NULL,
  deal.agent_id,
  'AMOUNT',
  amounts.primary_amount,
  amounts.primary_amount,
  amounts.primary_amount,
  true,
  false,
  false
FROM public.transactions AS deal
JOIN public.agents AS agent ON agent.id = deal.agent_id
JOIN LATERAL (
  SELECT ROUND((
    COALESCE(deal.total_commission, deal.gci_amount, 0)
    - COALESCE((
        SELECT SUM(COALESCE(item.final_amount, item.calculated_amount, 0))
        FROM public.transaction_commission_items AS item
        WHERE item.transaction_id = deal.id
          AND COALESCE(item.archived, false) = false
          AND item.section = 'OFF_THE_TOP'
      ), 0)
    - COALESCE((
        SELECT SUM(COALESCE(item.final_amount, item.calculated_amount, 0))
        FROM public.transaction_commission_items AS item
        WHERE item.transaction_id = deal.id
          AND COALESCE(item.archived, false) = false
          AND item.section = 'PRE_SPLIT'
      ), 0)
    - COALESCE((
        SELECT SUM(COALESCE(item.final_amount, item.calculated_amount, 0))
        FROM public.transaction_commission_items AS item
        WHERE item.transaction_id = deal.id
          AND COALESCE(item.archived, false) = false
          AND item.section = 'AGENT_SPLIT'
          AND item.agent_id IS DISTINCT FROM deal.agent_id
      ), 0)
  )::numeric, 2) AS primary_amount
) AS amounts ON true
WHERE COALESCE(deal.archived, false) = false
  AND deal.agent_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.transaction_commission_items AS item
    WHERE item.transaction_id = deal.id
      AND COALESCE(item.archived, false) = false
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_commission_items AS item
    WHERE item.transaction_id = deal.id
      AND item.section = 'AGENT_SPLIT'
      AND item.agent_id = deal.agent_id
      AND COALESCE(item.archived, false) = false
  );
