import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireSessionClient, apiError } from '@/lib/session';
import { bulkUpdateTransactions } from '@/lib/transaction-bulk';
import { deleteTransactions } from '@/lib/transactions';
import { recordAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { clientId, supabase } = await requireSessionClient();
    const fieldKey = String(body.fieldKey || '').trim();
    const rawValue = body.value === undefined || body.value === null ? '' : String(body.value);
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)) : [];
    if (!fieldKey) {
      return NextResponse.json({ success: false, error: 'Choose a field to update.' }, { status: 400 });
    }

    const result = await bulkUpdateTransactions(supabase, {
      clientId,
      userId: session.user.email,
      ids,
      fieldKey,
      rawValue,
    });
    if (result.updated > 0) {
      await recordAudit(supabase, {
        clientId,
        actorEmail: session.user.email,
        action: 'update',
        entity: 'transaction',
        summary: `Updated ${fieldKey} on ${result.updated} transaction${result.updated === 1 ? '' : 's'}`,
        detail: { fieldKey, updated: result.updated },
      });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Error in POST /api/transactions/bulk:', error);
    return apiError(error, 'Server error', 'success');
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { clientId, supabase } = await requireSessionClient();
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)) : [];
    const result = await deleteTransactions(clientId, ids, session.user.email, supabase);
    const failed = result.deleted.length === 0 && result.errors.length > 0;
    return NextResponse.json(
      { success: result.errors.length === 0, ...result },
      { status: failed ? 400 : 200 },
    );
  } catch (error: unknown) {
    console.error('Error in DELETE /api/transactions/bulk:', error);
    return apiError(error, 'Server error', 'success');
  }
}
