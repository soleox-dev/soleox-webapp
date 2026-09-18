import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch all active/non-archived entities from Supabase
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = request.headers.get('x-client-id') || request.headers.get('client_id') || searchParams.get('client_id') || 'DEMO';

    const supabase = await getAuthenticatedSupabase();
    const { data, error } = await supabase
      .from('commission_entities')
      .select('*')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('is_active', { ascending: false })
      .order('entity_name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, entities: data || [] });
  } catch (error: any) {
    console.error('Error fetching commission entities:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update entity in Supabase
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const entity = body.entity || body;

    // 1. Validation: Entity Name is required. ID is optional for new records.
    if (!entity || !entity.entity_name) {
      return NextResponse.json({ error: 'Entity Name is required' }, { status: 400 });
    }

    const existingId = entity.id ? String(entity.id) : null;
    const isUpdate = Boolean(existingId);
    const clientId = String(entity.client_id || 'DEMO');
    const user = session.user.email || entity.updated_by || entity.created_by || 'system_admin';

    // 2. Format row payload matching schema
    const rowPayload: Record<string, any> = {
      client_id: clientId,
      entity_name: String(entity.entity_name),
      entity_type: String(entity.entity_type || 'BROKERAGE'),
      contact_name: entity.contact_name ? String(entity.contact_name) : null,
      contact_email: entity.contact_email ? String(entity.contact_email) : null,
      tax_id: entity.tax_id ? String(entity.tax_id) : null,
      is_active: entity.is_active !== undefined ? Boolean(entity.is_active) : true,
      archived: Boolean(entity.archived),
      created_by: entity.created_by || user,
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
        .from('commission_entities')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new entity (Postgres will execute generate_prefixed_id('ENT'))
      query = supabase
        .from('commission_entities')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Entity ${isUpdate ? 'updated' : 'created'} successfully`,
      entity: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Commission Entities Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Archive an entity record in Supabase
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const clientId = searchParams.get('client_id') || 'DEMO';

    if (!id) {
      return NextResponse.json({ error: 'Entity ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('commission_entities')
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('client_id', clientId);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Entity archived successfully' });
  } catch (error: any) {
    console.error('Supabase Commission Entity Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
