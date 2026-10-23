import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The agent fields that hold a cap date: each Team or Agent Cap's reset date and the Commission Plans' Cap Year
 * Start. Only their month and day count, so screens show them as "Nov 1". Display only: a failed read leaves the
 * fields shown as full dates.
 */
export async function capDateFieldKeys(supabase: SupabaseClient, clientId: string): Promise<string[]> {
  const [caps, settings] = await Promise.all([
    supabase
      .from('client_caps')
      .select('reset_date_field_key')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false'),
    supabase
      .from('client_commission_plan_settings')
      .select('cap_year_start_field_key')
      .eq('client_id', clientId)
      .eq('archived', false)
      .maybeSingle(),
  ]);
  const keys = new Set<string>();
  if (!caps.error) {
    (caps.data || []).forEach((row) => {
      const key = String(row.reset_date_field_key || '').trim();
      if (key) keys.add(key);
    });
  }
  if (!settings.error) {
    const key = String(settings.data?.cap_year_start_field_key || '').trim();
    if (key) keys.add(key);
  }
  return [...keys];
}
