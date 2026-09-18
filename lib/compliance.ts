import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getTenantContext } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';

export type TransactionStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISBURSED' | 'REJECTED';

export interface TransitionStatusInput {
  clientId: string;
  transactionId: string;
  newStatus: TransactionStatus;
  actorId: string;
  rejectionReason?: string;
}

export async function transitionTransactionStatus({
  clientId,
  transactionId,
  newStatus,
  actorId,
  rejectionReason,
}: TransitionStatusInput) {
  const supabase = await getAuthenticatedSupabase();

  // 1. Fetch current tenant context to check compliance rule
  const tenant = await getTenantContext(clientId, supabase);

  // 2. Fetch current transaction status
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('transaction_status')
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .single();

  if (txError || !transaction) {
    throw new Error(`Transaction ${transactionId} not found.`);
  }

  const currentStatus = transaction.transaction_status;

  // 3. Enforce Compliance & Redundancy Guards
  if (currentStatus === newStatus) {
    throw new Error(
      `Transaction ${transactionId} is already in state '${newStatus}'.`
    );
  }

  if (
    tenant.requireComplianceApproval &&
    currentStatus === 'DRAFT' &&
    newStatus === 'APPROVED'
  ) {
    throw new Error(
      `Tenant '${clientId}' requires compliance approval. Status must transition through PENDING_APPROVAL first.`
    );
  }

  // 4. Update Transaction Status in Supabase
  const { error: updateTxError } = await supabase
    .from('transactions')
    .update({
      transaction_status: newStatus,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq('id', transactionId)
    .eq('client_id', clientId);

  if (updateTxError) throw updateTxError;

  // 5. Update Payment Status as payments follow transaction compliance
  let paymentStatus = 'CALCULATED';
  if (newStatus === 'APPROVED') paymentStatus = 'APPROVED';
  if (newStatus === 'DISBURSED') paymentStatus = 'DISBURSED';
  if (newStatus === 'REJECTED') paymentStatus = 'HOLD';

  await supabase
    .from('payments')
    .update({
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq('transaction_id', transactionId)
    .eq('client_id', clientId);

  // 6. Write Audit Log Entry
  const auditId = await createAuditLog({
    clientId,
    actorId,
    action: `TRANSACTION_STATUS_${newStatus}`,
    targetEntity: 'transactions',
    entityId: transactionId,
    changesPayload: {
      previousStatus: currentStatus,
      newStatus,
      rejectionReason: rejectionReason || null,
      requireComplianceApproval: tenant.requireComplianceApproval,
    },
  });

  return {
    transactionId,
    previousStatus: currentStatus,
    newStatus,
    paymentStatus,
    auditId,
  };
}
