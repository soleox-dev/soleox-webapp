-- The order of team caps and agent caps is now chosen in Settings › Caps, and every list of caps follows it.
-- Existing caps keep the order they had, which was by creation date, numbered separately for each cap type.

ALTER TABLE public.client_caps
  ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY client_id, cap_type ORDER BY created_at, id) - 1 AS position
  FROM public.client_caps
)
UPDATE public.client_caps AS caps
SET sort_order = ranked.position
FROM ranked
WHERE caps.id = ranked.id
  AND caps.sort_order IS NULL;

NOTIFY pgrst, 'reload schema';
