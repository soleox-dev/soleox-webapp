// app/api/schema/field/route.ts
import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { clearSchemaCache } from '@/lib/fields';

// POST: Save or Update a single field configuration
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const { clientId = 'DEMO', targetTable, field, updatedBy } = body;
    const authorEmail = session.user.email || updatedBy || 'system_admin';

    if (!targetTable || !field || !field.field_key) {
      return NextResponse.json(
        { error: 'targetTable and field payload with field_key are required' },
        { status: 400 }
      );
    }

    const rowPayload: Record<string, any> = {
      client_id: String(clientId),
      target_table: String(targetTable),
      field_key: String(field.field_key),
      storage_type: String(field.storage_type || 'CORE_COLUMN'),
      section_name: String(field.section_name || 'General'),
      section_sort_order: Number(field.section_sort_order) || 1,
      sort_order: Number(field.sort_order) || 1,
      field_label: String(field.field_label || ''),
      field_type: String(field.field_type || 'TEXT'),
      is_required: Boolean(field.is_required),
      dropdown_options: Array.isArray(field.dropdown_options) ? field.dropdown_options : [],
      is_system: Boolean(field.is_system),
      is_enabled: field.is_enabled !== false,
      archived: Boolean(field.archived || false),
      updated_at: new Date().toISOString(),
      updated_by: String(authorEmail),
      min_value: field.min_value !== undefined && field.min_value !== '' ? Number(field.min_value) : null,
      max_value: field.max_value !== undefined && field.max_value !== '' ? Number(field.max_value) : null,
      min_date: field.min_date ? String(field.min_date) : null,
      max_length: field.max_length ? Number(field.max_length) : null,
      visibility_rules: field.visibility_rule || field.visibility_rules || {},
      calculation_formula: field.calculation_formula ? String(field.calculation_formula) : null,
      regex_pattern: field.regex_pattern ? String(field.regex_pattern) : null,
      regex_mode: String(field.regex_mode || 'MATCHES'),
    };

    if (field.id) {
      rowPayload.id = String(field.id);
    }

    const onConflictTarget = field.id ? 'id' : 'client_id,target_table,field_key';

    const { data: savedField, error: configError } = await supabase
      .from('client_field_configurations')
      .upsert(rowPayload, { onConflict: onConflictTarget })
      .select()
      .single();

    if (configError) throw configError;

    // Sync lookup choices if SELECT control type
    if (field.field_type === 'SELECT' && Array.isArray(field.dropdown_options)) {
      const categoryKey = field.field_key.toUpperCase();

      await supabase
        .from('client_lookup_values')
        .delete()
        .eq('client_id', clientId)
        .eq('category', categoryKey);

      const lookupRows = field.dropdown_options.map((label: string, idx: number) => ({
        client_id: String(clientId),
        category: String(categoryKey),
        option_label: String(label),
        option_value: label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_'),
        sort_order: idx + 1,
        is_active: true,
        is_default: idx === 0,
        archived: false,
        created_by: String(authorEmail),
        updated_at: new Date().toISOString(),
        updated_by: String(authorEmail),
      }));

      if (lookupRows.length > 0) {
        await supabase.from('client_lookup_values').insert(lookupRows);
      }
    }

    clearSchemaCache(String(clientId), String(targetTable));

    return NextResponse.json({ success: true, field: savedField });
  } catch (error: any) {
    console.error('Error saving field:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Archive/Delete a single field configuration
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const clientId = searchParams.get('clientId') || 'DEMO';
    const fieldKey = searchParams.get('fieldKey');
    const targetTable = searchParams.get('targetTable');

    if (!id && (!fieldKey || !targetTable)) {
      return NextResponse.json(
        { error: 'Field ID or fieldKey + targetTable required' },
        { status: 400 }
      );
    }

    let query = supabase.from('client_field_configurations').update({
      archived: true,
      is_enabled: false,
      updated_at: new Date().toISOString(),
      updated_by: session.user.email,
    });

    if (id) {
      query = query.eq('id', id);
    } else {
      query = query
        .eq('client_id', clientId)
        .eq('target_table', targetTable)
        .eq('field_key', fieldKey);
    }

    const { error } = await query;
    if (error) throw error;

    clearSchemaCache(String(clientId), targetTable ? String(targetTable) : undefined);

    return NextResponse.json({ success: true, message: 'Field deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting field:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
