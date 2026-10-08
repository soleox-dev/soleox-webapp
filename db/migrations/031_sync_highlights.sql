-- Field keys written by each sync run, so the ledger can mark and filter them.

ALTER TABLE public.integration_sync_runs
  ADD COLUMN IF NOT EXISTS highlights jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
