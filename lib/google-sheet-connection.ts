import { SupabaseClient } from '@supabase/supabase-js';
import { generatePrefixedId } from '@/lib/id';
import { googleServiceAccount, parseSpreadsheetId, readGoogleSheet, spreadsheetUrl } from '@/lib/google-sheets';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  DEFAULT_SHEET_TAB,
  GOOGLE_SHEETS_PROVIDER,
  SYNC_POLICIES,
  catalogFromFields,
  collectSourceTmsIds,
  formulaFieldsFromConfig,
  isSyncableField,
  suggestFieldKey,
  type SyncPolicy,
} from '@/lib/transaction-sync';
import { transactionDefaultViewFromSettings } from '@/lib/transaction-default-view';

/** How long a stored TMS ID list is reused before the next page load reads the sheet again. */
const SOURCE_TMS_ID_CACHE_MS = 5 * 60 * 1000;

const sourceTmsIdReads = new Map<string, Promise<{ available: boolean; tmsIds: string[]; cached: boolean }>>();

export interface MappingInput {
  sourceHeader: string;
  fieldKey: string | null;
  policy: SyncPolicy;
}

export async function callerIsAdmin(sb: SupabaseClient, clientId: string): Promise<boolean> {
  const roles = await callerRoles(sb, clientId);
  return roles.some((role) => role === 'ADMIN');
}

const SYNC_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'COMMISSION_TRACKER_WRITE']);

export async function callerCanSyncTransactions(sb: SupabaseClient, clientId: string): Promise<boolean> {
  const roles = await callerRoles(sb, clientId);
  return roles.some((role) => SYNC_ROLES.has(role));
}

async function callerRoles(sb: SupabaseClient, clientId: string): Promise<string[]> {
  const { data, error } = await sb
    .from('client_user_roles')
    .select('role')
    .eq('client_id', clientId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => String(row.role || ''));
}

/** The client's TMS name, such as SkySlope. Blank until migration 049 adds the column. */
export async function loadTmsName(sb: SupabaseClient, clientId: string, connectionId: string): Promise<string> {
  const { data, error } = await sb
    .from('integration_connections')
    .select('tms_name')
    .eq('id', connectionId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) {
    if (/tms_name/.test(error.message)) return '';
    throw new Error(error.message);
  }
  return String(data?.tms_name || '').trim();
}

