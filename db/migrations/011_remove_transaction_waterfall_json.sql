-- Waterfall lines and the agent roster live in transaction_commission_items.
-- Remove the copies that were stored on the transaction document.

UPDATE public.transactions
SET custom_attributes = custom_attributes
  - 'agents'
  - 'offTheTopRules'
  - 'preSplitRules'
  - 'postSplitRulesByAgent'
  - 'postSplit2RulesByAgent'
WHERE custom_attributes IS NOT NULL
  AND custom_attributes ?| ARRAY[
    'agents',
    'offTheTopRules',
    'preSplitRules',
    'postSplitRulesByAgent',
    'postSplit2RulesByAgent'
  ];
