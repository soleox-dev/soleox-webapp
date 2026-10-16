import { NextResponse } from 'next/server';
import { permanentlyDeleteTransaction, restoreTransaction } from '@/lib/transactions';
import { requireSessionClient, apiError } from '@/lib/session';
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
    const { clientId, supabase } = await requireSessionClient();

    if (!id) {
      return NextResponse.json({ success: false, error: 'Transaction ID is required' }, { status: 400 });
    }
    if (action === 'restore') {
      await restoreTransaction(clientId, id, session.user.email, supabase);
    } else if (action === 'permanent') {
      await permanentlyDeleteTransaction(clientId, id, session.user.email, supabase);
    } else {
      return NextResponse.json({ success: false, error: 'Choose restore or permanent.' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.', 'success');
  }
}
