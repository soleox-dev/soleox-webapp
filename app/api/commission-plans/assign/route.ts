import { NextResponse } from 'next/server';
import { apiError, requireSessionClient, TenantAccessError } from '@/lib/session';
import { badRequest, clientPlanForPreset, loadPlans, recordPlanAssignments } from '@/lib/commission-plans-server';

/**
 * Assigns Commission Plans to agents (Settings > Plans > Propose Plans). Body:
 * { assignments: [{ agentId, planId?, presetId? }] }. A presetId uses the client's copy of that preset, copying it
 * first when the client has none; neither means No Plan. Saved deals are not recalculated.
 */
export async function POST(request: Request) {
  try {
    const { email, clientId, supabase } = await requireSessionClient();
    const body = await request.json().catch(() => ({}));
    const assignments: { agentId: string; planId: string | null; presetId: string | null }[] = (Array.isArray(body.assignments) ? body.assignments : [])
      .map((item: Record<string, unknown>) => ({
        agentId: String(item?.agentId || '').trim(),
        planId: item?.planId ? String(item.planId) : null,
        presetId: item?.presetId ? String(item.presetId) : null,
      }))
      .filter((item: { agentId: string }) => item.agentId);
    if (!assignments.length) badRequest('Choose at least one agent.');

    // Client plans must be this client's; presets resolve to the client's copy.
    const planIds = [...new Set(assignments.map((item) => item.planId).filter(Boolean))] as string[];
    if (planIds.length) {
      const { data, error } = await supabase.from('commission_plans').select('id').eq('client_id', clientId).eq('archived', false).in('id', planIds);
      if (error) throw error;
      const known = new Set((data || []).map((row) => row.id));
      if (planIds.some((id) => !known.has(id))) badRequest('One of the plans was not found.');
    }
    const fromPreset = new Map<string, string>();
    for (const presetId of new Set(assignments.map((item) => item.presetId).filter(Boolean)) as Set<string>) {
      fromPreset.set(presetId, await clientPlanForPreset(supabase, clientId, email, presetId));
    }

    const byPlan = new Map<string | null, string[]>();
    for (const item of assignments) {
      const target = item.planId || (item.presetId ? fromPreset.get(item.presetId)! : null);
      byPlan.set(target, [...(byPlan.get(target) || []), item.agentId]);
    }
    // Each agent's plan before, for the activity log.
    const { data: before, error: beforeError } = await supabase
      .from('agents')
      .select('id, agent_name, commission_plan_id')
      .eq('client_id', clientId)
      .in('id', assignments.map((item) => item.agentId));
    if (beforeError) throw beforeError;
    let updated = 0;
    const now = new Date().toISOString();
    for (const [planId, agentIds] of byPlan) {
      const { data, error } = await supabase
        .from('agents')
        .update({ commission_plan_id: planId, updated_at: now, updated_by: email })
        .eq('client_id', clientId)
        .in('id', agentIds)
        .select('id');
      if (error) throw error;
      updated += data?.length || 0;
    }
    const targetOf = new Map<string, string | null>();
    for (const [planId, agentIds] of byPlan) for (const agentId of agentIds) targetOf.set(agentId, planId);
    await recordPlanAssignments(supabase, clientId, email, (before || []).map((row) => ({
      agentId: String(row.id),
      agentName: String(row.agent_name || row.id),
      fromPlanId: row.commission_plan_id ? String(row.commission_plan_id) : null,
      toPlanId: targetOf.get(String(row.id)) ?? null,
    })));
    // Row security skips agents this user may not change instead of failing, so count what really changed.
    if (updated < assignments.length) {
      throw new TenantAccessError(
        `${updated} of ${assignments.length} agents were updated. Assigning plans needs Commission Tracker Write or Admin on this client.`,
        403,
      );
    }
    return NextResponse.json({ ...(await loadPlans(supabase, clientId)), updated });
  } catch (error) {
    return apiError(error, 'The plans could not be assigned.', 'success');
  }
}
