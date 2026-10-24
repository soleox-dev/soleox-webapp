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
import { DB_TRANSACTION_COLUMNS } from '@/lib/fields';

/**
 * What the deal page needs to calculate a deal with Commission Plans (?transaction_id=): the client's plan settings
 * and switch, its plans and versions, agent fields, year-to-date plan history, the FINISHED view's formula, whether
 * the deal is one side of a double end, and the brokerage-agent entities. Read-only; the page decides with
 * buildDealPlanContext.
 */
export async function GET(request: Request) {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const searchParams = new URL(request.url).searchParams;
    const transactionId = searchParams.get('transaction_id') || '';
    // Agents being added to the deal on the page, not yet saved on it: their history is read too.
    const extraAgentIds = (searchParams.get('agent_ids') || '').split(',').map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_]+$/.test(id));

    const [settingsResult, plansResult, versionsResult, clientResult, entitiesResult, dealResult] = await Promise.all([
      supabase.from('client_commission_plan_settings').select('*').eq('client_id', clientId).eq('archived', false).maybeSingle(),
      supabase.from('commission_plans').select('id, client_id, preset_key, name, archived').eq('client_id', clientId).eq('archived', false),
      supabase.from('commission_plan_versions').select('id, plan_id, effective_from, lines').eq('client_id', clientId),
      supabase.from('clients').select('settings_json').eq('id', clientId).maybeSingle(),
      supabase.from('commission_entities').select('entity_name').eq('client_id', clientId).eq('is_brokerage_agent', true),
      transactionId
        ? supabase.from('transactions').select('id, property_address, closing_date, transaction_side, agent_id').eq('client_id', clientId).eq('id', transactionId).maybeSingle()
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
      history_entity_ids: (stored.history_entity_ids as Record<string, string>) || {},
      calculate_deals: Boolean(stored.calculate_deals),
      calculate_since: (stored.calculate_since as string) || null,
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
    // Saved plan lines, and lines saved before plans to the entities Plan Settings maps to a plan line.
    const mappedEntities = Object.values(settings.history_entity_ids || {}).filter((id) => /^[A-Za-z0-9_]+$/.test(id));
    // Only what the history reads (planHistoryFromItems): of a line's custom attributes just counts_toward_cap, and of
    // a deal its id, first save, status, and Cap Date (a column, or inside custom_attributes). The whole rows made this
    // slow enough to time out once a client had a year of deals.
    type ItemRow = Omit<PlanItemRow, 'custom_attributes'> & { counts_toward_cap?: string | null };
    const itemColumns = 'transaction_id, agent_id, plan_line_key, payee_entity_id, final_amount, archived, counts_toward_cap:custom_attributes->>counts_toward_cap';
    const itemFilter = mappedEntities.length ? `plan_line_key.not.is.null,payee_entity_id.in.(${mappedEntities.join(',')})` : 'plan_line_key.not.is.null';
    const capColumn = DB_TRANSACTION_COLUMNS.some((column) => column.field_key === settings.cap_date_field_key) ? settings.cap_date_field_key : null;
    // A deal's year-to-date only reads deals in its cap year, so with a Cap Date column and a saved Cap Date only deals
    // from two years before it on are read (room for an edited date). Otherwise every saved line is read.
    const dealCapDate = capColumn === 'closing_date' ? String(dealResult.data?.closing_date || '').slice(0, 10) : '';
    const windowStart = /^\d{4}-\d{2}-\d{2}$/.test(dealCapDate) ? `${Number(dealCapDate.slice(0, 4)) - 2}${dealCapDate.slice(4)}` : '';
    // A saved deal only needs the year-to-date of its own agents: those on its saved lines, its primary agent, and any
    // the page is adding (agent_ids). historyAgentIds tells the page whose history it got; a new deal gets everyone's.
    let historyAgentIds: string[] | null = null;
    if (transactionId && dealResult.data) {
      const { data: dealLines, error: dealLinesError } = await supabase
        .from('transaction_commission_items')
        .select('agent_id')
        .eq('client_id', clientId)
        .eq('transaction_id', transactionId)
        .not('agent_id', 'is', null);
      if (dealLinesError) throw dealLinesError;
      const primary = (dealResult.data as { agent_id?: string | null }).agent_id;
      historyAgentIds = [...new Set([
        ...(dealLines || []).map((row) => String(row.agent_id)),
        ...(primary && /^[A-Za-z0-9_]+$/.test(primary) ? [primary] : []),
        ...extraAgentIds,
      ])].sort();
    }
    const agentFilter = historyAgentIds ? (historyAgentIds.length ? historyAgentIds : ['__none__']) : null;
    let itemRows: ItemRow[];
    if (windowStart) {
      const windowDeals = await fetchAllPages<{ id: string }>((offset, limit, withCount) =>
        supabase
          .from('transactions')
          .select('id', withCount ? { count: 'exact' } : undefined)
          .eq('client_id', clientId)
          .gte('closing_date', windowStart)
          .range(offset, offset + limit - 1));
      const windowIds = windowDeals.map((row) => row.id);
      const idBatches: string[][] = [];
      for (let start = 0; start < windowIds.length; start += 200) idBatches.push(windowIds.slice(start, start + 200));
      const pages = await Promise.all(idBatches.map((ids) => fetchAllPages<ItemRow>((offset, limit, withCount) => {
        let query = supabase
          .from('transaction_commission_items')
          .select(itemColumns, withCount ? { count: 'exact' } : undefined)
          .eq('client_id', clientId)
          .in('transaction_id', ids);
        if (agentFilter) query = query.in('agent_id', agentFilter);
        return query.or(itemFilter).range(offset, offset + limit - 1);
      })));
      itemRows = pages.flat();
    } else {
      itemRows = await fetchAllPages<ItemRow>((offset, limit, withCount) => {
        let query = supabase
          .from('transaction_commission_items')
          .select(itemColumns, withCount ? { count: 'exact' } : undefined)
          .eq('client_id', clientId);
        if (agentFilter) query = query.in('agent_id', agentFilter);
        return query.or(itemFilter).range(offset, offset + limit - 1);
      });
    }
    const items: PlanItemRow[] = itemRows.map(({ counts_toward_cap: countsTowardCap, ...row }) => ({
      ...row,
      custom_attributes: countsTowardCap ? { counts_toward_cap: countsTowardCap } : null,
    }));
    const dealIds = [...new Set(items.map((item) => item.transaction_id))];
    const dealColumns = ['id', 'created_at', 'transaction_status', 'closing_date', 'custom_attributes', ...(capColumn && capColumn !== 'closing_date' ? [capColumn] : [])].join(', ');
    const batches: string[][] = [];
    for (let start = 0; start < dealIds.length; start += 200) batches.push(dealIds.slice(start, start + 200));
    const dealResults = await Promise.all(batches.map((ids) => supabase.from('transactions').select(dealColumns).eq('client_id', clientId).in('id', ids)));
    const deals: PlanTransactionRow[] = [];
    for (const { data, error } of dealResults) {
      if (error) throw error;
      deals.push(...((data || []) as unknown as PlanTransactionRow[]));
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
      historyAgentIds,
    });
  } catch (error) {
    return apiError(error, 'The Commission Plans for this deal could not be loaded.', 'success');
  }
}
