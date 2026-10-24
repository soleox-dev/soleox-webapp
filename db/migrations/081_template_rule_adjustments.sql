-- Adjustments in commission templates (docs/commission-model-redesign.md, section 4).
--
-- A Post-splits rule with a stage is an adjustment: a deal-specific line paid by the agents in paid_by_agent_keys,
-- or by every agent when the rule names no agent, at Before Plan or After Plan (lib/commission-engine/stages.ts).
-- stage: 'BEFORE_PLAN' (off the payers' splits, before their Commission Plan) or 'AFTER_PLAN' (off their net
--   after the plan). NULL keeps the rule a post-split for its agent_key, as before.
-- level: the level within the stage (every percent in a level takes the same base). NULL: the section's level.
-- paid_share_by now also takes 'custom' (paid_shares are percents) and 'typed' (paid_shares are dollars).
-- share_basis: for 'split', whose amounts divide it: 'split', 'after_before_plan', 'after_plan' or 'at_level'.
-- paid_shares: one formula per paid_by_agent_keys entry, in the same order, for 'custom' and 'typed'.
-- Additive only: every existing rule keeps NULL in the new columns, so no saved template changes.

ALTER TABLE public.commission_template_rules
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS level integer,
  ADD COLUMN IF NOT EXISTS share_basis text,
  ADD COLUMN IF NOT EXISTS paid_shares text[];

ALTER TABLE public.commission_template_rules
  DROP CONSTRAINT IF EXISTS commission_template_rules_stage_check;
ALTER TABLE public.commission_template_rules
  ADD CONSTRAINT commission_template_rules_stage_check
  CHECK (stage IS NULL OR stage IN ('BEFORE_PLAN', 'AFTER_PLAN'));

ALTER TABLE public.commission_template_rules
  DROP CONSTRAINT IF EXISTS commission_template_rules_level_check;
ALTER TABLE public.commission_template_rules
  ADD CONSTRAINT commission_template_rules_level_check
  CHECK (level IS NULL OR level >= 1);

ALTER TABLE public.commission_template_rules
  DROP CONSTRAINT IF EXISTS commission_template_rules_share_basis_check;
ALTER TABLE public.commission_template_rules
  ADD CONSTRAINT commission_template_rules_share_basis_check
  CHECK (share_basis IS NULL OR share_basis IN ('split', 'after_before_plan', 'after_plan', 'at_level'));

ALTER TABLE public.commission_template_rules
  DROP CONSTRAINT IF EXISTS commission_template_rules_paid_share_by_check;
ALTER TABLE public.commission_template_rules
  ADD CONSTRAINT commission_template_rules_paid_share_by_check
  CHECK (paid_share_by IS NULL OR paid_share_by IN ('split', 'equal', 'custom', 'typed'));

NOTIFY pgrst, 'reload schema';
