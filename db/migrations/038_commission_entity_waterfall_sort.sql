-- Per-client display order for post-split rows in the waterfall table.
-- Null means the entity is not placed, so it stays at the bottom of its level.

ALTER TABLE public.commission_entities
  ADD COLUMN IF NOT EXISTS waterfall_sort_order integer;

-- DEMO display order. Match by name so a renamed entity keeps its place.
UPDATE public.commission_entities AS entity
SET waterfall_sort_order = ordered.waterfall_sort_order
FROM (
  VALUES
    ('Broker Cap', 1),
    ('Flat Cap Fee', 2),
    ('Broker Fee', 2),
    ('Risk Mgmt', 3),
    ('Broker Review', 4),
    ('Stock', 5),
    ('TC Fee', 6)
) AS ordered(entity_name, waterfall_sort_order)
WHERE entity.client_id = 'DEMO'
  AND entity.entity_name = ordered.entity_name;

NOTIFY pgrst, 'reload schema';
