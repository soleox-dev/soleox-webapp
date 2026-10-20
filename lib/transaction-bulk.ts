import type { SupabaseClient } from '@supabase/supabase-js';
import { DB_TRANSACTION_COLUMNS } from '@/lib/fields';
import { fromPercentPoints, roundPercentRate } from '@/lib/percent';
import { loadUserProtectionContext, writeUserProtectionChanges } from '@/lib/transaction-field-protections';
import {
  coerceSyncValue,
  formulaFieldsFromConfig,
  formulaWrites,
  isBlankValue,
  parseCustomAttributes,
  readMappedField,
  resolveSyncAgent,
  syncValuesEqual,
  userProtectionChanges,
  type ConfiguredTransactionField,
  type SyncAgent,
  type SyncFieldCatalogEntry,
} from '@/lib/transaction-sync';

/** Internal columns that are not fields on the transaction schema. */
const BULK_BLOCKED_KEYS = new Set([
  'client_id',
  'tms_connection',
  'archived',
  'permanently_deleted',
  'custom_attributes',
  'address_details',
  'co_broker',
  'settlement_vendors',
]);

/** Locked on a transaction, or audit stamps the user cannot edit. */
const BULK_READ_ONLY_KEYS = new Set([
  'id',
  'total_commission',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
]);

const FORMULA_FIELD_TYPES = new Set(['CURRENCY', 'NUMBER', 'PERCENT']);

const MAX_BULK_IDS = 5000;
const WRITE_CHUNK = 100;
const WRITE_CONCURRENCY = 8;

export interface BulkFieldChoice extends SyncFieldCatalogEntry {
  isRequired: boolean;
  options: string[];
}

function bulkFieldType(field: { field_key?: string | null; field_type?: string | null }): string {
  const fieldKey = String(field.field_key || '').trim();
  if (fieldKey === 'gci_perc') return 'PERCENT';
  return String(field.field_type || '').trim().toUpperCase();
}

/** Same rule as the schema page: only a numeric field with formula text is calculated. */
function hasCalculationFormula(field: {
  field_key?: string | null;
  field_type?: string | null;
  calculation_formula?: string | null;
}): boolean {
  return FORMULA_FIELD_TYPES.has(bulkFieldType(field)) && String(field.calculation_formula || '').trim().length > 0;
}

export function isBulkEditableField(field: {
  field_key?: string | null;
  field_type?: string | null;
  storage_type?: string | null;
  calculation_formula?: string | null;
  is_enabled?: boolean | null;
}): boolean {
  const fieldKey = String(field.field_key || '').trim();
  if (!fieldKey || BULK_BLOCKED_KEYS.has(fieldKey) || BULK_READ_ONLY_KEYS.has(fieldKey)) return false;
  if (field.is_enabled === false) return false;
  if (hasCalculationFormula(field)) return false;
  return true;
}

function storageTypeFor(fieldKey: string, configured?: string | null): 'CORE_COLUMN' | 'CUSTOM_JSON' {
  if (DB_TRANSACTION_COLUMNS.some((column) => column.field_key === fieldKey)) return 'CORE_COLUMN';
  return configured === 'CORE_COLUMN' ? 'CORE_COLUMN' : 'CUSTOM_JSON';
}

type BulkConfigField = ConfiguredTransactionField & {
  is_required?: boolean | null;
  is_enabled?: boolean | null;
  dropdown_options?: string[] | null;
};

function choiceFrom(field: BulkConfigField): BulkFieldChoice {
  const fieldKey = String(field.field_key || '').trim();
  const column = DB_TRANSACTION_COLUMNS.find((item) => item.field_key === fieldKey);
  const options = Array.isArray(field.dropdown_options)
    ? field.dropdown_options.map((option) => String(option)).filter(Boolean)
    : [];
  return {
    fieldKey,
    fieldLabel: String(field.field_label || column?.field_label || fieldKey),
    fieldType: fieldKey === 'gci_perc' ? 'PERCENT' : String(field.field_type || column?.field_type || 'TEXT'),
    storageType: storageTypeFor(fieldKey, field.storage_type),
    isRequired: Boolean(field.is_required),
    options,
  };
}

