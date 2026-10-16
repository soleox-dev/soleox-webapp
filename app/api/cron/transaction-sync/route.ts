import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { GOOGLE_SHEETS_PROVIDER } from '@/lib/transaction-sync';
import { syncGoogleSheetConnection } from '@/lib/transaction-sync-run';
import { apiError } from '@/lib/session';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return bearer === secret || request.headers.get('x-cron-secret') === secret;
}

async function run() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 500 });
  }
  const { data: connections, error } = await supabaseAdmin
    .from('integration_connections')
    .select('id, client_id')
    .eq('provider', GOOGLE_SHEETS_PROVIDER)
    .eq('enabled', true)
    .or('archived.is.null,archived.eq.false');
  if (error) {
    return apiError(error, 'The request could not be completed.', 'success');
  }

  const results = [];
  for (const connection of connections || []) {
    try {
      const runResult = await syncGoogleSheetConnection(supabaseAdmin, String(connection.client_id), String(connection.id));
      await recordAudit(supabaseAdmin, {
        clientId: String(connection.client_id),
        actorEmail: 'scheduled sync',
        action: 'sync',
        entity: 'sync',
        entityId: runResult.id,
        summary: `Scheduled sync. ${runResult.createdCount ?? 0} added, ${runResult.updatedCount ?? 0} updated, ${runResult.errorCount ?? 0} errors.`,
        detail: { status: runResult.status },
      });
      results.push({ clientId: connection.client_id, connectionId: connection.id, ...runResult });
    } catch (err) {
      results.push({
        clientId: connection.client_id,
        connectionId: connection.id,
        status: 'failed',
        message: err instanceof Error ? err.message : 'Sync failed.',
      });
    }
  }
  return NextResponse.json({ success: true, results });
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return run();
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return run();
}
