// app/api/data-version/route.ts
import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';

const MAX_CHANGED_TRANSACTIONS = 50;

// GET: The active client's data version. It goes up on any change to data the Transactions page uses
// (see migration 052). `available: false` means it cannot be read, and callers then reload as usual.
// With `since=<version>`, `changes` says whether everything after that version touched only a few known
// transactions (migration 056). `changes.complete` is false whenever that cannot be told for certain.
export async function GET(request: Request) {
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
    const version = Number(data?.version ?? 0);
    const sinceParam = new URL(request.url).searchParams.get('since');
    const since = sinceParam !== null && /^\d+$/.test(sinceParam) ? Number(sinceParam) : null;
    const changes = since === null ? undefined : await changesSince(supabase, clientId, since, version);
    return NextResponse.json(
      { available: true, clientId, version, changedAt: data?.changed_at ?? null, ...(changes ? { changes } : {}) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error, 'The data version could not be read.');
  }
}

async function changesSince(
  supabase: Awaited<ReturnType<typeof requireSessionClient>>['supabase'],
  clientId: string,
  since: number,
  version: number,
): Promise<{ complete: boolean; transactionIds: string[] }> {
  const incomplete = { complete: false, transactionIds: [] };
  if (since > version) return incomplete;
  if (since === version) return { complete: true, transactionIds: [] };
  if (version - since > 200) return incomplete;
  const { data, error } = await supabase
    .from('client_data_changes')
    .select('version, transaction_ids')
    .eq('client_id', clientId)
    .gt('version', since)
    .lte('version', version)
    .order('version', { ascending: true });
  // Before migration 056, or once the log has been trimmed, the steps cannot all be accounted for.
  if (error || !data || data.length !== version - since) return incomplete;
  const ids = new Set<string>();
  for (const row of data) {
    if (!Array.isArray(row.transaction_ids)) return incomplete;
    row.transaction_ids.forEach((id: unknown) => ids.add(String(id)));
    if (ids.size > MAX_CHANGED_TRANSACTIONS) return incomplete;
  }
  return { complete: true, transactionIds: [...ids] };
}
