-- rule_key: name other formulas use to read the amount this rule calculated.
-- agent_key: transaction field, template parameter, or other rule whose value is the agent.
ALTER TABLE public.commission_template_logic
  ADD COLUMN IF NOT EXISTS rule_key text,
  ADD COLUMN IF NOT EXISTS agent_key text;

NOTIFY pgrst, 'reload schema';
