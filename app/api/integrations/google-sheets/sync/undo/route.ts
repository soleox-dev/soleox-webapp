import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveRequestTenant, apiError } from '@/lib/session';
import { callerCanSyncTransactions } from '@/lib/google-sheet-connection';
import { SyncUndoError, undoSyncRun } from '@/lib/transaction-sync-undo';
import { recordAudit } from '@/lib/audit';

/** Undo the latest Sync with TMS. `dryRun: true` reports what would change without writing. */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const runId = String(body.runId || '').trim();
    if (!/^ISR_[A-F0-9]{12}$/.test(runId)) {
      return NextResponse.json({ success: false, error: 'Choose a sync to undo.' }, { status: 400 });
    }
    const dryRun = body.dryRun === true;
    const { supabase, tenant } = await resolveRequestTenant(request, body.clientId);
    if (!await callerCanSyncTransactions(supabase, tenant.clientId)) {
      return NextResponse.json({ success: false, error: 'You do not have access to undo a sync.' }, { status: 403 });
    }

    const result = await undoSyncRun(supabase, tenant.clientId, runId, session.user.email, { dryRun });
    if (!dryRun) {
      const fieldCount = result.reverted.reduce((sum, row) => sum + row.fields.length, 0);
      await recordAudit(supabase, {
        clientId: tenant.clientId,
        actorEmail: session.user.email,
        action: 'undo',
        entity: 'sync',
        entityId: runId,
        summary: `Undid Sync with TMS. ${result.reverted.length} restored (${fieldCount} fields), ${result.removed.length} removed, ${result.skipped.length} kept, ${result.errors.length} errors.`,
        detail: {
          restored: result.reverted.length,
          fields: fieldCount,
          removed: result.removed.map((row) => row.transactionId),
          kept: result.skipped.length,
          errors: result.errors.length,
          fromFormattedValues: result.fromFormattedValues,
        },
      });
    }
    return NextResponse.json({ success: result.errors.length === 0, result });
  } catch (error) {
    if (error instanceof SyncUndoError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return apiError(error, 'The sync could not be undone.', 'success');
  }
}
