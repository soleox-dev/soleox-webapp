import { NextResponse } from 'next/server';
import { apiError, requireSessionClient } from '@/lib/session';

/**
 * When the active client's report data last changed (migration 074), and whose copy it is, so Owner Reports can open
 * from the copy saved in the browser and download again only when something changed. `changedAt` is null until the
 * migration is run; the page then refreshes its copy in the background on every visit.
 */
export async function GET() {
  try {
    const { email, clientId, supabase } = await requireSessionClient();
    const { data, error } = await supabase.from('client_data_versions').select('changed_at').eq('client_id', clientId).maybeSingle();
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw error;
    return NextResponse.json(
      { success: true, clientId, email: email.toLowerCase(), changedAt: error ? null : data?.changed_at ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error, 'Could not check for new report data.', 'success');
  }
}
