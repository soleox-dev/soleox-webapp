-- Shared TMS ID snapshot for the transactions list.
-- Page loads read this instead of the Google Sheet until it is five minutes old.
-- A sync replaces it immediately.

ALTER TABLE public.integration_connections
  ADD COLUMN IF NOT EXISTS source_tms_ids jsonb,
  ADD COLUMN IF NOT EXISTS source_tms_ids_cached_at timestamptz;

NOTIFY pgrst, 'reload schema';
