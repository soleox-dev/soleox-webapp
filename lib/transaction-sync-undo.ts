import type { SupabaseClient } from '@supabase/supabase-js';
import { generatePrefixedId } from '@/lib/id';
import { fetchAllPages } from '@/lib/supabase-pagination';
import { transactionDealLabel } from '@/lib/transaction-label';
import { deleteTransaction } from '@/lib/transactions';
import {
  SYNC_ACTOR,
  catalogFromFields,
  parseCustomAttributes,
  readMappedField,
  syncValuesEqual,
  type SyncFieldCatalogEntry,
} from '@/lib/transaction-sync';
import {
  displaySyncValue,
  missingUndoColumn,
  type SyncRunDetail,
  type SyncRunUndo,
  type SyncUndoRow,
} from '@/lib/transaction-sync-run';

const WRITE_CONCURRENCY = 8;

export interface UndoFieldResult {
  fieldKey: string;
  fieldLabel: string;
  /** What the sync wrote, which undo replaces. */
  from: string;
  /** The value undo puts back. */
  to: string;
}

export interface UndoTransactionResult {
  transactionId: string;
  label: string;
  fields: UndoFieldResult[];
}

export interface UndoSkip {
  transactionId: string;
  label: string;
  fieldLabel?: string;
  reason: string;
}

export interface SyncUndoResult {
  runId: string;
  dryRun: boolean;
  reverted: UndoTransactionResult[];
  removed: { transactionId: string; label: string }[];
  skipped: UndoSkip[];
  errors: UndoSkip[];
  /** Before migration 055 a run only kept formatted values; undo read them back. */
  fromFormattedValues: boolean;
}

export class SyncUndoError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** One field undo means to put back. Raw runs keep values; older runs keep the text shown in the sync results. */
type PlannedField =
  | { kind: 'raw'; fieldKey: string; storageType: 'CORE_COLUMN' | 'CUSTOM_JSON'; fieldType: string; previous: unknown; value: unknown }
  | { kind: 'text'; fieldKey: string; storageType: 'CORE_COLUMN' | 'CUSTOM_JSON'; fieldType: string; before: string; after: string };

interface PlannedRow {
  transactionId: string;
  outcome: SyncUndoRow['outcome'];
  label: string;
  fields: PlannedField[];
  previousConnection?: string | null;
  clearedProtections: NonNullable<SyncUndoRow['clearedProtections']>;
}

interface RunRow {
  id: string;
  client_id: string;
  connection_id: string | null;
  status: string;
  started_at: string;
  created_count: number;
  updated_count: number;
  connected_count: number;
  disconnected_count: number;
  details: SyncRunDetail[] | null;
  undo?: SyncRunUndo | null;
  undone_at?: string | null;
}

function isBlankText(text: string): boolean {
  return text === '—';
}

