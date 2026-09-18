import { NextRequest, NextResponse } from 'next/server';
import { transitionTransactionStatus } from '@/lib/compliance';

export async function POST(request: NextRequest) {
  try {
    const clientId = request.headers.get('x-client-id') || 'DEMO';
    const { transactionId, newStatus, actorId, rejectionReason } = await request.json();

    if (!transactionId || !newStatus) {
      return NextResponse.json(
        { success: false, error: 'transactionId and newStatus are required' },
        { status: 400 }
      );
    }

    const result = await transitionTransactionStatus({
      clientId,
      transactionId,
      newStatus,
      actorId: actorId || 'compliance_officer',
      rejectionReason,
    });

    return NextResponse.json({ success: true, approval: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}