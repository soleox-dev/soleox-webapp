import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getTenantContext } from '@/lib/session';
import { formulaLookupSource } from '@/lib/formula-lookup-tables';

// GET: One page of a client-scoped table for formula XLOOKUP.
// Rows are limited to the signed-in user's active client. Tables without client_id are rejected.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requested = searchParams.get('table') || '';
    const table = formulaLookupSource(requested);
    if (!table) {
      return NextResponse.json({ error: 'That table cannot be used in a formula lookup.' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const headerClientId = request.headers.get('x-client-id') || request.headers.get('client_id') || searchParams.get('client_id');
    const tenant = await getTenantContext(headerClientId, supabase);
    const clientId = tenant.clientId;

    const offset = Math.max(0, Number(searchParams.get('offset')) || 0);
    const limit = Math.min(1000, Math.max(1, Number(searchParams.get('limit')) || 1000));

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('client_id', clientId)
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const rows = (data || []).filter((row) => String(row.client_id || '') === clientId);

    return NextResponse.json({ success: true, client_id: clientId, table, rows });
  } catch (error: any) {
    console.error('Error fetching formula lookups:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
