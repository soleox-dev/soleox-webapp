// lib/transactions.ts

import { getAuthenticatedSupabase } from '@/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { Transaction } from '@/types/schema';
import { CreateTransactionInput } from '@/lib/validations/transaction';
import { processTransactionWaterfall } from '@/lib/services/waterfall-service';
import { generatePrefixedId } from '@/lib/id';
import { recordUserFieldProtections } from '@/lib/transaction-field-protections';
import { recordAudit, recordAudits } from '@/lib/audit';
import { repairImportedText } from '@/lib/imported-text';
import { fetchAllPages } from '@/lib/supabase-pagination';

// Helper utility to safely round currency values to 2 decimal places
const roundCurrency = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

function readCustomAttributes(row: any): Record<string, any> {
  try {
    if (!row?.custom_attributes) return {};
    return typeof row.custom_attributes === 'string'
      ? JSON.parse(row.custom_attributes)
      : row.custom_attributes;
  } catch {
    return {};
  }
}

function repairImportedRecord(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (typeof value === 'string') next[key] = repairImportedText(value);
    else next[key] = value;
  });
  return next;
}

/** Puts saved custom field values on the transaction object the screen reads. */
export function presentTransaction(row: any): any {
  const customAttrs = repairImportedRecord(readCustomAttributes(row));
  return repairImportedRecord({
    ...row,
    ...customAttrs,
    custom_attributes: customAttrs,
  });
}

/**
 * Fetch transactions for a specific client tenant.
 * Active rows are the live ledger. Deleted rows are archived and still restorable.
 * Joins/resolves agent_id to the agents table to provide agent_name and primary_agent.
 */
