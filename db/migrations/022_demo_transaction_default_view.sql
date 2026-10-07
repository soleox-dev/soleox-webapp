-- Store the DEMO transactions default view on the client.
-- Included when the formula is true. Blank closing dates sort last.

UPDATE public.clients
SET settings_json = COALESCE(settings_json, '{}'::jsonb) || jsonb_build_object(
  'transaction_default_view',
  jsonb_build_object(
    'filter_formula', 'AND(transaction_status<>"Cancelled", NOT(AND(transaction_status="Closed", finance_status="Paid")))',
    'sort_rules', jsonb_build_array(
      jsonb_build_object('field_key', 'closing_date', 'direction', 'asc')
    )
  )
)
WHERE id = 'DEMO'
  AND COALESCE(settings_json, '{}'::jsonb)->'transaction_default_view' IS NULL;
