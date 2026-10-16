import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bulkDeleteAgents, bulkUpdateAgents } from '@/lib/agent-bulk';
import { requireSessionClient, apiError } from '@/lib/session';

function idsFrom(body: { ids?: unknown }): string[] {
  return Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)) : [];
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const fieldKey = String(body.fieldKey || '').trim();
    const rawValue = body.value === undefined || body.value === null ? '' : String(body.value);
    if (!fieldKey) {
      return NextResponse.json({ success: false, error: 'Choose a field to update.' }, { status: 400 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const result = await bulkUpdateAgents(supabase, {
      clientId,
      userId: session.user.email,
      ids: idsFrom(body),
      fieldKey,
      rawValue,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Error in POST /api/agents/bulk:', error);
    return apiError(error, 'Server error', 'success');
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { clientId, supabase } = await requireSessionClient();
    const result = await bulkDeleteAgents(supabase, {
      clientId,
      userId: session.user.email,
      ids: idsFrom(body),
    });
    const failed = result.deleted.length === 0 && result.errors.length > 0 && result.skipped === 0;
    return NextResponse.json(
      { success: result.errors.length === 0, ...result },
      { status: failed ? 400 : 200 },
    );
  } catch (error: unknown) {
    console.error('Error in DELETE /api/agents/bulk:', error);
    return apiError(error, 'Server error', 'success');
  }
}
