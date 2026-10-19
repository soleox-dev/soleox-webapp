import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';
import { fetchAllPages } from '@/lib/supabase-pagination';

export async function GET() {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const transactions = await fetchAllPages((offset, limit, withCount) =>
      supabase
        .from('transactions')
        .select('*', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
    );

    return NextResponse.json({ success: true, transactions });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
