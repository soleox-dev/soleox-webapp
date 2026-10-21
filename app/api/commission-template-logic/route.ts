import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { requireSessionClient, apiError } from '@/lib/session';
import { recordAudit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch non-archived template logic steps ordered by step_number
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('template_id');

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('commission_template_rules')
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
    return apiError(error, 'The request could not be completed.');
  }
}

// POST: Create or Update template logic rule step
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const body = await request.json();
    const logic = body.logic || body;

    // 1. Validation: Template ID, Step Number, and Rule Name are required. ID is optional for new records.
    if (!logic || !logic.template_id || logic.step_number === undefined || !logic.rule_name) {
      return NextResponse.json(
        { error: 'Template ID, step number, and rule name are required' },
        { status: 400 }
      );
    }

    const existingId = logic.id ? String(logic.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || logic.updated_by || logic.created_by || 'system_admin';

    // 2. Format row payload
    const rowPayload: Record<string, any> = {
      client_id: clientId,
      template_id: String(logic.template_id),
      step_number: Number(logic.step_number),
      rule_name: String(logic.rule_name),
      rule_key: logic.rule_key ? String(logic.rule_key) : null,
      section: logic.section ? String(logic.section) : null,
      payee_entity_id: logic.payee_entity_id ? String(logic.payee_entity_id) : null,
      agent_key: logic.agent_key ? String(logic.agent_key) : null,
      payee_formula: logic.payee_formula ? String(logic.payee_formula) : null,
      apply_condition: logic.apply_condition ? String(logic.apply_condition) : null,
      custom_baseline: logic.custom_baseline ? String(logic.custom_baseline) : null,
      calculation_formula: logic.calculation_formula ? String(logic.calculation_formula) : null,
      split_type: (() => {
        const splitType = String(logic.split_type || '').trim().toUpperCase();
        if (splitType === 'PERCENT' || splitType === 'AMOUNT') return splitType;
        return null;
      })(),
      result_type: (() => {
        const resultType = String(logic.result_type || '').trim().toUpperCase();
        if (resultType === 'CURRENCY' || resultType === 'NUMBER' || resultType === 'PERCENT') return resultType;
        return null;
      })(),
      cap_condition_key: logic.cap_condition_key ? String(logic.cap_condition_key) : null,
      show_in_popup: Boolean(logic.show_in_popup),
      popup_section: logic.popup_section ? String(logic.popup_section).trim() || null : null,
      show_when_formula: logic.show_when_formula ? String(logic.show_when_formula).trim() || null : null,
      divider_below: Boolean(logic.divider_below),
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
        .from('commission_template_rules')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new rule (Postgres assigns generate_prefixed_id('CTR'))
      query = supabase
        .from('commission_template_rules')
        .insert(rowPayload)
        .select();
    }

    let { data, error } = await query;
    for (const column of ['result_type', 'popup_section', 'show_in_popup', 'show_when_formula', 'divider_below']) {
      if (!error || !String(error.message || '').includes(column)) continue;
      delete rowPayload[column];
      const retry = isUpdate
        ? supabase.from('commission_template_rules').upsert(rowPayload, { onConflict: 'id' }).select()
        : supabase.from('commission_template_rules').insert(rowPayload).select();
      const retried = await retry;
      data = retried.data;
      error = retried.error;
    }
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;
    await recordAudit(supabase, {
      clientId,
      actorEmail: session.user.email,
      action: isUpdate ? 'update' : 'create',
      entity: 'template',
      entityId: returnedRow.id ? String(returnedRow.id) : null,
      summary: `${isUpdate ? 'Updated' : 'Created'} template rule ${returnedRow.rule_name || ''}`.trim(),
    });

    return NextResponse.json({
      success: true,
      message: `Logic step ${isUpdate ? 'updated' : 'created'} successfully`,
      logic_step: returnedRow,
    });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
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
      return NextResponse.json({ error: 'Logic step ID is required' }, { status: 400 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const { error } = await supabase
      .from('commission_template_rules')
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', id)
      .eq('client_id', clientId);

    if (error) throw error;
    await recordAudit(supabase, {
      clientId,
      actorEmail: session.user.email,
      action: 'delete',
      entity: 'template',
      entityId: id,
      summary: `Archived template rule ${id}`,
    });

    return NextResponse.json({ success: true, message: 'Logic step archived successfully' });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
