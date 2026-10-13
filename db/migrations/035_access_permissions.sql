-- Permissions for Commission Tracker, Owner Reports, and platform Super Admin.
-- carlos.bes@soleox.org can open every client.

ALTER TABLE public.web_users
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- A person can hold more than one permission on the same client.
ALTER TABLE public.client_user_roles DROP CONSTRAINT IF EXISTS unique_user_per_client;
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_client_role
  ON public.client_user_roles (user_id, client_id, role);

UPDATE public.web_users
SET is_super_admin = true
WHERE lower(email) = 'carlos.bes@soleox.org';

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.web_users
    WHERE lower(email) = lower(public.get_request_email())
      AND is_super_admin = true
      AND (archived IS NULL OR archived = false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_super_admin() TO authenticated, anon, public;

CREATE OR REPLACE FUNCTION public.is_client_admin(target_client_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_platform_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.client_user_roles cur
      JOIN public.web_users wu ON wu.id = cur.user_id
      WHERE cur.client_id = target_client_id
        AND lower(wu.email) = lower(public.get_request_email())
        AND cur.is_active = true
        AND cur.role IN ('ADMIN', 'SUPER_ADMIN')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_client_member(target_client_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_platform_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.client_user_roles cur
      JOIN public.web_users wu ON wu.id = cur.user_id
      WHERE cur.client_id = target_client_id
        AND lower(wu.email) = lower(public.get_request_email())
        AND cur.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.get_admin_tenant_ids()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id
  FROM public.clients
  WHERE public.is_platform_super_admin()
    AND status = 'ACTIVE'
    AND (archived IS NULL OR archived = false)
  UNION
  SELECT cur.client_id
  FROM public.client_user_roles cur
  JOIN public.web_users wu ON wu.id = cur.user_id
  WHERE lower(wu.email) = lower(public.get_request_email())
    AND cur.is_active = true
    AND cur.role IN ('ADMIN', 'SUPER_ADMIN');
$$;

CREATE OR REPLACE FUNCTION public.get_member_tenant_ids()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id
  FROM public.clients
  WHERE public.is_platform_super_admin()
    AND status = 'ACTIVE'
    AND (archived IS NULL OR archived = false)
  UNION
  SELECT cur.client_id
  FROM public.client_user_roles cur
  JOIN public.web_users wu ON wu.id = cur.user_id
  WHERE lower(wu.email) = lower(public.get_request_email())
    AND cur.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.can_write_commission_tracker(target_client_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_client_admin(target_client_id)
    OR EXISTS (
      SELECT 1
      FROM public.client_user_roles cur
      JOIN public.web_users wu ON wu.id = cur.user_id
      WHERE cur.client_id = target_client_id
        AND lower(wu.email) = lower(public.get_request_email())
        AND cur.is_active = true
        AND cur.role = 'COMMISSION_TRACKER_WRITE'
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_write_commission_tracker(text) TO authenticated, anon, public;

CREATE OR REPLACE FUNCTION public.can_manage_tracker_settings(target_client_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_client_admin(target_client_id)
    OR EXISTS (
      SELECT 1
      FROM public.client_user_roles cur
      JOIN public.web_users wu ON wu.id = cur.user_id
      WHERE cur.client_id = target_client_id
        AND lower(wu.email) = lower(public.get_request_email())
        AND cur.is_active = true
        AND cur.role = 'COMMISSION_TRACKER_SETTINGS'
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_tracker_settings(text) TO authenticated, anon, public;

DROP POLICY IF EXISTS "Commission tracker write can manage transactions" ON public.transactions;
CREATE POLICY "Commission tracker write can manage transactions" ON public.transactions
  FOR ALL TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

DROP POLICY IF EXISTS "Commission tracker write can manage agents" ON public.agents;
CREATE POLICY "Commission tracker write can manage agents" ON public.agents
  FOR ALL TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

DROP POLICY IF EXISTS "Commission tracker write can manage commission items" ON public.transaction_commission_items;
CREATE POLICY "Commission tracker write can manage commission items" ON public.transaction_commission_items
  FOR ALL TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

DROP POLICY IF EXISTS "Commission tracker write can manage payments" ON public.payments;
CREATE POLICY "Commission tracker write can manage payments" ON public.payments
  FOR ALL TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

DROP POLICY IF EXISTS "Commission tracker write can read commission templates" ON public.commission_templates;
CREATE POLICY "Commission tracker write can read commission templates" ON public.commission_templates
  FOR SELECT TO public
  USING (public.can_write_commission_tracker(client_id));

DROP POLICY IF EXISTS "Commission tracker write can read template parameters" ON public.commission_template_parameters;
CREATE POLICY "Commission tracker write can read template parameters" ON public.commission_template_parameters
  FOR SELECT TO public
  USING (public.can_write_commission_tracker(client_id));

DROP POLICY IF EXISTS "Commission tracker write can read template rules" ON public.commission_template_rules;
CREATE POLICY "Commission tracker write can read template rules" ON public.commission_template_rules
  FOR SELECT TO public
  USING (public.can_write_commission_tracker(client_id));

DROP POLICY IF EXISTS "Commission tracker write can manage template submissions" ON public.commission_template_submissions;
CREATE POLICY "Commission tracker write can manage template submissions" ON public.commission_template_submissions
  FOR ALL TO public
  USING (public.can_write_commission_tracker(client_id))
  WITH CHECK (public.can_write_commission_tracker(client_id));

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'client_field_configurations',
    'client_lookup_values',
    'commission_entities',
    'commission_templates',
    'commission_template_parameters',
    'commission_template_rules',
    'commission_template_submissions',
    'integration_connections',
    'integration_field_mappings',
    'transaction_field_protections',
    'integration_sync_runs'
  ]
  LOOP
    IF to_regclass('public.' || target) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Commission tracker settings can manage %s" ON public.%I', target, target);
    EXECUTE format(
      'CREATE POLICY "Commission tracker settings can manage %s" ON public.%I FOR ALL TO public USING (public.can_manage_tracker_settings(client_id)) WITH CHECK (public.can_manage_tracker_settings(client_id))',
      target,
      target
    );
  END LOOP;
END $$;
