import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSessionClient, apiError } from '@/lib/session';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

async function readClientPages(
  page: (offset: number, limit: number, withCount: boolean) => PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }>,
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  const first = await page(0, pageSize, true);
  if (first.error) throw first.error;
  const rows = (Array.isArray(first.data) ? first.data : []) as Record<string, unknown>[];
  const total = first.count ?? rows.length;
  const offsets: number[] = [];
  for (let offset = pageSize; offset < total && offset < 50000; offset += pageSize) offsets.push(offset);
  if (offsets.length === 0) return rows;
  const rest = await Promise.all(offsets.map(async (offset) => {
    const result = await page(offset, pageSize, false);
    if (result.error) throw result.error;
    return (Array.isArray(result.data) ? result.data : []) as Record<string, unknown>[];
  }));
  return rows.concat(...rest);
}

/** Commission lines plus the closing day and status SUMIFS needs, without the rest of each row. */
async function loadCommissionLedgerRows(supabase: SupabaseClient, clientId: string) {
  const [items, deals] = await Promise.all([
    readClientPages((offset, limit, withCount) => supabase
      .from('transaction_commission_items')
      .select('final_amount, agent_id, payee_entity_id, section, transaction_id', withCount ? { count: 'exact' } : undefined)
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)),
    readClientPages((offset, limit, withCount) => supabase
      .from('transactions')
      .select('id, closing_date, transaction_status', withCount ? { count: 'exact' } : undefined)
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)),
  ]);

  const byId = new Map(deals.map((deal) => [String(deal.id || ''), deal]));
  return items.map((item) => {
    const deal = byId.get(String(item.transaction_id || '')) || {};
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
    return apiError(error, 'The request could not be completed.');
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
        { error: 'Item ID and Transaction ID are required' },
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
