import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveRequestTenant, apiError } from '@/lib/session';
import { callerIsAdmin, loadGoogleSheetIntegration, saveGoogleSheetIntegration } from '@/lib/google-sheet-connection';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase, tenant } = await resolveRequestTenant(request);
    const integration = await loadGoogleSheetIntegration(supabase, tenant.clientId);
    return NextResponse.json({ success: true, ...integration });
  } catch (error) {
    return apiError(error, 'The integration could not be loaded.', 'success');
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { supabase, tenant } = await resolveRequestTenant(request, body.clientId);
    if (!await callerIsAdmin(supabase, tenant.clientId)) {
      return NextResponse.json({ success: false, error: 'Only an admin can change the integration.' }, { status: 403 });
    }
    const saved = await saveGoogleSheetIntegration(supabase, tenant.clientId, session.user.email, {
      spreadsheet: String(body.spreadsheetId ?? body.spreadsheet ?? ''),
      tabName: String(body.tabName ?? body.tab_name ?? ''),
      tmsName: String(body.tmsName ?? body.tms_name ?? ''),
      enabled: Boolean(body.enabled),
      mappings: body.mappings,
    });
    if (saved.error) return NextResponse.json({ success: false, error: saved.error }, { status: saved.status });
    const integration = await loadGoogleSheetIntegration(supabase, tenant.clientId);
    return NextResponse.json({ success: true, ...integration });
  } catch (error) {
    return apiError(error, 'The integration could not be saved.', 'success');
  }
}
