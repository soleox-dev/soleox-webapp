import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch non-archived template parameters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('template_id');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('commission_template_parameters')
      .select('*')
      .or('archived.is.null,archived.eq.false')
      .order('sort_order', { ascending: true });

    if (templateId) {
      query = query.eq('template_id', templateId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, parameters: data || [] });
  } catch (error: any) {
    console.error('Error fetching template parameters:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update template parameter
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const param = body.parameter || body;

    // 1. Validation: Template ID and Parameter Name are required. ID is optional for creation.
    if (!param || !param.template_id || !param.parameter_name) {
      return NextResponse.json(
        { error: 'Template ID and Parameter Name are required' },
        { status: 400 }
      );
    }

    const existingId = param.id ? String(param.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || param.updated_by || param.created_by || 'system_admin';

    // 2. Format row payload
    const rowPayload: Record<string, any> = {
      client_id: String(param.client_id || 'DEMO'),
      template_id: String(param.template_id),
      parameter_name: String(param.parameter_name),
      parameter_key: String(param.parameter_key || param.parameter_name.toLowerCase().replace(/\s+/g, '_')),
      data_type: String(param.data_type || 'NUMERIC'),
      default_value: param.default_value !== undefined && param.default_value !== '' ? Number(param.default_value) : null,
      autofill_formula: param.autofill_formula ? String(param.autofill_formula) : null,
      sort_order: param.sort_order !== undefined ? Number(param.sort_order) : 0,
      is_user_editable: param.is_user_editable !== undefined ? Boolean(param.is_user_editable) : true,
      archived: Boolean(param.archived),
      created_by: param.created_by || user,
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
        .from('commission_template_parameters')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new parameter (Postgres will trigger generate_prefixed_id('CTP'))
      query = supabase
        .from('commission_template_parameters')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Parameter ${isUpdate ? 'updated' : 'created'} successfully`,
      parameter: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Template Parameter Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Archive template parameter
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Parameter ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('commission_template_parameters')
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Parameter archived successfully' });
  } catch (error: any) {
    console.error('Supabase Template Parameter Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