export async function loadGoogleSheetIntegration(sb: SupabaseClient, clientId: string) {
  const account = googleServiceAccount();
  const [{ data: connection, error: connectionError }, { data: client, error: clientError }, { data: fields, error: fieldError }] = await Promise.all([
    sb.from('integration_connections')
      .select('id, spreadsheet_id, tab_name, enabled')
      .eq('client_id', clientId)
      .eq('provider', GOOGLE_SHEETS_PROVIDER)
      .or('archived.is.null,archived.eq.false')
      .maybeSingle(),
    sb.from('clients').select('settings_json').eq('id', clientId).maybeSingle(),
    sb.from('client_field_configurations')
      .select('field_key, field_label, field_type, storage_type, calculation_formula, is_enabled')
      .eq('client_id', clientId)
      .eq('target_table', 'transactions')
      .or('archived.is.null,archived.eq.false'),
  ]);
  if (connectionError) throw new Error(connectionError.message);
  if (clientError) throw new Error(clientError.message);
  if (fieldError) throw new Error(fieldError.message);

  const catalog = catalogFromFields(fields || []);
  const formulaLabels = new Map(formulaFieldsFromConfig(fields || []).map((field) => [field.fieldKey, field.fieldLabel]));
  let mappings: MappingInput[] = [];
  let lastRun = null;
  let protections: Array<Record<string, unknown>> = [];
  if (connection?.id) {
    const [{ data: mappingRows, error: mappingError }, { data: runs, error: runError }, { data: protectionRows, error: protectionError }] = await Promise.all([
      sb.from('integration_field_mappings').select('source_header, field_key, policy').eq('connection_id', connection.id).order('source_header'),
      sb.from('integration_sync_runs').select('id, status, started_at, finished_at, created_count, updated_count, skipped_count, error_count, unchanged_count, connected_count, disconnected_count, message, details, highlights').eq('connection_id', connection.id).order('started_at', { ascending: false }).limit(1),
      sb.from('transaction_field_protections').select('id, transaction_id, field_key, protection, protected_by, protected_at').eq('client_id', clientId).order('protected_at', { ascending: false }),
    ]);
    if (mappingError) throw new Error(mappingError.message);
    if (runError) throw new Error(runError.message);
    if (protectionError) throw new Error(protectionError.message);
    mappings = (mappingRows || []).map((row) => {
      const fieldKey = row.field_key ? String(row.field_key) : null;
      const mappedKey = fieldKey && !formulaLabels.has(fieldKey) ? fieldKey : null;
      return {
        sourceHeader: String(row.source_header),
        fieldKey: mappedKey,
        policy: mappedKey && (row.policy === 'tms_wins' || row.policy === 'lock_on_edit' || row.policy === 'keep_until_tms') ? row.policy : 'disconnected',
      };
    });
    lastRun = runs?.[0] ?? null;
    const transactionIds = [...new Set((protectionRows || []).map((row) => String(row.transaction_id)))];
    const transactions = transactionIds.length === 0
      ? []
      : (await sb.from('transactions').select('id, tms_id, property_address').in('id', transactionIds)).data || [];
    const labels = new Map((transactions || []).map((row) => [String(row.id), row]));
    const fieldLabels = new Map(catalog.map((field) => [field.fieldKey, field.fieldLabel]));
    protections = (protectionRows || []).map((row) => {
      const deal = labels.get(String(row.transaction_id));
      return {
        id: row.id,
        transactionId: row.transaction_id,
        tmsId: deal?.tms_id ?? null,
        propertyAddress: deal?.property_address ?? null,
        fieldKey: row.field_key,
        fieldLabel: fieldLabels.get(String(row.field_key)) || row.field_key,
        protection: row.protection,
        protectedBy: row.protected_by,
        protectedAt: row.protected_at,
      };
    });
  }

  const formula = transactionDefaultViewFromSettings(client?.settings_json, clientId).filterFormula;
  const tmsName = connection?.id ? await loadTmsName(sb, clientId, String(connection.id)) : '';
  return {
    connection: connection ? {
      id: connection.id,
      spreadsheetId: connection.spreadsheet_id || '',
      spreadsheetUrl: connection.spreadsheet_id ? spreadsheetUrl(String(connection.spreadsheet_id)) : '',
      tabName: connection.tab_name || DEFAULT_SHEET_TAB,
      tmsName,
      enabled: Boolean(connection.enabled),
    } : null,
    mappings,
    fields: catalog.map((field) => ({
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      fieldType: field.fieldType,
    })),
    lastRun,
    protections,
    defaultViewFormula: formula,
    serviceAccountEmail: account?.client_email ?? null,
    serviceAccountConfigured: Boolean(account),
    canManage: await callerIsAdmin(sb, clientId),
  };
}

function freshSourceTmsIds(cachedAt: unknown, ids: unknown): string[] | null {
  if (!cachedAt || !Array.isArray(ids)) return null;
  const age = Date.now() - new Date(String(cachedAt)).getTime();
  if (!Number.isFinite(age) || age < 0 || age >= SOURCE_TMS_ID_CACHE_MS) return null;
  return ids.map((id) => String(id).trim().toLowerCase()).filter(Boolean);
}

