-- Renaming a cap's formula key (Settings > Caps) without breaking the formulas that use it.
--
-- Formulas refer to a cap by its key: <key>.agent and <key>.total. A saved key was locked because changing it
-- left those formulas pointing at nothing. rename_cap_key changes the key and rewrites every mention of
-- "<old key>." in the client's formulas to the new key, in one transaction. Deals are not touched: they record
-- which caps applied by the cap's id.
-- With p_apply false it changes nothing and only counts what it would change, for the confirmation dialog.

CREATE OR REPLACE FUNCTION public.rename_cap_key(
  p_client_id text,
  p_cap_id text,
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
  -- The old key as a whole word, followed by a dot: team_cap.total, never my_team_cap.total or team_cap_2.total.
  -- Keys are [a-z0-9_] only (checked below), so they are safe inside a regular expression.
  pattern text;
  n_templates int := 0;
  n_parameters int := 0;
  n_rules int := 0;
  n_caps int := 0;
  n_sales_volume int := 0;
  n_field_formulas int := 0;
BEGIN
  IF NOT public.can_manage_tracker_settings(p_client_id) THEN
    RAISE EXCEPTION 'You do not have permission to change cap settings.' USING ERRCODE = '42501';
  END IF;
  SELECT key INTO old_key FROM client_caps WHERE client_id = p_client_id AND id = p_cap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That cap was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF old_key IS NULL OR old_key !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'This cap has no saved key to rename. Save the cap first.' USING ERRCODE = '22023';
  END IF;
  IF p_new_key !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'The new key must start with a letter or underscore and use only lowercase letters, numbers, and underscores.' USING ERRCODE = '22023';
  END IF;
  IF p_new_key = old_key THEN
    RAISE EXCEPTION 'The new key is the same as the current one.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM client_caps WHERE client_id = p_client_id AND key = p_new_key AND id <> p_cap_id) THEN
    RAISE EXCEPTION 'Another cap already uses the key %.', p_new_key USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM commission_template_parameters WHERE client_id = p_client_id AND lower(parameter_key) = p_new_key)
    OR EXISTS (SELECT 1 FROM commission_template_rules WHERE client_id = p_client_id AND lower(coalesce(rule_key, '')) = p_new_key) THEN
    RAISE EXCEPTION 'A template parameter or rule already uses % as its key, so formulas could not tell them apart.', p_new_key USING ERRCODE = '23505';
  END IF;

  pattern := '\m' || old_key || '(?=\.)';

  SELECT count(*) INTO n_templates FROM commission_templates
    WHERE client_id = p_client_id AND coalesce(eligibility_formula, '') ~ pattern;
  SELECT count(*) INTO n_parameters FROM commission_template_parameters
    WHERE client_id = p_client_id
      AND (coalesce(autofill_formula, '') ~ pattern OR coalesce(validation_rule, '') ~ pattern);
  SELECT count(*) INTO n_rules FROM commission_template_rules
    WHERE client_id = p_client_id
      AND (coalesce(apply_condition, '') ~ pattern OR coalesce(calculation_formula, '') ~ pattern
        OR coalesce(custom_baseline, '') ~ pattern OR coalesce(payee_formula, '') ~ pattern
        OR coalesce(show_when_formula, '') ~ pattern OR cap_condition_key = old_key);
  SELECT count(*) INTO n_caps FROM client_caps
    WHERE client_id = p_client_id AND coalesce(qualifying_formula, '') ~ pattern;
  SELECT count(*) INTO n_sales_volume FROM client_sales_volume_assignments
    WHERE client_id = p_client_id AND coalesce(qualifying_formula, '') ~ pattern;
  SELECT count(*) INTO n_field_formulas FROM client_field_configurations
    WHERE client_id = p_client_id
      AND (coalesce(calculation_formula, '') ~ pattern OR coalesce(visibility_rules::text, '') ~ pattern);

  IF p_apply THEN
    UPDATE client_caps SET key = p_new_key WHERE client_id = p_client_id AND id = p_cap_id;

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
          show_when_formula = regexp_replace(show_when_formula, pattern, p_new_key, 'g'),
          cap_condition_key = CASE WHEN cap_condition_key = old_key THEN p_new_key ELSE cap_condition_key END
      WHERE client_id = p_client_id
        AND (coalesce(apply_condition, '') ~ pattern OR coalesce(calculation_formula, '') ~ pattern
          OR coalesce(custom_baseline, '') ~ pattern OR coalesce(payee_formula, '') ~ pattern
          OR coalesce(show_when_formula, '') ~ pattern OR cap_condition_key = old_key);
    UPDATE client_caps
      SET qualifying_formula = regexp_replace(qualifying_formula, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id AND qualifying_formula ~ pattern;
    UPDATE client_sales_volume_assignments
      SET qualifying_formula = regexp_replace(qualifying_formula, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id AND qualifying_formula ~ pattern;
    UPDATE client_field_configurations
      SET calculation_formula = regexp_replace(calculation_formula, pattern, p_new_key, 'g')
      WHERE client_id = p_client_id AND calculation_formula ~ pattern;
    UPDATE client_field_configurations
      SET visibility_rules = regexp_replace(visibility_rules::text, pattern, p_new_key, 'g')::jsonb
      WHERE client_id = p_client_id AND visibility_rules::text ~ pattern;
  END IF;

  RETURN jsonb_build_object(
    'applied', p_apply,
    'oldKey', old_key,
    'templates', n_templates,
    'parameters', n_parameters,
    'rules', n_rules,
    'caps', n_caps,
    'salesVolume', n_sales_volume,
    'fieldFormulas', n_field_formulas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rename_cap_key(text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.rename_cap_key(text, text, text, boolean) TO authenticated, service_role;
