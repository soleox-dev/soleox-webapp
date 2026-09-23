// app/api/schema/rename-option/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getTenantContext } from '@/lib/session';
import { getDbTableColumns, clearSchemaCache } from '@/lib/fields';

export async function POST(request: Request) {
  try {
    // 1. Authenticate user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request payload
    const body = await request.json();
    const { targetTable, fieldKey, oldValue, newValue, storageType } = body;

    if (!targetTable || (targetTable !== 'transactions' && targetTable !== 'agents')) {
      return NextResponse.json(
        { error: 'Valid targetTable ("transactions" or "agents") is required' },
        { status: 400 }
      );
    }

    if (!fieldKey || typeof fieldKey !== 'string') {
      return NextResponse.json({ error: 'fieldKey is required' }, { status: 400 });
    }

    const trimmedOldValue = typeof oldValue === 'string' ? oldValue.trim() : '';
    const trimmedNewValue = typeof newValue === 'string' ? newValue.trim() : '';

    if (!trimmedOldValue) {
      return NextResponse.json({ error: 'oldValue cannot be empty' }, { status: 400 });
    }

    if (!trimmedNewValue) {
      return NextResponse.json({ error: 'newValue cannot be empty' }, { status: 400 });
    }

    if (trimmedOldValue === trimmedNewValue) {
      return NextResponse.json(
        { error: 'New value must be different from current value' },
        { status: 400 }
      );
    }

    // 3. Initialize authenticated Supabase client and resolve active tenant
    const supabase = await getAuthenticatedSupabase();
    const headerClientId = request.headers.get('x-client-id') || request.headers.get('client_id');
    const tenant = await getTenantContext(body.clientId || headerClientId, supabase);
    const clientId = tenant.clientId;
    const authorEmail = session.user.email;

    // 4. Determine physical column vs custom attribute
    const dbColumns = getDbTableColumns(targetTable);
    const isCoreCol = dbColumns.some((col) => col.field_key === fieldKey);

    let updatedRowCount = 0;

    // 5. Update records in the database table
    if (isCoreCol || storageType === 'CORE_COLUMN') {
      const { data: updatedRows, error: coreUpdateError } = await supabase
        .from(targetTable)
        .update({
          [fieldKey]: trimmedNewValue,
          updated_at: new Date().toISOString(),
          updated_by: authorEmail,
        })
        .eq('client_id', clientId)
        .eq(fieldKey, trimmedOldValue)
        .select('id');

      if (coreUpdateError) {
        console.error(`Error updating core column ${fieldKey} on ${targetTable}:`, coreUpdateError);
        throw coreUpdateError;
      }

      updatedRowCount += updatedRows?.length || 0;
    }

    // Also check and update custom_attributes JSONB if applicable
    try {
      const { data: matchingCustomRows, error: fetchCustomError } = await supabase
        .from(targetTable)
        .select('id, custom_attributes')
        .eq('client_id', clientId)
        .filter(`custom_attributes->>${fieldKey}`, 'eq', trimmedOldValue);

      if (!fetchCustomError && matchingCustomRows && matchingCustomRows.length > 0) {
        for (const row of matchingCustomRows) {
          const currentAttrs =
            typeof row.custom_attributes === 'object' && row.custom_attributes !== null
              ? row.custom_attributes
              : {};

          const updatedAttrs = {
            ...currentAttrs,
            [fieldKey]: trimmedNewValue,
          };

          const { error: customUpdateErr } = await supabase
            .from(targetTable)
            .update({
              custom_attributes: updatedAttrs,
              updated_at: new Date().toISOString(),
              updated_by: authorEmail,
            })
            .eq('id', row.id);

          if (!customUpdateErr) {
            updatedRowCount++;
          }
        }
      }
    } catch (customErr) {
      console.warn(`Error inspecting custom_attributes for ${fieldKey}:`, customErr);
    }

    // 6. Update dropdown_options in client_field_configurations
    const { data: configs, error: configFetchError } = await supabase
      .from('client_field_configurations')
      .select('id, dropdown_options')
      .eq('client_id', clientId)
      .eq('target_table', targetTable)
      .eq('field_key', fieldKey);

    if (!configFetchError && configs && configs.length > 0) {
      for (const cfg of configs) {
        if (Array.isArray(cfg.dropdown_options)) {
          const newOptions = cfg.dropdown_options.map((opt: string) =>
            opt === trimmedOldValue ? trimmedNewValue : opt
          );

          await supabase
            .from('client_field_configurations')
            .update({
              dropdown_options: newOptions,
              updated_at: new Date().toISOString(),
              updated_by: authorEmail,
            })
            .eq('id', cfg.id);
        }
      }
    }

    // 7. Update client_lookup_values if present
    const categoryKey = fieldKey.toUpperCase();
    const newOptionValue = trimmedNewValue
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_');

    const { error: lookupUpdateError } = await supabase
      .from('client_lookup_values')
      .update({
        option_label: trimmedNewValue,
        option_value: newOptionValue,
        updated_at: new Date().toISOString(),
        updated_by: authorEmail,
      })
      .eq('client_id', clientId)
      .eq('category', categoryKey)
      .eq('option_label', trimmedOldValue);

    if (lookupUpdateError) {
      console.warn('Warning updating client_lookup_values:', lookupUpdateError);
    }

    // 8. Clear schema cache
    clearSchemaCache(String(clientId), String(targetTable));

    return NextResponse.json({
      success: true,
      updatedCount: updatedRowCount,
      targetTable,
      fieldKey,
      oldValue: trimmedOldValue,
      newValue: trimmedNewValue,
      message: `Successfully renamed "${trimmedOldValue}" to "${trimmedNewValue}". ${updatedRowCount} record(s) have been updated.`,
    });
  } catch (error: any) {
    console.error('Error in /api/schema/rename-option:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message || 'Failed to rename option' }, { status });
  }
}
