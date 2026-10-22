/**
 * Loads what the commission engine (lib/commission-engine) reads in the browser: template rules and parameters,
 * the commission ledger and formula lookup tables, each cached per client until clearCommissionModuleCache().
 */
import type { FormulaLedgerRow, FormulaLookups, FormulaLookupRow } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { FORMULA_LOOKUP_TABLES, formulaLookupSource } from '@/lib/formula-lookup-tables';
import {
  formulaLookupRow,
  labelLedgerRows,
  type LedgerItem,
  type TemplateBundle,
  type TemplateLogicStep,
  type TemplateParameterRecord,
} from '@/lib/commission-engine/template';

const templateBundles = new Map<string, { promise: Promise<TemplateBundle> | null; bundle: TemplateBundle | null }>();

export function peekTemplateBundle(templateId: string): TemplateBundle | null {
  return templateBundles.get(templateId)?.bundle ?? null;
}

/** Rules and parameters for one template. Later reads reuse the first request unless refresh is requested. */
export function loadTemplateBundle(templateId: string, options?: { refresh?: boolean }): Promise<TemplateBundle> {
  const existing = templateBundles.get(templateId);
  if (!options?.refresh && existing?.promise) return existing.promise;
  const promise = (async () => {
    const [parametersResponse, logicResponse] = await Promise.all([
      fetch(`/api/commission-template-parameters?template_id=${encodeURIComponent(templateId)}`, { cache: 'no-store' }),
      fetch(`/api/commission-template-logic?template_id=${encodeURIComponent(templateId)}`, { cache: 'no-store' }),
    ]);
    const data = await parametersResponse.json();
    const logicData = await logicResponse.json();
    if (!parametersResponse.ok || !data.success) throw new Error(data.error || 'Failed to load parameters.');
    if (!logicResponse.ok || !logicData.success) throw new Error(logicData.error || 'Failed to load rules.');
    return {
      parameters: (data.parameters || []) as TemplateParameterRecord[],
      steps: (logicData.logic_steps || []) as TemplateLogicStep[],
    };
  })().then((bundle) => {
    const current = templateBundles.get(templateId);
    if (current?.promise === promise) current.bundle = bundle;
    return bundle;
  }).catch((error) => {
    const current = templateBundles.get(templateId);
    if (current?.promise === promise) {
      current.promise = null;
      if (!current.bundle) templateBundles.delete(templateId);
    }
    throw error;
  });
  templateBundles.set(templateId, { promise, bundle: options?.refresh ? existing?.bundle ?? null : null });
  return promise;
}

type LedgerParty = { id: string; name: string };

/**
 * The raw ledger, once per client: one 8 MB download however many callers ask, and while one is in flight
 * later callers share it. Entity names only label the rows, so each entity list gets its own labelled copy.
 */
type LedgerCacheEntry = {
  items: LedgerItem[] | null;
  promise: Promise<LedgerItem[]> | null;
  labelled: Map<string, FormulaLedgerRow[]>;
};

const ledgerCache = new Map<string, LedgerCacheEntry>();

function ledgerEntitiesKey(entities: LedgerParty[]): string {
  return entities.map((entity) => `${entity.id}\t${entity.name}`).join('\n');
}

async function fetchCommissionLedgerItems(clientId: string): Promise<LedgerItem[]> {
  const response = await fetch(`/api/transaction-commission-items?client_id=${encodeURIComponent(clientId)}&view=ledger`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.error || 'Failed to load commission lines.');
  return Array.isArray(data.items) ? data.items as LedgerItem[] : [];
}

function labelLedger(entry: LedgerCacheEntry, items: LedgerItem[], entities: LedgerParty[]): FormulaLedgerRow[] {
  const key = ledgerEntitiesKey(entities);
  const cached = entry.labelled.get(key);
  if (cached) return cached;
  const rows = labelLedgerRows(items, entities);
  entry.labelled.set(key, rows);
  return rows;
}

/** Rows already loaded for this client. The popup can calculate while a refresh is still running. */
export function peekCommissionLedger(clientId: string, entities: LedgerParty[]): FormulaLedgerRow[] | null {
  const entry = ledgerCache.get(clientId);
  if (!entry?.items) return null;
  return labelLedger(entry, entry.items, entities);
}

/** Commission lines joined to their transaction, for SUMIFS in calculation rules. */
export function loadCommissionLedger(
  clientId: string,
  entities: LedgerParty[],
  options?: { refresh?: boolean },
): Promise<FormulaLedgerRow[]> {
  let entry = ledgerCache.get(clientId);
  if (!entry) {
    entry = { items: null, promise: null, labelled: new Map() };
    ledgerCache.set(clientId, entry);
  }
  const current = entry;
  // A refresh while a download is already running shares it; otherwise reuse what is loaded.
  if (current.promise && (!options?.refresh || !current.items)) {
    return current.promise.then((items) => labelLedger(current, items, entities));
  }
  if (current.items && !options?.refresh) {
    return Promise.resolve(labelLedger(current, current.items, entities));
  }
  const promise = fetchCommissionLedgerItems(clientId).then((items) => {
    if (current.promise === promise) {
      current.items = items;
      current.labelled = new Map();
      current.promise = null;
    }
    return items;
  }).catch((error) => {
    if (current.promise === promise) {
      current.promise = null;
      if (!current.items) ledgerCache.delete(clientId);
    }
    throw error;
  });
  current.promise = promise;
  return promise.then((items) => labelLedger(current, items, entities));
}

