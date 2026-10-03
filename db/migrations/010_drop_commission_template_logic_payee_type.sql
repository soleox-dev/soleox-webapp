-- The payee is the entity when payee_entity_id is set, and the agent otherwise.
ALTER TABLE public.commission_template_logic
  DROP COLUMN IF EXISTS payee_type;

NOTIFY pgrst, 'reload schema';
