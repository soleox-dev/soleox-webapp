-- Commission Tracker Write can read and write cap definitions.
-- Members can already read them. Settings and admins can already write them.
-- Migration 048 renames client_team_caps to client_caps and keeps this grant.
-- Run this first. If 048 has already renamed the table, the grant lives there.

DO $$
BEGIN
  IF to_regclass('public.client_team_caps') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Commission tracker write can manage team caps" ON public.client_team_caps';
    EXECUTE $policy$
      CREATE POLICY "Commission tracker write can manage team caps" ON public.client_team_caps
        FOR ALL TO public
        USING (public.can_write_commission_tracker(client_id))
        WITH CHECK (public.can_write_commission_tracker(client_id))
    $policy$;
  END IF;
END $$;
