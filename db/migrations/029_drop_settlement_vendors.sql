-- Settlement vendor values are tracked as their own transaction fields.
-- Drop the unused JSON column and any configuration that still points at it.

UPDATE public.integration_field_mappings
SET field_key = NULL,
    policy = 'disconnected',
    updated_at = now()
WHERE field_key = 'settlement_vendors';

DELETE FROM public.transaction_field_protections
WHERE field_key = 'settlement_vendors';

DELETE FROM public.client_field_configurations
WHERE target_table = 'transactions'
  AND field_key = 'settlement_vendors';

ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS settlement_vendors;

NOTIFY pgrst, 'reload schema';
