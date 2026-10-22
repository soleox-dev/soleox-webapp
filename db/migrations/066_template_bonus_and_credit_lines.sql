-- Bonus and credit lines in commission templates (design: Commission Plans, phase 4).
--
-- rule_kind 'BONUS' (Agent Splits section): moves the rule's amount from the agent named by from_agent_key to the
--   rule's agent (agent_key) after every agent split is worked out. A $1 bonus to one agent is a $1 concession
--   from another. Commission Plans share per-deal fees by the split before bonuses and work company dollar and
--   stock from the split after them.
-- paid_by_agent_keys (Off-the-top or Pre-splits section): the credit comes out of only these agents' splits,
--   before their plan lines, instead of off the top. paid_share_by says how they share it: 'split' (by their
--   split %, the default) or 'equal'. A credit typed per agent is one credit line per agent.
-- Every existing rule keeps NULL in these columns, so no saved template changes.

ALTER TABLE public.commission_template_rules
  ADD COLUMN IF NOT EXISTS rule_kind text,
  ADD COLUMN IF NOT EXISTS from_agent_key text,
  ADD COLUMN IF NOT EXISTS paid_by_agent_keys text[],
  ADD COLUMN IF NOT EXISTS paid_share_by text;

ALTER TABLE public.commission_template_rules
  DROP CONSTRAINT IF EXISTS commission_template_rules_rule_kind_check;

ALTER TABLE public.commission_template_rules
  ADD CONSTRAINT commission_template_rules_rule_kind_check
  CHECK (rule_kind IS NULL OR rule_kind = 'BONUS');

ALTER TABLE public.commission_template_rules
  DROP CONSTRAINT IF EXISTS commission_template_rules_paid_share_by_check;

ALTER TABLE public.commission_template_rules
  ADD CONSTRAINT commission_template_rules_paid_share_by_check
  CHECK (paid_share_by IS NULL OR paid_share_by IN ('split', 'equal'));

