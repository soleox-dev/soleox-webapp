// app/api/schema/key-terms/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionClient, apiError } from '@/lib/session';
import { clearSchemaCache } from '@/lib/fields';

const KeyTermsBody = z.object({
  targetTable: z.literal('transactions'),
  /** Field keys in the order Key Terms shows them. Every other field leaves Key Terms. */
  fieldKeys: z.array(z.string().min(1)).max(40),
});

// PUT: Set which transaction fields show in Key Terms, and in what order.
// Only key_terms_position changes, so sections and the Transactions table order stay as they are.
export async function PUT(request: Request) {
  try {
    const { clientId, supabase, email } = await requireSessionClient();
    const parsed = KeyTermsBody.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'targetTable "transactions" and a list of field keys are required.' }, { status: 400 });
    }
    const { targetTable, fieldKeys } = parsed.data;
    const keys = [...new Set(fieldKeys)];
    const now = new Date().toISOString();

    const { error: clearError } = await supabase
      .from('client_field_configurations')
      .update({ key_terms_position: null, updated_at: now, updated_by: email })
      .eq('client_id', clientId)
      .eq('target_table', targetTable)
      .not('key_terms_position', 'is', null);
    if (clearError) throw clearError;

    for (const [index, fieldKey] of keys.entries()) {
      const { error } = await supabase
        .from('client_field_configurations')
        .update({ key_terms_position: index + 1, updated_at: now, updated_by: email })
        .eq('client_id', clientId)
        .eq('target_table', targetTable)
        .eq('field_key', fieldKey);
      if (error) throw error;
    }

    clearSchemaCache(String(clientId), targetTable);
    return NextResponse.json({ success: true, fieldKeys: keys });
  } catch (error) {
    return apiError(error, 'Key Terms could not be saved.');
  }
}
