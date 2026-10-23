import type { SupabaseClient } from '@supabase/supabase-js';
import { TenantAccessError } from '@/lib/session';
import { recordAudits } from '@/lib/audit';
import type { AgentCapSource, PlanLine } from '@/lib/commission-engine';
import type { PlanDto, PlanSettingsDto, PlansResponse } from '@/app/api/commission-plans/route';

/**
 * Server helpers for Commission Plans (migration 065): loading a client's plans, presets and settings, and copying
 * a preset into a client's plans. Row security decides who may write.
 */

type PlanRow = { id: string; client_id: string | null; preset_key: string | null; name: string };
type VersionRow = { id: string; plan_id: string; effective_from: string; lines: unknown };

export const DEFAULT_SETTINGS: PlanSettingsDto = {
  capDateFieldKey: 'closing_date',
  capYearStartFieldKey: '',
  startingBalancesForFieldKey: '',
  startingBalanceFieldKeys: {},
  optInFieldKeys: {},
  capAmountFieldKeys: {},
  countingStatuses: ['Closed', 'Pending'],
  historyEntityIds: {},
  calculateDeals: false,
  calculateSince: '',
};

export const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function badRequest(message: string): never {
  throw new TenantAccessError(message, 400);
}

function planDto(row: PlanRow, versions: VersionRow[]): PlanDto {
  return {
    id: row.id,
    name: row.name,
    presetKey: row.preset_key,
    isPreset: row.client_id === null,
    versions: versions
      .filter((version) => version.plan_id === row.id)
      .sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))
      .map((version) => ({ id: version.id, effectiveFrom: version.effective_from.slice(0, 10), lines: (version.lines as PlanLine[]) || [] })),
  };
}

export function fieldMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const map: Record<string, string> = {};
  for (const [lineKey, fieldKey] of Object.entries(value as Record<string, unknown>)) {
    const text = String(fieldKey ?? '').trim();
    if (text && FIELD_KEY.test(text) && FIELD_KEY.test(lineKey)) map[lineKey] = text;
  }
  return map;
}

export function statusList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((status) => String(status ?? '').trim()).filter(Boolean))];
}

export function fieldKey(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!FIELD_KEY.test(text)) badRequest(`${text} is not a field.`);
  return text;
}

export async function loadPlans(supabase: SupabaseClient, clientId: string): Promise<PlansResponse> {
  const [plans, versions, settings, agents] = await Promise.all([
    supabase
      .from('commission_plans')
      .select('id, client_id, preset_key, name')
      .or(`client_id.is.null,client_id.eq.${clientId}`)
      .eq('archived', false)
      .order('name'),
    supabase.from('commission_plan_versions').select('id, plan_id, effective_from, lines').or(`client_id.is.null,client_id.eq.${clientId}`),
    supabase.from('client_commission_plan_settings').select('*').eq('client_id', clientId).eq('archived', false).maybeSingle(),
    supabase
      .from('agents')
      .select('commission_plan_id')
      .eq('client_id', clientId)
      .not('commission_plan_id', 'is', null)
      .or('archived.is.null,archived.eq.false'),
  ]);
  for (const result of [plans, versions, settings, agents]) if (result.error) throw result.error;

  const rows = (plans.data || []) as PlanRow[];
  const versionRows = (versions.data || []) as VersionRow[];
  const agentCounts: Record<string, number> = {};
  for (const agent of agents.data || []) {
    const id = String((agent as { commission_plan_id: string }).commission_plan_id);
    agentCounts[id] = (agentCounts[id] || 0) + 1;
  }
  const stored = settings.data as Record<string, unknown> | null;
  return {
    success: true,
    plans: rows.filter((row) => row.client_id === clientId).map((row) => planDto(row, versionRows)),
    presets: rows.filter((row) => row.client_id === null).map((row) => planDto(row, versionRows)),
    settings: stored
      ? {
          capDateFieldKey: String(stored.cap_date_field_key || 'closing_date'),
          capYearStartFieldKey: String(stored.cap_year_start_field_key || ''),
          startingBalancesForFieldKey: String(stored.starting_balances_for_field_key || ''),
          startingBalanceFieldKeys: fieldMap(stored.starting_balance_field_keys),
          optInFieldKeys: fieldMap(stored.opt_in_field_keys),
          capAmountFieldKeys: fieldMap(stored.cap_amount_field_keys),
          countingStatuses: statusList(stored.counting_statuses).length ? statusList(stored.counting_statuses) : DEFAULT_SETTINGS.countingStatuses,
          historyEntityIds: fieldMap(stored.history_entity_ids),
          calculateDeals: Boolean(stored.calculate_deals),
          calculateSince: typeof stored.calculate_since === 'string' && stored.calculate_deals ? stored.calculate_since : '',
        }
      : DEFAULT_SETTINGS,
    agentCounts,
  };
}

/** A name not yet used by the client's active plans: "eXp $4,000", then "eXp $4,000 (2)". */
export async function freeName(supabase: SupabaseClient, clientId: string | null, name: string, exceptId?: string): Promise<string> {
  let query = supabase.from('commission_plans').select('id, name').eq('archived', false);
  query = clientId ? query.eq('client_id', clientId) : query.is('client_id', null);
  const { data, error } = await query;
  if (error) throw error;
  const taken = new Set((data || []).filter((row) => row.id !== exceptId).map((row) => String(row.name).trim().toLowerCase()));
  if (!taken.has(name.trim().toLowerCase())) return name.trim();
  let suffix = 2;
  while (taken.has(`${name.trim()} (${suffix})`.toLowerCase())) suffix += 1;
  return `${name.trim()} (${suffix})`;
}

