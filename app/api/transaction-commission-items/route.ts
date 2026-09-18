import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch non-archived commission breakdown items
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = request.headers.get('x-client-id') || request.headers.get('client_id') || searchParams.get('client_id') || 'DEMO';
    const transactionId = searchParams.get('transaction_id');
    const submissionId = searchParams.get('submission_id');

    const supabase = await getAuthenticatedSupabase();
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

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, items: data || [] });
  } catch (error: any) {
    console.error('Error fetching transaction commission items:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Upsert (Create or Update) commission line item
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const item = body.item || body;
    const action = body.action || 'UPDATE';

    if (!item || !item.id || !item.transaction_id || !item.rule_name) {
      return NextResponse.json(
        { error: 'Item ID, Transaction ID, and Rule Name are required' },
        { status: 400 }
      );
    }

    const user = session.user.email || item.updated_by || item.created_by || 'system_admin';

    const rowPayload = {
      id: String(item.id),
      client_id: String(item.client_id || 'DEMO'),
      transaction_id: String(item.transaction_id),
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
    console.error('Supabase Commission Item Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
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

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('transaction_commission_items')
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Commission item archived successfully' });
  } catch (error: any) {
    console.error('Supabase Commission Item Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
