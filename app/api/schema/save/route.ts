// app/api/schema/save/route.ts

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/session';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { clearSchemaCache } from '@/lib/fields';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetTable, fields } = body;

    if (!targetTable || !Array.isArray(fields)) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    // 1. Retrieve the authenticated user's session from NextAuth
    const nextAuthSession = await getServerSession(authOptions);
    if (!nextAuthSession?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Initialize Supabase with custom JWT to satisfy Postgres RLS
    const supabase = await getAuthenticatedSupabase();

    // 3. Resolve active tenant context dynamically
    const headerClientId = request.headers.get('x-client-id') || request.headers.get('client_id');
    const inputClientId = body.clientId || headerClientId;
    
    const tenant = await getTenantContext(inputClientId, supabase);
    const clientCode = tenant.clientId;
    
    const userEmail = nextAuthSession.user.email;

    // 4. Format unified row payload for ALL fields
    const rowsToUpsert = fields.map((f: any) => {
      const rowPayload: Record<string, any> = {
        client_id: String(clientCode),
        target_table: String(targetTable),
        field_key: String(f.field_key),
        storage_type: String(f.storage_type || 'CORE_COLUMN'),
        section_name: String(f.section_name || 'General'),
        section_sort_order: Number(f.section_sort_order) || 1,
        sort_order: Number(f.sort_order) || 1,
        field_label: String(f.field_label || ''),
        field_type: String(f.field_type || 'TEXT'),
        is_required: Boolean(f.is_required),
        dropdown_options: Array.isArray(f.dropdown_options) ? f.dropdown_options : [],
        is_system: Boolean(f.is_system),
        is_enabled: Boolean(f.is_enabled),
        archived: Boolean(f.archived || false),
        updated_at: new Date().toISOString(),
        updated_by: String(userEmail), // Storing the email for audit logs
        min_value: f.min_value !== undefined && f.min_value !== null && f.min_value !== '' ? Number(f.min_value) : null,
        max_value: f.max_value !== undefined && f.max_value !== null && f.max_value !== '' ? Number(f.max_value) : null,
        min_date: f.min_date ? String(f.min_date) : null,
        max_length: f.max_length ? Number(f.max_length) : null,
        visibility_rules: f.visibility_rule || f.visibility_rules || {},
        regex_pattern: f.regex_pattern ? String(f.regex_pattern) : null,
        regex_mode: String(f.regex_mode || 'MATCHES'),
      };

      if (f.id) {
        rowPayload.id = String(f.id);
      }

      return rowPayload;
    });

    // 5. UPSERT using authenticated client (RLS enforces ADMIN authorization via custom JWT)
    if (rowsToUpsert.length > 0) {
      const { error } = await supabase
        .from('client_field_configurations')
        .upsert(rowsToUpsert, { onConflict: 'client_id,target_table,field_key' });
      
      if (error) throw error;
    }

    // 6. Extract SELECT options for client_lookup_values sync
    const lookupRowsToInsert: Record<string, any>[] = [];
    const categoriesToClear: string[] = [];

    fields.forEach((f: any) => {
      if (f.field_type === 'SELECT' && Array.isArray(f.dropdown_options)) {
        const categoryKey = f.field_key.toUpperCase();
        categoriesToClear.push(categoryKey);

        f.dropdown_options.forEach((optionLabel: string, idx: number) => {
          const optionValue = optionLabel
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '_');

          lookupRowsToInsert.push({
            client_id: String(clientCode),
            category: String(categoryKey),
            option_label: String(optionLabel),
            option_value: String(optionValue),
            sort_order: idx + 1,
            is_active: true,
            is_default: idx === 0,
            archived: false,
            created_by: String(userEmail),
            updated_at: new Date().toISOString(),
            updated_by: String(userEmail),
          });
        });
      }
    });

    // 7. Clear existing category lookups and insert updated set
    const uniqueCategories = Array.from(new Set(categoriesToClear));

    if (uniqueCategories.length > 0) {
      const { error: deleteLookupError } = await supabase
        .from('client_lookup_values')
        .delete()
        .eq('client_id', clientCode)
        .in('category', uniqueCategories);

      if (deleteLookupError) throw deleteLookupError;
    }

    if (lookupRowsToInsert.length > 0) {
      const { error: insertLookupError } = await supabase
        .from('client_lookup_values')
        .insert(lookupRowsToInsert);

      if (insertLookupError) throw insertLookupError;
    }

    clearSchemaCache(String(clientCode), String(targetTable));

    return NextResponse.json({
      success: true,
      configCount: fields.length,
      lookupCount: lookupRowsToInsert.length,
    });
  } catch (error: any) {
    console.error('Error persisting schema to Supabase:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
