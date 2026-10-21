import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSessionClient, apiError } from '@/lib/session';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchAllPages, fetchAllByIdBands } from '@/lib/supabase-pagination';

/** Commission lines plus the closing day and status SUMIFS needs, without the rest of each row. */
async function loadCommissionLedgerRows(supabase: SupabaseClient, clientId: string) {
  const [items, deals] = await Promise.all([
    fetchAllByIdBands<{ id: string; final_amount: any; agent_id: any; payee_entity_id: any; section: any; transaction_id: any }>((after, before, limit) => {
      let query = supabase
        .from('transaction_commission_items')
        .select('id, final_amount, agent_id, payee_entity_id, section, transaction_id')
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false')
        .gt('id', after)
        .order('id', { ascending: true })
        .limit(limit);
      if (before) query = query.lt('id', before);
      return query;
    }, 'TCI_', 4),
    fetchAllByIdBands<{ id: string; closing_date: any; transaction_status: any }>((after, before, limit) => {
      let query = supabase
        .from('transactions')
        .select('id, closing_date, transaction_status')
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false')
        .gt('id', after)
        .order('id', { ascending: true })
        .limit(limit);
      if (before) query = query.lt('id', before);
      return query;
    }, 'TXN_', 4),
  ]);

  const byId = new Map(deals.map((deal) => [String(deal.id || ''), deal]));
  return items.map((item) => {
    const deal = (byId.get(String(item.transaction_id || '')) || {}) as Record<string, any>;
    return {
      final_amount: item.final_amount ?? null,
      agent_id: item.agent_id ?? null,
      payee_entity_id: item.payee_entity_id ?? null,
      section: item.section ?? null,
      transaction_id: item.transaction_id ?? null,
      closing_date: deal.closing_date ?? null,
      transaction_status: deal.transaction_status ?? null,
    };
  });
}

// Set once the database says post_split_history (migration 057) is missing, so later requests skip it.
let postSplitHistoryMissing = false;

