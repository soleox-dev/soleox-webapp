import { NextResponse } from 'next/server';
import { apiError, requireSessionClient } from '@/lib/session';
import { fetchAllPages } from '@/lib/supabase-pagination';
import { loadAgentCapSources } from '@/lib/commission-plans-server';
import {
  planCapMismatches,
  planInForce,
  readTransactionField,
  type CommissionPlanRow,
  type CommissionPlanVersionRow,
  type PlanAgentRow,
  type PlanCapMismatch,
} from '@/lib/commission-engine';

export interface PlanCapWarning {
  agentId: string;
  agentName: string;
  planName: string;
  mismatches: PlanCapMismatch[];
}

/**
 * Agents whose Commission Plan, as in force today, has a yearly cap that differs from the cap on their own record
 * (the agent caps in Settings > Caps). Lines Plan Settings reads from an agent field (Cap Amounts) are skipped.
 * The agent caps themselves come back too (sources), for Propose Plans.
 */
export async function GET() {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const [plansResult, versionsResult, settingsResult, sources] = await Promise.all([
      supabase.from('commission_plans').select('id, client_id, preset_key, name, archived').eq('client_id', clientId).eq('archived', false),
      supabase.from('commission_plan_versions').select('id, plan_id, effective_from, lines').eq('client_id', clientId),
      supabase.from('client_commission_plan_settings').select('cap_amount_field_keys').eq('client_id', clientId).eq('archived', false).maybeSingle(),
      loadAgentCapSources(supabase, clientId),
    ]);
    for (const result of [plansResult, versionsResult, settingsResult]) if (result.error) throw result.error;
    if (!sources.length) return NextResponse.json({ success: true, warnings: [], sources });

    const agents = await fetchAllPages<PlanAgentRow>((offset, limit, withCount) =>
      supabase
        .from('agents')
        .select('id, agent_name, is_team_lead, commission_plan_id, custom_attributes', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false')
        .not('commission_plan_id', 'is', null)
        .range(offset, offset + limit - 1));
    const plans = new Map(((plansResult.data || []) as CommissionPlanRow[]).map((plan) => [plan.id, plan]));
    const versions = (versionsResult.data || []) as CommissionPlanVersionRow[];
    const agentFieldLines = new Set(Object.keys((settingsResult.data?.cap_amount_field_keys as Record<string, string>) || {}));
    const today = new Date().toISOString().slice(0, 10);

    const warnings: PlanCapWarning[] = [];
    for (const agent of agents) {
      const row = plans.get(String(agent.commission_plan_id || ''));
      if (!row) continue;
      let plan;
      try {
        plan = planInForce(row, versions, today);
      } catch {
        continue;
      }
      const { mismatches } = planCapMismatches(plan, (key) => readTransactionField(agent, key), sources, agentFieldLines);
      if (mismatches.length) warnings.push({ agentId: agent.id, agentName: agent.agent_name, planName: row.name, mismatches });
    }
    warnings.sort((a, b) => a.agentName.localeCompare(b.agentName));
    return NextResponse.json({ success: true, warnings, sources });
  } catch (error) {
    return apiError(error, 'The plan caps could not be checked.', 'success');
  }
}
