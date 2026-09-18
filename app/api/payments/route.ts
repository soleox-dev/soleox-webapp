import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch non-archived payment records
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = request.headers.get('x-client-id') || request.headers.get('client_id') || searchParams.get('client_id') || 'DEMO';
    const transactionId = searchParams.get('transaction_id');
    const commissionItemId = searchParams.get('commission_item_id');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('payments')
      .select('*')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('payment_date', { ascending: false });

    if (transactionId) {
      query = query.eq('transaction_id', transactionId);
    }
    if (commissionItemId) {
      query = query.eq('commission_item_id', commissionItemId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, payments: data || [] });
  } catch (error: any) {
    console.error('Error fetching payment records:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update payment record
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const payment = body.payment || body;

    // 1. Validation: Transaction ID is required. ID is optional for new records.
    if (!payment || !payment.transaction_id) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    const existingId = payment.id ? String(payment.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || payment.updated_by || payment.created_by || 'system_admin';

    const sanitizeDate = (val?: string) =>
      val && String(val).trim() !== '' ? String(val).substring(0, 10) : null;

    // 2. Format row payload matching schema
    const rowPayload: Record<string, any> = {
      client_id: String(payment.client_id || 'DEMO'),
      transaction_id: String(payment.transaction_id),
      commission_item_id: payment.commission_item_id ? String(payment.commission_item_id) : null,
      amount_paid: payment.amount_paid !== undefined && payment.amount_paid !== '' ? Number(payment.amount_paid) : 0,
      payment_date: sanitizeDate(payment.payment_date),
      payment_method: String(payment.payment_method || 'ACH'),
      reference_number: payment.reference_number ? String(payment.reference_number) : null,
      payment_status: String(payment.payment_status || 'COMPLETED'),
      notes: payment.notes ? String(payment.notes) : null,
      archived: Boolean(payment.archived),
      created_by: payment.created_by || user,
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
        .from('payments')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new payment (Postgres will trigger generate_prefixed_id('PAY'))
      query = supabase
        .from('payments')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Payment record ${isUpdate ? 'updated' : 'created'} successfully`,
      payment: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Payment Record Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Soft delete / archive payment record
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('payments')
      .update({
        archived: true,
        payment_status: 'VOIDED',
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Payment record voided and archived successfully' });
  } catch (error: any) {
    console.error('Supabase Payment Record Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
