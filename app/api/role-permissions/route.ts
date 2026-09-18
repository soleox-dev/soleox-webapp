import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch role permissions (filterable by role or resource)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const resource = searchParams.get('resource');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('role_permissions')
      .select('*')
      .order('role', { ascending: true })
      .order('resource', { ascending: true });

    if (role) {
      query = query.eq('role', role.toUpperCase());
    }
    if (resource) {
      query = query.eq('resource', resource.toLowerCase());
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, permissions: data || [] });
  } catch (error: any) {
    console.error('Error fetching role permissions:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update role permission entry
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const perm = body.permission || body;

    // 1. Validation: Role and Resource are required. ID is optional for new entries.
    if (!perm || !perm.role || !perm.resource) {
      return NextResponse.json(
        { error: 'Role and Resource are required' },
        { status: 400 }
      );
    }

    const existingId = perm.id ? String(perm.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || perm.updated_by || perm.created_by || 'system_admin';

    // 2. Format row payload matching schema
    const rowPayload: Record<string, any> = {
      role: String(perm.role).toUpperCase(),
      resource: String(perm.resource).toLowerCase(),
      can_read: Boolean(perm.can_read),
      can_create: Boolean(perm.can_create),
      can_update: Boolean(perm.can_update),
      can_delete: Boolean(perm.can_delete),
      can_approve_payouts: Boolean(perm.can_approve_payouts),
      created_by: perm.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    // Attach ID only if updating an existing record explicitly
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 3. Upsert using primary key `id` or composite constraint `role,resource`
    const { data, error } = await supabase
      .from('role_permissions')
      .upsert(rowPayload, { onConflict: isUpdate ? 'id' : 'role,resource' })
      .select();

    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Role permission ${isUpdate ? 'updated' : 'saved'} successfully`,
      permission: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Role Permission Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Remove permission entry
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Permission ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Permission entry removed successfully' });
  } catch (error: any) {
    console.error('Supabase Role Permission Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
