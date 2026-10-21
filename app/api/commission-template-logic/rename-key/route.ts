// app/api/commission-template-logic/rename-key/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionClient, apiError } from '@/lib/session';

const body = z.object({
  ruleId: z.string().trim().min(1),
  newKey: z.string().trim().min(1),
  apply: z.boolean().optional(),
});

export type RuleKeyRenameCounts = {
  applied: boolean;
  oldKey: string;
  templates: number;
  parameters: number;
  rules: number;
};

// Messages the database function writes for people (permission, bad key, key in use, rule missing).
const READABLE_CODES = new Set(['42501', '22023', '23505', 'P0002']);

// POST: Count (apply false) or carry out (apply true) a template rule key rename. See migration 062.
export async function POST(request: Request) {
  try {
    const parsed = body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    const { ruleId, newKey, apply = false } = parsed.data;

    const { clientId, supabase } = await requireSessionClient();
    const { data, error } = await supabase.rpc('rename_rule_key', {
      p_client_id: clientId,
      p_rule_id: ruleId,
      p_new_key: newKey,
      p_apply: apply,
    });
    if (error) {
      if (error.code === 'PGRST202') {
        return NextResponse.json(
          { error: 'Renaming a rule key needs database migration 062 (rename_rule_key). Run it in Supabase, then try again.' },
          { status: 501 },
        );
      }
      if (error.code && READABLE_CODES.has(error.code)) {
        return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 });
      }
      throw error;
    }
    return NextResponse.json({ success: true, counts: data as RuleKeyRenameCounts });
  } catch (error) {
    return apiError(error, 'The rule key could not be renamed.');
  }
}
