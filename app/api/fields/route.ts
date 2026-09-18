import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = request.headers.get('x-client-id') || request.headers.get('client_id') || searchParams.get('client_id') || 'DEMO';

    const supabase = await getAuthenticatedSupabase();
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, transactions: transactions || [] });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
