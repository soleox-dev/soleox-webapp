import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';
import { recordAudit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch non-archived templates
export async function GET(request: Request) {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const { data, error } = await supabase
      .from('commission_templates')
      .select('*')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('is_default', { ascending: false })
      .order('template_name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, templates: data || [] });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}

// POST: Create or Update template record
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase, email } = await requireSessionClient();
    const body = await request.json();
    const template = body.template || body;

    // 1. Validation: Template Name is required. ID is optional for creation.
    if (!template || !template.template_name) {
      return NextResponse.json({ error: 'Template Name is required' }, { status: 400 });
    }

    const existingId = template.id ? String(template.id) : null;
    const isUpdate = Boolean(existingId);
    const user = email || template.updated_by || template.created_by || 'system_admin';

    // 2. Handle default template unsetting logic if this item is marked default
    if (template.is_default) {
      await supabase
        .from('commission_templates')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('client_id', clientId);
    }

    // 3. Format row payload
    const rowPayload: Record<string, any> = {
      client_id: clientId,
      template_name: String(template.template_name),
      description: template.description ? String(template.description) : null,
      eligibility_formula: template.eligibility_formula ? String(template.eligibility_formula).trim() || null : null,
      is_default: Boolean(template.is_default),
      is_active: template.is_active !== undefined ? Boolean(template.is_active) : true,
      archived: Boolean(template.archived),
      created_by: template.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    // Attach ID only if updating an existing record explicitly
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // Display names for rule sections: section name to label, both short text. Only sent when the page changes them.
    if (template.rule_section_labels && typeof template.rule_section_labels === 'object' && !Array.isArray(template.rule_section_labels)) {
      const labels: Record<string, string> = {};
      for (const [section, label] of Object.entries(template.rule_section_labels as Record<string, unknown>)) {
        const cleanSection = String(section).trim().slice(0, 80);
        const cleanLabel = String(label ?? '').trim().slice(0, 80);
        if (cleanSection && cleanLabel && cleanLabel !== cleanSection) labels[cleanSection] = cleanLabel;
      }
      rowPayload.rule_section_labels = labels;
    }

    // 4. Insert or Upsert
    let query;
    if (isUpdate) {
      query = supabase
        .from('commission_templates')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new template (Postgres will trigger generate_prefixed_id('TPL'))
      query = supabase
        .from('commission_templates')
        .insert(rowPayload)
        .select();
    }

    let { data, error } = await query;
    if (error && String(error.message || '').includes('eligibility_formula')) {
      delete rowPayload.eligibility_formula;
      const retry = isUpdate
        ? supabase.from('commission_templates').upsert(rowPayload, { onConflict: 'id' }).select()
        : supabase.from('commission_templates').insert(rowPayload).select();
      const retried = await retry;
      data = retried.data;
      error = retried.error;
    }
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;
    await recordAudit(supabase, {
      clientId,
      actorEmail: email,
      action: isUpdate ? 'update' : 'create',
      entity: 'template',
      entityId: returnedRow.id ? String(returnedRow.id) : null,
      summary: `${isUpdate ? 'Updated' : 'Created'} template ${returnedRow.template_name || ''}`.trim(),
    });

    return NextResponse.json({
      success: true,
      message: `Template ${isUpdate ? 'updated' : 'created'} successfully`,
      template: returnedRow,
    });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}

// DELETE: Archive template record
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const { error } = await supabase
      .from('commission_templates')
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
      summary: `Archived template ${id}`,
    });

    return NextResponse.json({ success: true, message: 'Template archived successfully' });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
