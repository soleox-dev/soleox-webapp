import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadConnectedTmsIds } from '@/lib/google-sheet-connection';
import { resolveRequestTenant, apiError } from '@/lib/session';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase, tenant } = await resolveRequestTenant(request);
    const source = await loadConnectedTmsIds(supabase, tenant.clientId);
    return NextResponse.json({ success: true, ...source });
  } catch (error) {
    return apiError(error, 'The TMS IDs could not be loaded.', 'success');
  }
}
