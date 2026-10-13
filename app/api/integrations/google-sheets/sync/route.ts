import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveRequestTenant, responseStatus } from '@/lib/session';
import { callerCanSyncTransactions } from '@/lib/google-sheet-connection';
import { GOOGLE_SHEETS_PROVIDER } from '@/lib/transaction-sync';
import { syncGoogleSheetConnection } from '@/lib/transaction-sync-run';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const { supabase, tenant } = await resolveRequestTenant(request, body.clientId);
    if (!await callerCanSyncTransactions(supabase, tenant.clientId)) {
      return NextResponse.json({ success: false, error: 'You do not have access to sync transactions.' }, { status: 403 });
    }
    const transactionIds = Array.isArray(body.transactionIds)
      ? body.transactionIds.map((id: unknown) => String(id || '').trim()).filter(Boolean).slice(0, 2000)
      : [];
    const { data: connection, error } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('client_id', tenant.clientId)
      .eq('provider', GOOGLE_SHEETS_PROVIDER)
      .or('archived.is.null,archived.eq.false')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!connection?.id) {
      return NextResponse.json({ success: false, error: 'Connect a spreadsheet before syncing.' }, { status: 400 });
    }
    const result = await syncGoogleSheetConnection(supabase, tenant.clientId, String(connection.id), {
      requireEnabled: false,
      ...(transactionIds.length > 0 ? { transactionIds } : {}),
    });
    const status = result.status === 'failed' ? 500 : result.status === 'blocked' ? 400 : 200;
    return NextResponse.json({ success: result.status === 'succeeded', run: result }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed.';
    return NextResponse.json({ success: false, error: message }, { status: responseStatus(error) });
  }
}