/** Writes the TMS ID snapshot. Service role so any member's page load can refresh the shared copy. */
export async function rememberSourceTmsIds(
  connectionId: string,
  clientId: string,
  tmsIds: string[],
  sb?: SupabaseClient,
): Promise<void> {
  const row = {
    source_tms_ids: tmsIds,
    source_tms_ids_cached_at: new Date().toISOString(),
  };
  const writers = [
    process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdmin : null,
    sb ?? null,
  ].filter((writer): writer is SupabaseClient => Boolean(writer));
  for (const writer of writers) {
    try {
      const { error } = await writer
        .from('integration_connections')
        .update(row)
        .eq('id', connectionId)
        .eq('client_id', clientId);
      if (!error) return;
    } catch {
      // The next writer, or the next page load, can store the snapshot.
    }
  }
}

async function readConnectedTmsIds(
  sb: SupabaseClient,
  clientId: string,
): Promise<{ available: boolean; tmsIds: string[]; cached: boolean }> {
  const cachedSelect = await sb
    .from('integration_connections')
    .select('id, spreadsheet_id, tab_name, source_tms_ids, source_tms_ids_cached_at')
    .eq('client_id', clientId)
    .eq('provider', GOOGLE_SHEETS_PROVIDER)
    .or('archived.is.null,archived.eq.false')
    .maybeSingle();
  const missingCacheColumn = Boolean(cachedSelect.error && /source_tms_ids/.test(cachedSelect.error.message));
  const connectionResult = missingCacheColumn
    ? await sb
      .from('integration_connections')
      .select('id, spreadsheet_id, tab_name')
      .eq('client_id', clientId)
      .eq('provider', GOOGLE_SHEETS_PROVIDER)
      .or('archived.is.null,archived.eq.false')
      .maybeSingle()
    : cachedSelect;
  if (connectionResult.error) throw new Error(connectionResult.error.message);
  const connection = connectionResult.data as {
    id: string;
    spreadsheet_id: string | null;
    tab_name: string | null;
    source_tms_ids?: unknown;
    source_tms_ids_cached_at?: unknown;
  } | null;
  if (!connection?.spreadsheet_id) return { available: false, tmsIds: [], cached: false };

  const stored = freshSourceTmsIds(connection.source_tms_ids_cached_at, connection.source_tms_ids);
  if (stored) return { available: true, tmsIds: stored, cached: true };

  const { data: mappingRows, error: mappingError } = await sb
    .from('integration_field_mappings')
    .select('source_header, field_key')
    .eq('connection_id', connection.id)
    .eq('client_id', clientId)
    .eq('field_key', 'tms_id');
  if (mappingError) throw new Error(mappingError.message);
  const sourceHeader = String(mappingRows?.[0]?.source_header || '').trim();
  if (!sourceHeader) return { available: false, tmsIds: [], cached: false };

  const table = await readGoogleSheet(String(connection.spreadsheet_id), String(connection.tab_name || DEFAULT_SHEET_TAB));
  const tmsIds = collectSourceTmsIds(table.rows, sourceHeader);
  if (!missingCacheColumn) await rememberSourceTmsIds(String(connection.id), clientId, tmsIds, sb);
  return { available: true, tmsIds, cached: false };
}

/**
 * TMS IDs from the column mapped to TMS ID.
 * A snapshot under five minutes old is reused for every user of that client.
 * `available` is false when there is no sheet to compare, so the list does not invent a connection.
 */
export function loadConnectedTmsIds(
  sb: SupabaseClient,
  clientId: string,
): Promise<{ available: boolean; tmsIds: string[]; cached: boolean }> {
  const current = sourceTmsIdReads.get(clientId);
  if (current) return current;
  const job = readConnectedTmsIds(sb, clientId).finally(() => {
    if (sourceTmsIdReads.get(clientId) === job) sourceTmsIdReads.delete(clientId);
  });
  sourceTmsIdReads.set(clientId, job);
  return job;
}

