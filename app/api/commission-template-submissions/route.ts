import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch non-archived template submissions (filterable by transaction_id or template_id)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = request.headers.get('x-client-id') || request.headers.get('client_id') || searchParams.get('client_id') || 'DEMO';
    const transactionId = searchParams.get('transaction_id');
    const templateId = searchParams.get('template_id');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('commission_template_submissions')
      .select('*')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('created_at', { ascending: false });

    if (transactionId) {
      query = query.eq('transaction_id', transactionId);
    }
    if (templateId) {
      query = query.eq('template_id', templateId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, submissions: data || [] });
  } catch (error: any) {
    console.error('Error fetching template submissions:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update template submission snapshot
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const submission = body.submission || body;

    // 1. Validation: Transaction ID and Template ID are required. ID is optional for creation.
    if (!submission || !submission.transaction_id || !submission.template_id) {
      return NextResponse.json(
        { error: 'Transaction ID and Template ID are required' },
        { status: 400 }
      );
    }

    const existingId = submission.id ? String(submission.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || submission.updated_by || submission.created_by || 'system_admin';

    // 2. Format row payload
    const rowPayload: Record<string, any> = {
      client_id: String(submission.client_id || 'DEMO'),
      transaction_id: String(submission.transaction_id),
      template_id: String(submission.template_id),
      submitted_parameters: typeof submission.submitted_parameters === 'object' ? submission.submitted_parameters : {},
      status: String(submission.status || 'CALCULATED'),
      archived: Boolean(submission.archived),
      created_by: submission.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    // Attach ID only if updating an existing record explicitly
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 3. Insert or Upsert
    let query;
    if (isUpdate) {
      query = supabase
        .from('commission_template_submissions')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new submission (Postgres will trigger generate_prefixed_id('CTS'))
      query = supabase
        .from('commission_template_submissions')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Template submission ${isUpdate ? 'updated' : 'created'} successfully`,
      submission: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Template Submission Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Soft delete / archive template submission snapshot
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Submission ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('commission_template_submissions')
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Template submission archived successfully' });
  } catch (error: any) {
    console.error('Supabase Template Submission Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
