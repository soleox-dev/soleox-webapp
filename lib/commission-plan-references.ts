import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_COUNTING_STATUSES } from '@/lib/commission-engine/plan-rows';

/**
 * What Commission Plans point at outside themselves, so Settings elsewhere can keep them whole: plan lines pay
 * Commission Entities by name, Plan Settings read agent and transaction fields by key, map entities by ID
 * (Earlier Deals), and count deals by status value. A delete refuses what plans still use; a rename carries the
 * new name or key into them.
 */

type SettingsRow = {
  id: string;
  cap_date_field_key: string | null;
  cap_year_start_field_key: string | null;
  starting_balances_for_field_key: string | null;
  starting_balance_field_keys: Record<string, string> | null;
  opt_in_field_keys: Record<string, string> | null;
  cap_amount_field_keys: Record<string, string> | null;
  counting_statuses: string[] | null;
  history_entity_ids: Record<string, string> | null;
};

type VersionRow = { id: string; plan_id: string; lines: Array<{ key?: string; name?: string; payee?: string }> | null };

const same = (left: string | null | undefined, right: string) => String(left || '').trim().toLowerCase() === right.trim().toLowerCase();

async function loadSettings(supabase: SupabaseClient, clientId: string): Promise<SettingsRow | null> {
  const { data, error } = await supabase
    .from('client_commission_plan_settings')
    .select('id, cap_date_field_key, cap_year_start_field_key, starting_balances_for_field_key, starting_balance_field_keys, opt_in_field_keys, cap_amount_field_keys, counting_statuses, history_entity_ids')
    .eq('client_id', clientId)
    .eq('archived', false)
    .maybeSingle();
  if (error) throw error;
  return (data as SettingsRow | null) || null;
}

async function loadPlanVersions(supabase: SupabaseClient, clientId: string, activeOnly: boolean) {
  let plansQuery = supabase.from('commission_plans').select('id, name').eq('client_id', clientId);
  if (activeOnly) plansQuery = plansQuery.eq('archived', false);
  const [plansResult, versionsResult] = await Promise.all([
    plansQuery,
    supabase.from('commission_plan_versions').select('id, plan_id, lines').eq('client_id', clientId),
  ]);
  if (plansResult.error) throw plansResult.error;
  if (versionsResult.error) throw versionsResult.error;
  const names = new Map((plansResult.data || []).map((plan) => [String(plan.id), String(plan.name || '')]));
  return ((versionsResult.data || []) as VersionRow[]).filter((version) => names.has(version.plan_id)).map((version) => ({ ...version, planName: names.get(version.plan_id)! }));
}

/** Where plans use this entity: plan lines paying it by name, and Plan Settings' Earlier Deals mapping. */
export async function planUsesOfEntity(supabase: SupabaseClient, clientId: string, entity: { id: string; name: string }): Promise<string[]> {
  const [versions, settings] = await Promise.all([loadPlanVersions(supabase, clientId, true), loadSettings(supabase, clientId)]);
  const uses = new Set<string>();
  for (const version of versions) {
    if ((version.lines || []).some((line) => same(line.payee, entity.name))) uses.add(`the ${version.planName} plan`);
  }
  if (Object.values(settings?.history_entity_ids || {}).includes(entity.id)) uses.add('Plan Settings (Earlier Deals)');
  return [...uses];
}

/** Carries an entity's new name into every plan line that paid the old one. Returns how many plan versions changed. */
export async function renameEntityInPlans(supabase: SupabaseClient, clientId: string, oldName: string, newName: string): Promise<number> {
  if (!oldName.trim() || same(oldName, newName)) return 0;
  const versions = await loadPlanVersions(supabase, clientId, false);
  let changed = 0;
  for (const version of versions) {
    const lines = version.lines || [];
    if (!lines.some((line) => same(line.payee, oldName))) continue;
    const { error } = await supabase
      .from('commission_plan_versions')
      .update({ lines: lines.map((line) => (same(line.payee, oldName) ? { ...line, payee: newName } : line)) })
      .eq('id', version.id)
      .eq('client_id', clientId);
    if (error) throw error;
    changed += 1;
  }
  return changed;
}

