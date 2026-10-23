import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Numbers a template's remaining rules (step_number) or parameters (sort_order) 1, 2, 3… in their current order,
 * so a delete leaves no gaps. The order itself never changes, so nothing calculates differently.
 */
export async function renumberTemplateRows(
  supabase: SupabaseClient,
  table: 'commission_template_rules' | 'commission_template_parameters',
  templateId: string,
  clientId: string,
): Promise<void> {
  const column = table === 'commission_template_rules' ? 'step_number' : 'sort_order';
  const { data, error } = await supabase
    .from(table)
    .select(`id, ${column}`)
    .eq('template_id', templateId)
    .eq('client_id', clientId)
    .or('archived.is.null,archived.eq.false')
    .order(column, { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data || []) as unknown as Array<{ id: string } & Record<string, number | null>>;
  const moves = rows.map((row, index) => ({ id: row.id, from: row[column], to: index + 1 })).filter((row) => row.from !== row.to);
  const results = await Promise.all(moves.map((row) => supabase
    .from(table)
    .update({ [column]: row.to })
    .eq('id', row.id)
    .eq('client_id', clientId)));
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}
