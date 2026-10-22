-- eXp's post-cap fee is never more than 20% of the agent's split (before bonuses): an agent alone on a $300 split
-- pays $60, not $75. Plan lines carry this as maxPercentOfSide (lib/commission-engine/plans.ts).
-- Adds it to the post-cap fee of the four eXp presets seeded by 065. Client plans already copied from a preset
-- keep their lines; edit them in Settings > Plans (or copy the preset again).

UPDATE public.commission_plan_versions AS v
SET lines = (
      SELECT jsonb_agg(
        CASE
          WHEN line->>'key' = 'post_cap_fee' AND line->>'type' = 'per_deal_fee' THEN line || '{"maxPercentOfSide": 0.2}'::jsonb
          ELSE line
        END
        ORDER BY position
      )
      FROM jsonb_array_elements(v.lines) WITH ORDINALITY AS item(line, position)
    ),
    updated_at = now(),
    updated_by = 'migration 067'
FROM public.commission_plans AS p
WHERE p.id = v.plan_id
  AND p.client_id IS NULL
  AND p.preset_key IN ('exp-4000', 'exp-8000', 'exp-16000', 'exp-16000-team-lead')
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v.lines) AS item(line)
    WHERE line->>'key' = 'post_cap_fee' AND NOT (line ? 'maxPercentOfSide')
  );
