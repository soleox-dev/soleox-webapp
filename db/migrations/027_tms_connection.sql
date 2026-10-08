-- Whether a transaction with a TMS ID was found on the last sync.
-- NULL means it has not been classified. A blank tms_id stays independent and is never deleted by sync.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tms_connection text;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_tms_connection_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_tms_connection_check
  CHECK (tms_connection IS NULL OR tms_connection IN ('connected', 'disconnected'));
