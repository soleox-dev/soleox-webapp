import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getClientLookupValues } from '@/lib/fields';
import { getTenantContext } from '@/lib/session';

// GET: Active lookup values for a category, ordered by sort_order
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category')?.trim();
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    const headerClientId = request.headers.get('x-client-id') || request.headers.get('client_id');
    const tenant = await getTenantContext(headerClientId, supabase);
    const lookupValues = await getClientLookupValues(tenant.clientId, category, supabase);

    return NextResponse.json({ lookup_values: lookupValues });
  } catch (error: any) {
    console.error('Supabase Client Lookup Value Fetch Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update Client Lookup Value
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const lookup = body.lookup_value || body;

    // 1. Validation: Category, Code, and Label are required. ID is optional for creation.
    if (!lookup || !lookup.category || !lookup.lookup_code || !lookup.lookup_label) {
      return NextResponse.json(
        { error: 'Category, Lookup Code, and Lookup Label are required' },
        { status: 400 }
      );
    }

    const existingId = lookup.id ? String(lookup.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || lookup.updated_by || lookup.created_by || 'system_admin';

    // 2. Format row payload
    const rowPayload: Record<string, any> = {
      client_id: String(lookup.client_id || 'DEMO'),
      category: String(lookup.category),
      lookup_code: String(lookup.lookup_code),
      lookup_label: String(lookup.lookup_label),
      sort_order: lookup.sort_order !== undefined ? Number(lookup.sort_order) : 0,
      is_active: lookup.is_active !== undefined ? Boolean(lookup.is_active) : true,
      archived: Boolean(lookup.archived),
      created_by: lookup.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 3. Insert or Upsert
    let query;
    if (isUpdate) {
      query = supabase
        .from('client_lookup_values')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new lookup value (Postgres triggers generate_prefixed_id('CLV'))
      query = supabase
        .from('client_lookup_values')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Lookup value ${isUpdate ? 'updated' : 'created'} successfully`,
      lookup_value: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Client Lookup Value Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