export interface BulkUpdateResult {
  updated: number;
  unchanged: number;
  skipped: number;
  errors: { id: string; message: string }[];
  rows: Record<string, unknown>[];
}

export async function bulkUpdateTransactions(
  sb: SupabaseClient,
  input: {
    clientId: string;
    userId: string;
    ids: string[];
    fieldKey: string;
    rawValue: string;
  },
): Promise<BulkUpdateResult> {
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error('Choose at least one transaction.');
  if (ids.length > MAX_BULK_IDS) throw new Error(`Choose ${MAX_BULK_IDS.toLocaleString('en-US')} transactions or fewer.`);

  const { data: fieldRows, error: fieldError } = await sb
    .from('client_field_configurations')
    .select('field_key, field_label, field_type, storage_type, calculation_formula, is_required, is_enabled, dropdown_options')
    .eq('client_id', input.clientId)
    .eq('target_table', 'transactions')
    .or('archived.is.null,archived.eq.false');
  if (fieldError) throw new Error(fieldError.message);

  const configured = (fieldRows || []) as BulkConfigField[];
  const match = configured.find((field) => String(field.field_key || '').trim() === input.fieldKey);
  if (!match || !isBulkEditableField(match)) throw new Error('That field cannot be updated in bulk.');
  const field = choiceFrom(match);
  const needsAgent = field.fieldType === 'AGENT_PICKER' || field.fieldKey === 'agent_id';
  const [lookupOptions, found, protectionContext, agents] = await Promise.all([
    loadLookupOptions(sb, input.clientId, field.fieldKey),
    loadActiveTransactions(sb, input.clientId, ids),
    loadUserProtectionContext(sb, input.clientId, input.userId, configured),
    needsAgent ? loadAgents(sb, input.clientId) : Promise.resolve([] as SyncAgent[]),
  ]);
  if (lookupOptions.length > 0) field.options = lookupOptions;

  const coerced = coerceBulkValue(field, input.rawValue);
  if (coerced.ok === false) throw new Error(coerced.message);

  let value = coerced.value;
  if (field.fieldKey === 'tms_id') {
    if (!isBlankValue(value)) {
      throw new Error('TMS ID can only be cleared in bulk. Each transaction needs its own TMS ID.');
    }
    value = null;
  }
  if (needsAgent) {
    const resolved = resolveSyncAgent(value, agents);
    if ('error' in resolved) throw new Error(resolved.error);
    if ('blank' in resolved) {
      value = null;
    } else {
      value = resolved.id;
    }
  }

  const formulaFields = formulaFieldsFromConfig(configured).filter((item) => item.fieldKey !== field.fieldKey);
  const foundIds = new Set(found.map((row) => String(row.id)));

  const result: BulkUpdateResult = {
    updated: 0,
    unchanged: 0,
    skipped: ids.filter((id) => !foundIds.has(id)).length,
    errors: [],
    rows: [],
  };

  const now = new Date().toISOString();
  const planned: PlannedBulkRow[] = [];
  found.forEach((row) => {
    const id = String(row.id);
    try {
      const plan = planBulkRow(row, field, value, formulaFields, now, input.userId);
      if (plan) planned.push(plan);
      else result.unchanged += 1;
    } catch (error) {
      result.errors.push({ id, message: error instanceof Error ? error.message : 'Could not update this transaction.' });
    }
  });

  const groups = new Map<string, { payload: Record<string, unknown>; rows: PlannedBulkRow[] }>();
  planned.forEach((row) => {
    const key = JSON.stringify(stableValue(row.payload));
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { payload: row.payload, rows: [row] });
  });

  const outcomes = await runPool([...groups.values()], WRITE_CONCURRENCY, (group) => (
    writeGroup(sb, input.clientId, group.payload, group.rows)
  ));
  const saved: PlannedBulkRow[] = [];
  outcomes.forEach((outcome) => {
    saved.push(...outcome.saved);
    result.errors.push(...outcome.failed);
  });

  if (protectionContext && saved.length > 0) {
    try {
      const protectionRows = saved.map((row) => ({
        transactionId: row.id,
        changes: userProtectionChanges({
          mappings: protectionContext.mappings,
          catalog: protectionContext.catalog,
          previous: row.previous,
          next: row.next,
        }),
      })).filter((row) => row.changes.length > 0);
      await writeUserProtectionChanges(sb, {
        clientId: input.clientId,
        userId: input.userId,
        rows: protectionRows,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Field protections could not be saved.';
      saved.forEach((row) => result.errors.push({ id: row.id, message }));
    }
  }

  result.updated = saved.length;
  result.rows = saved.map((row) => row.next);
  return result;
}

function coerceBulkValue(field: BulkFieldChoice, rawValue: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const text = rawValue.trim();
  if (!text) return { ok: true, value: null };
  if (field.fieldType === 'PERCENT') {
    const amount = Number(text.replace(/[%,$\s,]/g, ''));
    if (!Number.isFinite(amount)) return { ok: false, message: `${field.fieldLabel} is not a percent.` };
    return { ok: true, value: roundPercentRate(fromPercentPoints(amount)) };
  }
  if ((field.fieldType === 'SELECT') && field.options.length > 0 && !field.options.includes(text)) {
    return { ok: false, message: `${text} is not a ${field.fieldLabel} option.` };
  }
  return coerceSyncValue(text, field.fieldKey, field.fieldType);
}

async function loadLookupOptions(sb: SupabaseClient, clientId: string, fieldKey: string): Promise<string[]> {
  const { data, error } = await sb
    .from('client_lookup_values')
    .select('option_label, category')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .or('archived.is.null,archived.eq.false');
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  return (data || [])
    .filter((row) => String(row.category || '').toUpperCase() === fieldKey.toUpperCase())
    .map((row) => String(row.option_label || '').trim())
    .filter((label) => {
      if (!label || seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

async function loadAgents(sb: SupabaseClient, clientId: string): Promise<SyncAgent[]> {
  const { data, error } = await sb
    .from('agents')
    .select('id, tms_id, agent_email, agent_name')
    .eq('client_id', clientId);
  if (error) throw new Error(error.message);
  return (data || []).map((agent) => ({
    id: String(agent.id),
    tmsId: agent.tms_id ? String(agent.tms_id) : null,
    email: agent.agent_email ? String(agent.agent_email) : null,
    name: agent.agent_name ? String(agent.agent_name) : null,
  }));
}

async function loadActiveTransactions(sb: SupabaseClient, clientId: string, ids: string[]): Promise<Record<string, unknown>[]> {
  const batches = chunk(ids, WRITE_CHUNK);
  const parts = await runPool(batches, WRITE_CONCURRENCY, async (batch) => {
    const { data, error } = await sb
      .from('transactions')
      .select('*')
      .eq('client_id', clientId)
      .eq('archived', false)
      .eq('permanently_deleted', false)
      .in('id', batch);
    if (error) throw new Error(error.message);
    return data || [];
  });
  return parts.flat();
}

interface PlannedBulkRow {
  id: string;
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
  payload: Record<string, unknown>;
}

function planBulkRow(
  row: Record<string, unknown>,
  field: BulkFieldChoice,
  value: unknown,
  formulaFields: ReturnType<typeof formulaFieldsFromConfig>,
  now: string,
  userId: string,
): PlannedBulkRow | null {
  if (field.fieldKey === 'tms_id') return planTmsIdClear(row, now, userId);

  const current = readMappedField(row, field.fieldKey, field.storageType);
  if (syncValuesEqual(current, value, field.fieldType)) return null;

  const userWrite = {
    fieldKey: field.fieldKey,
    storageType: field.storageType,
    value,
    previous: current,
  };
  const writes = [userWrite, ...formulaWrites(formulaFields, row, [userWrite])];
  const next: Record<string, unknown> = { ...row, updated_at: now, updated_by: userId };
  const payload: Record<string, unknown> = { updated_at: now, updated_by: userId };
  const custom = { ...parseCustomAttributes(row.custom_attributes) };
  let customChanged = false;
  writes.forEach((write) => {
    if (write.storageType === 'CUSTOM_JSON') {
      if (isBlankValue(write.value)) delete custom[write.fieldKey];
      else custom[write.fieldKey] = write.value;
      customChanged = true;
      return;
    }
    payload[write.fieldKey] = write.value;
    next[write.fieldKey] = write.value;
  });
  if (customChanged) {
    payload.custom_attributes = custom;
    next.custom_attributes = custom;
  }
  return { id: String(row.id), previous: row, next, payload };
}

/** A blank TMS ID cannot be matched on the next sync. Drop the stored connection too. */
function planTmsIdClear(row: Record<string, unknown>, now: string, userId: string): PlannedBulkRow | null {
  const currentId = String(row.tms_id ?? '').trim();
  const connection = row.tms_connection;
  const linked = connection === 'connected' || connection === 'disconnected';
  if (!currentId && !linked) return null;

  const next: Record<string, unknown> = { ...row, tms_id: null, updated_at: now, updated_by: userId };
  const payload: Record<string, unknown> = { tms_id: null, updated_at: now, updated_by: userId };
  if (linked) {
    next.tms_connection = null;
    payload.tms_connection = null;
  }
  return { id: String(row.id), previous: row, next, payload };
}

async function writeGroup(
  sb: SupabaseClient,
  clientId: string,
  payload: Record<string, unknown>,
  rows: PlannedBulkRow[],
): Promise<{ saved: PlannedBulkRow[]; failed: { id: string; message: string }[] }> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const outcome = await updateIds(sb, clientId, rows.map((row) => row.id), payload);
  return {
    saved: outcome.updatedIds.map((id) => byId.get(id)).filter((row): row is PlannedBulkRow => Boolean(row)),
    failed: outcome.failed,
  };
}

async function updateIds(
  sb: SupabaseClient,
  clientId: string,
  ids: string[],
  payload: Record<string, unknown>,
): Promise<{ updatedIds: string[]; failed: { id: string; message: string }[] }> {
  const updatedIds: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const piece of chunk(ids, WRITE_CHUNK)) {
    const outcome = await updatePiece(sb, clientId, piece, payload);
    updatedIds.push(...outcome.updatedIds);
    failed.push(...outcome.failed);
  }
  return { updatedIds, failed };
}

async function updatePiece(
  sb: SupabaseClient,
  clientId: string,
  ids: string[],
  payload: Record<string, unknown>,
): Promise<{ updatedIds: string[]; failed: { id: string; message: string }[] }> {
  const { data, error } = await sb
    .from('transactions')
    .update(payload)
    .eq('client_id', clientId)
    .eq('archived', false)
    .eq('permanently_deleted', false)
    .in('id', ids)
    .select('id');
  if (!error) {
    const written = new Set((data || []).map((row) => String(row.id)));
    const updatedIds: string[] = [];
    const failed: { id: string; message: string }[] = [];
    ids.forEach((id) => {
      if (written.has(id)) updatedIds.push(id);
      else failed.push({ id, message: 'Transaction not found.' });
    });
    return { updatedIds, failed };
  }
  if (ids.length === 1) return { updatedIds: [], failed: [{ id: ids[0], message: error.message }] };
  const mid = Math.ceil(ids.length / 2);
  const [left, right] = await Promise.all([
    updatePiece(sb, clientId, ids.slice(0, mid), payload),
    updatePiece(sb, clientId, ids.slice(mid), payload),
  ]);
  return {
    updatedIds: [...left.updatedIds, ...right.updatedIds],
    failed: [...left.failed, ...right.failed],
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().map((key) => [key, stableValue(record[key])]);
  }
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}
