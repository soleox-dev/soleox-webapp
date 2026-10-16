import { NextResponse } from 'next/server';
import { getTransactions, createTransaction, deleteTransaction } from '@/lib/transactions';
import { CreateTransactionSchema } from '@/lib/validations/transaction';
import { requireSessionClient, apiError } from '@/lib/session';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ZodError } from 'zod';

// GET: Fetch active transactions for a tenant
export async function GET(request: Request) {
  const view = new URL(request.url).searchParams.get('view');

  try {
    const { clientId, supabase } = await requireSessionClient();
    const transactions = await getTransactions(clientId, supabase, view === 'deleted' ? 'deleted' : 'active');
    return NextResponse.json({ success: true, transactions });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.', 'success');
  }
}

// POST: Create/Update transaction and run calculation engine
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const body = await request.json();

    const payloadWithClientId = {
      ...body,
      client_id: clientId,
    };

    // 3. Validate payload with Zod
    const validatedData = CreateTransactionSchema.parse(payloadWithClientId);

    // 4. Insert/Upsert transaction and run commission engine
    const userEmail = session.user.email;
    const result = await createTransaction(
      validatedData,
      body.template_id,
      userEmail,
      supabase,
      body.template_submission,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error in POST /api/transactions:', error);

    // Return human-readable Zod validation errors
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed on transaction payload',
          // Use canonical .issues property and format issues into readable strings/paths
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
        { status: 400 }
      );
    }

    return apiError(error, 'The transaction could not be saved.', 'success');
  }
}

// DELETE: Archive a transaction and its related commission, payment, and template records
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || id === 'new') {
      return NextResponse.json({ success: false, error: 'Transaction ID is required' }, { status: 400 });
    }

    const { clientId, supabase } = await requireSessionClient();
    await deleteTransaction(clientId, id, session.user.email, supabase);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.', 'success');
  }
}
