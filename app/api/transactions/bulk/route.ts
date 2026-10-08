import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { bulkUpdateTransactions } from '@/lib/transaction-bulk';
import { deleteTransactions } from '@/lib/transactions';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const clientId = String(body.clientId || request.headers.get('x-client-id') || request.headers.get('client_id') || 'DEMO');
    const fieldKey = String(body.fieldKey || '').trim();
    const rawValue = body.value === undefined || body.value === null ? '' : String(body.value);
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)) : [];
    if (!fieldKey) {
      return NextResponse.json({ success: false, error: 'Choose a field to update.' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const result = await bulkUpdateTransactions(supabase, {
      clientId,
      userId: session.user.email,
      ids,
      fieldKey,
      rawValue,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Error in POST /api/transactions/bulk:', error);
    const message = error instanceof Error ? error.message : 'Server error';
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const clientId = String(body.clientId || request.headers.get('x-client-id') || request.headers.get('client_id') || 'DEMO');
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)) : [];
    const supabase = await getAuthenticatedSupabase();
    const result = await deleteTransactions(clientId, ids, session.user.email, supabase);
    const failed = result.deleted.length === 0 && result.errors.length > 0;
    return NextResponse.json(
      { success: result.errors.length === 0, ...result },
      { status: failed ? 400 : 200 },
    );
  } catch (error: unknown) {
    console.error('Error in DELETE /api/transactions/bulk:', error);
    const message = error instanceof Error ? error.message : 'Server error';
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