/** The Plan Settings that read this field, by name. */
function settingsUsingField(settings: SettingsRow, targetTable: string, key: string): string[] {
  if (targetTable === 'transactions') return same(settings.cap_date_field_key, key) ? ['Cap Date'] : [];
  if (targetTable !== 'agents') return [];
  const uses: string[] = [];
  if (same(settings.cap_year_start_field_key, key)) uses.push('Cap Year Start');
  if (same(settings.starting_balances_for_field_key, key)) uses.push('Starting Balances For');
  if (Object.values(settings.starting_balance_field_keys || {}).some((value) => same(value, key))) uses.push('Starting Balances');
  if (Object.values(settings.opt_in_field_keys || {}).some((value) => same(value, key))) uses.push('Opt-Ins');
  if (Object.values(settings.cap_amount_field_keys || {}).some((value) => same(value, key))) uses.push('Cap Amounts');
  return uses;
}

/** Where Plan Settings use this agent or transaction field. */
export async function planUsesOfField(supabase: SupabaseClient, clientId: string, targetTable: string, key: string): Promise<string[]> {
  const settings = await loadSettings(supabase, clientId);
  return settings ? settingsUsingField(settings, targetTable, key).map((name) => `Plan Settings (${name})`) : [];
}

/** Points Plan Settings at a field's new key. With apply false it only counts the settings that would change. */
export async function renameFieldInPlanSettings(
  supabase: SupabaseClient,
  clientId: string,
  targetTable: string,
  oldKey: string,
  newKey: string,
  apply: boolean,
): Promise<number> {
  const settings = await loadSettings(supabase, clientId);
  if (!settings) return 0;
  const count = settingsUsingField(settings, targetTable, oldKey).length;
  if (!apply || count === 0) return count;
  const swap = (value: string | null) => (same(value, oldKey) ? newKey : value);
  const swapAll = (map: Record<string, string> | null) => Object.fromEntries(Object.entries(map || {}).map(([line, value]) => [line, swap(value) as string]));
  const change = targetTable === 'transactions'
    ? { cap_date_field_key: swap(settings.cap_date_field_key) }
    : {
      cap_year_start_field_key: swap(settings.cap_year_start_field_key),
      starting_balances_for_field_key: swap(settings.starting_balances_for_field_key),
      starting_balance_field_keys: swapAll(settings.starting_balance_field_keys),
      opt_in_field_keys: swapAll(settings.opt_in_field_keys),
      cap_amount_field_keys: swapAll(settings.cap_amount_field_keys),
    };
  const { error } = await supabase.from('client_commission_plan_settings').update(change).eq('id', settings.id).eq('client_id', clientId);
  if (error) throw error;
  return count;
}

/** Renames a transaction status in the statuses that count toward caps (the defaults count when none are chosen). */
export async function renameStatusInPlanSettings(supabase: SupabaseClient, clientId: string, oldValue: string, newValue: string): Promise<void> {
  const settings = await loadSettings(supabase, clientId);
  if (!settings) return;
  const current = settings.counting_statuses?.length ? settings.counting_statuses : DEFAULT_COUNTING_STATUSES;
  if (!current.some((status) => same(status, oldValue))) return;
  const { error } = await supabase
    .from('client_commission_plan_settings')
    .update({ counting_statuses: current.map((status) => (same(status, oldValue) ? newValue : status)) })
    .eq('id', settings.id)
    .eq('client_id', clientId);
  if (error) throw error;
}

/** "X can't be deleted while A and B use it." */
export function inUseByPlansMessage(name: string, uses: string[]): string {
  const list = uses.length < 2 ? uses.join('') : `${uses.slice(0, -1).join(', ')} and ${uses[uses.length - 1]}`;
  return `${name} can't be deleted while ${list} ${uses.length === 1 ? 'uses' : 'use'} it. Change ${uses.length === 1 ? 'that' : 'those'} first.`;
}