// GET: Fetch non-archived commission breakdown items
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transaction_id');
    const submissionId = searchParams.get('submission_id');

    const { clientId, supabase } = await requireSessionClient();
    if (searchParams.get('view') === 'ledger') {
      const items = await loadCommissionLedgerRows(supabase, clientId);
      return NextResponse.json({ success: true, items });
    }
    if (searchParams.get('view') === 'post-split-history') {
      const list = (value: string | null) => (value || '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 40);
      const agentIds = list(searchParams.get('agent_ids'));
      const entityIds = list(searchParams.get('entity_ids'));
      const excludeId = searchParams.get('exclude_transaction_id') || '';
      if (agentIds.length === 0 || entityIds.length === 0) return NextResponse.json({ success: true, history: [] });
      const startedAt = Date.now();
      // One query when migration 057 is applied; otherwise the paged read below.
      if (!postSplitHistoryMissing) {
        const { data: joined, error: joinedError } = await supabase.rpc('post_split_history', {
          p_client_id: clientId,
          p_agent_ids: agentIds,
          p_entity_ids: entityIds,
          p_exclude_transaction_id: excludeId || null,
        });
        if (!joinedError && Array.isArray(joined)) {
          return NextResponse.json(
            { success: true, history: joined },
            { headers: { 'Server-Timing': `history;dur=${Date.now() - startedAt}` } },
          );
        }
        if (joinedError?.code === 'PGRST202') postSplitHistoryMissing = true;
      }
      const items = await fetchAllPages((offset, limit, withCount) => {
        let itemsQuery = supabase
          .from('transaction_commission_items')
          .select('final_amount, agent_id, payee_entity_id, section, transaction_id', withCount ? { count: 'exact' } : undefined)
          .eq('client_id', clientId)
          .in('agent_id', agentIds)
          .in('payee_entity_id', entityIds)
          .in('section', ['POST_SPLIT', 'POST_SPLIT_L2'])
          .or('archived.is.null,archived.eq.false')
          .order('id', { ascending: true })
          .range(offset, offset + limit - 1);
        if (excludeId) itemsQuery = itemsQuery.neq('transaction_id', excludeId);
        return itemsQuery;
      });
      const itemsMs = Date.now() - startedAt;
      const transactionIds = [...new Set(items.map((row) => String(row.transaction_id || '')).filter(Boolean))];
      const dates = new Map<string, string | null>();
      const slices: string[][] = [];
      for (let index = 0; index < transactionIds.length; index += 100) slices.push(transactionIds.slice(index, index + 100));
      // A few slices at a time, instead of one after another, keeps the cap history off the page's critical path.
      for (let index = 0; index < slices.length; index += 5) {
        const results = await Promise.all(slices.slice(index, index + 5).map((slice) => supabase
          .from('transactions')
          .select('id, closing_date, archived')
          .eq('client_id', clientId)
          .in('id', slice)));
        for (const { data: deals, error: dealsError } of results) {
          if (dealsError) throw dealsError;
          for (const deal of deals || []) {
            if (deal.archived) continue;
            dates.set(String(deal.id), deal.closing_date);
          }
        }
      }
      const datesMs = Date.now() - startedAt - itemsMs;
      return NextResponse.json({
        success: true,
        history: items.flatMap((row) => {
          const transactionId = String(row.transaction_id || '');
          if (!dates.has(transactionId)) return [];
          return [{
            agentId: String(row.agent_id || ''),
            entityId: String(row.payee_entity_id || ''),
            amount: Number(row.final_amount) || 0,
            closingDate: dates.get(transactionId) || null,
          }];
        }),
      }, { headers: { 'Server-Timing': `items;dur=${itemsMs}, dates;dur=${datesMs}` } });
    }

    let query = supabase
      .from('transaction_commission_items')
      .select('*')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('step_number', { ascending: true });

    if (transactionId) {
      query = query.eq('transaction_id', transactionId);
    }
    if (submissionId) {
      query = query.eq('submission_id', submissionId);
    }
    if (searchParams.has('offset')) {
      const offset = Math.max(0, Number(searchParams.get('offset')) || 0);
      const limit = Math.min(1000, Math.max(1, Number(searchParams.get('limit')) || 1000));
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, items: data || [] });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.', 'success');
  }
}

// POST: Upsert (Create or Update) commission line item
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const body = await request.json();
    const item = body.item || body;
    const action = body.action || 'UPDATE';

    if (!item || !item.id || !item.transaction_id) {
      return NextResponse.json(
        { error: 'Item ID and transaction ID are required' },
        { status: 400 }
      );
    }

    const user = session.user.email || item.updated_by || item.created_by || 'system_admin';

    const rowPayload = {
      id: String(item.id),
      client_id: clientId,
      transaction_id: String(item.transaction_id),
      submission_id: item.submission_id ? String(item.submission_id) : null,
      step_number: item.step_number !== undefined ? Number(item.step_number) : 1,
      section: item.section ? String(item.section) : null,
      payee_type: String(item.payee_type || 'AGENT'),
      payee_entity_id: item.payee_entity_id ? String(item.payee_entity_id) : null,
      agent_id: item.agent_id ? String(item.agent_id) : null,
      final_amount: item.final_amount !== undefined && item.final_amount !== ''
        ? Number(item.final_amount)
        : (item.calculated_amount !== undefined && item.calculated_amount !== '' ? Number(item.calculated_amount) : 0),
      archived: Boolean(item.archived),
      created_by: item.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: user,
    };

    const { data, error } = await supabase
      .from('transaction_commission_items')
      .upsert(rowPayload, { onConflict: 'id' })
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Commission item ${action} completed`,
      item: data ? data[0] : rowPayload,
    });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}

// DELETE: Archive commission line item
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const { error } = await supabase
      .from('transaction_commission_items')
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id)
      .eq('client_id', clientId);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Commission item archived successfully' });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