const lookupTableCache = new Map<string, { promise: Promise<FormulaLookupRow[]>; rows: FormulaLookupRow[] | null }>();

async function fetchFormulaLookupTable(clientId: string, table: string): Promise<FormulaLookupRow[]> {
  const pageSize = 1000;
  const rows: FormulaLookupRow[] = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const response = await fetch(`/api/formula-lookups?table=${encodeURIComponent(table)}&client_id=${encodeURIComponent(clientId)}&offset=${offset}&limit=${pageSize}`, {
      headers: { 'x-client-id': clientId },
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.error || `Failed to load ${table}.`);
    const returnedClientId = String(data.client_id || '').trim();
    if (clientId && clientId !== 'DEMO' && returnedClientId && returnedClientId !== clientId) {
      throw new Error('Formula lookup returned a different client.');
    }
    const effectiveClientId = returnedClientId || clientId;
    const batch = Array.isArray(data.rows) ? data.rows as Record<string, unknown>[] : [];
    for (const record of batch) {
      const row = formulaLookupRow(effectiveClientId, record);
      if (row) rows.push(row);
    }
    if (batch.length < pageSize) break;
  }
  return rows;
}

function loadFormulaLookupTable(clientId: string, table: string, options?: { refresh?: boolean }): Promise<FormulaLookupRow[]> {
  const cacheKey = `${clientId}:${table}`;
  const existing = lookupTableCache.get(cacheKey);
  if (!options?.refresh && existing) return existing.promise;
  const promise = fetchFormulaLookupTable(clientId, table).then((rows) => {
    const current = lookupTableCache.get(cacheKey);
    if (current?.promise === promise) current.rows = rows;
    return rows;
  }).catch((error) => {
    const current = lookupTableCache.get(cacheKey);
    if (current?.promise === promise) lookupTableCache.delete(cacheKey);
    throw error;
  });
  lookupTableCache.set(cacheKey, { promise, rows: options?.refresh ? existing?.rows ?? null : null });
  return promise;
}

/** Lookup rows already loaded for these tables. */
export function peekFormulaLookups(clientId: string, tables: readonly string[]): FormulaLookups | null {
  const loaded: FormulaLookups['tables'] = {};
  for (const table of tables) {
    const entry = lookupTableCache.get(`${clientId}:${table}`);
    if (!entry?.rows) return null;
    loaded[table] = entry.rows;
  }
  const configEntry = lookupTableCache.get(`${clientId}:client_field_configurations`);
  if (configEntry?.rows) {
    loaded['client_field_configurations'] = configEntry.rows;
  }
  return { clientId, tables: loaded };
}

/** Client-scoped rows for the tables a formula's XLOOKUP actually reads. */
export async function loadFormulaLookups(
  clientId: string,
  tablesToLoad: readonly string[] = FORMULA_LOOKUP_TABLES,
  options?: { refresh?: boolean },
): Promise<FormulaLookups> {
  const tablesWithConfigs = [...new Set([...tablesToLoad, 'client_field_configurations'])];
  const requested = tablesWithConfigs.flatMap((table) => {
    const source = formulaLookupSource(table);
    return source ? [{ key: table, source }] : [];
  });
  const loaded = await Promise.all(requested.map(async ({ key, source }) => [key, await loadFormulaLookupTable(clientId, source, options)] as const));
  const tables: FormulaLookups['tables'] = {};
  for (const [table, rows] of loaded) tables[table] = rows;
  return { clientId, tables };
}

/** Clears all module-level in-memory caches so subsequent calculations re-fetch fresh data. */
export function clearCommissionModuleCache(): void {
  templateBundles.clear();
  ledgerCache.clear();
  lookupTableCache.clear();
}

export function invalidateTemplateBundle(templateId?: string): void {
  if (templateId) templateBundles.delete(templateId);
  else templateBundles.clear();
}

export function invalidateFormulaLookups(clientId?: string, table?: string): void {
  if (clientId && table) {
    lookupTableCache.delete(`${clientId}:${table}`);
  } else if (clientId) {
    for (const key of lookupTableCache.keys()) {
      if (key.startsWith(`${clientId}:`)) lookupTableCache.delete(key);
    }
  } else {
    lookupTableCache.clear();
  }
}

export function invalidateCommissionLedger(clientId?: string): void {
  if (clientId) ledgerCache.delete(clientId);
  else ledgerCache.clear();
}
