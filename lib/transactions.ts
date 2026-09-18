// lib/transactions.ts

import { getAuthenticatedSupabase } from '@/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { Transaction } from '@/types/schema';
import { CreateTransactionInput } from '@/lib/validations/transaction';
import { processTransactionWaterfall } from '@/lib/services/waterfall-service';
import { generatePrefixedId } from '@/lib/id';

// Helper utility to safely round currency values to 2 decimal places
const roundCurrency = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

/**
 * Fetch active, non-archived transactions for a specific client tenant.
 * Joins/resolves agent_id to the agents table to provide agent_name and primary_agent.
 */
export async function getTransactions(clientId: string, client?: SupabaseClient): Promise<Transaction[]> {
  const sb = client || (await getAuthenticatedSupabase());

  const [txRes, agentsRes] = await Promise.all([
    sb
      .from('transactions')
      .select('*')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .order('created_at', { ascending: false }),
    sb
      .from('agents')
      .select('id, agent_name')
      .eq('client_id', clientId),
  ]);

  if (txRes.error) {
    console.error('Error fetching transactions from Supabase:', txRes.error);
    throw txRes.error;
  }

  const agentMap = new Map<string, string>();
  (agentsRes.data || []).forEach((ag: any) => {
    const name = ag.agent_name || ag.name;
    if (ag.id && name) agentMap.set(String(ag.id), name);
    if (ag.agent_id && name) agentMap.set(String(ag.agent_id), name);
  });

  // Parse custom attributes and format numeric values without forcing fallbacks
  return (txRes.data || []).map((row: any) => {
    let customAttrs: Record<string, any> = {};
    try {
      if (row.custom_attributes) {
        customAttrs = typeof row.custom_attributes === 'string'
          ? JSON.parse(row.custom_attributes)
          : row.custom_attributes;
      }
    } catch (e) {
      console.warn('JSON parse error on transaction row:', e);
    }

    const resolvedAgentName = row.agent_id ? (agentMap.get(String(row.agent_id)) || null) : null;

    return {
      ...row,
      agent_name: resolvedAgentName || (customAttrs as any)?.primary_agent || null,
      primary_agent: resolvedAgentName || (customAttrs as any)?.primary_agent || null,
      list_price: row.list_price ? roundCurrency(Number(row.list_price)) : null,
      sales_price: row.sales_price ? roundCurrency(Number(row.sales_price)) : null,
      gci_perc: row.gci_perc ? Number(row.gci_perc) : null,
      gci_amount: row.gci_amount ? roundCurrency(Number(row.gci_amount)) : null,
      transaction_fee: row.transaction_fee ? roundCurrency(Number(row.transaction_fee)) : null,
      total_commission: row.total_commission ? roundCurrency(Number(row.total_commission)) : null,
      ...customAttrs,
    } as Transaction;
  });
}

/**
 * Create or Update a transaction record and trigger the waterfall engine calculation.
 */
