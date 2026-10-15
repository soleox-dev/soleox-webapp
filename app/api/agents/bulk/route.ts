import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bulkDeleteAgents, bulkUpdateAgents } from '@/lib/agent-bulk';
import { getAuthenticatedSupabase } from '@/lib/supabase';

function clientIdFrom(request: Request, body: { clientId?: unknown }): string {
  return String(body.clientId || request.headers.get('x-client-id') || request.headers.get('client_id') || 'DEMO');
}

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

    const supabase = await getAuthenticatedSupabase();
    const result = await bulkUpdateAgents(supabase, {
      clientId: clientIdFrom(request, body),
      userId: session.user.email,
      ids: idsFrom(body),
      fieldKey,
      rawValue,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Error in POST /api/agents/bulk:', error);
    const message = error instanceof Error ? error.message : 'Server error';
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const supabase = await getAuthenticatedSupabase();
    const result = await bulkDeleteAgents(supabase, {
      clientId: clientIdFrom(request, body),
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
    const message = error instanceof Error ? error.message : 'Server error';
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
