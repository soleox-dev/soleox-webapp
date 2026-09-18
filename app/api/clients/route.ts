import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch active client accounts
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('id');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('clients')
      .select('*')
      .or('archived.is.null,archived.eq.false')
      .order('client_name', { ascending: true });

    if (clientId) {
      query = query.eq('id', clientId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, clients: data || [] });
  } catch (error: any) {
    console.error('Error fetching clients:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update client account
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const client = body.client || body;

    // 1. Validation: Client Name is required. ID is optional for creation.
    if (!client || !client.client_name) {
      return NextResponse.json(
        { error: 'Client Name is required' },
        { status: 400 }
      );
    }

    const existingId = client.id ? String(client.id).toUpperCase().trim() : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || client.updated_by || client.created_by || 'system_admin';

    // 2. Format row payload matching Postgres types
    const rowPayload: Record<string, any> = {
      client_name: String(client.client_name),
      status: String(client.status || 'ACTIVE'),
      client_type: String(client.client_type || 'TEAM'),
      track_detailed_payments: client.track_detailed_payments !== undefined ? Boolean(client.track_detailed_payments) : true,
      require_compliance_approval: client.require_compliance_approval !== undefined ? Boolean(client.require_compliance_approval) : true,
      subscription_plan: String(client.subscription_plan || 'STARTER'),
      subscription_status: String(client.subscription_status || 'ACTIVE'),
      billing_email: client.billing_email ? String(client.billing_email) : null,
      max_users: client.max_users !== undefined && client.max_users !== '' ? Number(client.max_users) : null,
      logo_url: client.logo_url ? String(client.logo_url) : null,
      primary_color: client.primary_color ? String(client.primary_color) : null,
      custom_domain: client.custom_domain ? String(client.custom_domain) : null,
      currency_code: String(client.currency_code || 'USD'),
      default_financial_visibility: String(client.default_financial_visibility || 'FULL'),
      settings_json: typeof client.settings_json === 'object' ? client.settings_json : {},
      archived: Boolean(client.archived),
      created_by: client.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    // Attach ID only if updating an existing record explicitly
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 3. Insert or Upsert
    let query;
    if (isUpdate) {
      query = supabase
        .from('clients')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new client (Postgres will trigger generate_prefixed_id('CLI'))
      query = supabase
        .from('clients')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Client account ${isUpdate ? 'updated' : 'created'} successfully`,
      client: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Client Account Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Soft delete / archive client account
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('clients')
      .update({
        archived: true,
        status: 'SUSPENDED',
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Client account archived successfully' });
  } catch (error: any) {
    console.error('Supabase Client Account Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
