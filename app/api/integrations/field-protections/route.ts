import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveRequestTenant, responseStatus } from '@/lib/session';
import { callerIsAdmin } from '@/lib/google-sheet-connection';

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const { supabase, tenant } = await resolveRequestTenant(request, body.clientId);
    if (!await callerIsAdmin(supabase, tenant.clientId)) {
      return NextResponse.json({ success: false, error: 'Only an admin can clear a field lock.' }, { status: 403 });
    }
    const protectionId = String(body.id || '').trim();
    if (!protectionId) {
      return NextResponse.json({ success: false, error: 'Choose a field lock to clear.' }, { status: 400 });
    }
    const { error } = await supabase
      .from('transaction_field_protections')
      .delete()
      .eq('id', protectionId)
      .eq('client_id', tenant.clientId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The field lock could not be cleared.';
    return NextResponse.json({ success: false, error: message }, { status: responseStatus(error) });
  }
}