export function presetKeyFrom(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'preset';
}

/** Copies a preset, with every version, into the client's plans and returns the new plan id. */
export async function copyPresetIntoClient(supabase: SupabaseClient, clientId: string, email: string, presetId: string): Promise<string> {
    const { data: preset, error: presetError } = await supabase
      .from('commission_plans')
      .select('id, name, preset_key')
      .eq('id', presetId)
      .is('client_id', null)
      .eq('archived', false)
      .maybeSingle();
    if (presetError) throw presetError;
    if (!preset) badRequest('That preset was not found.');
    const { data: versions, error: versionsError } = await supabase
      .from('commission_plan_versions')
      .select('effective_from, lines')
      .eq('plan_id', preset.id);
    if (versionsError) throw versionsError;

    const now = new Date().toISOString();
    const { data: plan, error: planError } = await supabase
      .from('commission_plans')
      .insert({
        client_id: clientId,
        preset_key: preset.preset_key,
        name: await freeName(supabase, clientId, preset.name),
        created_by: email,
        updated_at: now,
        updated_by: email,
      })
      .select('id')
      .single();
    if (planError) throw planError;
    if (versions && versions.length) {
      const { error } = await supabase.from('commission_plan_versions').insert(
        versions.map((version) => ({
          plan_id: plan.id,
          client_id: clientId,
          effective_from: version.effective_from,
          lines: version.lines,
          created_by: email,
          updated_at: now,
          updated_by: email,
        })),
      );
      if (error) throw error;
    }
  return plan.id;
}

/** The client's active copy of a preset (by preset key), copying the preset when the client has none yet. */
export async function clientPlanForPreset(supabase: SupabaseClient, clientId: string, email: string, presetId: string): Promise<string> {
  const { data: preset, error } = await supabase.from('commission_plans').select('id, preset_key').eq('id', presetId).is('client_id', null).maybeSingle();
  if (error) throw error;
  if (!preset) badRequest('That preset was not found.');
  const { data: existing, error: existingError } = await supabase
    .from('commission_plans')
    .select('id')
    .eq('client_id', clientId)
    .eq('preset_key', preset.preset_key)
    .eq('archived', false)
    .order('created_at')
    .limit(1);
  if (existingError) throw existingError;
  return existing?.[0]?.id ?? copyPresetIntoClient(supabase, clientId, email, presetId);
}

/** The client's enabled agent caps (Settings > Caps) as cap sources: the entity each tracks and its amount field. */
export async function loadAgentCapSources(supabase: SupabaseClient, clientId: string): Promise<AgentCapSource[]> {
  const [capsResult, entitiesResult] = await Promise.all([
    supabase
      .from('client_caps')
      .select('name, cap_type, enabled, cap_amount_field_key, commission_entity_id')
      .eq('client_id', clientId)
      .eq('cap_type', 'AGENT')
      .or('archived.is.null,archived.eq.false'),
    supabase.from('commission_entities').select('id, entity_name').eq('client_id', clientId),
  ]);
  if (capsResult.error) throw capsResult.error;
  if (entitiesResult.error) throw entitiesResult.error;
  const entityName = new Map((entitiesResult.data || []).map((row) => [String(row.id), String(row.entity_name || '')]));
  return (capsResult.data || []).flatMap((row) => {
    const entity = entityName.get(String(row.commission_entity_id || ''));
    const fieldKey = String(row.cap_amount_field_key || '');
    return row.enabled !== false && entity && fieldKey ? [{ name: String(row.name || entity), entityName: entity, fieldKey }] : [];
  });
}

/**
 * Writes one activity entry per agent whose Commission Plan changed ("Laura Gillespie: Commission Plan eXp $8,000
 * → Broker $16,000"). Unchanged agents are skipped; a failed write is logged and does not undo the assignment.
 */
export async function recordPlanAssignments(
  supabase: SupabaseClient,
  clientId: string,
  actorEmail: string,
  changes: { agentId: string; agentName: string; fromPlanId: string | null; toPlanId: string | null }[],
): Promise<void> {
  const moved = changes.filter((change) => (change.fromPlanId || null) !== (change.toPlanId || null));
  if (!moved.length) return;
  const ids = [...new Set(moved.flatMap((change) => [change.fromPlanId, change.toPlanId]).filter(Boolean))] as string[];
  const { data } = ids.length ? await supabase.from('commission_plans').select('id, name').in('id', ids) : { data: [] };
  const names = new Map((data || []).map((row) => [String(row.id), String(row.name || row.id)]));
  const label = (id: string | null) => (id ? names.get(id) || id : 'No Plan');
  await recordAudits(supabase, moved.map((change) => ({
    clientId,
    actorEmail,
    action: 'update',
    entity: 'agent' as const,
    entityId: change.agentId,
    summary: `${change.agentName}: Commission Plan ${label(change.fromPlanId)} → ${label(change.toPlanId)}`,
    detail: { fromPlanId: change.fromPlanId, toPlanId: change.toPlanId },
  })));
}
