import { NextResponse } from 'next/server';
import { apiError, requireSessionClient } from '@/lib/session';
import { fetchAllPages } from '@/lib/supabase-pagination';
import {
  planHistoryFromItems,
  type CommissionPlanRow,
  type CommissionPlanVersionRow,
  type PlanAgentRow,
  type PlanItemRow,
  type PlanSettingsRow,
  type PlanTransactionRow,
} from '@/lib/commission-engine';

/**
 * What the Caps report (Owner Reports) needs to show Commission Plan caps: the client's plan settings, its plans and
 * their versions, the agents on a plan, and the year-to-date plan history (saved plan lines, and lines saved before
 * plans to the entities Plan Settings maps to a plan line). Read-only. Empty when no agent is on a plan.
 */
export async function GET() {
  try {
    const { clientId, supabase } = await requireSessionClient();

    const [settingsResult, plansResult, versionsResult] = await Promise.all([
      supabase.from('client_commission_plan_settings').select('*').eq('client_id', clientId).eq('archived', false).maybeSingle(),
      supabase.from('commission_plans').select('id, client_id, preset_key, name, archived').eq('client_id', clientId).eq('archived', false),
      supabase.from('commission_plan_versions').select('id, plan_id, effective_from, lines').eq('client_id', clientId),
    ]);
    for (const result of [settingsResult, plansResult, versionsResult]) if (result.error) throw result.error;

    const stored = (settingsResult.data || {}) as Record<string, unknown>;
    const settings: PlanSettingsRow = {
      cap_date_field_key: String(stored.cap_date_field_key || 'closing_date'),
      cap_year_start_field_key: (stored.cap_year_start_field_key as string) || null,
      starting_balances_for_field_key: (stored.starting_balances_for_field_key as string) || null,
      starting_balance_field_keys: (stored.starting_balance_field_keys as Record<string, string>) || {},
      opt_in_field_keys: (stored.opt_in_field_keys as Record<string, string>) || {},
      cap_amount_field_keys: (stored.cap_amount_field_keys as Record<string, string>) || {},
      counting_statuses: (stored.counting_statuses as string[]) || null,
      history_entity_ids: (stored.history_entity_ids as Record<string, string>) || {},
    };
    const plans = (plansResult.data || []) as CommissionPlanRow[];
    const empty = { success: true, settings, plans: [], versions: [], agents: [], history: [] };
    if (plans.length === 0) return NextResponse.json(empty);

    const agents = (await fetchAllPages<PlanAgentRow>((offset, limit, withCount) =>
      supabase
        .from('agents')
        .select('id, agent_name, is_team_lead, commission_plan_id, custom_attributes', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false')
        .not('commission_plan_id', 'is', null)
        .range(offset, offset + limit - 1))).filter((agent) => agent.commission_plan_id);
    if (agents.length === 0) return NextResponse.json(empty);

    // Saved plan lines, and lines saved before plans to the entities Plan Settings maps to a plan line.
    const mappedEntities = Object.values(settings.history_entity_ids || {}).filter((id) => /^[A-Za-z0-9_]+$/.test(id));
    const items = await fetchAllPages<PlanItemRow>((offset, limit, withCount) =>
      supabase
        .from('transaction_commission_items')
        .select('transaction_id, agent_id, plan_line_key, payee_entity_id, final_amount, archived, custom_attributes', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .or(mappedEntities.length ? `plan_line_key.not.is.null,payee_entity_id.in.(${mappedEntities.join(',')})` : 'plan_line_key.not.is.null')
        .range(offset, offset + limit - 1));
    const dealIds = [...new Set(items.map((item) => item.transaction_id))];
    const deals: PlanTransactionRow[] = [];
    for (let start = 0; start < dealIds.length; start += 200) {
      const { data, error } = await supabase.from('transactions').select('*').eq('client_id', clientId).in('id', dealIds.slice(start, start + 200));
      if (error) throw error;
      deals.push(...((data || []) as PlanTransactionRow[]));
    }

    return NextResponse.json({
      success: true,
      settings,
      plans,
      versions: (versionsResult.data || []) as CommissionPlanVersionRow[],
      agents,
      history: planHistoryFromItems(items, deals, settings),
    });
  } catch (error) {
    return apiError(error, 'The Commission Plan caps could not be loaded.', 'success');
  }
}
