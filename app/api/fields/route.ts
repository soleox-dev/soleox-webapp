import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';

export async function GET() {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, transactions: transactions || [] });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
