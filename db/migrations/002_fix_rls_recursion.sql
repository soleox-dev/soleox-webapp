-- ====================================================================
-- Soleox REBT: Fix RLS Policies & Eliminate Recursion via SECURITY DEFINER
-- ====================================================================

-- 1. Helper function: get_request_user_id
-- Safely gets the current user's ID without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.get_request_user_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM public.web_users WHERE email = public.get_request_email() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_request_user_id() TO authenticated, anon, public;

-- 2. Helper function: get_admin_tenant_ids
-- Safely gets all client_ids where the user is an active ADMIN
CREATE OR REPLACE FUNCTION public.get_admin_tenant_ids()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT cur.client_id
  FROM public.client_user_roles cur
  JOIN public.web_users wu ON cur.user_id = wu.id
  WHERE wu.email = public.get_request_email()
    AND cur.role = 'ADMIN'
    AND cur.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_tenant_ids() TO authenticated, anon, public;

-- 3. Helper function: get_member_tenant_ids
-- Safely gets all client_ids where the user has ANY active role
CREATE OR REPLACE FUNCTION public.get_member_tenant_ids()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT cur.client_id
  FROM public.client_user_roles cur
  JOIN public.web_users wu ON cur.user_id = wu.id
  WHERE wu.email = public.get_request_email()
    AND cur.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_tenant_ids() TO authenticated, anon, public;

-- 4. Clean up and recreate web_users policies (NO recursion)
DROP POLICY IF EXISTS "Users can manage own profile" ON public.web_users;
DROP POLICY IF EXISTS "Admins can view tenant users" ON public.web_users;

CREATE POLICY "Users can manage own profile" ON public.web_users
  FOR ALL TO public
  USING (email = public.get_request_email())
  WITH CHECK (email = public.get_request_email());

CREATE POLICY "Admins can view tenant users" ON public.web_users
  FOR SELECT TO public
  USING (
    id IN (
      SELECT cur.user_id
      FROM public.client_user_roles cur
      WHERE cur.client_id IN (SELECT public.get_admin_tenant_ids())
    )
  );

-- 5. Clean up and recreate client_user_roles policies (NO recursion)
DROP POLICY IF EXISTS "Admins can manage client user roles" ON public.client_user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.client_user_roles;

CREATE POLICY "Admins can manage client user roles" ON public.client_user_roles
  FOR ALL TO public
  USING (client_id IN (SELECT public.get_admin_tenant_ids()))
  WITH CHECK (client_id IN (SELECT public.get_admin_tenant_ids()));

CREATE POLICY "Users can view own roles" ON public.client_user_roles
  FOR SELECT TO public
  USING (user_id = public.get_request_user_id());

-- 6. Clean up old auth.uid() policies on client_field_configurations & client_lookup_values
DROP POLICY IF EXISTS "Users can read tenant field configs" ON public.client_field_configurations;
CREATE POLICY "Members can view field configs" ON public.client_field_configurations
  FOR SELECT TO public
  USING (client_id IN (SELECT public.get_member_tenant_ids()));

DROP POLICY IF EXISTS "Users can read tenant lookup values" ON public.client_lookup_values;
CREATE POLICY "Members can view lookup values" ON public.client_lookup_values
  FOR SELECT TO public
  USING (client_id IN (SELECT public.get_member_tenant_ids()));

-- 7. Update transactions policies to use get_admin_tenant_ids / get_member_tenant_ids
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.transactions;
DROP POLICY IF EXISTS "Members can view transactions" ON public.transactions;

CREATE POLICY "Admins can manage transactions" ON public.transactions
  FOR ALL TO public
  USING (client_id IN (SELECT public.get_admin_tenant_ids()))
  WITH CHECK (client_id IN (SELECT public.get_admin_tenant_ids()));

CREATE POLICY "Members can view transactions" ON public.transactions
  FOR SELECT TO public
  USING (client_id IN (SELECT public.get_member_tenant_ids()));
