-- Renaming a custom field's key (Settings > Fields) without breaking anything that uses it.
--
-- A custom field's values live under its key in agents.custom_attributes or transactions.custom_attributes,
-- and formulas and settings refer to it by that key. Changing only the field's settings row would leave every
-- value behind under the old key and every formula and cap pointing at a field that no longer exists.
--
-- rename_field_key moves all of it at once, in one transaction: the stored values, the field's settings row,
-- every formula that mentions the key (bare or as agents./transactions.<key>), the field choices on caps and
-- sales volume, TMS field mappings and protections, and saved transaction views and scorecards.
-- With p_apply false it changes nothing and only counts what it would change, for the confirmation dialog.
--
-- Only custom fields (keys starting with custom_) can be renamed. The new key must be unused in this client,
-- and the old key must belong to one table only, so a formula's mention of it is never ambiguous.

CREATE OR REPLACE FUNCTION public.rename_field_key(
  p_client_id text,
  p_target_table text,
  p_old_key text,
  p_new_key text,
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Keys are [a-z0-9_] only (checked below), so they are safe inside a regular expression.
  -- \m and \M are word boundaries; "_" counts as a word character, so custom_a never matches custom_ab.
  pattern text := '\m' || p_old_key || '\M';
  other_table text;
  n_values int := 0;
  n_field_formulas int := 0;
  n_templates int := 0;
  n_parameters int := 0;
  n_rules int := 0;
  n_caps int := 0;
  n_sales_volume int := 0;
  n_mappings int := 0;
  n_protections int := 0;
  n_settings int := 0;
BEGIN
  IF NOT public.can_manage_tracker_settings(p_client_id) THEN
    RAISE EXCEPTION 'You do not have permission to change field settings.' USING ERRCODE = '42501';
  END IF;
  IF p_target_table NOT IN ('agents', 'transactions') THEN
    RAISE EXCEPTION 'Fields can only be renamed on agents or transactions.' USING ERRCODE = '22023';
  END IF;
  other_table := CASE WHEN p_target_table = 'agents' THEN 'transactions' ELSE 'agents' END;
  IF p_old_key !~ '^custom_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Only custom fields can be renamed.' USING ERRCODE = '22023';
  END IF;
  IF p_new_key !~ '^custom_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'The new key must start with custom_ and use only lowercase letters, numbers, and underscores.' USING ERRCODE = '22023';
  END IF;
  IF p_new_key = p_old_key THEN
    RAISE EXCEPTION 'The new key is the same as the current one.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM client_field_configurations
    WHERE client_id = p_client_id AND target_table = p_target_table AND field_key = p_old_key
  ) THEN
    RAISE EXCEPTION 'The field % was not found.', p_old_key USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM client_field_configurations WHERE client_id = p_client_id AND field_key = p_new_key
  ) THEN
    RAISE EXCEPTION 'Another field already uses the key %.', p_new_key USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM client_field_configurations
    WHERE client_id = p_client_id AND target_table = other_table AND field_key = p_old_key
  ) THEN
    RAISE EXCEPTION 'The key % is also used by a % field, so its formulas cannot be told apart. Rename that field first.', p_old_key, other_table USING ERRCODE = '22023';
  END IF;

  -- Count what would change.
  IF p_target_table = 'agents' THEN
    SELECT count(*) INTO n_values FROM agents WHERE client_id = p_client_id AND custom_attributes ? p_old_key;
  ELSE
    SELECT count(*) INTO n_values FROM transactions WHERE client_id = p_client_id AND custom_attributes ? p_old_key;
    SELECT count(*) INTO n_mappings FROM integration_field_mappings WHERE client_id = p_client_id AND field_key = p_old_key;
    SELECT count(*) INTO n_protections FROM transaction_field_protections WHERE client_id = p_client_id AND field_key = p_old_key;
  END IF;
  SELECT count(*) INTO n_field_formulas FROM client_field_configurations
    WHERE client_id = p_client_id
      AND (coalesce(calculation_formula, '') ~ pattern OR coalesce(visibility_rules::text, '') ~ pattern);
  SELECT count(*) INTO n_templates FROM commission_templates
    WHERE client_id = p_client_id AND coalesce(eligibility_formula, '') ~ pattern;
  SELECT count(*) INTO n_parameters FROM commission_template_parameters
    WHERE client_id = p_client_id
      AND (coalesce(autofill_formula, '') ~ pattern OR coalesce(validation_rule, '') ~ pattern);
  SELECT count(*) INTO n_rules FROM commission_template_rules
    WHERE client_id = p_client_id
      AND (coalesce(apply_condition, '') ~ pattern OR coalesce(calculation_formula, '') ~ pattern
        OR coalesce(custom_baseline, '') ~ pattern OR coalesce(payee_formula, '') ~ pattern
        OR coalesce(show_when_formula, '') ~ pattern);
  SELECT count(*) INTO n_caps FROM client_caps
    WHERE client_id = p_client_id
      AND (p_old_key IN (qualifying_field_key, split_percent_field_key, cap_amount_field_key, reset_date_field_key)
        OR coalesce(qualifying_formula, '') ~ pattern);
  SELECT count(*) INTO n_sales_volume FROM client_sales_volume_assignments
    WHERE client_id = p_client_id
      AND (qualifying_field_key = p_old_key OR coalesce(qualifying_formula, '') ~ pattern);
  SELECT count(*) INTO n_settings FROM clients
    WHERE id = p_client_id AND coalesce(settings_json::text, '') ~ pattern;

  IF p_apply THEN
    IF p_target_table = 'agents' THEN
      UPDATE agents
        SET custom_attributes = (custom_attributes - p_old_key) || jsonb_build_object(p_new_key, custom_attributes -> p_old_key)
        WHERE client_id = p_client_id AND custom_attributes ? p_old_key;
    ELSE
      UPDATE transactions
        SET custom_attributes = (custom_attributes - p_old_key) || jsonb_build_object(p_new_key, custom_attributes -> p_old_key)
        WHERE client_id = p_client_id AND custom_attributes ? p_old_key;
      UPDATE integration_field_mappings SET field_key = p_new_key
        WHERE client_id = p_client_id AND field_key = p_old_key;
      UPDATE transaction_field_protections SET field_key = p_new_key
        WHERE client_id = p_client_id AND field_key = p_old_key;
    END IF;

    UPDATE client_field_configurations SET field_key = p_new_key
      WHERE client_id = p_client_id AND target_table = p_target_table AND field_key = p_old_key;
    UPDATE client_field_configurations
      SET calculation_formula = regexp_replace(calculation_formula, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id AND calculation_formula ~ pattern;
    UPDATE client_field_configurations
      SET visibility_rules = regexp_replace(visibility_rules::text, pattern, p_new_key, 'g')::jsonb
      WHERE client_id = p_client_id AND visibility_rules::text ~ pattern;

    UPDATE commission_templates
      SET eligibility_formula = regexp_replace(eligibility_formula, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id AND eligibility_formula ~ pattern;
    UPDATE commission_template_parameters
      SET autofill_formula = regexp_replace(autofill_formula, pattern, p_new_key, 'g'),
          validation_rule = regexp_replace(validation_rule, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id
        AND (coalesce(autofill_formula, '') ~ pattern OR coalesce(validation_rule, '') ~ pattern);
    UPDATE commission_template_rules
      SET apply_condition = regexp_replace(apply_condition, pattern, p_new_key, 'g'),
          calculation_formula = regexp_replace(calculation_formula, pattern, p_new_key, 'g'),
          custom_baseline = regexp_replace(custom_baseline, pattern, p_new_key, 'g'),
          payee_formula = regexp_replace(payee_formula, pattern, p_new_key, 'g'),
          show_when_formula = regexp_replace(show_when_formula, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id
        AND (coalesce(apply_condition, '') ~ pattern OR coalesce(calculation_formula, '') ~ pattern
          OR coalesce(custom_baseline, '') ~ pattern OR coalesce(payee_formula, '') ~ pattern
          OR coalesce(show_when_formula, '') ~ pattern);

    UPDATE client_caps
      SET qualifying_field_key = CASE WHEN qualifying_field_key = p_old_key THEN p_new_key ELSE qualifying_field_key END,
          split_percent_field_key = CASE WHEN split_percent_field_key = p_old_key THEN p_new_key ELSE split_percent_field_key END,
          cap_amount_field_key = CASE WHEN cap_amount_field_key = p_old_key THEN p_new_key ELSE cap_amount_field_key END,
          reset_date_field_key = CASE WHEN reset_date_field_key = p_old_key THEN p_new_key ELSE reset_date_field_key END,
          qualifying_formula = regexp_replace(qualifying_formula, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id
        AND (p_old_key IN (qualifying_field_key, split_percent_field_key, cap_amount_field_key, reset_date_field_key)
          OR coalesce(qualifying_formula, '') ~ pattern);
    UPDATE client_sales_volume_assignments
      SET qualifying_field_key = CASE WHEN qualifying_field_key = p_old_key THEN p_new_key ELSE qualifying_field_key END,
          qualifying_formula = regexp_replace(qualifying_formula, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id
        AND (qualifying_field_key = p_old_key OR coalesce(qualifying_formula, '') ~ pattern);

    -- Saved transaction views (columns, filters, sorting) and scorecard metrics.
    UPDATE clients
      SET settings_json = regexp_replace(settings_json::text, pattern, p_new_key, 'g')::jsonb
      WHERE id = p_client_id AND settings_json::text ~ pattern;
  END IF;

  RETURN jsonb_build_object(
    'applied', p_apply,
    'values', n_values,
    'fieldFormulas', n_field_formulas,
    'templates', n_templates,
    'parameters', n_parameters,
    'rules', n_rules,
    'caps', n_caps,
    'salesVolume', n_sales_volume,
    'mappings', n_mappings,
    'protections', n_protections,
    'settings', n_settings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rename_field_key(text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.rename_field_key(text, text, text, text, boolean) TO authenticated, service_role;
