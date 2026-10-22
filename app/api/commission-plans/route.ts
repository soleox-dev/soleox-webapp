import { NextResponse } from 'next/server';
import { apiError, requireSessionClient, TenantAccessError } from '@/lib/session';
import { DAY, badRequest, copyPresetIntoClient, fieldKey, fieldMap, freeName, loadPlans, presetKeyFrom, statusList } from '@/lib/commission-plans-server';
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
  /** Deal statuses that count toward caps and yearly limits. */
  countingStatuses: string[];
  /** Plan line key -> the entity earlier deals paid that line to; those saved lines count toward caps. */
  historyEntityIds: Record<string, string>;
  /**
   * The switch. Deals created after calculateSince (when it was turned on, set by the server) calculate with plans;
   * earlier deals keep their saved lines until someone chooses Calculate With Plans on the deal.
   */
  calculateDeals: boolean;
  calculateSince: string;
};
export type PlansResponse = {
  success: true;
  plans: PlanDto[];
  presets: PlanDto[];
  settings: PlanSettingsDto;
  /** Active agents on each client plan. */
  agentCounts: Record<string, number>;
};

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
    const id = await copyPresetIntoClient(supabase, clientId, email, String(body.presetId || ''));
    return NextResponse.json({ ...(await loadPlans(supabase, clientId)), createdId: id });
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
        counting_statuses: statusList(settings.countingStatuses).length ? statusList(settings.countingStatuses) : null,
        history_entity_ids: fieldMap(settings.historyEntityIds),
        calculate_deals: Boolean(settings.calculateDeals),
        updated_at: now,
        updated_by: email,
      };
      const { data: existing, error: readError } = await supabase
        .from('client_commission_plan_settings')
        .select('id, calculate_deals, calculate_since')
        .eq('client_id', clientId)
        .eq('archived', false)
        .maybeSingle();
      if (readError) throw readError;
      // The switch time is the server's: set when the switch turns on, kept while it stays on, cleared when it turns off.
      const switchedOn = Boolean(row.calculate_deals);
      Object.assign(row, {
        calculate_since: switchedOn ? (existing?.calculate_deals && existing.calculate_since ? existing.calculate_since : now) : null,
      });
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
