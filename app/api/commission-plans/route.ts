import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { apiError, requireSessionClient, TenantAccessError } from '@/lib/session';
import { commissionPlanSchema, validatePlan, type PlanLine } from '@/lib/commission-engine';

/**
 * Commission Plans (migration 065): the client's plans, the platform preset library, and the client's plan
 * settings. Row security decides who writes what: Settings users write their client's plans and settings,
 * platform super admins write presets.
 */

export type PlanVersionDto = { id: string; effectiveFrom: string; lines: PlanLine[] };
export type PlanDto = { id: string; name: string; presetKey: string | null; isPreset: boolean; versions: PlanVersionDto[] };
export type PlanSettingsDto = {
  capDateFieldKey: string;
  capYearStartFieldKey: string;
  startingBalancesForFieldKey: string;
  startingBalanceFieldKeys: Record<string, string>;
  optInFieldKeys: Record<string, string>;
  capAmountFieldKeys: Record<string, string>;
};
export type PlansResponse = {
  success: true;
  plans: PlanDto[];
  presets: PlanDto[];
  settings: PlanSettingsDto;
  /** Active agents on each client plan. */
  agentCounts: Record<string, number>;
};

type PlanRow = { id: string; client_id: string | null; preset_key: string | null; name: string };
type VersionRow = { id: string; plan_id: string; effective_from: string; lines: unknown };

const DEFAULT_SETTINGS: PlanSettingsDto = {
  capDateFieldKey: 'closing_date',
  capYearStartFieldKey: '',
  startingBalancesForFieldKey: '',
  startingBalanceFieldKeys: {},
  optInFieldKeys: {},
  capAmountFieldKeys: {},
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

function badRequest(message: string): never {
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

function fieldMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const map: Record<string, string> = {};
  for (const [lineKey, fieldKey] of Object.entries(value as Record<string, unknown>)) {
    const text = String(fieldKey ?? '').trim();
    if (text && FIELD_KEY.test(text) && FIELD_KEY.test(lineKey)) map[lineKey] = text;
  }
  return map;
}

function fieldKey(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!FIELD_KEY.test(text)) badRequest(`${text} is not a field.`);
  return text;
}

async function loadPlans(supabase: SupabaseClient, clientId: string): Promise<PlansResponse> {
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
        }
      : DEFAULT_SETTINGS,
    agentCounts,
  };
}