export function normalizeMappingInputs(
  rawMappings: unknown,
  knownFieldKeys: Set<string>,
  formulaLabels: Map<string, string> = new Map(),
): { mappings: MappingInput[]; error: string | null } {
  if (!Array.isArray(rawMappings)) return { mappings: [], error: 'Column mappings are required.' };
  const mappings: MappingInput[] = [];
  const headers = new Set<string>();
  const fields = new Set<string>();
  for (const raw of rawMappings) {
    if (!raw || typeof raw !== 'object') return { mappings: [], error: 'Each column mapping needs a header.' };
    const record = raw as Record<string, unknown>;
    const sourceHeader = String(record.sourceHeader ?? record.source_header ?? '').trim();
    if (!sourceHeader) return { mappings: [], error: 'Each column mapping needs a header.' };
    const headerKey = sourceHeader.toLowerCase();
    if (headers.has(headerKey)) return { mappings: [], error: `The header ${sourceHeader} is mapped more than once.` };
    headers.add(headerKey);
    const fieldKeyRaw = String(record.fieldKey ?? record.field_key ?? '').trim();
    const fieldKey = fieldKeyRaw || null;
    if (fieldKey && formulaLabels.has(fieldKey)) {
      return { mappings: [], error: `${formulaLabels.get(fieldKey)} is calculated by a formula, so the sheet does not map to it.` };
    }
    if (fieldKey && !isSyncableField(fieldKey)) {
      return { mappings: [], error: `${fieldKey} cannot be synced.` };
    }
    if (fieldKey && !knownFieldKeys.has(fieldKey)) {
      return { mappings: [], error: `${fieldKey} is not a transaction field.` };
    }
    if (fieldKey && fields.has(fieldKey)) {
      return { mappings: [], error: `${fieldKey} is mapped from more than one column.` };
    }
    if (fieldKey) fields.add(fieldKey);
    const policyRaw = String(record.policy || (fieldKey ? 'tms_wins' : 'disconnected'));
    const policy = SYNC_POLICIES.includes(policyRaw as SyncPolicy) ? policyRaw as SyncPolicy : null;
    if (!policy) return { mappings: [], error: `Unknown sync policy for ${sourceHeader}.` };
    mappings.push({
      sourceHeader,
      fieldKey,
      policy: fieldKey ? policy === 'disconnected' ? 'tms_wins' : policy : 'disconnected',
    });
  }
  return { mappings, error: null };
}

