import { NextRequest, NextResponse } from 'next/server';
import { calculateWaterfallForTransaction } from '@/lib/services/waterfall-service';
import { getAuthenticatedSupabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const clientId = request.headers.get('x-client-id') || 'DEMO';
    const body = await request.json();
    const { transactionId, gci, transactionFee, agentSplitRate, templateId } = body;

    if (!transactionId || gci === undefined) {
      return NextResponse.json(
        { success: false, error: 'transactionId and gci are required' },
        { status: 400 }
      );
    }

    const supabase = await getAuthenticatedSupabase();
    const result = await calculateWaterfallForTransaction(
      clientId,
      String(transactionId),
      Number(gci),
      Number(transactionFee || 0),
      Number(agentSplitRate || 0.70),
      templateId ? String(templateId) : undefined,
      supabase
    );

    return NextResponse.json({ success: true, waterfall: result });
  } catch (error: any) {
    console.error('Error running waterfall calculation:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
