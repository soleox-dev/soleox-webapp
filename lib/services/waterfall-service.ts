import { getAuthenticatedSupabase } from '@/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { calculateWaterfall, TemplateLogicStep } from '@/lib/services/waterfall-engine';

/**
 * Fetch logic steps and calculate commission waterfall preview.
 */
export async function calculateWaterfallForTransaction(
  clientId: string,
  transactionId: string,
  gci: number,
  transactionFee: number = 0,
  agentSplitRate: number = 0.70,
  templateId?: string,
  client?: SupabaseClient
) {
  const sb = client || (await getAuthenticatedSupabase());
  let logicSteps: TemplateLogicStep[] = [];

  if (templateId) {
    const { data, error } = await sb
      .from('commission_template_logic')
      .select('id, step_number, rule_name, section, payee_type, payee_entity_id, calculation_formula')
      .eq('template_id', templateId)
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('step_number', { ascending: true });

    if (!error && data && data.length > 0) {
      logicSteps = data.map((step: any) => ({
        ...step,
        step_number: Number(step.step_number),
      }));
    }
  }

  if (logicSteps.length === 0) {
    logicSteps = [
      {
        id: 'STEP_1',
        step_number: 1,
        rule_name: 'Transaction Admin Fee',
        section: 'OFF_THE_TOP',
        payee_type: 'ENTITY',
        calculation_formula: 'transaction_fee',
      },
      {
        id: 'STEP_2',
        step_number: 2,
        rule_name: 'Agent Commission Split',
        section: 'POST_SPLIT',
        payee_type: 'AGENT',
        calculation_formula: '(gci_amount - off_the_top) * agent_split_rate',
      },
      {
        id: 'STEP_3',
        step_number: 3,
        rule_name: 'Brokerage Net Split',
        section: 'POST_SPLIT',
        payee_type: 'ENTITY',
        calculation_formula: '(gci_amount - off_the_top) * (1 - agent_split_rate)',
      },
    ];
  }

  const mockTransaction = {
    id: transactionId,
    client_id: clientId,
    gci_amount: Number(gci || 0),
    agent_id: 'PREVIEW_AGENT',
  };

  const parameters = {
    agent_split_rate: Number(agentSplitRate || 0.70),
    transaction_fee: Number(transactionFee || 0),
  };

  return calculateWaterfall(
    mockTransaction,
    `PREVIEW_${transactionId}`,
    logicSteps,
    parameters
  );
}

/**
 * Process and persist waterfall calculation results to Supabase.
 */
export async function processTransactionWaterfall(
  clientId: string,
  transactionId: string,
  templateId?: string,
  submissionId?: string,
  client?: SupabaseClient
) {
  const sb = client || (await getAuthenticatedSupabase());

  // Fetch transaction details
  const { data: transaction, error: txError } = await sb
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .single();

  if (txError || !transaction) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  // Calculate waterfall items
  const waterfallItems = await calculateWaterfallForTransaction(
    clientId,
    transaction.id,
    transaction.gci_amount || 0,
    transaction.transaction_fee || 0,
    transaction.agent_split_rate || 0.70,
    templateId,
    sb
  );

  // Map items for database persistence (omitting ID so Postgres uses generate_prefixed_id('TCI'))
  const rowsToInsert = waterfallItems.map((item: any) => ({
    client_id: clientId,
    transaction_id: transaction.id,
    submission_id: submissionId || `SUB_${transaction.id}`,
    step_number: item.step_number,
    rule_name: item.rule_name,
    section: item.section,
    payee_type: item.payee_type,
    payee_entity_id: item.payee_entity_id,
    agent_id: transaction.agent_id,
    calculated_amount: item.calculated_amount,
    final_amount: item.final_amount,
    is_manual_override: false,
    created_by: 'system_engine',
    updated_at: new Date().toISOString(),
    updated_by: 'system_engine',
  }));

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await sb
      .from('transaction_commission_items')
      .insert(rowsToInsert);

    if (insertError) throw insertError;
  }

  return { success: true, count: rowsToInsert.length };
}