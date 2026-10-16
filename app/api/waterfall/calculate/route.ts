import { NextRequest, NextResponse } from 'next/server';
import { calculateWaterfallForTransaction } from '@/lib/services/waterfall-service';
import { requireSessionClient, apiError } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const body = await request.json();
    const { transactionId, gci, transactionFee, agentSplitRate, templateId } = body;

    if (!transactionId || gci === undefined) {
      return NextResponse.json(
        { success: false, error: 'transactionId and gci are required' },
        { status: 400 }
      );
    }

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
    return apiError(error, 'The request could not be completed.', 'success');
  }
}
