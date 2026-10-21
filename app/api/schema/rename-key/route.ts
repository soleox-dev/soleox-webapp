// app/api/schema/rename-key/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionClient, apiError } from '@/lib/session';
import { clearSchemaCache } from '@/lib/fields';

const body = z.object({
  targetTable: z.enum(['agents', 'transactions']),
  oldKey: z.string().trim().min(1),
  newKey: z.string().trim().min(1),
  apply: z.boolean().optional(),
});

export type FieldKeyRenameCounts = {
  applied: boolean;
  values: number;
  fieldFormulas: number;
  templates: number;
  parameters: number;
  rules: number;
  caps: number;
  salesVolume: number;
  mappings: number;
  protections: number;
  settings: number;
};

// Messages the database function writes for people (permission, bad key, key in use, field missing).
const READABLE_CODES = new Set(['42501', '22023', '23505', 'P0002']);

// POST: Count (apply false) or carry out (apply true) a custom field key rename. See migration 058.
export async function POST(request: Request) {
  try {
    const parsed = body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    const { targetTable, oldKey, newKey, apply = false } = parsed.data;

    const { clientId, supabase } = await requireSessionClient();
    const { data, error } = await supabase.rpc('rename_field_key', {
      p_client_id: clientId,
      p_target_table: targetTable,
      p_old_key: oldKey,
      p_new_key: newKey,
      p_apply: apply,
    });
    if (error) {
      if (error.code === 'PGRST202') {
        return NextResponse.json(
          { error: 'Renaming a field key needs database migration 058 (rename_field_key). Run it in Supabase, then try again.' },
          { status: 501 },
        );
      }
      if (error.code && READABLE_CODES.has(error.code)) {
        return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 });
      }
      throw error;
    }
    if (apply) clearSchemaCache();
    return NextResponse.json({ success: true, counts: data as FieldKeyRenameCounts });
  } catch (error) {
    return apiError(error, 'The field key could not be renamed.');
  }
}
