import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch non-archived templates
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = request.headers.get('x-client-id') || request.headers.get('client_id') || searchParams.get('client_id') || 'DEMO';

    const supabase = await getAuthenticatedSupabase();
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
    console.error('Error fetching commission templates:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update template record
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const template = body.template || body;

    // 1. Validation: Template Name is required. ID is optional for creation.
    if (!template || !template.template_name) {
      return NextResponse.json({ error: 'Template Name is required' }, { status: 400 });
    }

    const existingId = template.id ? String(template.id) : null;
    const isUpdate = Boolean(existingId);
    const clientId = String(template.client_id || 'DEMO');
    const user = session.user.email || template.updated_by || template.created_by || 'system_admin';

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

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Template ${isUpdate ? 'updated' : 'created'} successfully`,
      template: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Commission Templates Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
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
    const clientId = searchParams.get('client_id') || 'DEMO';

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
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

    return NextResponse.json({ success: true, message: 'Template archived successfully' });
  } catch (error: any) {
    console.error('Supabase Commission Template Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
