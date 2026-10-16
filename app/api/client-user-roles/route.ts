import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';
import { recordAudit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch user roles by user_id or client_id
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const { clientId, supabase } = await requireSessionClient();
    let query = supabase
      .from('client_user_roles')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('is_primary_team', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, roles: data || [] });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}

// POST: Create or Update user role assignment
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const body = await request.json();
    const roleMapping = body.role_mapping || body.role || body;

    if (!roleMapping || !roleMapping.user_id) {
      return NextResponse.json(
        { error: 'User ID is required' },
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
      client_id: clientId,
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
    await recordAudit(supabase, {
      clientId,
      actorEmail: session.user.email,
      action: isUpdate ? 'update' : 'create',
      entity: 'permission',
      entityId: returnedRow.id ? String(returnedRow.id) : null,
      summary: `${isUpdate ? 'Changed' : 'Granted'} ${returnedRow.role || 'a permission'} for user ${returnedRow.user_id}`,
      detail: { role: returnedRow.role, userId: returnedRow.user_id, active: returnedRow.is_active },
    });

    return NextResponse.json({
      success: true,
      message: `User role assignment ${isUpdate ? 'updated' : 'saved'} successfully`,
      role_mapping: returnedRow,
    });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
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

    const { clientId, supabase } = await requireSessionClient();
    const { data: existing } = await supabase
      .from('client_user_roles')
      .select('id, role, user_id')
      .eq('id', id)
      .eq('client_id', clientId)
      .maybeSingle();
    const { error } = await supabase
      .from('client_user_roles')
      .update({
        is_active: false,
        is_primary_team: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('client_id', clientId);

    if (error) throw error;
    await recordAudit(supabase, {
      clientId,
      actorEmail: session.user.email,
      action: 'delete',
      entity: 'permission',
      entityId: id,
      summary: existing ? `Revoked ${existing.role} for user ${existing.user_id}` : 'Revoked a permission',
    });

    return NextResponse.json({ success: true, message: 'User role access revoked successfully' });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