export async function createTransaction(
  input: CreateTransactionInput & { id?: string; [key: string]: any },
  templateId?: string,
  userId: string = 'SYSTEM',
  client?: SupabaseClient
): Promise<{ transactionId: string; success: boolean; transaction?: any }> {
  const sb = client || (await getAuthenticatedSupabase());
  const isExistingRecord = Boolean(input.id && input.id.trim() !== '');
  const transactionId = isExistingRecord ? input.id! : generatePrefixedId('TXN');

  // Preserve custom attributes and scope unmapped/JSON fields like admin_fee into custom_attributes
  const existingCustomAttrs =
    typeof input.custom_attributes === 'object' && input.custom_attributes !== null
      ? input.custom_attributes
      : {};

  const cleanCustomAttributes = {
    ...existingCustomAttrs,
    // Scope admin_fee strictly inside custom_attributes JSONB (NOT a core SQL column)
    ...(input.admin_fee !== undefined ? { admin_fee: input.admin_fee } : {}),
  };

  // Resolve agent_id to agent row id if agent name was provided
  let resolvedAgentId = input.agent_id !== undefined ? input.agent_id : undefined;
  if (resolvedAgentId && typeof resolvedAgentId === 'string' && !resolvedAgentId.startsWith('AGT_')) {
    try {
      const { data: matchedAgent } = await sb
        .from('agents')
        .select('id')
        .eq('client_id', input.client_id)
        .ilike('agent_name', resolvedAgentId.trim())
        .limit(1)
        .maybeSingle();

      if (matchedAgent?.id) {
        resolvedAgentId = matchedAgent.id;
      }
    } catch (e) {
      // Continue with provided agent_id if lookup fails
    }
  }

  // Build rowPayload strictly using valid physical SQL columns from the Supabase schema (all 33 columns mapped)
  const rowPayload: Record<string, any> = {
    id: transactionId,
    client_id: input.client_id,
    ...(input.tms_id !== undefined ? { tms_id: input.tms_id } : {}),
    ...(input.transaction_status !== undefined ? { transaction_status: input.transaction_status } : {}),
    ...(input.finance_status !== undefined ? { finance_status: input.finance_status } : {}),
    ...(input.transaction_side !== undefined ? { transaction_side: input.transaction_side } : {}),
    ...(input.property_address !== undefined ? { property_address: input.property_address } : {}),
    ...(input.client_name !== undefined ? { client_name: input.client_name } : {}),
    ...(input.lead_source !== undefined ? { lead_source: input.lead_source } : {}),
    ...(input.lead_owner !== undefined ? { lead_owner: input.lead_owner } : {}),
    ...(input.list_price !== undefined ? { list_price: input.list_price !== null ? roundCurrency(Number(input.list_price)) : null } : {}),
    ...(input.sales_price !== undefined ? { sales_price: input.sales_price !== null ? roundCurrency(Number(input.sales_price)) : null } : {}),
    ...(input.gci_type !== undefined ? { gci_type: input.gci_type } : {}),
    ...(input.gci_perc !== undefined ? { gci_perc: input.gci_perc !== null ? Number(input.gci_perc) : null } : {}),
    ...(input.gci_amount !== undefined ? { gci_amount: input.gci_amount !== null ? roundCurrency(Number(input.gci_amount)) : null } : {}),
    ...(input.total_commission !== undefined ? { total_commission: input.total_commission !== null ? roundCurrency(Number(input.total_commission)) : null } : {}),
    ...(input.transaction_fee !== undefined ? { transaction_fee: input.transaction_fee !== null ? roundCurrency(Number(input.transaction_fee)) : null } : {}),
    ...(input.list_date !== undefined ? { list_date: input.list_date ? new Date(input.list_date).toISOString().substring(0, 10) : null } : {}),
    ...(input.acceptance_date !== undefined ? { acceptance_date: input.acceptance_date ? new Date(input.acceptance_date).toISOString().substring(0, 10) : null } : {}),
    ...(input.closing_date !== undefined ? { closing_date: input.closing_date ? new Date(input.closing_date).toISOString() : null } : {}),
    ...(resolvedAgentId !== undefined ? { agent_id: resolvedAgentId } : {}),
    ...(input.isa !== undefined ? { isa: input.isa } : {}),
    ...(input.transaction_coordinator !== undefined ? { transaction_coordinator: input.transaction_coordinator } : {}),
    ...(input.co_broker !== undefined ? { co_broker: input.co_broker } : {}),
    ...(input.settlement_vendors !== undefined ? { settlement_vendors: input.settlement_vendors } : {}),
    ...(input.address_details !== undefined ? { address_details: input.address_details } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    custom_attributes: cleanCustomAttributes,
    archived: input.archived ?? false,
    created_by: userId,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  // Perform upsert on conflict of 'id'
  const { data, error } = await sb
    .from('transactions')
    .upsert(rowPayload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('Error upserting transaction to Supabase:', error);
    throw error;
  }

  const finalRecord = data || rowPayload;
  const finalTransactionId = finalRecord.id;

  // Persist commission breakdown items if provided by client or calculation
  if (Array.isArray(input.commission_items) && input.commission_items.length > 0) {
    try {
      // Remove any existing commission breakdown items for this transaction
      await sb
        .from('transaction_commission_items')
        .delete()
        .eq('transaction_id', finalTransactionId)
        .eq('client_id', input.client_id);

      const rowsToInsert = input.commission_items.map((item: any, idx: number) => ({
        client_id: input.client_id,
        transaction_id: finalTransactionId,
        submission_id: `SUB_${finalTransactionId}`,
        step_number: item.step_number || idx + 1,
        rule_name: item.rule_name || item.name || 'Commission Item',
        section: item.section || 'POST_SPLIT',
        payee_type: item.payee_type || (item.agent_id || item.agentName ? 'AGENT' : 'ENTITY'),
        payee_entity_id: item.payee_entity_id || item.entity || null,
        agent_id: item.agent_id || item.agentName || finalRecord.agent_id || null,
        calculated_amount: item.calculated_amount !== undefined ? roundCurrency(Number(item.calculated_amount)) : roundCurrency(Number(item.amount || 0)),
        final_amount: item.final_amount !== undefined ? roundCurrency(Number(item.final_amount)) : roundCurrency(Number(item.amount || 0)),
        is_manual_override: Boolean(item.is_manual_override),
        override_reason: item.override_reason || null,
        created_by: userId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }));

      const { error: insErr } = await sb
        .from('transaction_commission_items')
        .insert(rowsToInsert);

      if (insErr) {
        console.warn('Warning: Could not persist transaction_commission_items:', insErr.message);
      }
    } catch (err) {
      console.warn('Warning: Error saving commission items:', err);
    }
  } else if (templateId) {
    const submissionId = `SUB_${finalTransactionId}`;
    await processTransactionWaterfall(input.client_id, finalTransactionId, templateId, submissionId, sb);
  }

  return { transactionId: finalTransactionId, success: true, transaction: finalRecord };
}