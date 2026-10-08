import { NextResponse } from 'next/server';
import { permanentlyDeleteTransaction, restoreTransaction } from '@/lib/transactions';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim();
    const clientId = String(body.clientId || request.headers.get('x-client-id') || request.headers.get('client_id') || 'DEMO');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Transaction ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    if (action === 'restore') {
      await restoreTransaction(clientId, id, session.user.email, supabase);
    } else if (action === 'permanent') {
      await permanentlyDeleteTransaction(clientId, id, session.user.email, supabase);
    } else {
      return NextResponse.json({ success: false, error: 'Choose restore or permanent.' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/transactions/lifecycle:', error);
    const message = error.message || 'Server error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('not found') || message.includes('permanently deleted') ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