/** Reads a value back from the text the sync results showed. Undo only uses it when it shows the same way again. */
function parseShownValue(text: string, fieldKey: string, fieldType: string, agentIdsByName: Map<string, string>): unknown {
  if (isBlankText(text)) return null;
  if (fieldKey === 'agent_id') return agentIdsByName.get(text) ?? text;
  if (fieldType === 'PERCENT' || fieldKey === 'gci_perc') {
    const points = Number(text.replace(/[%,\s]/g, ''));
    return Number.isFinite(points) ? Number((points / 100).toFixed(6)) : text;
  }
  if (fieldType === 'CURRENCY' || fieldType === 'NUMBER') {
    const amount = Number(text.replace(/[$,\s]/g, ''));
    return Number.isFinite(amount) ? amount : text;
  }
  if (fieldType === 'BOOLEAN' && (text === 'true' || text === 'false')) return text === 'true';
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/** Shown values match, with dates compared by day as the sync does ("2026-09-23" and "2026-09-23T00:00:00+00:00"). */
function sameShown(left: string, right: string, fieldType: string): boolean {
  if (left === right) return true;
  const day = /^\d{4}-\d{2}-\d{2}/;
  if (fieldType === 'DATE' || (day.test(left) && day.test(right))) return left.slice(0, 10) === right.slice(0, 10);
  return false;
}

function fieldEntry(catalog: Map<string, SyncFieldCatalogEntry>, fieldKey: string, deal: Record<string, unknown> | undefined): SyncFieldCatalogEntry {
  const known = catalog.get(fieldKey);
  if (known) return known;
  const core = Boolean(deal && Object.prototype.hasOwnProperty.call(deal, fieldKey));
  return {
    fieldKey,
    fieldLabel: fieldKey,
    fieldType: fieldKey === 'agent_id' ? 'AGENT_PICKER' : 'TEXT',
    storageType: core ? 'CORE_COLUMN' : 'CUSTOM_JSON',
  };
}

async function loadRun(sb: SupabaseClient, clientId: string, runId: string): Promise<{ run: RunRow; undoColumns: boolean }> {
  const { data, error } = await sb
    .from('integration_sync_runs')
    .select('*')
    .eq('id', runId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new SyncUndoError('This sync was not found.', 404);
  return { run: data as RunRow, undoColumns: Object.prototype.hasOwnProperty.call(data, 'undone_at') };
}

/** Only the latest sync that changed something can be undone, so a later sync never sits on top of the restored values. */
async function assertLatest(sb: SupabaseClient, run: RunRow, undoColumns: boolean): Promise<void> {
  const { data, error } = await sb
    .from('integration_sync_runs')
    .select(undoColumns ? 'id, undone_at' : 'id')
    .eq('client_id', run.client_id)
    .eq('status', 'succeeded')
    .gt('started_at', run.started_at)
    .or('created_count.gt.0,updated_count.gt.0,connected_count.gt.0,disconnected_count.gt.0');
  if (error) throw new Error(error.message);
  const later = ((data || []) as unknown as { undone_at?: string | null }[]).filter((row) => !row.undone_at);
  if (later.length > 0) {
    throw new SyncUndoError('A later sync changed transactions after this one. Only the latest sync can be undone.', 409);
  }
}

function planFromUndo(undo: SyncRunUndo, details: SyncRunDetail[]): PlannedRow[] {
  const labels = new Map(details.filter((detail) => detail.transactionId).map((detail) => [detail.transactionId as string, detail.label || '']));
  return undo.rows.map((row) => ({
    transactionId: row.transactionId,
    outcome: row.outcome,
    label: labels.get(row.transactionId) || '',
    fields: row.writes.map((write) => ({ kind: 'raw' as const, ...write })),
    previousConnection: row.previousConnection,
    clearedProtections: row.clearedProtections || [],
  }));
}

function planFromDetails(run: RunRow, details: SyncRunDetail[], catalog: Map<string, SyncFieldCatalogEntry>): PlannedRow[] {
  const changed = details.filter((detail) => (detail.outcome === 'create' || detail.outcome === 'update') && detail.transactionId);
  if (changed.length < (run.created_count || 0) + (run.updated_count || 0)) {
    throw new SyncUndoError('This sync changed more transactions than its results kept, so it cannot be undone.', 409);
  }
  return changed.map((detail) => ({
    transactionId: detail.transactionId as string,
    outcome: detail.outcome as 'create' | 'update',
    label: detail.label || '',
    fields: (detail.changes || []).map((change) => {
      const entry = fieldEntry(catalog, change.fieldKey, undefined);
      return {
        kind: 'text' as const,
        fieldKey: change.fieldKey,
        storageType: entry.storageType,
        fieldType: entry.fieldType,
        before: change.before,
        after: change.after,
      };
    }),
    clearedProtections: [],
  }));
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(WRITE_CONCURRENCY, items.length) }, () => run()));
}

/**
 * Puts back what one Sync with TMS changed.
 * A field is restored only while it still holds what the sync wrote; anything edited since is left alone and reported.
 * Transactions the sync added are archived, unless someone has changed them since.
 */
