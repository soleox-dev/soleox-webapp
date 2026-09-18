import { NextResponse } from 'next/server';
import { getTransactions, createTransaction } from '@/lib/transactions';
import { CreateTransactionSchema } from '@/lib/validations/transaction';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ZodError } from 'zod';

// GET: Fetch active transactions for a tenant
export async function GET(request: Request) {
  const clientId = request.headers.get('x-client-id') || request.headers.get('client_id') || 'DEMO';

  try {
    const supabase = await getAuthenticatedSupabase();
    const transactions = await getTransactions(clientId, supabase);
    return NextResponse.json({ success: true, transactions });
  } catch (error: any) {
    console.error('Error in GET /api/transactions:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

// POST: Create/Update transaction and run calculation engine
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();

    // 1. Resolve client_id from headers or body
    const headerClientId = request.headers.get('x-client-id') || request.headers.get('client_id');
    const resolvedClientId = body.client_id || headerClientId;

    if (!resolvedClientId) {
      return NextResponse.json(
        { success: false, error: 'User is not mapped to an active Client ID (client_id is required).' },
        { status: 400 }
      );
    }

    // 2. Attach client_id to payload before schema validation
    const payloadWithClientId = {
      ...body,
      client_id: resolvedClientId,
    };

    // 3. Validate payload with Zod
    const validatedData = CreateTransactionSchema.parse(payloadWithClientId);

    // 4. Insert/Upsert transaction and run commission engine
    const userEmail = session.user.email;
    const result = await createTransaction(validatedData, body.template_id, userEmail, supabase);

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

    const status = error.message?.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Server error' }, { status });
  }
}
