-- Commission Tracker Write can read template definitions and manage submissions.
-- 035 already ran without these policies.

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
