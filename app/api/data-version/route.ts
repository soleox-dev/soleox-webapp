// app/api/data-version/route.ts
import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';

// GET: The active client's data version. It goes up on any change to data the Transactions page uses
// (see migration 052). `available: false` means it cannot be read, and callers then reload as usual.
export async function GET() {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const { data, error } = await supabase
      .from('client_data_versions')
      .select('version, changed_at')
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(
      { available: true, clientId, version: Number(data?.version ?? 0), changedAt: data?.changed_at ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error, 'The data version could not be read.');
  }
}