export async function getTransactions(
  clientId: string,
  client?: SupabaseClient,
  scope: 'active' | 'deleted' = 'active',
): Promise<Transaction[]> {
  const sb = client || (await getAuthenticatedSupabase());

  const [txData, agentData] = await Promise.all([
    fetchAllPages((offset, limit, withCount) => {
      let q = sb
        .from('transactions')
        .select('*', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId);
      q = scope === 'deleted'
        ? q.eq('archived', true).eq('permanently_deleted', false)
        : q.or('archived.is.null,archived.eq.false');
      return q
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
    }),
    sb
      .from('agents')
      .select('id, agent_name')
      .eq('client_id', clientId)
      .order('id', { ascending: true })
      .then((res: any) => (res.data || []) as Array<{ id?: string | number; agent_name?: string; name?: string; agent_id?: string }>),
  ]);

  const agentMap = new Map<string, string>();
  agentData.forEach((ag: any) => {
    const name = ag.agent_name || ag.name;
    if (ag.id && name) agentMap.set(String(ag.id), name);
    if (ag.agent_id && name) agentMap.set(String(ag.agent_id), name);
  });

  const seenIds = new Set<string>();
  const uniqueTx = txData.filter((row: any) => {
    const id = String(row?.id || '');
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  // Parse custom attributes and format numeric values without forcing fallbacks
  return uniqueTx.map((row: any) => {
    const customAttrs = readCustomAttributes(row);
    const resolvedAgentName = row.agent_id ? (agentMap.get(String(row.agent_id)) || null) : null;

    return presentTransaction({
      ...row,
      agent_name: resolvedAgentName || customAttrs.primary_agent || null,
      primary_agent: resolvedAgentName || customAttrs.primary_agent || null,
      list_price: row.list_price ? roundCurrency(Number(row.list_price)) : null,
      sales_price: row.sales_price ? roundCurrency(Number(row.sales_price)) : null,
      gci_perc: row.gci_perc ? Number(row.gci_perc) : null,
      gci_amount: row.gci_amount ? roundCurrency(Number(row.gci_amount)) : null,
      transaction_fee: row.transaction_fee ? roundCurrency(Number(row.transaction_fee)) : null,
      total_commission: row.total_commission ? roundCurrency(Number(row.total_commission)) : null,
    }) as Transaction;
  });
}

export interface PendingTemplateSubmission {
  id?: string | null;
  template_id?: string | null;
  submitted_parameters?: unknown;
  status?: string | null;
}

/** Writes a template submission after the transaction itself has been saved. */
async function storeTemplateSubmission(
  sb: SupabaseClient,
  clientId: string,
  transactionId: string,
  submission: PendingTemplateSubmission,
  userId: string,
) {
  const templateId = String(submission.template_id || '').trim();
  if (!templateId) return;

  let existingId = submission.id ? String(submission.id) : '';
  if (!existingId) {
    const { data: existing, error: existingError } = await sb
      .from('commission_template_submissions')
      .select('id')
      .eq('client_id', clientId)
      .eq('transaction_id', transactionId)
      .or('archived.is.null,archived.eq.false')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(`Could not save the commission template: ${existingError.message}`);
    existingId = existing?.id ? String(existing.id) : '';
  }

  const row = {
    ...(existingId ? { id: existingId } : {}),
    client_id: clientId,
    transaction_id: transactionId,
    template_id: templateId,
    submitted_parameters: submission.submitted_parameters && typeof submission.submitted_parameters === 'object'
      ? submission.submitted_parameters
      : {},
    status: String(submission.status || 'SUBMITTED'),
    archived: false,
    updated_at: new Date().toISOString(),
    updated_by: userId,
    ...(existingId ? {} : { created_by: userId }),
  };

  const { error } = existingId
    ? await sb.from('commission_template_submissions').upsert(row, { onConflict: 'id' })
    : await sb.from('commission_template_submissions').insert(row);
  if (error) throw new Error(`Could not save the commission template: ${error.message}`);
}

/** Create or update a transaction, then store a pending template submission if the save succeeded. */
export async function createTransaction(
  input: CreateTransactionInput & { id?: string; [key: string]: any },
  templateId?: string,
  userId: string = 'SYSTEM',
  client?: SupabaseClient,
  templateSubmission?: PendingTemplateSubmission | null,
): Promise<{ transactionId: string; success: boolean; transaction?: any }> {
  const sb = client || (await getAuthenticatedSupabase());
  const isExistingRecord = Boolean(input.id && input.id.trim() !== '');
  const transactionId = isExistingRecord ? input.id! : generatePrefixedId('TXN');

  let previousRow: Record<string, unknown> | null = null;
  if (isExistingRecord) {
    const { data: existingRow, error: existingError } = await sb
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('client_id', input.client_id)
      .maybeSingle();
    if (existingError) throw existingError;
    previousRow = existingRow;
  }

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
    ...(input.tms_id !== undefined
      && (previousRow?.tms_connection === 'connected' || previousRow?.tms_connection === 'disconnected')
      && (
        !String(input.tms_id ?? '').trim()
        || String(input.tms_id ?? '').trim() !== String(previousRow?.tms_id ?? '').trim()
      ) ? { tms_connection: null } : {}),
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
  let savedCommissionItems: any[] | undefined;

  // Commission lines are the source of truth. Replace the deal's rows when the
  // client sends a list, including an empty list. Insert first so a failed write
  // leaves the previous lines in place.
  if (Array.isArray(input.commission_items)) {
    if (input.commission_items.length > 0) {
      const rowsToInsert = input.commission_items.map((item: any, idx: number) => ({
        client_id: input.client_id,
        transaction_id: finalTransactionId,
        submission_id: item.submission_id || `SUB_${finalTransactionId}`,
        step_number: item.step_number || idx + 1,
        section: item.section || 'POST_SPLIT',
        split_type: item.split_type || item.type || null,
        split_value: item.split_value !== undefined && item.split_value !== null ? Number(item.split_value) : null,
        payee_type: item.payee_type || (item.agent_id || item.agentName ? 'AGENT' : 'ENTITY'),
        payee_entity_id: item.payee_entity_id || null,
        agent_id: item.agent_id || null,
        final_amount: item.final_amount !== undefined
          ? roundCurrency(Number(item.final_amount))
          : roundCurrency(Number(item.calculated_amount ?? item.amount ?? 0)),
        custom_attributes: item.custom_attributes || {},
        created_by: userId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }));

      const { data: inserted, error: insErr } = await sb
        .from('transaction_commission_items')
        .insert(rowsToInsert)
        .select();

      if (insErr) {
        throw new Error(`Could not save commission lines: ${insErr.message}`);
      }
      savedCommissionItems = inserted || [];
      if (savedCommissionItems.length === 0) {
        throw new Error('Could not save commission lines: the new lines were not returned.');
      }

      const keepIds = savedCommissionItems.map((row) => row.id).filter(Boolean);
      const { error: delErr } = await sb
        .from('transaction_commission_items')
        .delete()
        .eq('transaction_id', finalTransactionId)
        .eq('client_id', input.client_id)
        .not('id', 'in', `(${keepIds.map((id: string) => `"${String(id).replace(/"/g, '')}"`).join(',')})`);

      if (delErr) {
        throw new Error(`Could not save commission lines: ${delErr.message}`);
      }
    } else {
      const { error: delErr } = await sb
        .from('transaction_commission_items')
        .delete()
        .eq('transaction_id', finalTransactionId)
        .eq('client_id', input.client_id);

      if (delErr) {
        throw new Error(`Could not save commission lines: ${delErr.message}`);
      }
      savedCommissionItems = [];
    }
  } else if (templateId) {
    const submissionId = `SUB_${finalTransactionId}`;
    await processTransactionWaterfall(input.client_id, finalTransactionId, templateId, submissionId, sb);
  }

  // Payments follow the same rule as commission lines: an explicit list replaces
  // what is stored, and an empty list removes every payment for the deal.
  if (Array.isArray(input.payments)) {
    const { error: clearPayErr } = await sb
      .from('payments')
      .delete()
      .eq('transaction_id', finalTransactionId)
      .eq('client_id', input.client_id);
    if (clearPayErr) {
      throw new Error(`Could not save payments: ${clearPayErr.message}`);
    }
  }

  if (Array.isArray(input.payments) && input.payments.length > 0) {
    try {

      const payRowsToInsert = input.payments.map((p: any) => ({
        client_id: input.client_id,
        transaction_id: finalTransactionId,
        amount_paid: roundCurrency(Number(p.amount_paid !== undefined ? p.amount_paid : p.amount || 0)),
        payment_status: p.payment_status || (p.payee_type === 'AGENT' ? 'Ready to Pay' : 'Pending Escrow Wire'),
        payment_date: p.payment_date || (finalRecord.closing_date ? String(finalRecord.closing_date).substring(0, 10) : new Date().toISOString().substring(0, 10)),
        payment_method: p.payment_method || (p.payee_type === 'AGENT' ? 'ACH' : 'Escrow Wire'),
        payee_type: p.payee_type || 'AGENT',
        agent_id: p.agent_id || null,
        payee_entity_id: p.payee_entity_id || null,
        disbursement_type: p.disbursement_type || (p.payee_type === 'AGENT' ? 'AGENT_NET' : 'THIRD_PARTY_DISBURSEMENT'),
        reference_number: p.reference_number || null,
        notes: p.notes || null,
        custom_attributes: p.custom_attributes || {},
        archived: false,
        created_by: userId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }));

      const { error: payErr } = await sb
        .from('payments')
        .insert(payRowsToInsert);

      if (payErr) {
        console.warn('Warning: Could not persist payments:', payErr.message);
      }
    } catch (err) {
      console.warn('Warning: Error saving payments:', err);
    }
  }

  if (templateSubmission?.template_id) {
    await storeTemplateSubmission(sb, input.client_id, finalTransactionId, templateSubmission, userId);
  }

  try {
    await recordUserFieldProtections(sb, {
      clientId: input.client_id,
      transactionId: finalTransactionId,
      userId,
      previous: previousRow,
      next: rowPayload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const missingTable = message.includes('does not exist') || message.includes('schema cache');
    if (!missingTable) {
      throw new Error(`The transaction was saved, but a field lock could not be recorded. ${message}`);
    }
    console.warn('Field protections were not recorded:', message);
  }

  const changedFields = previousRow
    ? Object.keys(rowPayload).filter((key) => !['updated_at', 'updated_by', 'created_at', 'created_by'].includes(key) && JSON.stringify(previousRow[key]) !== JSON.stringify(rowPayload[key])).slice(0, 40)
    : [];
  await recordAudit(sb, {
    clientId: input.client_id,
    actorEmail: userId,
    action: isExistingRecord ? 'update' : 'create',
    entity: 'transaction',
    entityId: finalTransactionId,
    summary: isExistingRecord ? `Updated transaction ${finalTransactionId}` : `Created transaction ${finalTransactionId}`,
    detail: changedFields.length > 0 ? { fields: changedFields } : {},
  });

  return {
    transactionId: finalTransactionId,
    success: true,
    transaction: presentTransaction(finalRecord),
    ...(savedCommissionItems !== undefined ? { commissionItems: savedCommissionItems } : {}),
  };
}

/** Archives a transaction and the commission, payment, and template records that belong to it. */
const TRANSACTION_CHILD_TABLES = [
  'transaction_commission_items',
  'payments',
  'commission_template_submissions',
] as const;

async function setChildRecordsArchived(
  sb: SupabaseClient,
  clientId: string,
  transactionId: string,
  archived: boolean,
  userId: string,
) {
  const now = new Date().toISOString();
  for (const table of TRANSACTION_CHILD_TABLES) {
    let query = sb
      .from(table)
      .update({ archived, updated_at: now, updated_by: userId })
      .eq('transaction_id', transactionId)
      .eq('client_id', clientId);
    if (!archived) query = query.eq('archived', true);
    const { error } = await query;
    if (error) throw new Error(error.message);
  }
}

export async function deleteTransaction(
  clientId: string,
  transactionId: string,
  userId: string,
  client?: SupabaseClient,
) {
  const sb = client || (await getAuthenticatedSupabase());
  const now = new Date().toISOString();

  const { data: existing, error: lookupError } = await sb
    .from('transactions')
    .select('id')
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .or('archived.is.null,archived.eq.false')
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (!existing) throw new Error('Transaction not found.');

  await setChildRecordsArchived(sb, clientId, transactionId, true, userId);

  const { data: archived, error: archiveError } = await sb
    .from('transactions')
    .update({ archived: true, updated_at: now, updated_by: userId })
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .select('id');

  if (archiveError) throw new Error(archiveError.message);
  if (!archived?.length) throw new Error('Transaction not found or you do not have permission to delete it.');

  await recordAudit(sb, {
    clientId,
    actorEmail: userId,
    action: 'delete',
    entity: 'transaction',
    entityId: transactionId,
    summary: `Archived transaction ${transactionId}`,
  });

  return { id: transactionId };
}

const MAX_BULK_DELETE = 5000;
const DELETE_CHUNK = 100;
const DELETE_CONCURRENCY = 4;

type BulkDeleteOutcome = { deleted: string[]; errors: { id: string; message: string }[] };

export async function deleteTransactions(
  clientId: string,
  ids: string[],
  userId: string,
  client?: SupabaseClient,
): Promise<BulkDeleteOutcome> {
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  if (unique.length === 0) throw new Error('Choose at least one transaction.');
  if (unique.length > MAX_BULK_DELETE) throw new Error(`Choose ${MAX_BULK_DELETE.toLocaleString('en-US')} transactions or fewer.`);

  const sb = client || (await getAuthenticatedSupabase());
  const pieces: string[][] = [];
  for (let index = 0; index < unique.length; index += DELETE_CHUNK) pieces.push(unique.slice(index, index + DELETE_CHUNK));

  const outcomes: BulkDeleteOutcome[] = new Array(pieces.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < pieces.length) {
      const index = cursor;
      cursor += 1;
      outcomes[index] = await deleteTransactionPiece(sb, clientId, pieces[index], userId);
    }
  };
  await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, pieces.length) }, () => run()));

  return {
    deleted: outcomes.flatMap((outcome) => outcome.deleted),
    errors: outcomes.flatMap((outcome) => outcome.errors),
  };
}

