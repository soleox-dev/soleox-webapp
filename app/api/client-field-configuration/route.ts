import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// POST: Create or Update Client Field Configuration
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const config = body.field_config || body;

    // 1. Validation: Field Key and Field Label are required. ID is optional for creation.
    if (!config || !config.field_key || !config.field_label) {
      return NextResponse.json(
        { error: 'Field Key and Field Label are required' },
        { status: 400 }
      );
    }

    const existingId = config.id ? String(config.id) : null;
    const isUpdate = Boolean(existingId);
    const user = session.user.email || config.updated_by || config.created_by || 'system_admin';

    // 2. Format row payload
    const rowPayload: Record<string, any> = {
      client_id: String(config.client_id || 'DEMO'),
      target_table: String(config.target_table || 'transactions'),
      section_name: String(config.section_name || config.section_label || 'General Information'),
      field_key: String(config.field_key),
      field_label: String(config.field_label),
      field_type: String(config.field_type || 'TEXT'),
      is_required: Boolean(config.is_required),
      is_enabled: config.is_enabled !== undefined ? Boolean(config.is_enabled) : true,
      sort_order: config.sort_order !== undefined ? Number(config.sort_order) : 0,
      archived: Boolean(config.archived),
      created_by: config.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 3. Insert or Upsert
    let query;
    if (isUpdate) {
      query = supabase
        .from('client_field_configurations')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new field configuration (Postgres triggers generate_prefixed_id('CFC'))
      query = supabase
        .from('client_field_configurations')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Field configuration ${isUpdate ? 'updated' : 'created'} successfully`,
      field_config: returnedRow,
    });
  } catch (error: any) {
    console.error('Supabase Client Field Config Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
