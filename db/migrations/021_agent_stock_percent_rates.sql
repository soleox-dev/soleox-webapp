-- Agent Stock was saved as percent points (5 means 5%). Percentages are stored as rates (5% = 0.05).
-- Only values above 1 are converted. A rate is already at most a small multiple of 1, and 1 itself is 100%.

UPDATE public.agents
SET custom_attributes = jsonb_set(
  custom_attributes,
  '{custom_stock}',
  to_jsonb((custom_attributes->>'custom_stock')::numeric / 100)
)
WHERE custom_attributes ? 'custom_stock'
  AND custom_attributes->>'custom_stock' ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND (custom_attributes->>'custom_stock')::numeric > 1;
