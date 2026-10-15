-- Each team cap has a formula key. Formulas use that key with .agent and .total.
-- A saved key stays put. Caps that already exist take a key from their name.

ALTER TABLE public.client_team_caps
  ADD COLUMN IF NOT EXISTS key text;

WITH prepared AS (
  SELECT
    id,
    client_id,
    created_at,
    CASE
      WHEN base = '' THEN 'team_cap'
      WHEN base ~ '^[0-9]' THEN 'cap_' || base
      ELSE base
    END AS base
  FROM (
    SELECT
      id,
      client_id,
      created_at,
      trim(both '_' from regexp_replace(lower(COALESCE(name, '')), '[^a-z0-9]+', '_', 'g')) AS base
    FROM public.client_team_caps
    WHERE COALESCE(btrim(key), '') = ''
      AND COALESCE(archived, false) = false
  ) AS raw
),
numbered AS (
  SELECT
    id,
    base,
    row_number() OVER (PARTITION BY client_id, base ORDER BY created_at NULLS LAST, id) AS n
  FROM prepared
)
UPDATE public.client_team_caps AS cap
SET key = CASE WHEN numbered.n = 1 THEN numbered.base ELSE numbered.base || '_' || numbered.n::text END
FROM numbered
WHERE cap.id = numbered.id;

ALTER TABLE public.client_team_caps
  DROP CONSTRAINT IF EXISTS client_team_caps_key_check;

ALTER TABLE public.client_team_caps
  ADD CONSTRAINT client_team_caps_key_check
  CHECK (key IS NULL OR key ~ '^[a-z_][a-z0-9_]*$');

CREATE UNIQUE INDEX IF NOT EXISTS client_team_caps_key_uidx
  ON public.client_team_caps (client_id, key)
  WHERE COALESCE(archived, false) = false
    AND COALESCE(btrim(key), '') <> '';

NOTIFY pgrst, 'reload schema';
