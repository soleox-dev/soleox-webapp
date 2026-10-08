-- Drop column defaults that were filling values when an insert left the column out.
-- Existing rows are unchanged.

ALTER TABLE public.agents
  ALTER COLUMN client_id DROP DEFAULT;

ALTER TABLE public.client_field_configurations
  ALTER COLUMN client_id DROP DEFAULT,
  ALTER COLUMN calculation_formula DROP DEFAULT;

ALTER TABLE public.client_lookup_values
  ALTER COLUMN client_id DROP DEFAULT;

ALTER TABLE public.commission_entities
  ALTER COLUMN client_id DROP DEFAULT,
  ALTER COLUMN entity_type DROP DEFAULT;

ALTER TABLE public.commission_template_parameters
  ALTER COLUMN client_id DROP DEFAULT;

ALTER TABLE public.commission_template_rules
  ALTER COLUMN client_id DROP DEFAULT;

ALTER TABLE public.commission_template_submissions
  ALTER COLUMN client_id DROP DEFAULT;

ALTER TABLE public.commission_templates
  ALTER COLUMN client_id DROP DEFAULT;

ALTER TABLE public.payments
  ALTER COLUMN client_id DROP DEFAULT,
  ALTER COLUMN payment_method DROP DEFAULT,
  ALTER COLUMN payment_status DROP DEFAULT;

ALTER TABLE public.transaction_commission_items
  ALTER COLUMN client_id DROP DEFAULT,
  ALTER COLUMN payee_type DROP DEFAULT;

ALTER TABLE public.transactions
  ALTER COLUMN client_id DROP DEFAULT,
  ALTER COLUMN transaction_status DROP DEFAULT,
  ALTER COLUMN finance_status DROP DEFAULT,
  ALTER COLUMN transaction_side DROP DEFAULT;

NOTIFY pgrst, 'reload schema';
