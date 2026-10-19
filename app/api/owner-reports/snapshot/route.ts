import { NextResponse } from 'next/server';
import { requireSessionClient, getTenantContext, apiError } from '@/lib/session';
import { fetchAllByIdBands } from '@/lib/supabase-pagination';

const DEAL_COLUMNS = [
  'id',
  'agent_id',
  'archived',
  'permanently_deleted',
  'client_name',
  'closing_date',
  'acceptance_date',
  'list_date',
  'finance_status',
  'gci_amount',
  'gci_perc',
  'gci_type',
  'lead_owner',
  'lead_source',
  'list_price',
  'sales_price',
  'property_address',
  'tms_id',
  'total_commission',
  'transaction_fee',
  'transaction_side',
  'transaction_status',
  'custom_attributes',
].join(', ');

type Row = Record<string, unknown> & { id?: unknown };

/**
 * One payload for Owner Reports.
 * Rows are read in id bands so a client with thousands of deals does not scan
 * deep offsets or wait on an exact count.
 */
export async function GET() {
  try {
    const { clientId, supabase } = await requireSessionClient();

    const [transactions, payments, items, entities, contributions] = await Promise.all([
      fetchAllByIdBands<Row>((after, before, limit) => {
        let query = supabase
          .from('transactions')
          .select(DEAL_COLUMNS)
          .eq('client_id', clientId)
          .or('archived.is.null,archived.eq.false')
          .gt('id', after)
          .order('id', { ascending: true })
          .limit(limit);
        if (before) query = query.lt('id', before);
        return query;
      }, 'TXN_', 8),
      fetchAllByIdBands<Row>((after, before, limit) => {
        let query = supabase
          .from('payments')
          .select('id, transaction_id, agent_id, payee_entity_id, payee_type, amount_paid')
          .eq('client_id', clientId)
          .or('archived.is.null,archived.eq.false')
          .gt('id', after)
          .order('id', { ascending: true })
          .limit(limit);
        if (before) query = query.lt('id', before);
        return query;
      }, 'PAY_', 8),
      fetchAllByIdBands<Row>((after, before, limit) => {
        let query = supabase
          .from('transaction_commission_items')
          .select('id, transaction_id, agent_id, payee_entity_id, section, final_amount')
          .eq('client_id', clientId)
          .or('archived.is.null,archived.eq.false')
          .in('section', ['AGENT_SPLIT', 'POST_SPLIT', 'POST_SPLIT_L2'])
          .gt('id', after)
          .order('id', { ascending: true })
          .limit(limit);
        if (before) query = query.lt('id', before);
        return query;
      }, 'TCI_', 8),
      supabase
        .from('commission_entities')
        .select('id, entity_name, entity_type')
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false'),
      fetchAllByIdBands<Row>((after, before, limit) => {
        let query = supabase
          .from('transaction_team_caps')
          .select('id, agent_id, amount, period_start, transaction_id, team_cap_id')
          .eq('client_id', clientId)
          .gt('id', after)
          .order('id', { ascending: true })
          .limit(limit);
        if (before) query = query.lt('id', before);
        return query;
      }, 'TTC_', 4),
    ]);

    if (entities.error) throw entities.error;

    const tenant = await getTenantContext();

    const payload = JSON.stringify({
      success: true,
      clientId,
      clientName: tenant?.clientName || clientId,
      transactions,
      payments: payments.map((row) => ({
        transaction_id: row.transaction_id ?? null,
        agent_id: row.agent_id ?? null,
        payee_entity_id: row.payee_entity_id ?? null,
        payee_type: row.payee_type ?? null,
        amount_paid: row.amount_paid ?? null,
      })),
      items: items.map((row) => ({
        transaction_id: row.transaction_id ?? null,
        agent_id: row.agent_id ?? null,
        payee_entity_id: row.payee_entity_id ?? null,
        section: row.section ?? null,
        final_amount: row.final_amount ?? null,
      })),
      entities: entities.data || [],
      contributions: contributions.map((row) => ({
        agentId: row.agent_id,
        amount: Number(row.amount) || 0,
        periodStart: row.period_start,
        teamCapId: row.team_cap_id,
        transactionId: row.transaction_id,
      })),
    });

    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
      },
    });
  } catch (error) {
    return apiError(error, 'The reports could not be loaded.');
  }
}