/** A name not yet used by the client's active plans: "eXp $4,000", then "eXp $4,000 (2)". */
async function freeName(supabase: SupabaseClient, clientId: string | null, name: string, exceptId?: string): Promise<string> {
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

function presetKeyFrom(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'preset';
}

export async function GET() {
  try {
    const { clientId, supabase } = await requireSessionClient();
    return NextResponse.json(await loadPlans(supabase, clientId));
  } catch (error) {
    return apiError(error, 'The commission plans could not be loaded.', 'success');
  }
}

/** Copies a preset, with every version, into the client's plans. Body: { presetId }. */
export async function POST(request: Request) {
  try {
    const { email, clientId, supabase } = await requireSessionClient();
    const body = await request.json().catch(() => ({}));
    const presetId = String(body.presetId || '');
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
    return NextResponse.json({ ...(await loadPlans(supabase, clientId)), createdId: plan.id });
  } catch (error) {
    return apiError(error, 'The preset could not be copied.', 'success');
  }
}

/**
 * Saves a plan or the plan settings.
 * - { plan: { id?, preset?, name, effectiveFrom, lines } }: the lines become the version effective on that date
 *   (replacing a version with the same date). A new plan is created when id is empty; preset: true saves to the
 *   preset library (super admins only, by row security).
 * - { settings }: the client's plan settings.
 */
export async function PUT(request: Request) {
  try {
    const { email, clientId, supabase } = await requireSessionClient();
    const body = await request.json().catch(() => ({}));
    const now = new Date().toISOString();

    if (body.settings) {
      const settings = body.settings as Partial<PlanSettingsDto>;
      const row = {
        client_id: clientId,
        cap_date_field_key: fieldKey(settings.capDateFieldKey) || 'closing_date',
        cap_year_start_field_key: fieldKey(settings.capYearStartFieldKey),
        starting_balances_for_field_key: fieldKey(settings.startingBalancesForFieldKey),
        starting_balance_field_keys: fieldMap(settings.startingBalanceFieldKeys),
        opt_in_field_keys: fieldMap(settings.optInFieldKeys),
        cap_amount_field_keys: fieldMap(settings.capAmountFieldKeys),
        updated_at: now,
        updated_by: email,
      };
      const { data: existing, error: readError } = await supabase
        .from('client_commission_plan_settings')
        .select('id')
        .eq('client_id', clientId)
        .eq('archived', false)
        .maybeSingle();
      if (readError) throw readError;
      const { error } = existing
        ? await supabase.from('client_commission_plan_settings').update(row).eq('id', existing.id).eq('client_id', clientId)
        : await supabase.from('client_commission_plan_settings').insert({ ...row, created_by: email });
      if (error) throw error;
      return NextResponse.json(await loadPlans(supabase, clientId));
    }

    const input = body.plan || {};
    const preset = input.preset === true;
    const owner = preset ? null : clientId;
    const effectiveFrom = String(input.effectiveFrom || '');
    if (!DAY.test(effectiveFrom)) badRequest('Choose the date these lines take effect.');
    const parsed = commissionPlanSchema.safeParse({ id: String(input.id || 'new'), name: String(input.name || ''), lines: input.lines });
    if (!parsed.success) badRequest('Some plan lines are incomplete. Check each line and try again.');
    const problems = validatePlan(parsed.data);
    if (problems.length) badRequest(problems[0]);

    let planId = String(input.id || '');
    if (planId) {
      let query = supabase.from('commission_plans').select('id').eq('id', planId).eq('archived', false);
      query = owner ? query.eq('client_id', owner) : query.is('client_id', null);
      const { data: found, error } = await query.maybeSingle();
      if (error) throw error;
      if (!found) badRequest('That plan was not found.');
      const { error: updateError } = await supabase
        .from('commission_plans')
        .update({ name: await freeName(supabase, owner, parsed.data.name, planId), updated_at: now, updated_by: email })
        .eq('id', planId);
      if (updateError) throw updateError;
    } else {
      const name = await freeName(supabase, owner, parsed.data.name);
      const { data: created, error } = await supabase
        .from('commission_plans')
        .insert({ client_id: owner, preset_key: preset ? presetKeyFrom(name) : null, name, created_by: email, updated_at: now, updated_by: email })
        .select('id')
        .single();
      if (error) throw error;
      planId = created.id;
    }

    const { error: versionError } = await supabase.from('commission_plan_versions').upsert(
      { plan_id: planId, client_id: owner, effective_from: effectiveFrom, lines: parsed.data.lines, created_by: email, updated_at: now, updated_by: email },
      { onConflict: 'plan_id,effective_from' },
    );
    if (versionError) throw versionError;
    return NextResponse.json({ ...(await loadPlans(supabase, clientId)), savedId: planId });
  } catch (error) {
    return apiError(error, 'The plan could not be saved.', 'success');
  }
}

/** Archives a plan (?id=). A client plan that agents are on cannot be archived until they move to another. */
export async function DELETE(request: Request) {
  try {
    const { email, clientId, supabase } = await requireSessionClient();
    const id = new URL(request.url).searchParams.get('id') || '';
    const { data: plan, error } = await supabase
      .from('commission_plans')
      .select('id, client_id, name')
      .eq('id', id)
      .or(`client_id.is.null,client_id.eq.${clientId}`)
      .maybeSingle();
    if (error) throw error;
    if (!plan) badRequest('That plan was not found.');
    if (plan.client_id) {
      const { count, error: countError } = await supabase
        .from('agents')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('commission_plan_id', id)
        .or('archived.is.null,archived.eq.false');
      if (countError) throw countError;
      if (count) throw new TenantAccessError(`${count} agent${count === 1 ? ' is' : 's are'} on ${plan.name}. Move them to another plan first.`, 409);
    }
    const { error: archiveError } = await supabase
      .from('commission_plans')
      .update({ archived: true, updated_at: new Date().toISOString(), updated_by: email })
      .eq('id', id);
    if (archiveError) throw archiveError;
    return NextResponse.json(await loadPlans(supabase, clientId));
  } catch (error) {
    return apiError(error, 'The plan could not be removed.', 'success');
  }
}