export async function undoSyncRun(
  sb: SupabaseClient,
  clientId: string,
  runId: string,
  actorEmail: string,
  options: { dryRun?: boolean } = {},
): Promise<SyncUndoResult> {
  const dryRun = Boolean(options.dryRun);
  const { run, undoColumns } = await loadRun(sb, clientId, runId);
  if (run.status !== 'succeeded') throw new SyncUndoError('Only a sync that finished can be undone.');
  if (run.undone_at) throw new SyncUndoError('This sync was already undone.', 409);
  if (!dryRun && !undoColumns) {
    throw new SyncUndoError('Undo needs database migration 055 (sync run undo). Apply it, then try again.', 409);
  }
  await assertLatest(sb, run, undoColumns);

  const [{ data: fieldRows, error: fieldError }, agents] = await Promise.all([
    sb.from('client_field_configurations')
      .select('field_key, field_label, field_type, storage_type, calculation_formula')
      .eq('client_id', clientId)
      .eq('target_table', 'transactions')
      .or('archived.is.null,archived.eq.false'),
    fetchAllPages((offset, limit, withCount) =>
      sb.from('agents')
        .select('id, agent_name', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .range(offset, offset + limit - 1)
    ),
  ]);
  if (fieldError) throw new Error(fieldError.message);
  const catalog = new Map(catalogFromFields(fieldRows || []).map((field) => [field.fieldKey, field]));
  const agentNames = new Map((agents || []).filter((agent) => agent.agent_name).map((agent) => [String(agent.id), String(agent.agent_name)]));
  const nameCounts = new Map<string, number>();
  agentNames.forEach((name) => nameCounts.set(name, (nameCounts.get(name) || 0) + 1));
  const agentIdsByName = new Map([...agentNames].filter(([, name]) => nameCounts.get(name) === 1).map(([id, name]) => [name, id]));

  const details = Array.isArray(run.details) ? run.details : [];
  const undo = run.undo && run.undo.version === 1 ? run.undo : null;
  const plan = undo ? planFromUndo(undo, details) : planFromDetails(run, details, catalog);
  const links = undo?.links ?? [];

  const ids = [...new Set([...plan.map((row) => row.transactionId), ...links.map((link) => link.transactionId)])];
  const deals = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < ids.length; index += 200) {
    const { data, error } = await sb
      .from('transactions')
      .select('*')
      .eq('client_id', clientId)
      .in('id', ids.slice(index, index + 200));
    if (error) throw new Error(error.message);
    (data || []).forEach((row) => deals.set(String(row.id), row as Record<string, unknown>));
  }

  const result: SyncUndoResult = {
    runId,
    dryRun,
    reverted: [],
    removed: [],
    skipped: [],
    errors: [],
    fromFormattedValues: !undo,
  };

  if (!dryRun) {
    const { data: marked, error: markError } = await sb
      .from('integration_sync_runs')
      .update({ undone_at: new Date().toISOString(), undone_by: actorEmail.trim().toLowerCase() })
      .eq('id', runId)
      .eq('client_id', clientId)
      .is('undone_at', null)
      .select('id');
    if (markError) {
      if (missingUndoColumn(markError.message)) throw new SyncUndoError('Undo needs database migration 055 (sync run undo). Apply it, then try again.', 409);
      throw new Error(markError.message);
    }
    if (!marked?.length) throw new SyncUndoError('This sync was already undone.', 409);
  }

  // Links first: an updated row's own previous link below is the state before the whole run.
  const linkGroups = new Map<string, string[]>();
  links.forEach((link) => {
    const deal = deals.get(link.transactionId);
    if (!deal || deal.tms_connection !== link.next) return;
    const key = link.previous ?? '';
    linkGroups.set(key, [...(linkGroups.get(key) || []), link.transactionId]);
  });
  if (!dryRun) {
    for (const [previous, group] of linkGroups) {
      for (let index = 0; index < group.length; index += 100) {
        const { error } = await sb
          .from('transactions')
          .update({ tms_connection: previous || null })
          .eq('client_id', clientId)
          .in('id', group.slice(index, index + 100));
        if (error) result.errors.push({ transactionId: group[index], label: '', reason: error.message });
      }
    }
  }

  const now = new Date().toISOString();
  await runPool(plan, async (row) => {
    const deal = deals.get(row.transactionId);
    const label = row.label || transactionDealLabel(deal) || row.transactionId;
    if (!deal) {
      result.skipped.push({ transactionId: row.transactionId, label, reason: 'This transaction no longer exists.' });
      return;
    }

    if (row.outcome === 'create') {
      if (deal.archived === true) {
        result.skipped.push({ transactionId: row.transactionId, label, reason: 'This transaction was already deleted.' });
        return;
      }
      if (deal.updated_by && deal.updated_by !== SYNC_ACTOR) {
        result.skipped.push({ transactionId: row.transactionId, label, reason: 'This transaction was edited after the sync added it, so it was kept.' });
        return;
      }
      try {
        if (!dryRun) await deleteTransaction(clientId, row.transactionId, actorEmail, sb);
        result.removed.push({ transactionId: row.transactionId, label });
      } catch (error) {
        result.errors.push({ transactionId: row.transactionId, label, reason: error instanceof Error ? error.message : 'It could not be deleted.' });
      }
      return;
    }

    const payload: Record<string, unknown> = {};
    const custom = { ...parseCustomAttributes(deal.custom_attributes) };
    let customChanged = false;
    const fields: UndoFieldResult[] = [];
    row.fields.forEach((field) => {
      const entry = fieldEntry(catalog, field.fieldKey, deal);
      const current = readMappedField(deal, field.fieldKey, field.storageType);
      let restore: unknown;
      if (field.kind === 'raw') {
        if (!syncValuesEqual(current, field.value, field.fieldType)) {
          result.skipped.push({ transactionId: row.transactionId, label, fieldLabel: entry.fieldLabel, reason: 'Changed after the sync, so it was kept.' });
          return;
        }
        restore = field.previous;
      } else {
        if (!sameShown(displaySyncValue(current, field.fieldKey, field.fieldType, agentNames), field.after, field.fieldType)) {
          result.skipped.push({ transactionId: row.transactionId, label, fieldLabel: entry.fieldLabel, reason: 'Changed after the sync, so it was kept.' });
          return;
        }
        restore = parseShownValue(field.before, field.fieldKey, field.fieldType, agentIdsByName);
        if (!sameShown(displaySyncValue(restore, field.fieldKey, field.fieldType, agentNames), field.before, field.fieldType)) {
          result.skipped.push({ transactionId: row.transactionId, label, fieldLabel: entry.fieldLabel, reason: `The earlier value (${field.before}) could not be read back exactly, so it was kept.` });
          return;
        }
      }
      if (field.storageType === 'CUSTOM_JSON') {
        if (restore === null || restore === undefined) delete custom[field.fieldKey];
        else custom[field.fieldKey] = restore;
        customChanged = true;
      } else {
        payload[field.fieldKey] = restore ?? null;
      }
      fields.push({
        fieldKey: field.fieldKey,
        fieldLabel: entry.fieldLabel,
        from: displaySyncValue(current, field.fieldKey, field.fieldType, agentNames),
        to: displaySyncValue(restore, field.fieldKey, field.fieldType, agentNames),
      });
    });
    if (customChanged) payload.custom_attributes = custom;
    if (row.previousConnection !== undefined && deal.tms_connection === 'connected' && row.previousConnection !== 'connected') {
      payload.tms_connection = row.previousConnection;
    }

    try {
      if (!dryRun && Object.keys(payload).length > 0) {
        payload.updated_at = now;
        payload.updated_by = actorEmail;
        const { error } = await sb.from('transactions').update(payload).eq('id', row.transactionId).eq('client_id', clientId);
        if (error) throw new Error(error.message);
      }
      if (!dryRun && row.clearedProtections.length > 0) {
        const { error } = await sb.from('transaction_field_protections').upsert(
          row.clearedProtections.map((item) => ({
            id: generatePrefixedId('TFP'),
            client_id: clientId,
            transaction_id: row.transactionId,
            field_key: item.fieldKey,
            protection: item.protection,
            protected_by: actorEmail,
            protected_at: now,
          })),
          { onConflict: 'transaction_id,field_key', ignoreDuplicates: true },
        );
        if (error) throw new Error(error.message);
      }
      if (fields.length > 0) result.reverted.push({ transactionId: row.transactionId, label, fields });
    } catch (error) {
      result.errors.push({ transactionId: row.transactionId, label, reason: error instanceof Error ? error.message : 'It could not be saved.' });
    }
  });

  return result;
}
