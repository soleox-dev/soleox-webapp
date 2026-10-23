// app/api/schema/field/route.ts
import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { clearSchemaCache } from '@/lib/fields';
import { disconnectTransactionFieldMapping } from '@/lib/google-sheet-connection';
import { inUseByPlansMessage, planUsesOfField } from '@/lib/commission-plan-references';

// POST: Save or Update a single field configuration
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase, email } = await requireSessionClient();
    const body = await request.json();
    const { targetTable, field, updatedBy } = body;
    const authorEmail = email || updatedBy || 'system_admin';

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
    return apiError(error, 'The request could not be completed.');
  }
}

// DELETE: Archive/Delete a single field configuration
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const fieldKey = searchParams.get('fieldKey');
    const targetTable = searchParams.get('targetTable');

    if (!id && (!fieldKey || !targetTable)) {
      return NextResponse.json(
        { error: 'Field ID or fieldKey + targetTable required' },
        { status: 400 }
      );
    }

    let lookup = supabase.from('client_field_configurations').select('id, client_id, target_table, field_key, field_label').eq('client_id', clientId);
    if (id) lookup = lookup.eq('id', id);
    else lookup = lookup.eq('target_table', targetTable).eq('field_key', fieldKey);
    const { data: existing, error: lookupError } = await lookup.maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) {
      return NextResponse.json({ success: true, message: 'Field deleted successfully' });
    }
    const planUses = await planUsesOfField(supabase, clientId, String(existing.target_table), String(existing.field_key));
    if (planUses.length) {
      return NextResponse.json({ error: inUseByPlansMessage(String(existing.field_label || existing.field_key), planUses) }, { status: 409 });
    }

    const { error } = await supabase
      .from('client_field_configurations')
      .update({
        archived: true,
        is_enabled: false,
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', existing.id)
      .eq('client_id', clientId);
    if (error) throw error;

    if (existing.target_table === 'transactions' && existing.field_key) {
      await disconnectTransactionFieldMapping(supabase, String(existing.client_id), String(existing.field_key));
    }

    clearSchemaCache(String(existing.client_id), String(existing.target_table));

    return NextResponse.json({ success: true, message: 'Field deleted successfully' });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
