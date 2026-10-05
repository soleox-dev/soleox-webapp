-- The primary agent split is the AGENT_SPLIT row with step_number 1.
-- Later AGENT_SPLIT steps are the other agents on the deal.

WITH ordered AS (
  SELECT
    item.id,
    ROW_NUMBER() OVER (
      PARTITION BY item.transaction_id
      ORDER BY
        CASE WHEN item.agent_id = txn.agent_id THEN 0 ELSE 1 END,
        item.step_number,
        item.id
    ) AS next_step
  FROM public.transaction_commission_items AS item
  JOIN public.transactions AS txn ON txn.id = item.transaction_id
  WHERE item.section = 'AGENT_SPLIT'
    AND COALESCE(item.archived, false) = false
)
UPDATE public.transaction_commission_items AS item
SET step_number = ordered.next_step
FROM ordered
WHERE item.id = ordered.id
  AND item.step_number IS DISTINCT FROM ordered.next_step;

ALTER TABLE public.transaction_commission_items
  DROP COLUMN IF EXISTS is_primary;

NOTIFY pgrst, 'reload schema';
