import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch users (filterable by email, auth_provider_id, or agent_id)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    const email = searchParams.get('email');
    const authProviderId = searchParams.get('auth_provider_id');
    const agentId = searchParams.get('agent_id');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('web_users')
      .select('*')
      .or('archived.is.null,archived.eq.false')
      .order('email', { ascending: true });

    if (userId) {
      query = query.eq('id', userId);
    }
    if (email) {
      query = query.eq('email', email.toLowerCase().trim());
    }
    if (authProviderId) {
      query = query.eq('auth_provider_id', authProviderId);
    }
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, users: data || [] });
  } catch (error: any) {
    console.error('Error fetching web users:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update web user account profile
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const user = body.user || body;

    // 1. Validation: Email is strictly required. ID is optional for new records.
    if (!user || !user.email) {
      return NextResponse.json(
        { error: 'User Email is required' },
        { status: 400 }
      );
    }

    const primaryEmail = String(user.email).toLowerCase().trim();
    const existingId = user.id ? String(user.id) : null;
    const isUpdate = Boolean(existingId);
    const updatedBy = session.user.email || user.updated_by || user.created_by || 'system_admin';

    // 2. Format row payload matching schema
    const rowPayload: Record<string, any> = {
      auth_provider_id: user.auth_provider_id ? String(user.auth_provider_id) : null,
      email: primaryEmail,
      first_name: user.first_name ? String(user.first_name) : null,
      last_name: user.last_name ? String(user.last_name) : null,
      phone: user.phone ? String(user.phone) : null,
      avatar_url: user.avatar_url ? String(user.avatar_url) : null,
      agent_id: user.agent_id ? String(user.agent_id) : null,
      status: String(user.status || 'ACTIVE'),
      last_login_at: user.last_login_at ? new Date(user.last_login_at).toISOString() : null,
      archived: Boolean(user.archived),
      created_by: user.created_by || updatedBy,
      updated_at: new Date().toISOString(),
      updated_by: String(updatedBy),
    };

    // Attach ID only if updating an existing record explicitly
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 3. Upsert using primary key `id` or fallback to unique `email`
    const { data, error } = await supabase
      .from('web_users')
      .upsert(rowPayload, { onConflict: isUpdate ? 'id' : 'email' })
      .select();

    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `User account ${isUpdate ? 'updated' : 'saved'} successfully`,
      user: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Web User Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Archive web user account
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('web_users')
      .update({
        archived: true,
        status: 'SUSPENDED',
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'User account archived successfully' });
  } catch (error: any) {
    console.error('Supabase Web User Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
