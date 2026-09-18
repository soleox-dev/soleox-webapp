import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch non-archived template logic steps ordered by step_number
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('template_id');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('commission_template_logic')
      .select('*')
      .or('archived.is.null,archived.eq.false')
      .order('step_number', { ascending: true });

    if (templateId) {
      query = query.eq('template_id', templateId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, logic_steps: data || [] });
  } catch (error: any) {
    console.error('Error fetching template logic:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update template logic rule step
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const logic = body.logic || body;

    // 1. Validation: Template ID, Step Number, and Rule Name are required. ID is optional for new records.
    if (!logic || !logic.template_id || logic.step_number === undefined || !logic.rule_name) {
      return NextResponse.json(
        { error: 'Template ID, Step Number, and Rule Name are required' },
        { status: 400 }
      );
    }

    const existingId = logic.id ? String(logic.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || logic.updated_by || logic.created_by || 'system_admin';

    // 2. Format row payload
    const rowPayload: Record<string, any> = {
      client_id: String(logic.client_id || 'DEMO'),
      template_id: String(logic.template_id),
      step_number: Number(logic.step_number),
      rule_name: String(logic.rule_name),
      section: logic.section ? String(logic.section) : null,
      payee_type: String(logic.payee_type || 'AGENT'),
      payee_entity_id: logic.payee_entity_id ? String(logic.payee_entity_id) : null,
      calculation_formula: logic.calculation_formula ? String(logic.calculation_formula) : null,
      cap_condition_key: logic.cap_condition_key ? String(logic.cap_condition_key) : null,
      archived: Boolean(logic.archived),
      created_by: logic.created_by || user,
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
        .from('commission_template_logic')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new logic step (Postgres will trigger generate_prefixed_id('CTL'))
      query = supabase
        .from('commission_template_logic')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Logic step ${isUpdate ? 'updated' : 'created'} successfully`,
      logic_step: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Template Logic Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Archive template logic step
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Logic Step ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('commission_template_logic')
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Logic step archived successfully' });
  } catch (error: any) {
    console.error('Supabase Template Logic Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