/** Archives up to DELETE_CHUNK transactions with one query per table. Falls back to one at a time if a batch query fails. */
async function deleteTransactionPiece(
  sb: SupabaseClient,
  clientId: string,
  ids: string[],
  userId: string,
): Promise<BulkDeleteOutcome> {
  try {
    const now = new Date().toISOString();
    const { data: existing, error: lookupError } = await sb
      .from('transactions')
      .select('id')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false')
      .in('id', ids);
    if (lookupError) throw new Error(lookupError.message);

    const activeIds = new Set((existing || []).map((row) => String(row.id)));
    const errors = ids
      .filter((id) => !activeIds.has(id))
      .map((id) => ({ id, message: 'Transaction not found.' }));
    if (activeIds.size === 0) return { deleted: [], errors };

    const targets = [...activeIds];
    for (const table of TRANSACTION_CHILD_TABLES) {
      const { error } = await sb
        .from(table)
        .update({ archived: true, updated_at: now, updated_by: userId })
        .eq('client_id', clientId)
        .in('transaction_id', targets);
      if (error) throw new Error(error.message);
    }

    const { data: archived, error: archiveError } = await sb
      .from('transactions')
      .update({ archived: true, updated_at: now, updated_by: userId })
      .eq('client_id', clientId)
      .in('id', targets)
      .select('id');
    if (archiveError) throw new Error(archiveError.message);

    const archivedIds = new Set((archived || []).map((row) => String(row.id)));
    const deleted = targets.filter((id) => archivedIds.has(id));
    targets
      .filter((id) => !archivedIds.has(id))
      .forEach((id) => errors.push({ id, message: 'Transaction not found or you do not have permission to delete it.' }));

    await recordAudits(sb, deleted.map((id) => ({
      clientId,
      actorEmail: userId,
      action: 'delete',
      entity: 'transaction' as const,
      entityId: id,
      summary: `Archived transaction ${id}`,
    })));
    return { deleted, errors };
  } catch {
    const deleted: string[] = [];
    const errors: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await deleteTransaction(clientId, id, userId, sb);
        deleted.push(id);
      } catch (error) {
        errors.push({ id, message: error instanceof Error ? error.message : 'Could not delete this transaction.' });
      }
    }
    return { deleted, errors };
  }
}

