-- ====================================================================
-- Soleox REBT: Complete Row-Level Security (RLS) & Multi-Tenant Policies
-- ====================================================================

-- 1. Helper function: is_client_member
-- Checks if the authenticated user has an active role in the specified tenant
CREATE OR REPLACE FUNCTION public.is_client_member(target_client_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM client_user_roles cur
    JOIN web_users wu ON cur.user_id = wu.id
    WHERE cur.client_id = target_client_id
      AND wu.email = public.get_request_email()
      AND cur.is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_client_member(text) TO authenticated, anon, public;

-- 2. clients table
DROP POLICY IF EXISTS "Admins can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Members can view clients" ON public.clients;

CREATE POLICY "Admins can manage clients" ON public.clients
  FOR ALL TO public
  USING (is_client_admin(id))
  WITH CHECK (is_client_admin(id));

CREATE POLICY "Members can view clients" ON public.clients
  FOR SELECT TO public
  USING (is_client_member(id));

-- 3. agents table
DROP POLICY IF EXISTS "Admins can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Members can view agents" ON public.agents;

CREATE POLICY "Admins can manage agents" ON public.agents
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

CREATE POLICY "Members can view agents" ON public.agents
  FOR SELECT TO public
  USING (is_client_member(client_id));

-- 4. commission_entities table
DROP POLICY IF EXISTS "Admins can manage commission entities" ON public.commission_entities;
DROP POLICY IF EXISTS "Members can view commission entities" ON public.commission_entities;

CREATE POLICY "Admins can manage commission entities" ON public.commission_entities
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

CREATE POLICY "Members can view commission entities" ON public.commission_entities
  FOR SELECT TO public
  USING (is_client_member(client_id));

-- 5. transactions table
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.transactions;
DROP POLICY IF EXISTS "Members can view transactions" ON public.transactions;

CREATE POLICY "Admins can manage transactions" ON public.transactions
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

CREATE POLICY "Members can view transactions" ON public.transactions
  FOR SELECT TO public
  USING (
    is_client_member(client_id) AND (
      is_client_admin(client_id) OR
      agent_id IN (
        SELECT wu.agent_id FROM web_users wu WHERE wu.email = public.get_request_email()
      )
    )
  );

-- 6. transaction_commission_items table
DROP POLICY IF EXISTS "Admins can manage commission items" ON public.transaction_commission_items;
DROP POLICY IF EXISTS "Members can view commission items" ON public.transaction_commission_items;

CREATE POLICY "Admins can manage commission items" ON public.transaction_commission_items
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

CREATE POLICY "Members can view commission items" ON public.transaction_commission_items
  FOR SELECT TO public
  USING (is_client_member(client_id));

-- 7. payments table
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Members can view payments" ON public.payments;

CREATE POLICY "Admins can manage payments" ON public.payments
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

CREATE POLICY "Members can view payments" ON public.payments
  FOR SELECT TO public
  USING (is_client_member(client_id));

-- 8. commission_templates & logic tables
DROP POLICY IF EXISTS "Admins can manage commission templates" ON public.commission_templates;
CREATE POLICY "Admins can manage commission templates" ON public.commission_templates
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

DROP POLICY IF EXISTS "Admins can manage template parameters" ON public.commission_template_parameters;
CREATE POLICY "Admins can manage template parameters" ON public.commission_template_parameters
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

DROP POLICY IF EXISTS "Admins can manage template logic" ON public.commission_template_logic;
CREATE POLICY "Admins can manage template logic" ON public.commission_template_logic
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

DROP POLICY IF EXISTS "Admins can manage template submissions" ON public.commission_template_submissions;
CREATE POLICY "Admins can manage template submissions" ON public.commission_template_submissions
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

-- 9. web_users table
DROP POLICY IF EXISTS "Users can manage own profile" ON public.web_users;
DROP POLICY IF EXISTS "Admins can view tenant users" ON public.web_users;

CREATE POLICY "Users can manage own profile" ON public.web_users
  FOR ALL TO public
  USING (email = public.get_request_email())
  WITH CHECK (email = public.get_request_email());

CREATE POLICY "Admins can view tenant users" ON public.web_users
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM client_user_roles cur
      WHERE cur.user_id = web_users.id
        AND is_client_admin(cur.client_id)
    )
  );

-- 10. client_user_roles table
DROP POLICY IF EXISTS "Admins can manage client user roles" ON public.client_user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.client_user_roles;

CREATE POLICY "Admins can manage client user roles" ON public.client_user_roles
  FOR ALL TO public
  USING (is_client_admin(client_id))
  WITH CHECK (is_client_admin(client_id));

CREATE POLICY "Users can view own roles" ON public.client_user_roles
  FOR SELECT TO public
  USING (
    user_id IN (
      SELECT id FROM web_users WHERE email = public.get_request_email()
    )
  );

-- 11. role_permissions table
DROP POLICY IF EXISTS "Authenticated users can read role permissions" ON public.role_permissions;

CREATE POLICY "Authenticated users can read role permissions" ON public.role_permissions
  FOR SELECT TO public
  USING (true);
