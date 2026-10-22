import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { requireSessionClient, apiError } from '@/lib/session';
import { recordAudit } from '@/lib/audit';
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
    return apiError(error, 'The request could not be completed.');
  }
}

// POST: Create or Update template parameter
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const body = await request.json();
    const param = body.parameter || body;

    // 1. Validation: Template ID and Parameter Name are required. ID is optional for creation.
    if (!param || !param.template_id || !param.parameter_name) {
      return NextResponse.json(
        { error: 'Template ID and parameter name are required' },
        { status: 400 }
      );
    }

    const existingId = param.id ? String(param.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || param.updated_by || param.created_by || 'system_admin';

    // 2. Format row payload
    const rowPayload: Record<string, any> = {
      client_id: clientId,
      template_id: String(param.template_id),
      parameter_name: String(param.parameter_name),
      parameter_key: String(param.parameter_key || param.parameter_name.toLowerCase().replace(/\s+/g, '_')),
      data_type: String(param.data_type || 'CURRENCY'),
      autofill_formula: param.autofill_formula ? String(param.autofill_formula) : null,
      validation_rule: param.validation_rule ? String(param.validation_rule) : null,
      notes: param.notes ? String(param.notes) : null,
      section: param.section ? String(param.section).trim() : null,
      dropdown_options: Array.isArray(param.dropdown_options)
        ? param.dropdown_options.map((option: unknown) => String(option).trim()).filter(Boolean)
        : null,
      sort_order: param.sort_order !== undefined ? Number(param.sort_order) : 0,
      is_required: param.is_required !== undefined ? Boolean(param.is_required) : false,
      is_user_editable: param.is_user_editable !== undefined ? Boolean(param.is_user_editable) : true,
      divider_below: Boolean(param.divider_below),
      archived: Boolean(param.archived),
      created_by: param.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    const key = String(rowPayload.parameter_key || '').trim().toLowerCase();
    if (!isUpdate) {
      rowPayload.parameter_key = key;
      const [{ data: siblingParameters, error: parameterLookupError }, { data: siblingRules, error: ruleLookupError }] = await Promise.all([
        supabase
          .from('commission_template_parameters')
          .select('id, parameter_key, parameter_name')
          .eq('template_id', rowPayload.template_id)
          .or('archived.is.null,archived.eq.false'),
        supabase
          .from('commission_template_rules')
          .select('rule_key, rule_name')
          .eq('template_id', rowPayload.template_id)
          .or('archived.is.null,archived.eq.false'),
      ]);
      if (parameterLookupError) throw parameterLookupError;
      if (ruleLookupError) throw ruleLookupError;
      const parameterClash = (siblingParameters || []).find((row) => String(row.parameter_key || '').trim().toLowerCase() === key);
      const ruleClash = (siblingRules || []).find((row) => String(row.rule_key || '').trim().toLowerCase() === key);
      const clashName = parameterClash?.parameter_name || ruleClash?.rule_name;
      if (clashName) {
        return NextResponse.json({ error: `That key is already used by ${clashName}.` }, { status: 409 });
      }
    }

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

    let { data, error } = await query;
    const omittedColumns = new Set<string>();
    while (error?.message?.includes('schema cache')) {
      const missingColumn = error.message.match(/Could not find the '([^']+)' column/)?.[1];
      if (!missingColumn || omittedColumns.has(missingColumn) || !(missingColumn in rowPayload)) break;
      if (missingColumn === 'validation_rule' && param.validation_rule) {
        throw new Error('The validation rule could not be saved. Reload the page and try again.');
      }
      omittedColumns.add(missingColumn);
      delete rowPayload[missingColumn];
      const retry = isUpdate
        ? supabase.from('commission_template_parameters').upsert(rowPayload, { onConflict: 'id' }).select()
        : supabase.from('commission_template_parameters').insert(rowPayload).select();
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
      summary: `${isUpdate ? 'Updated' : 'Created'} template parameter ${returnedRow.parameter_name || ''}`.trim(),
    });

    return NextResponse.json({
      success: true,
      message: `Parameter ${isUpdate ? 'updated' : 'created'} successfully`,
      parameter: returnedRow,
    });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
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

    const { clientId, supabase } = await requireSessionClient();
    const { error } = await supabase
      .from('commission_template_parameters')
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
      summary: `Archived template parameter ${id}`,
    });

    return NextResponse.json({ success: true, message: 'Parameter archived successfully' });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
