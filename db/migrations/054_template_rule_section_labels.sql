-- Display names for a template's rule sections, such as {"Level 1 Post-splits": "Fees"}.
-- A rule's section is its waterfall stage and the calculation engine reads it, so rules keep their stage;
-- these names only change what the Rules table shows.

ALTER TABLE public.commission_templates
  ADD COLUMN IF NOT EXISTS rule_section_labels jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
