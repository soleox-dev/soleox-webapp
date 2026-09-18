import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TransactionCommissionItem } from '@/types/schema';

// GET: Fetch non-archived commission breakdown items for a specific transaction
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: transactionId } = await context.params;
  const clientId = request.headers.get('x-client-id') || 'DEMO';

  try {
    const supabase = await getAuthenticatedSupabase();
    const { data, error } = await supabase
      .from('transaction_commission_items')
      .select(`
        id,
        client_id,
        transaction_id,
        submission_id,
        step_number,
        rule_name,
        section,
        payee_type,
        payee_entity_id,
        agent_id,
        calculated_amount,
        final_amount,
        is_manual_override,
        override_reason
      `)
      .eq('transaction_id', transactionId)
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('step_number', { ascending: true });

    if (error) throw error;

    // Cast numeric fields explicitly to match your TransactionCommissionItem interface
    const items: TransactionCommissionItem[] = (data || []).map((row: any) => ({
      ...row,
      step_number: Number(row.step_number || 0),
      calculated_amount: Number(row.calculated_amount || 0),
      final_amount: Number(row.final_amount || 0),
    }));

    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    console.error('Error fetching transaction commission items:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

// POST: Create or Update commission breakdown item for a specific transaction
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: transactionId } = await context.params;
  const clientId = request.headers.get('x-client-id') || 'DEMO';

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const item = body.item || body;

    // 1. Validation: Rule Name is required. ID is optional for new records.
    if (!item || !item.rule_name) {
      return NextResponse.json(
        { error: 'Rule Name is required' },
        { status: 400 }
      );
    }

    const existingId = item.id ? String(item.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || item.updated_by || item.created_by || 'system_admin';

    // 2. Format row payload matching schema
    const rowPayload: Record<string, any> = {
      client_id: String(item.client_id || clientId),
      transaction_id: String(transactionId),
      submission_id: item.submission_id ? String(item.submission_id) : null,
      step_number: item.step_number !== undefined ? Number(item.step_number) : 1,
      rule_name: String(item.rule_name),
      section: item.section ? String(item.section) : null,
      payee_type: String(item.payee_type || 'AGENT'),
      payee_entity_id: item.payee_entity_id ? String(item.payee_entity_id) : null,
      agent_id: item.agent_id ? String(item.agent_id) : null,
      calculated_amount: item.calculated_amount !== undefined && item.calculated_amount !== '' ? Number(item.calculated_amount) : 0,
      final_amount: item.final_amount !== undefined && item.final_amount !== '' ? Number(item.final_amount) : 0,
      is_manual_override: Boolean(item.is_manual_override),
      override_reason: item.override_reason ? String(item.override_reason) : null,
      archived: Boolean(item.archived),
      created_by: item.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    // Attach ID only if updating an existing record explicitly
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 3. Insert or Upsert
    let query;
    if (isUpdate) {
      query = supabase
        .from('transaction_commission_items')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new line item (Postgres triggers generate_prefixed_id('TCI'))
      query = supabase
        .from('transaction_commission_items')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Commission item ${isUpdate ? 'updated' : 'created'} successfully`,
      item: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Transaction Commission Item Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
