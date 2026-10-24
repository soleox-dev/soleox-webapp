-- Moves every business date of the DEMO client forward (or back) by a number of days, so demo data looks
-- current. Run through scripts/shift-demo-dates.mjs. One statement per table, so the whole shift is one
-- transaction and each table bumps the data version once.
--
-- Deal dates (list, acceptance, closing, payment dates, plan version start dates) move by exactly p_days.
-- Cap anniversaries (agents' Cap Year Start and cap reset fields, team cap period starts) move by the same
-- days counted in a non-leap year, so the anniversary of an agent and the period starts stored on deals
-- always land on the same month and day. Deals keep their place in each cap year.
-- created_at, updated_at and the change history are left as they are.

CREATE OR REPLACE FUNCTION public.shift_anniversary(d date, p_days integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  moved date;
BEGIN
  IF d IS NULL THEN
    RETURN NULL;
  END IF;
  moved := make_date(2001, extract(month FROM d)::int, least(extract(day FROM d)::int, CASE WHEN extract(month FROM d) = 2 THEN 28 ELSE 31 END)) + p_days;
  RETURN make_date(extract(year FROM d)::int + extract(year FROM moved)::int - 2001, extract(month FROM moved)::int, extract(day FROM moved)::int);
END;
$$;

CREATE OR REPLACE FUNCTION public.shift_demo_dates(p_client_id text, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  anniversary_keys text[];
  plain_keys text[];
  counts jsonb := '{}'::jsonb;
  n integer;
BEGIN
  IF p_client_id IS DISTINCT FROM 'DEMO' THEN
    RAISE EXCEPTION 'Dates can only be shifted on the DEMO client';
  END IF;
  IF p_days IS NULL OR p_days = 0 THEN
    RETURN counts;
  END IF;

  -- Agent date fields used as a cap anniversary, by plan settings or by a team cap.
  SELECT coalesce(array_agg(DISTINCT key), '{}') INTO anniversary_keys
  FROM (
    SELECT cap_year_start_field_key AS key FROM public.client_commission_plan_settings WHERE client_id = p_client_id
    UNION
    SELECT reset_date_field_key FROM public.client_caps WHERE client_id = p_client_id
  ) keys
  WHERE coalesce(key, '') <> '';

  SELECT coalesce(array_agg(field_key), '{}') INTO plain_keys
  FROM public.client_field_configurations
  WHERE client_id = p_client_id AND target_table = 'agents' AND storage_type = 'CUSTOM_JSON' AND upper(field_type) = 'DATE'
    AND NOT field_key = ANY (anniversary_keys);

  UPDATE public.agents a
  SET agent_onboard_date = a.agent_onboard_date + p_days,
      agent_offboard_date = a.agent_offboard_date + p_days,
      custom_attributes = (
        SELECT coalesce(jsonb_object_agg(e.key, CASE
          WHEN jsonb_typeof(e.value) = 'string' AND e.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$' AND e.key = ANY (anniversary_keys)
            THEN to_jsonb(public.shift_anniversary((e.value #>> '{}')::date, p_days)::text)
          WHEN jsonb_typeof(e.value) = 'string' AND e.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$' AND e.key = ANY (plain_keys)
            THEN to_jsonb(((e.value #>> '{}')::date + p_days)::text)
          ELSE e.value END), '{}'::jsonb)
        FROM jsonb_each(coalesce(a.custom_attributes, '{}'::jsonb)) e
      )
  WHERE a.client_id = p_client_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('agents', n);

  SELECT coalesce(array_agg(field_key), '{}') INTO plain_keys
  FROM public.client_field_configurations
  WHERE client_id = p_client_id AND target_table = 'transactions' AND storage_type = 'CUSTOM_JSON' AND upper(field_type) = 'DATE';

  UPDATE public.transactions t
  SET list_date = t.list_date + p_days,
      acceptance_date = t.acceptance_date + p_days,
      closing_date = t.closing_date + make_interval(days => p_days),
      custom_attributes = CASE WHEN cardinality(plain_keys) = 0 OR t.custom_attributes IS NULL THEN t.custom_attributes ELSE (
        SELECT jsonb_object_agg(e.key, CASE
          WHEN jsonb_typeof(e.value) = 'string' AND e.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$' AND e.key = ANY (plain_keys)
            THEN to_jsonb(((e.value #>> '{}')::date + p_days)::text)
          ELSE e.value END)
        FROM jsonb_each(t.custom_attributes) e
      ) END
  WHERE t.client_id = p_client_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('transactions', n);

  UPDATE public.payments SET payment_date = payment_date + p_days
  WHERE client_id = p_client_id AND payment_date IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('payments', n);

  UPDATE public.transaction_team_caps SET period_start = public.shift_anniversary(period_start, p_days)
  WHERE client_id = p_client_id AND period_start IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('transaction_team_caps', n);

  -- 2000-01-01 and earlier mean "always"; only real start dates move with the deals.
  UPDATE public.commission_plan_versions SET effective_from = effective_from + p_days
  WHERE client_id = p_client_id AND effective_from > '2000-01-01';
  GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('commission_plan_versions', n);

  RETURN counts;
END;
$$;

REVOKE ALL ON FUNCTION public.shift_anniversary(date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shift_demo_dates(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_anniversary(date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.shift_demo_dates(text, integer) TO service_role;
