-- The TMS a client's integration comes from, such as SkySlope.
-- Users see this name in sync messages instead of the integration tab.

ALTER TABLE public.integration_connections
  ADD COLUMN IF NOT EXISTS tms_name text;
