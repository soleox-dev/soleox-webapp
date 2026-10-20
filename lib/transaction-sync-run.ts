import { SupabaseClient } from '@supabase/supabase-js';
import { generatePrefixedId } from '@/lib/id';
import { validateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';
import { transactionDefaultViewFromSettings } from '@/lib/transaction-default-view';
import { readGoogleSheet } from '@/lib/google-sheets';
import { loadTmsName, rememberSourceTmsIds } from '@/lib/google-sheet-connection';
import { transactionDealLabel } from '@/lib/transaction-label';
import { formatTablePercent } from '@/lib/percent';
import { fetchAllPages } from '@/lib/supabase-pagination';
import {
  SYNC_ACTOR,
  catalogFromFields,
  formulaFieldsFromConfig,
  parseCustomAttributes,
  planTmsLinkUpdates,
  planTransactionSync,
  type PlannedSyncRow,
  type SyncAgent,
  type SyncFieldCatalogEntry,
  type SyncMapping,
  type SyncProtection,
  type ExistingSyncTransaction,
  type SheetSyncRow,
} from '@/lib/transaction-sync';

const DETAIL_LIMIT = 500;
const WRITE_CONCURRENCY = 8;
const LINK_CHUNK = 100;
/** Waits before each re-read when the sheet is still calculating. */
const SHEET_RETRY_DELAYS_MS = [2000, 4000];
/** Values Google Sheets shows in a formula cell that has not finished, or failed. */
const SHEET_ERROR_VALUE = /^(#N\/A|#REF!|#VALUE!|#ERROR!|#NAME\?|#DIV\/0!|#NUM!|#NULL!|#SPILL!|#CALC!|Loading\.{3}|Loading…)$/i;

/** How the integration tab read went. Recorded on the audit event, never shown to the user. */
export interface SheetReadHealth {
  attempts: number;
  errorRows: number;
  notReady: boolean;
}

function sheetCell(row: SheetSyncRow, header: string): string {
  const key = Object.keys(row.cells).find((item) => item.toLowerCase() === header.toLowerCase());
  return key ? String(row.cells[key] ?? '').trim() : '';
}

/** Counts TMS ID cells holding a sheet error and TMS ID cells holding a real id. */
export function inspectSheet(rows: SheetSyncRow[], tmsHeader: string): { errorRows: number; validRows: number } {
  let errorRows = 0;
  let validRows = 0;
  rows.forEach((row) => {
    const value = sheetCell(row, tmsHeader);
    if (!value) return;
    if (SHEET_ERROR_VALUE.test(value)) errorRows += 1;
    else validRows += 1;
  });
  return { errorRows, validRows };
}

export function isSheetErrorRow(row: SheetSyncRow, tmsHeader: string): boolean {
  return SHEET_ERROR_VALUE.test(sheetCell(row, tmsHeader));
}

/** Runs worker over items with at most `limit` in flight, keeping results in input order. */
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

export interface SyncFieldChange {
  fieldKey: string;
  fieldLabel: string;
  before: string;
  after: string;
}

export interface SyncRunDetail {
  rowNumber: number | null;
  tmsId: string | null;
  outcome: string;
  reason?: string;
  transactionId?: string;
  label?: string;
  changes?: SyncFieldChange[];
  propertyAddress?: string | null;
  transactionSide?: string | null;
}

export interface SyncHighlight {
  transactionId: string;
  fieldKeys: string[];
}

export interface SyncRunRecord {
  id: string;
  status: 'succeeded' | 'failed' | 'blocked';
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  unchangedCount: number;
  connectedCount: number;
  disconnectedCount: number;
  finishedAt: string | null;
  message: string | null;
  details: SyncRunDetail[];
  highlights: SyncHighlight[];
  sheet?: SheetReadHealth;
}

function displaySyncValue(
  value: unknown,
  fieldKey: string,
  fieldType: string | undefined,
  agentNames: Map<string, string>,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (fieldKey === 'agent_id') {
    const name = agentNames.get(String(value));
    return name || String(value);
  }
  if (fieldType === 'PERCENT' || fieldKey === 'gci_perc') return formatTablePercent(value);
  if (fieldType === 'CURRENCY') {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount)) return String(value);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
  if (fieldType === 'NUMBER') {
    const amount = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(amount) ? String(amount) : String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function storedText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function resultLabel(row: PlannedSyncRow, existing: ExistingSyncTransaction | undefined): string {
  const deal: Record<string, unknown> = { ...(existing?.deal || {}) };
  row.writes.forEach((write) => {
    if (write.origin === 'formula' || write.storageType === 'CUSTOM_JSON') return;
    deal[write.fieldKey] = write.value;
  });
  return transactionDealLabel(deal) || row.tmsId || 'Transaction';
}

function detailRows(
  rows: PlannedSyncRow[],
  catalog: SyncFieldCatalogEntry[],
  agents: SyncAgent[],
  existingByTmsId: Map<string, ExistingSyncTransaction>,
): SyncRunDetail[] {
  const fields = new Map(catalog.map((field) => [field.fieldKey, field]));
  const agentNames = new Map(agents.filter((agent) => agent.name).map((agent) => [agent.id, agent.name as string]));
  const important = rows.filter((row) => row.outcome === 'create' || row.outcome === 'update' || row.outcome === 'error');
  const rest = rows.filter((row) => row.outcome === 'skip' || (row.outcome === 'unchanged' && row.reason));
  return [...important, ...rest].slice(0, DETAIL_LIMIT).map((row) => {
    const existing = existingByTmsId.get(String(row.tmsId || '').toLowerCase());
    const changes = row.outcome === 'update'
      ? row.writes
        .filter((write) => write.origin !== 'formula' && write.fieldKey !== 'tms_id')
        .map((write) => {
          const field = fields.get(write.fieldKey);
          return {
            fieldKey: write.fieldKey,
            fieldLabel: field?.fieldLabel || write.fieldKey,
            before: displaySyncValue(write.previous, write.fieldKey, field?.fieldType, agentNames),
            after: displaySyncValue(write.value, write.fieldKey, field?.fieldType, agentNames),
          };
        })
      : undefined;
    const propertyAddress = row.propertyAddress || storedText(existing?.deal.property_address);
    const transactionSide = row.transactionSide || storedText(existing?.deal.transaction_side);
    return {
      rowNumber: row.rowNumber,
      tmsId: row.tmsId,
      outcome: row.outcome,
      ...(row.reason ? { reason: row.reason } : {}),
      ...(row.transactionId ? { transactionId: row.transactionId } : {}),
      ...((row.outcome === 'create' || row.outcome === 'update') ? { label: resultLabel(row, existing) } : {}),
      ...(changes && changes.length > 0 ? { changes } : {}),
      ...(propertyAddress ? { propertyAddress } : {}),
      ...(transactionSide ? { transactionSide } : {}),
    };
  });
}

async function insertRun(
  sb: SupabaseClient,
  run: {
    id: string;
    clientId: string;
    connectionId: string;
    startedAt: string;
    status: SyncRunRecord['status'];
    createdCount?: number;
    updatedCount?: number;
    skippedCount?: number;
    errorCount?: number;
    unchangedCount?: number;
    connectedCount?: number;
    disconnectedCount?: number;
    message?: string | null;
    details?: SyncRunDetail[];
    highlights?: SyncHighlight[];
  },
) {
  const finishedAt = new Date().toISOString();
  const { error } = await sb.from('integration_sync_runs').insert({
    id: run.id,
    client_id: run.clientId,
    connection_id: run.connectionId,
    started_at: run.startedAt,
    finished_at: finishedAt,
    status: run.status,
    created_count: run.createdCount ?? 0,
    updated_count: run.updatedCount ?? 0,
    skipped_count: run.skippedCount ?? 0,
    error_count: run.errorCount ?? 0,
    unchanged_count: run.unchangedCount ?? 0,
    connected_count: run.connectedCount ?? 0,
    disconnected_count: run.disconnectedCount ?? 0,
    message: run.message ?? null,
    details: run.details ?? [],
    highlights: run.highlights ?? [],
  });
  if (error) throw new Error(error.message);
  return finishedAt;
}

function blockMessage(formula: string, formulaError: string | null, tmsMapped: boolean): string | null {
  if (!formula.trim()) {
    return 'Save a default view before syncing. A blank filter would include every transaction, including ones that are already reconciled.';
  }
  if (formulaError) return `The default view formula could not be used: ${formulaError}`;
  if (!tmsMapped) return 'Map a column to TMS ID before syncing.';
  return null;
}

export async function syncGoogleSheetConnection(
  sb: SupabaseClient,
  clientId: string,
  connectionId: string,
  options?: { requireEnabled?: boolean; transactionIds?: string[] },
): Promise<SyncRunRecord> {
  const startedAt = new Date().toISOString();
  const runId = generatePrefixedId('ISR');

  const { data: connection, error: connectionError } = await sb
    .from('integration_connections')
    .select('id, spreadsheet_id, tab_name, enabled')
    .eq('id', connectionId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (connectionError) throw new Error(connectionError.message);
  if (!connection) throw new Error('This Google Sheet connection was not found.');

  const fail = async (message: string, status: SyncRunRecord['status'] = 'failed'): Promise<SyncRunRecord> => {
    await insertRun(sb, { id: runId, clientId, connectionId, startedAt, status, message, errorCount: status === 'failed' ? 1 : 0 });
    return {
      id: runId,
      status,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: status === 'failed' ? 1 : 0,
      unchangedCount: 0,
      connectedCount: 0,
      disconnectedCount: 0,
      finishedAt: null,
      message,
      details: [],
      highlights: [],
    };
  };

  if (options?.requireEnabled !== false && !connection.enabled) {
    return fail('Turn on sync for this spreadsheet before running it.', 'blocked');
  }
  if (!connection.spreadsheet_id) {
    return fail('Add the spreadsheet before syncing.', 'blocked');
  }

  const [{ data: client, error: clientError }, { data: mappingRows, error: mappingError }, { data: fieldRows, error: fieldError }] = await Promise.all([
    sb.from('clients').select('settings_json').eq('id', clientId).maybeSingle(),
    sb.from('integration_field_mappings').select('source_header, field_key, policy').eq('connection_id', connectionId).eq('client_id', clientId),
    sb.from('client_field_configurations').select('field_key, field_label, field_type, storage_type, calculation_formula').eq('client_id', clientId).eq('target_table', 'transactions').or('archived.is.null,archived.eq.false'),
  ]);
  if (clientError) return fail(clientError.message);
  if (mappingError) return fail(mappingError.message);
  if (fieldError) return fail(fieldError.message);

  const catalog = catalogFromFields(fieldRows || []);
  const formulaFields = formulaFieldsFromConfig(fieldRows || []);
  const fieldTypes = Object.fromEntries(catalog.map((field) => [field.fieldKey, field.fieldType]));
  formulaFields.forEach((field) => {
    fieldTypes[field.fieldKey] = field.fieldType;
  });
  fieldTypes.transaction_status = fieldTypes.transaction_status || 'SELECT';
  fieldTypes.finance_status = fieldTypes.finance_status || 'SELECT';
  const formula = transactionDefaultViewFromSettings(client?.settings_json, clientId).filterFormula;
  const knownNames = new Set<string>([...catalog.map((field) => field.fieldKey), 'status', 'transaction_status', 'finance_status']);
  const formulaError = validateFormula(formula, [...knownNames]);
  const mappings: SyncMapping[] = (mappingRows || []).map((row) => ({
    sourceHeader: String(row.source_header),
    fieldKey: row.field_key ? String(row.field_key) : null,
    policy: row.policy,
  }));
  const blocked = blockMessage(formula, formulaError, mappings.some((mapping) => mapping.fieldKey === 'tms_id' && mapping.policy !== 'disconnected'));
  if (blocked) return fail(blocked, 'blocked');

  // A formula-driven tab can briefly return #N/A while it calculates. A TMS ID hidden by an error
  // reads as missing and would disconnect that transaction, so read again, then stop the run
  // before any write if the tab still shows errors.
  const tmsHeader = mappings.find((mapping) => mapping.fieldKey === 'tms_id' && mapping.policy !== 'disconnected')?.sourceHeader || '';
  const tabName = String(connection.tab_name || 'SOLEOX Integration');
  let table: Awaited<ReturnType<typeof readGoogleSheet>>;
  let inspected = { errorRows: 0, validRows: 0 };
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      table = await readGoogleSheet(String(connection.spreadsheet_id), tabName);
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'The spreadsheet could not be read.');
    }
    inspected = inspectSheet(table.rows, tmsHeader);
    const ready = inspected.validRows > 0 && inspected.errorRows === 0;
    if (ready || attempts > SHEET_RETRY_DELAYS_MS.length) break;
    console.warn(`[sync] ${clientId} ${connectionId}: "${tabName}" read ${attempts} had ${inspected.errorRows} TMS ID errors and ${inspected.validRows} TMS IDs. Reading again.`);
    await new Promise((resolve) => setTimeout(resolve, SHEET_RETRY_DELAYS_MS[attempts - 1]));
  }
  const sheet: SheetReadHealth = {
    attempts,
    errorRows: inspected.errorRows,
    notReady: inspected.validRows === 0 || inspected.errorRows > 0,
  };
  if (sheet.notReady) {
    const errorRowNumbers = table.rows.filter((row) => isSheetErrorRow(row, tmsHeader)).map((row) => row.rowNumber);
    console.warn(`[sync] ${clientId} ${connectionId}: stopped after ${attempts} reads of "${tabName}" (${inspected.errorRows} TMS ID errors, ${inspected.validRows} TMS IDs). Error rows: ${errorRowNumbers.slice(0, 50).join(', ') || 'none'}. Nothing was changed.`);
    // Users know their TMS, not the integration tab, so the message names the TMS.
    const tms = (await loadTmsName(sb, clientId, connectionId)) || 'Your TMS';
    const count = errorRowNumbers.length;
    const message = inspected.validRows === 0
      ? `${tms} was still sending transactions, so nothing was changed. Try again in a minute.`
      : `${tms} sent ${count} transaction${count === 1 ? '' : 's'} without a ${tmsHeader || 'TMS ID'}, so nothing was changed. Try again in a minute.`;
    const blockedRun = await fail(message, 'blocked');
    return { ...blockedRun, sheet };
  }

  const [transactions, agents, protections] = await Promise.all([
    fetchAllPages((offset, limit, withCount) =>
      sb
        .from('transactions')
        .select('*', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .not('tms_id', 'is', null)
        .range(offset, offset + limit - 1)
    ),
    fetchAllPages((offset, limit, withCount) =>
      sb
        .from('agents')
        .select('id, tms_id, agent_email, agent_name', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false')
        .range(offset, offset + limit - 1)
    ),
    fetchAllPages((offset, limit, withCount) =>
      sb
        .from('transaction_field_protections')
        .select('transaction_id, field_key, protection', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .range(offset, offset + limit - 1)
    ),
  ]);

  const existingByTmsId = new Map<string, ExistingSyncTransaction>();
  (transactions || []).forEach((row) => {
    const tmsId = String(row.tms_id || '').trim();
    if (!tmsId) return;
    existingByTmsId.set(tmsId.toLowerCase(), {
      id: String(row.id),
      tmsId,
      deal: { ...row, custom_attributes: parseCustomAttributes(row.custom_attributes) },
    });
  });

  const syncAgents: SyncAgent[] = (agents || []).map((agent) => ({
    id: String(agent.id),
    tmsId: agent.tms_id ? String(agent.tms_id) : null,
    email: agent.agent_email ? String(agent.agent_email) : null,
    name: agent.agent_name ? String(agent.agent_name) : null,
  }));
  const syncProtections: SyncProtection[] = (protections || []).map((item) => ({
    transactionId: String(item.transaction_id),
    fieldKey: String(item.field_key),
    protection: item.protection === 'locked' ? 'locked' : 'keep_until_tms',
  }));

  const plan = planTransactionSync({
    formula,
    fieldTypes,
    catalog,
    formulaFields,
    mappings,
    rows: table.rows,
    existingByTmsId,
    protections: syncProtections,
    agents: syncAgents,
  });
  await rememberSourceTmsIds(String(connection.id), clientId, plan.sourceTmsIds, sb);

  const selectedIds = new Set((options?.transactionIds ?? []).map((id) => String(id).trim()).filter(Boolean));
  const selectionSync = selectedIds.size > 0;
  const selectedTmsKeys = selectionSync
    ? new Set(
      [...existingByTmsId.values()]
        .filter((row) => selectedIds.has(row.id))
        .map((row) => row.tmsId.trim().toLowerCase())
        .filter(Boolean),
    )
    : null;
  const plannedRows = selectedTmsKeys
    ? plan.rows.filter((row) => {
      const key = String(row.tmsId || '').trim().toLowerCase();
      return Boolean(key) && selectedTmsKeys.has(key) && row.outcome !== 'create';
    })
    : plan.rows;

  let created = 0;
  let updated = 0;

  const applied = await runPool(plannedRows, WRITE_CONCURRENCY, async (row): Promise<PlannedSyncRow> => {
    try {
      if (row.outcome === 'skip' || row.outcome === 'error') return row;
      if (row.outcome === 'unchanged') {
        if (row.clearProtections.length > 0 && row.transactionId) {
          await clearProtections(sb, clientId, row.transactionId, row.clearProtections);
        }
        return row;
      }
      if (row.outcome === 'create') {
        const id = generatePrefixedId('TXN');
        const payload = rowPayload(clientId, id, row, null, true);
        const { error } = await sb.from('transactions').insert(payload);
        if (error) throw new Error(error.message);
        created += 1;
        return { ...row, transactionId: id };
      }
      if (!row.transactionId) {
        return { ...row, outcome: 'error', reason: 'This transaction could not be matched.', writes: [] };
      }
      const current = existingByTmsId.get(String(row.tmsId || '').toLowerCase());
      const payload = rowPayload(clientId, row.transactionId, row, current?.deal ?? null, false);
      const { error } = await sb.from('transactions').update(payload).eq('id', row.transactionId).eq('client_id', clientId);
      if (error) throw new Error(error.message);
      if (current) current.deal.tms_connection = 'connected';
      if (row.clearProtections.length > 0) await clearProtections(sb, clientId, row.transactionId, row.clearProtections);
      updated += 1;
      return row;
    } catch (error) {
      return {
        ...row,
        outcome: 'error',
        reason: error instanceof Error ? error.message : 'This row could not be saved.',
        writes: [],
      };
    }
  });

  const linkUpdates = planTmsLinkUpdates({
    formula,
    fieldTypes,
    existing: [...existingByTmsId.values()].filter((row) => !selectionSync || selectedIds.has(row.id)),
    sourceTmsIds: new Set(plan.sourceTmsIds),
  });
  const previousConnection = new Map(
    [...existingByTmsId.values()].map((row) => [row.id, row.deal.tms_connection]),
  );
  let connected = 0;
  let disconnected = 0;
  const linkBatches: { tmsConnection: string; ids: string[] }[] = [];
  (['connected', 'disconnected'] as const).forEach((tmsConnection) => {
    const ids = linkUpdates.filter((update) => update.tmsConnection === tmsConnection).map((update) => update.transactionId);
    for (let index = 0; index < ids.length; index += LINK_CHUNK) {
      linkBatches.push({ tmsConnection, ids: ids.slice(index, index + LINK_CHUNK) });
    }
  });
  await runPool(linkBatches, WRITE_CONCURRENCY, async (batch) => {
    const { error } = await sb
      .from('transactions')
      .update({ tms_connection: batch.tmsConnection })
      .eq('client_id', clientId)
      .in('id', batch.ids);
    if (error) throw new Error(error.message);
  });
  linkUpdates.forEach((update) => {
    const previous = previousConnection.get(update.transactionId);
    if (update.tmsConnection === 'connected' && previous === 'disconnected') connected += 1;
    if (update.tmsConnection === 'disconnected' && previous === 'connected') disconnected += 1;
  });

  const skipped = applied.filter((row) => row.outcome === 'skip').length;
  const unchanged = applied.filter((row) => row.outcome === 'unchanged').length;
  const errorCount = applied.filter((row) => row.outcome === 'error').length;
  const details = detailRows(applied, catalog, syncAgents, existingByTmsId);
  const highlights = highlightRows(applied);
  const notes: string[] = [];
  if (selectionSync) notes.push('Only the selected transactions were synced. No new transactions were added.');
  if (unchanged > 0) notes.push(`${unchanged} transaction${unchanged === 1 ? ' was' : 's were'} already up to date.`);
  if (!selectionSync && plan.ignored > 0) notes.push(`${plan.ignored} sheet row${plan.ignored === 1 ? '' : 's'} had no TMS ID and ${plan.ignored === 1 ? 'was' : 'were'} ignored.`);
  if (disconnected > 0) notes.push(`${disconnected} transaction${disconnected === 1 ? '' : 's'} that ${disconnected === 1 ? 'was' : 'were'} connected to the TMS ${disconnected === 1 ? 'is' : 'are'} now disconnected.`);
  const message = notes.length > 0 ? notes.join(' ') : null;
  const finishedAt = await insertRun(sb, {
    id: runId,
    clientId,
    connectionId,
    startedAt,
    status: 'succeeded',
    createdCount: created,
    updatedCount: updated,
    skippedCount: skipped,
    errorCount,
    unchangedCount: unchanged,
    connectedCount: connected,
    disconnectedCount: disconnected,
    message,
    details,
    highlights,
  });

  return {
    id: runId,
    status: 'succeeded',
    createdCount: created,
    updatedCount: updated,
    skippedCount: skipped,
    errorCount,
    unchangedCount: unchanged,
    connectedCount: connected,
    disconnectedCount: disconnected,
    finishedAt,
    message,
    details,
    highlights,
    sheet,
  };
}

function highlightRows(rows: PlannedSyncRow[]): SyncHighlight[] {
  const highlights: SyncHighlight[] = [];
  rows.forEach((row) => {
    if ((row.outcome !== 'create' && row.outcome !== 'update') || !row.transactionId) return;
    const fieldKeys = [...new Set(
      row.writes
        .filter((write) => write.origin !== 'formula' && write.fieldKey !== 'tms_id')
        .map((write) => write.fieldKey),
    )];
    highlights.push({ transactionId: row.transactionId, fieldKeys });
  });
  return highlights;
}

function rowPayload(
  clientId: string,
  transactionId: string,
  row: PlannedSyncRow,
  current: Record<string, unknown> | null,
  creating: boolean,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const custom = { ...parseCustomAttributes(current?.custom_attributes) };
  const payload: Record<string, unknown> = {
    updated_at: now,
    updated_by: SYNC_ACTOR,
  };
  if (creating) {
    payload.id = transactionId;
    payload.client_id = clientId;
    payload.archived = false;
    payload.created_by = SYNC_ACTOR;
    payload.custom_attributes = custom;
    payload.tms_connection = 'connected';
  } else {
    payload.tms_connection = 'connected';
  }
  let customChanged = false;
  row.writes.forEach((write) => {
    if (write.storageType === 'CUSTOM_JSON') {
      custom[write.fieldKey] = write.value;
      customChanged = true;
      return;
    }
    payload[write.fieldKey] = write.value;
  });
  if (customChanged || creating) payload.custom_attributes = custom;
  return payload;
}

async function clearProtections(sb: SupabaseClient, clientId: string, transactionId: string, fieldKeys: string[]) {
  if (fieldKeys.length === 0) return;
  const { error } = await sb
    .from('transaction_field_protections')
    .delete()
    .eq('client_id', clientId)
    .eq('transaction_id', transactionId)
    .in('field_key', fieldKeys);
  if (error) throw new Error(error.message);
}

export function catalogFieldTypes(catalog: SyncFieldCatalogEntry[]): Record<string, string> {
  return Object.fromEntries(catalog.map((field) => [field.fieldKey, field.fieldType]));
}
