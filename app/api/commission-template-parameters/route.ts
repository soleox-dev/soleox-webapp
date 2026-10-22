import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { requireSessionClient, apiError } from '@/lib/session';
import { recordAudit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { parameterInUseMessage, parameterUsedBy, type UsageParameter, type UsageRule } from '@/lib/template-parameter-usage';

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

// PATCH: Change several parameters at once from the Parameters list's select mode: rename them (only names
// change; keys, formulas and order stay as they are), or turn their divider below on or off.
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const templateId = String(body.template_id || '').trim();
    const { clientId, supabase } = await requireSessionClient();
    const updatedAt = new Date().toISOString();

    // Update: one field set to one value on the selected parameters.
    if (typeof body.field === 'string') {
      const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => String(id || '').trim()).filter(Boolean);
      if (!templateId || ids.length === 0) {
        return NextResponse.json({ error: 'Choose the parameters to change.' }, { status: 400 });
      }
      const value = String(body.value ?? '').trim();
      let change: Record<string, string | boolean | null>;
      if (body.field === 'section') change = { section: value || null };
      else if (body.field === 'is_required' || body.field === 'is_user_editable') change = { [body.field]: value === 'true' };
      else return NextResponse.json({ error: 'That field cannot be updated in bulk.' }, { status: 400 });
      const { error } = await supabase
        .from('commission_template_parameters')
        .update({ ...change, updated_at: updatedAt, updated_by: session.user.email })
        .in('id', ids)
        .eq('template_id', templateId)
        .eq('client_id', clientId);
      if (error) throw error;
      await recordAudit(supabase, {
        clientId,
        actorEmail: session.user.email,
        action: 'update',
        entity: 'template',
        entityId: templateId,
        summary: `Set ${body.field} on ${ids.length} template ${ids.length === 1 ? 'parameter' : 'parameters'}`,
      });
      return NextResponse.json({ success: true, updated: ids.length });
    }

    if (typeof body.divider_below === 'boolean') {
      const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => String(id || '').trim()).filter(Boolean);
      if (!templateId || ids.length === 0) {
        return NextResponse.json({ error: 'Choose the parameters to change.' }, { status: 400 });
      }
      const { error } = await supabase
        .from('commission_template_parameters')
        .update({ divider_below: body.divider_below, updated_at: updatedAt, updated_by: session.user.email })
        .in('id', ids)
        .eq('template_id', templateId)
        .eq('client_id', clientId);
      if (error) throw error;
      await recordAudit(supabase, {
        clientId,
        actorEmail: session.user.email,
        action: 'update',
        entity: 'template',
        entityId: templateId,
        summary: `${body.divider_below ? 'Added' : 'Removed'} the divider below ${ids.length} template ${ids.length === 1 ? 'parameter' : 'parameters'}`,
      });
      return NextResponse.json({ success: true, updated: ids.length });
    }

    const names: { id: string; parameter_name: string }[] = (Array.isArray(body.names) ? body.names : [])
      .map((row: { id?: unknown; parameter_name?: unknown }) => ({ id: String(row?.id || '').trim(), parameter_name: String(row?.parameter_name || '').trim() }))
      .filter((row: { id: string }) => row.id);
    if (!templateId || names.length === 0) {
      return NextResponse.json({ error: 'Choose the parameters to rename.' }, { status: 400 });
    }
    if (names.some((row) => !row.parameter_name)) {
      return NextResponse.json({ error: 'A parameter name cannot be empty.' }, { status: 400 });
    }
    const results = await Promise.all(names.map((row) => supabase
      .from('commission_template_parameters')
      .update({ parameter_name: row.parameter_name, updated_at: updatedAt, updated_by: session.user!.email })
      .eq('id', row.id)
      .eq('template_id', templateId)
      .eq('client_id', clientId)));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    await recordAudit(supabase, {
      clientId,
      actorEmail: session.user.email,
      action: 'update',
      entity: 'template',
      entityId: templateId,
      summary: `Renamed ${names.length} template ${names.length === 1 ? 'parameter' : 'parameters'}`,
    });
    return NextResponse.json({ success: true, renamed: names.length });
  } catch (error: any) {
    return apiError(error, 'The parameters could not be changed.');
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
      return deleteParameters(request, session.user.email);
    }

    const { clientId, supabase } = await requireSessionClient();

    // A parameter a rule or another parameter still uses stays: deleting it would break those formulas.
    const { data: parameter, error: lookupError } = await supabase
      .from('commission_template_parameters')
      .select('template_id, parameter_name, parameter_key')
      .eq('id', id)
      .eq('client_id', clientId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (parameter?.parameter_key) {
      const [rulesResult, parametersResult] = await Promise.all([
        supabase
          .from('commission_template_rules')
          .select('rule_name, agent_key, from_agent_key, paid_by_agent_keys, payee_formula, apply_condition, custom_baseline, calculation_formula, show_when_formula')
          .eq('template_id', parameter.template_id)
          .eq('client_id', clientId)
          .or('archived.is.null,archived.eq.false'),
        supabase
          .from('commission_template_parameters')
          .select('parameter_name, parameter_key, autofill_formula, validation_rule')
          .eq('template_id', parameter.template_id)
          .eq('client_id', clientId)
          .or('archived.is.null,archived.eq.false'),
      ]);
      if (rulesResult.error) throw rulesResult.error;
      if (parametersResult.error) throw parametersResult.error;
      const usedBy = parameterUsedBy(parameter.parameter_key, (rulesResult.data || []) as UsageRule[], (parametersResult.data || []) as UsageParameter[]);
      if (usedBy.length) {
        return NextResponse.json({ error: parameterInUseMessage(parameter.parameter_name, usedBy) }, { status: 409 });
      }
    }

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

// Bulk delete ({ template_id, ids }): archives the selected parameters that nothing outside the selection uses.
// The used ones stay, and the reply says where each is used.
async function deleteParameters(request: Request, actorEmail: string) {
  const body = await request.json().catch(() => ({}));
  const templateId = String(body.template_id || '').trim();
  const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => String(id || '').trim()).filter(Boolean);
  if (!templateId || ids.length === 0) {
    return NextResponse.json({ error: 'Choose the parameters to delete.' }, { status: 400 });
  }
  const { clientId, supabase } = await requireSessionClient();
  const [rulesResult, parametersResult] = await Promise.all([
    supabase
      .from('commission_template_rules')
      .select('rule_name, agent_key, from_agent_key, paid_by_agent_keys, payee_formula, apply_condition, custom_baseline, calculation_formula, show_when_formula')
      .eq('template_id', templateId)
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false'),
    supabase
      .from('commission_template_parameters')
      .select('id, parameter_name, parameter_key, autofill_formula, validation_rule')
      .eq('template_id', templateId)
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false'),
  ]);
  if (rulesResult.error) throw rulesResult.error;
  if (parametersResult.error) throw parametersResult.error;
  const parameters = (parametersResult.data || []) as (UsageParameter & { id: string })[];
  const selected = new Set(ids);
  const remaining = parameters.filter((parameter) => !selected.has(parameter.id));
  const refused: string[] = [];
  const deletable: string[] = [];
  for (const parameter of parameters.filter((item) => selected.has(item.id))) {
    const usedBy = parameterUsedBy(parameter.parameter_key, (rulesResult.data || []) as UsageRule[], remaining);
    if (usedBy.length) refused.push(parameterInUseMessage(parameter.parameter_name, usedBy));
    else deletable.push(parameter.id);
  }
  if (deletable.length) {
    const { error } = await supabase
      .from('commission_template_parameters')
      .update({ archived: true, updated_at: new Date().toISOString(), updated_by: actorEmail })
      .in('id', deletable)
      .eq('template_id', templateId)
      .eq('client_id', clientId);
    if (error) throw error;
    await recordAudit(supabase, {
      clientId,
      actorEmail,
      action: 'delete',
      entity: 'template',
      entityId: templateId,
      summary: `Archived ${deletable.length} template ${deletable.length === 1 ? 'parameter' : 'parameters'}`,
    });
  }
  return NextResponse.json({ success: true, deleted: deletable, refused });
}