export async function saveGoogleSheetIntegration(
  sb: SupabaseClient,
  clientId: string,
  userEmail: string,
  input: { spreadsheet: string; tabName: string; tmsName: string; enabled: boolean; mappings: unknown },
) {
  const spreadsheetId = parseSpreadsheetId(input.spreadsheet);
  if (!spreadsheetId) return { error: 'Enter a Google Sheets link or spreadsheet ID.', status: 400 as const };
  const tabName = input.tabName.trim() || DEFAULT_SHEET_TAB;
  if (tabName.length > 200) return { error: 'The tab name is too long.', status: 400 as const };
  const tmsName = input.tmsName.trim();
  if (tmsName.length > 60) return { error: 'The TMS name is too long.', status: 400 as const };

  const { data: fieldRows, error: fieldError } = await sb
    .from('client_field_configurations')
    .select('field_key, field_label, field_type, storage_type, calculation_formula')
    .eq('client_id', clientId)
    .eq('target_table', 'transactions')
    .or('archived.is.null,archived.eq.false');
  if (fieldError) throw new Error(fieldError.message);
  const formulaLabels = new Map(formulaFieldsFromConfig(fieldRows || []).map((field) => [field.fieldKey, field.fieldLabel]));
  const known = new Set(catalogFromFields(fieldRows || []).map((field) => field.fieldKey));
  const normalized = normalizeMappingInputs(input.mappings, known, formulaLabels);
  if (normalized.error) return { error: normalized.error, status: 400 as const };

  const tmsMapped = normalized.mappings.some((mapping) => mapping.fieldKey === 'tms_id');
  if (input.enabled && !tmsMapped) {
    return { error: 'Map a column to TMS ID before turning sync on.', status: 400 as const };
  }
  if (input.enabled) {
    const { data: client, error: clientError } = await sb.from('clients').select('settings_json').eq('id', clientId).maybeSingle();
    if (clientError) throw new Error(clientError.message);
    const formula = transactionDefaultViewFromSettings(client?.settings_json, clientId).filterFormula.trim();
    if (!formula) {
      return { error: 'Save a default view before turning sync on.', status: 400 as const };
    }
  }

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await sb
    .from('integration_connections')
    .select('id')
    .eq('client_id', clientId)
    .eq('provider', GOOGLE_SHEETS_PROVIDER)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const connectionId = existing?.id ? String(existing.id) : generatePrefixedId('INC');
  const connectionRow = {
    id: connectionId,
    client_id: clientId,
    provider: GOOGLE_SHEETS_PROVIDER,
    spreadsheet_id: spreadsheetId,
    tab_name: tabName,
    tms_name: tmsName || null,
    enabled: input.enabled,
    archived: false,
    updated_at: now,
    updated_by: userEmail,
    source_tms_ids: null,
    source_tms_ids_cached_at: null,
    ...(existing?.id ? {} : { created_by: userEmail }),
  };
  const writeConnection = (row: Record<string, unknown>) => (existing?.id
    ? sb.from('integration_connections').update(row).eq('id', connectionId).eq('client_id', clientId)
    : sb.from('integration_connections').insert(row));
  // Columns from a migration that has not run yet are dropped and the write is tried again.
  let row: Record<string, unknown> = connectionRow;
  let saveError = (await writeConnection(row)).error;
  for (let retry = 0; saveError && retry < 2; retry += 1) {
    const next = { ...row };
    if (/source_tms_ids/.test(saveError.message)) {
      delete next.source_tms_ids;
      delete next.source_tms_ids_cached_at;
    } else if (/tms_name/.test(saveError.message)) {
      delete next.tms_name;
    } else {
      break;
    }
    row = next;
    saveError = (await writeConnection(row)).error;
  }
  if (saveError) throw new Error(saveError.message);

  const { error: clearError } = await sb.from('integration_field_mappings').delete().eq('connection_id', connectionId).eq('client_id', clientId);
  if (clearError) throw new Error(clearError.message);
  if (normalized.mappings.length > 0) {
    const { error: insertError } = await sb.from('integration_field_mappings').insert(normalized.mappings.map((mapping) => ({
      id: generatePrefixedId('IFM'),
      client_id: clientId,
      connection_id: connectionId,
      source_header: mapping.sourceHeader,
      field_key: mapping.fieldKey,
      policy: mapping.policy,
      updated_at: now,
    })));
    if (insertError) throw new Error(insertError.message);
  }

  return { error: null, status: 200 as const, connectionId };
}

/** A deleted transaction field leaves its sheet column in place and stops sync from writing it. */
export async function disconnectTransactionFieldMapping(
  sb: SupabaseClient,
  clientId: string,
  fieldKey: string,
): Promise<void> {
  const key = fieldKey.trim();
  if (!clientId || !key) return;
  const { error } = await sb
    .from('integration_field_mappings')
    .update({
      field_key: null,
      policy: 'disconnected',
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId)
    .eq('field_key', key);
  if (error) throw new Error(error.message);
}

export function suggestMappings(headers: string[], fields: Array<{ fieldKey: string; fieldLabel: string; fieldType: string; storageType: 'CORE_COLUMN' | 'CUSTOM_JSON' }>) {
  const used = new Set<string>();
  return headers.map((header) => {
    const suggested = suggestFieldKey(header, fields);
    const fieldKey = suggested && !used.has(suggested) ? suggested : null;
    if (fieldKey) used.add(fieldKey);
    return {
      sourceHeader: header,
      fieldKey,
      policy: fieldKey ? 'tms_wins' as const : 'disconnected' as const,
    };
  });
}
