-- The app stores GCI Type as PERCENTAGE. Align stored rows, the list value, and the column default.

UPDATE public.transactions
SET gci_type = 'PERCENTAGE'
WHERE gci_type IS NOT NULL
  AND gci_type <> 'PERCENTAGE'
  AND lower(gci_type) = 'percentage';

UPDATE public.client_lookup_values
SET option_value = 'PERCENTAGE'
WHERE upper(category) = 'GCI_TYPE'
  AND lower(option_value) = 'percentage'
  AND option_value <> 'PERCENTAGE';

ALTER TABLE public.transactions
  ALTER COLUMN gci_type SET DEFAULT 'PERCENTAGE';

NOTIFY pgrst, 'reload schema';
