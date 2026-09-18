import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch user roles by user_id or client_id
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const clientId = searchParams.get('client_id');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('client_user_roles')
      .select('*')
      .eq('is_active', true)
      .order('is_primary_team', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, roles: data || [] });
  } catch (error: any) {
    console.error('Error fetching client user roles:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update user role assignment
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const roleMapping = body.role_mapping || body.role || body;

    // 1. Validation: user_id and client_id are strictly required. ID is optional for new records.
    if (!roleMapping || !roleMapping.user_id || !roleMapping.client_id) {
      return NextResponse.json(
        { error: 'User ID and Client ID are required' },
        { status: 400 }
      );
    }

    const existingId = roleMapping.id ? String(roleMapping.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || roleMapping.updated_by || roleMapping.created_by || 'system_admin';

    // 2. Unset primary team flag on other assignments if this role is designated primary
    if (roleMapping.is_primary_team) {
      await supabase
        .from('client_user_roles')
        .update({ is_primary_team: false, updated_at: new Date().toISOString() })
        .eq('user_id', String(roleMapping.user_id));
    }

    // 3. Format row payload
    const rowPayload: Record<string, any> = {
      user_id: String(roleMapping.user_id),
      client_id: String(roleMapping.client_id),
      role: String(roleMapping.role || 'AGENT'),
      agent_access_scope: String(roleMapping.agent_access_scope || 'OWN_TRANSACTIONS'),
      is_primary_team: roleMapping.is_primary_team !== undefined ? Boolean(roleMapping.is_primary_team) : true,
      is_active: roleMapping.is_active !== undefined ? Boolean(roleMapping.is_active) : true,
      created_by: roleMapping.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    // Attach ID only if updating an existing record explicitly
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 4. Upsert using unique constraint on (user_id, client_id) or primary key `id`
    const { data, error } = await supabase
      .from('client_user_roles')
      .upsert(rowPayload, { onConflict: isUpdate ? 'id' : 'user_id,client_id' })
      .select();

    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `User role assignment ${isUpdate ? 'updated' : 'saved'} successfully`,
      role_mapping: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Client User Role Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Deactivate role mapping
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Role Mapping ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('client_user_roles')
      .update({
        is_active: false,
        is_primary_team: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'User role access revoked successfully' });
  } catch (error: any) {
    console.error('Supabase Client User Role Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
