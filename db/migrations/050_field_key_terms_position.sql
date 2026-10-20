-- Key Terms on Transaction Detail: the fields a client picks, in the order they pick.
-- A field with a position shows in the Key Terms table at the top of the Overview, in position order,
-- and not in its own section there. Null means the field is not in Key Terms.
-- Sections and sort orders (which also order the Transactions table) are unaffected.

ALTER TABLE public.client_field_configurations
  ADD COLUMN IF NOT EXISTS key_terms_position integer;