/** Puts a deleted transaction back on the active ledger and restores the records archived with it. */
export async function restoreTransaction(
  clientId: string,
  transactionId: string,
  userId: string,
  client?: SupabaseClient,
) {
  const sb = client || (await getAuthenticatedSupabase());
  const now = new Date().toISOString();

  const { data: existing, error: lookupError } = await sb
    .from('transactions')
    .select('id, archived, permanently_deleted')
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (!existing || existing.archived !== true) throw new Error('Transaction not found.');
  if (existing.permanently_deleted === true) throw new Error('This transaction was permanently deleted.');

  await setChildRecordsArchived(sb, clientId, transactionId, false, userId);

  const { data: restored, error: restoreError } = await sb
    .from('transactions')
    .update({ archived: false, permanently_deleted: false, updated_at: now, updated_by: userId })
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .eq('archived', true)
    .eq('permanently_deleted', false)
    .select('id');

  if (restoreError) throw new Error(restoreError.message);
  if (!restored?.length) throw new Error('Transaction not found or you do not have permission to restore it.');

  await recordAudit(sb, {
    clientId,
    actorEmail: userId,
    action: 'restore',
    entity: 'transaction',
    entityId: transactionId,
    summary: `Restored transaction ${transactionId}`,
  });

  return { id: transactionId };
}

/** Hides a deleted transaction for good. The row stays so sync will not create it again. */
export async function permanentlyDeleteTransaction(
  clientId: string,
  transactionId: string,
  userId: string,
  client?: SupabaseClient,
) {
  const sb = client || (await getAuthenticatedSupabase());
  const now = new Date().toISOString();

  const { data: removed, error } = await sb
    .from('transactions')
    .update({ archived: true, permanently_deleted: true, updated_at: now, updated_by: userId })
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .eq('archived', true)
    .eq('permanently_deleted', false)
    .select('id');

  if (error) throw new Error(error.message);
  if (!removed?.length) throw new Error('Transaction not found or you do not have permission to delete it.');

  await recordAudit(sb, {
    clientId,
    actorEmail: userId,
    action: 'permanent_delete',
    entity: 'client',
    entityId: transactionId,
    summary: `Permanently deleted transaction ${transactionId}`,
  });

  return { id: transactionId };
}