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
import { DEMO_FINISHED_VIEW_FORMULA, transactionViewKeyIsFinished, transactionViewsFromSettings } from '@/lib/transaction-default-view';

/**
 * What the deal page needs to calculate a deal with Commission Plans (?transaction_id=): the client's plan settings
 * and switch, its plans and versions, agent fields, year-to-date plan history, the FINISHED view's formula, whether
 * the deal is one side of a double end, and the brokerage-agent entities. Read-only; the page decides with
 * buildDealPlanContext.
 */
export async function GET(request: Request) {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const transactionId = new URL(request.url).searchParams.get('transaction_id') || '';

    const [settingsResult, plansResult, versionsResult, clientResult, entitiesResult, dealResult] = await Promise.all([
      supabase.from('client_commission_plan_settings').select('*').eq('client_id', clientId).eq('archived', false).maybeSingle(),
      supabase.from('commission_plans').select('id, client_id, preset_key, name, archived').eq('client_id', clientId).eq('archived', false),
      supabase.from('commission_plan_versions').select('id, plan_id, effective_from, lines').eq('client_id', clientId),
      supabase.from('clients').select('settings_json').eq('id', clientId).maybeSingle(),
      supabase.from('commission_entities').select('entity_name').eq('client_id', clientId).eq('is_brokerage_agent', true),
      transactionId
        ? supabase.from('transactions').select('id, property_address, closing_date, transaction_side').eq('client_id', clientId).eq('id', transactionId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    for (const result of [settingsResult, plansResult, versionsResult, clientResult, entitiesResult, dealResult]) if (result.error) throw result.error;

    const stored = (settingsResult.data || {}) as Record<string, unknown>;
    const settings: PlanSettingsRow = {
      cap_date_field_key: String(stored.cap_date_field_key || 'closing_date'),
      cap_year_start_field_key: (stored.cap_year_start_field_key as string) || null,
      starting_balances_for_field_key: (stored.starting_balances_for_field_key as string) || null,
      starting_balance_field_keys: (stored.starting_balance_field_keys as Record<string, string>) || {},
      opt_in_field_keys: (stored.opt_in_field_keys as Record<string, string>) || {},
      cap_amount_field_keys: (stored.cap_amount_field_keys as Record<string, string>) || {},
      counting_statuses: (stored.counting_statuses as string[]) || null,
      calculate_deals: Boolean(stored.calculate_deals),
      calculate_from: (stored.calculate_from as string) || null,
    };

    // Nothing more is needed while the switch is off: the page leaves the deal alone.
    if (!settings.calculate_deals) {
      return NextResponse.json({ success: true, settings, plans: [], versions: [], agents: [], history: [], finishedFormula: '', doubleEnd: false, brokerageAgentEntities: [] });
    }

    const agents = await fetchAllPages<PlanAgentRow>((offset, limit, withCount) =>
      supabase
        .from('agents')
        .select('id, agent_name, is_team_lead, commission_plan_id, custom_attributes', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false')
        .range(offset, offset + limit - 1));
    const items = await fetchAllPages<PlanItemRow>((offset, limit, withCount) =>
      supabase
        .from('transaction_commission_items')
        .select('transaction_id, agent_id, plan_line_key, final_amount, archived, custom_attributes', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .not('plan_line_key', 'is', null)
        .range(offset, offset + limit - 1));
    const dealIds = [...new Set(items.map((item) => item.transaction_id))];
    const deals: PlanTransactionRow[] = [];
    for (let start = 0; start < dealIds.length; start += 200) {
      const { data, error } = await supabase.from('transactions').select('*').eq('client_id', clientId).in('id', dealIds.slice(start, start + 200));
      if (error) throw error;
      deals.push(...((data || []) as PlanTransactionRow[]));
    }

    const views = transactionViewsFromSettings(clientResult.data?.settings_json, clientId);
    const finishedView = views.views.find((view) => transactionViewKeyIsFinished(view));
    const deal = dealResult.data as { id: string; property_address: string | null; closing_date: string | null; transaction_side: string | null } | null;
    let doubleEnd = false;
    if (deal?.property_address && deal.closing_date) {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, transaction_side')
        .eq('client_id', clientId)
        .ilike('property_address', deal.property_address.trim())
        .eq('closing_date', deal.closing_date)
        .neq('id', deal.id);
      if (error) throw error;
      doubleEnd = (data || []).some((other) => String(other.transaction_side || '').trim().toLowerCase() !== String(deal.transaction_side || '').trim().toLowerCase());
    }

    return NextResponse.json({
      success: true,
      settings,
      plans: (plansResult.data || []) as CommissionPlanRow[],
      versions: (versionsResult.data || []) as CommissionPlanVersionRow[],
      agents,
      history: planHistoryFromItems(items, deals, settings),
      // A client without a Finished view uses the seeded one: a cancelled, or a closed and paid, deal is finished.
      finishedFormula: finishedView?.filterFormula || DEMO_FINISHED_VIEW_FORMULA,
      doubleEnd,
      brokerageAgentEntities: (entitiesResult.data || []).map((row) => String(row.entity_name || '')).filter(Boolean),
    });
  } catch (error) {
    return apiError(error, 'The Commission Plans for this deal could not be loaded.', 'success');
  }
}
