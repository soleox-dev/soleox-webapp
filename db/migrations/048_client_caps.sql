-- Cap definitions cover team caps and agent caps.
-- Team caps keep the waterfall fields. Agent caps name a post-split entity.
-- hide_over_allocations keeps a fee that continues past the cap from showing as over the cap.
-- Existing rows are team caps. Run 047 before this so its write policy is here to rename.

ALTER TABLE public.client_team_caps RENAME TO client_caps;

ALTER TABLE public.client_caps
  ADD COLUMN IF NOT EXISTS cap_type text NOT NULL DEFAULT 'TEAM',
  ADD COLUMN IF NOT EXISTS hide_over_allocations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_entity_id text;

ALTER TABLE public.client_caps
  DROP CONSTRAINT IF EXISTS client_caps_cap_type_check;

ALTER TABLE public.client_caps
  ADD CONSTRAINT client_caps_cap_type_check
  CHECK (cap_type IN ('TEAM', 'AGENT'));

ALTER TABLE public.client_caps
  DROP CONSTRAINT IF EXISTS client_caps_entity_fkey;

ALTER TABLE public.client_caps
  ADD CONSTRAINT client_caps_entity_fkey
  FOREIGN KEY (commission_entity_id) REFERENCES public.commission_entities (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_team_caps_key_check'
      AND conrelid = 'public.client_caps'::regclass
  ) THEN
    ALTER TABLE public.client_caps RENAME CONSTRAINT client_team_caps_key_check TO client_caps_key_check;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.client_team_caps_key_uidx') IS NOT NULL THEN
    ALTER INDEX public.client_team_caps_key_uidx RENAME TO client_caps_key_uidx;
  END IF;
END $$;

DROP POLICY IF EXISTS "Members can view team caps" ON public.client_caps;
CREATE POLICY "Members can view caps" ON public.client_caps
  FOR SELECT TO public
  USING (public.is_client_member(client_id));

DROP POLICY IF EXISTS "Commission tracker settings can manage team caps" ON public.client_caps;
CREATE POLICY "Commission tracker settings can manage caps" ON public.client_caps
  FOR ALL TO public
  USING (public.can_manage_tracker_settings(client_id))
  WITH CHECK (public.can_manage_tracker_settings(client_id));

DROP POLICY IF EXISTS "Commission tracker write can manage team caps" ON public.client_caps;
CREATE POLICY "Commission tracker write can manage caps" ON public.client_caps
  FOR ALL TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

NOTIFY pgrst, 'reload schema';
