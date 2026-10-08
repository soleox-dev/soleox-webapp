import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveRequestTenant, responseStatus } from '@/lib/session';
import { callerIsAdmin, suggestMappings } from '@/lib/google-sheet-connection';
import { parseSpreadsheetId, readGoogleSheet } from '@/lib/google-sheets';
import { DEFAULT_SHEET_TAB, catalogFromFields } from '@/lib/transaction-sync';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { supabase, tenant } = await resolveRequestTenant(request, body.clientId);
    if (!await callerIsAdmin(supabase, tenant.clientId)) {
      return NextResponse.json({ success: false, error: 'Only an admin can read the spreadsheet.' }, { status: 403 });
    }
    const spreadsheetId = parseSpreadsheetId(String(body.spreadsheetId ?? body.spreadsheet ?? ''));
    if (!spreadsheetId) {
      return NextResponse.json({ success: false, error: 'Enter a Google Sheets link or spreadsheet ID.' }, { status: 400 });
    }
    const tabName = String(body.tabName ?? body.tab_name ?? DEFAULT_SHEET_TAB).trim() || DEFAULT_SHEET_TAB;
    const table = await readGoogleSheet(spreadsheetId, tabName);
    const { data: fields, error } = await supabase
      .from('client_field_configurations')
      .select('field_key, field_label, field_type, storage_type, calculation_formula')
      .eq('client_id', tenant.clientId)
      .eq('target_table', 'transactions')
      .or('archived.is.null,archived.eq.false');
    if (error) throw new Error(error.message);
    const catalog = catalogFromFields(fields || []);
    return NextResponse.json({
      success: true,
      spreadsheetId,
      headers: table.headers,
      rowCount: table.rows.length,
      mappings: suggestMappings(table.headers, catalog),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The spreadsheet could not be read.';
    return NextResponse.json({ success: false, error: message }, { status: responseStatus(error) });
  }
}