-- rename_rule_key (062) also rewrites a renamed key where a bonus names its payer or a credit its Paid By agents.
CREATE OR REPLACE FUNCTION public.rename_rule_key(
  p_client_id text,
  p_rule_id text,
  p_new_key text,
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_key text;
  v_template_id text;
  -- The old key as a whole word that is not a table column: a1_split, never agents.a1_split or a1_split_2.
  -- Keys are [a-z0-9_] only (checked below), so they are safe inside a regular expression.
  pattern text;
  n_templates int := 0;
  n_parameters int := 0;
  n_rules int := 0;
BEGIN
  IF NOT public.can_manage_tracker_settings(p_client_id) THEN
    RAISE EXCEPTION 'You do not have permission to change template settings.' USING ERRCODE = '42501';
  END IF;
  SELECT lower(rule_key), template_id INTO old_key, v_template_id
    FROM commission_template_rules WHERE client_id = p_client_id AND id = p_rule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That rule was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF old_key IS NULL OR old_key !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'This rule has no saved key to rename. Save the rule first.' USING ERRCODE = '22023';
  END IF;
  IF p_new_key !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'The new key must start with a letter or underscore and use only lowercase letters, numbers, and underscores.' USING ERRCODE = '22023';
  END IF;
  IF p_new_key = old_key THEN
    RAISE EXCEPTION 'The new key is the same as the current one.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM commission_template_rules
    WHERE client_id = p_client_id AND template_id = v_template_id AND id <> p_rule_id
      AND lower(coalesce(rule_key, '')) = p_new_key AND NOT coalesce(archived, false)
  ) THEN
    RAISE EXCEPTION 'Another rule in this template already uses the key %.', p_new_key USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM commission_template_parameters
    WHERE client_id = p_client_id AND template_id = v_template_id AND lower(parameter_key) = p_new_key
      AND NOT coalesce(archived, false)
  ) OR EXISTS (SELECT 1 FROM client_caps WHERE client_id = p_client_id AND key = p_new_key) THEN
    RAISE EXCEPTION 'A parameter or cap already uses % as its key, so formulas could not tell them apart.', p_new_key USING ERRCODE = '23505';
  END IF;

  pattern := '(?<![.])\m' || old_key || '\M';

  SELECT count(*) INTO n_templates FROM commission_templates
    WHERE client_id = p_client_id AND id = v_template_id AND coalesce(eligibility_formula, '') ~* pattern;
  SELECT count(*) INTO n_parameters FROM commission_template_parameters
    WHERE client_id = p_client_id AND template_id = v_template_id
      AND (coalesce(autofill_formula, '') ~* pattern OR coalesce(validation_rule, '') ~* pattern);
  SELECT count(*) INTO n_rules FROM commission_template_rules
    WHERE client_id = p_client_id AND template_id = v_template_id AND id <> p_rule_id
      AND (coalesce(apply_condition, '') ~* pattern OR coalesce(calculation_formula, '') ~* pattern
        OR coalesce(custom_baseline, '') ~* pattern OR coalesce(payee_formula, '') ~* pattern
        OR coalesce(show_when_formula, '') ~* pattern OR lower(coalesce(agent_key, '')) = old_key
        OR lower(coalesce(from_agent_key, '')) = old_key
        OR EXISTS (SELECT 1 FROM unnest(coalesce(paid_by_agent_keys, '{}'::text[])) AS payer WHERE lower(payer) = old_key));

  IF p_apply THEN
    UPDATE commission_template_rules SET rule_key = p_new_key WHERE client_id = p_client_id AND id = p_rule_id;

    UPDATE commission_templates
      SET eligibility_formula = regexp_replace(eligibility_formula, pattern, p_new_key, 'gi')
      WHERE client_id = p_client_id AND id = v_template_id AND eligibility_formula ~* pattern;
    UPDATE commission_template_parameters
      SET autofill_formula = regexp_replace(autofill_formula, pattern, p_new_key, 'gi'),
          validation_rule = regexp_replace(validation_rule, pattern, p_new_key, 'gi')
      WHERE client_id = p_client_id AND template_id = v_template_id
        AND (coalesce(autofill_formula, '') ~* pattern OR coalesce(validation_rule, '') ~* pattern);
    -- The renamed rule's own formulas too, in case one refers to its earlier result.
    UPDATE commission_template_rules
      SET apply_condition = regexp_replace(apply_condition, pattern, p_new_key, 'gi'),
          calculation_formula = regexp_replace(calculation_formula, pattern, p_new_key, 'gi'),
          custom_baseline = regexp_replace(custom_baseline, pattern, p_new_key, 'gi'),
          payee_formula = regexp_replace(payee_formula, pattern, p_new_key, 'gi'),
          show_when_formula = regexp_replace(show_when_formula, pattern, p_new_key, 'gi'),
          agent_key = CASE WHEN lower(agent_key) = old_key THEN p_new_key ELSE agent_key END,
          from_agent_key = CASE WHEN lower(from_agent_key) = old_key THEN p_new_key ELSE from_agent_key END,
          paid_by_agent_keys = CASE WHEN paid_by_agent_keys IS NULL THEN NULL ELSE ARRAY(
            SELECT CASE WHEN lower(payer) = old_key THEN p_new_key ELSE payer END
            FROM unnest(paid_by_agent_keys) WITH ORDINALITY AS item(payer, position)
            ORDER BY position
          ) END
      WHERE client_id = p_client_id AND template_id = v_template_id
        AND (coalesce(apply_condition, '') ~* pattern OR coalesce(calculation_formula, '') ~* pattern
          OR coalesce(custom_baseline, '') ~* pattern OR coalesce(payee_formula, '') ~* pattern
          OR coalesce(show_when_formula, '') ~* pattern OR lower(coalesce(agent_key, '')) = old_key
        OR lower(coalesce(from_agent_key, '')) = old_key
        OR EXISTS (SELECT 1 FROM unnest(coalesce(paid_by_agent_keys, '{}'::text[])) AS payer WHERE lower(payer) = old_key));
  END IF;

  RETURN jsonb_build_object(
    'applied', p_apply,
    'oldKey', old_key,
    'templates', n_templates,
    'parameters', n_parameters,
    'rules', n_rules
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rename_rule_key(text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.rename_rule_key(text, text, text, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
