-- Agent settings live in custom_attributes. commission_attributes was a
-- second copy of the same caps and is no longer read or written.
ALTER TABLE public.agents
  DROP COLUMN IF EXISTS commission_attributes;

NOTIFY pgrst, 'reload schema';
