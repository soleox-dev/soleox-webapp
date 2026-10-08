ALTER TABLE public.integration_sync_runs
  ADD COLUMN IF NOT EXISTS connected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disconnected_count integer NOT NULL DEFAULT 0;
