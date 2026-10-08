import { SupabaseClient } from '@supabase/supabase-js';
import { generatePrefixedId } from '@/lib/id';
import {
  catalogFromFields,
  userProtectionChanges,
  type ConfiguredTransactionField,
  type ProtectionChange,
  type SyncMapping,
} from '@/lib/transaction-sync';

const PROTECTION_CHUNK = 100;

export interface UserProtectionContext {
  mappings: SyncMapping[];
  catalog: ReturnType<typeof catalogFromFields>;
}

function skipsProtectionRecording(userId: string): boolean {
  return !userId || userId === 'SYSTEM' || userId.startsWith('sync:');
}

/** Sheets connection and column mappings. Null when this save should not record protections. */
export async function loadUserProtectionContext(
  sb: SupabaseClient,
  clientId: string,
  userId: string,
  fields: ConfiguredTransactionField[],
): Promise<UserProtectionContext | null> {
  if (skipsProtectionRecording(userId)) return null;
  const mappings = await loadSheetMappings(sb, clientId);
  if (!mappings) return null;
  return { mappings, catalog: catalogFromFields(fields) };
}

async function loadSheetMappings(sb: SupabaseClient, clientId: string): Promise<SyncMapping[] | null> {
  const { data: connections, error: connectionError } = await sb
    .from('integration_connections')
    .select('id')
    .eq('client_id', clientId)
    .eq('provider', 'google_sheets')
    .limit(1);
  if (connectionError) throw new Error(connectionError.message);
  const connectionId = connections?.[0]?.id ? String(connections[0].id) : '';
  if (!connectionId) return null;

  const { data: mappingRows, error: mappingError } = await sb
    .from('integration_field_mappings')
    .select('source_header, field_key, policy')
    .eq('client_id', clientId)
    .eq('connection_id', connectionId);
  if (mappingError) throw new Error(mappingError.message);

  return (mappingRows || []).map((row) => ({
    sourceHeader: String(row.source_header),
    fieldKey: row.field_key ? String(row.field_key) : null,
    policy: row.policy,
  }));
}

/** Records column locks from a person's save. Sync uses a different actor and does not call this. */
export async function recordUserFieldProtections(
  sb: SupabaseClient,
  input: {
    clientId: string;
    transactionId: string;
    userId: string;
    previous: Record<string, unknown> | null;
    next: Record<string, unknown>;
  },
) {
  if (skipsProtectionRecording(input.userId)) return;

  const [{ data: fields, error: fieldError }, mappings] = await Promise.all([
    sb.from('client_field_configurations').select('field_key, field_label, field_type, storage_type, calculation_formula').eq('client_id', input.clientId).eq('target_table', 'transactions').or('archived.is.null,archived.eq.false'),
    loadSheetMappings(sb, input.clientId),
  ]);
  if (fieldError) throw new Error(fieldError.message);
  if (!mappings) return;

  const changes = userProtectionChanges({
    mappings,
    catalog: catalogFromFields(fields || []),
    previous: input.previous,
    next: input.next,
  });
  if (changes.length === 0) return;

  await writeUserProtectionChanges(sb, {
    clientId: input.clientId,
    userId: input.userId,
    rows: [{ transactionId: input.transactionId, changes }],
  });
}

/** Writes lock, hold, and clear actions for many deals in a few statements. */
export async function writeUserProtectionChanges(
  sb: SupabaseClient,
  input: {
    clientId: string;
    userId: string;
    rows: { transactionId: string; changes: ProtectionChange[] }[];
  },
): Promise<void> {
  const clears = new Map<string, string[]>();
  const upserts: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  input.rows.forEach((row) => {
    row.changes.forEach((change) => {
      if (change.action === 'clear') {
        const ids = clears.get(change.fieldKey) || [];
        ids.push(row.transactionId);
        clears.set(change.fieldKey, ids);
        return;
      }
      upserts.push({
        id: generatePrefixedId('TFP'),
        client_id: input.clientId,
        transaction_id: row.transactionId,
        field_key: change.fieldKey,
        protection: change.action === 'lock' ? 'locked' : 'keep_until_tms',
        protected_by: input.userId,
        protected_at: now,
      });
    });
  });

  const writes: Promise<void>[] = [];
  clears.forEach((transactionIds, fieldKey) => {
    chunk(transactionIds, PROTECTION_CHUNK).forEach((piece) => {
      writes.push(deleteProtections(sb, input.clientId, fieldKey, piece));
    });
  });
  chunk(upserts, PROTECTION_CHUNK).forEach((piece) => {
    writes.push(upsertProtections(sb, piece));
  });
  await Promise.all(writes);
}

async function deleteProtections(sb: SupabaseClient, clientId: string, fieldKey: string, transactionIds: string[]): Promise<void> {
  const { error } = await sb
    .from('transaction_field_protections')
    .delete()
    .eq('client_id', clientId)
    .eq('field_key', fieldKey)
    .in('transaction_id', transactionIds);
  if (error) throw new Error(error.message);
}

async function upsertProtections(sb: SupabaseClient, rows: Record<string, unknown>[]): Promise<void> {
  const { error } = await sb
    .from('transaction_field_protections')
    .upsert(rows, { onConflict: 'transaction_id,field_key' });
  if (error) throw new Error(error.message);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
