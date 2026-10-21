import { normalizeAgentName } from '@/lib/id';
import { DB_TRANSACTION_COLUMNS } from '@/lib/fields';
import { roundPercentRate } from '@/lib/percent';
import { dealMatchesSyncView, type SyncViewResult } from '@/lib/transaction-default-view';
import { duplicateTmsIdReason } from '@/lib/sync-finished-summary';

export const SYNC_ACTOR = 'sync:google_sheets';
export const GOOGLE_SHEETS_PROVIDER = 'google_sheets';
export const DEFAULT_SHEET_TAB = 'SOLEOX Integration';

export const SYNC_POLICIES = ['tms_wins', 'lock_on_edit', 'keep_until_tms', 'disconnected'] as const;
export type SyncPolicy = (typeof SYNC_POLICIES)[number];

const UNSYNCABLE_FIELDS = new Set([
  'id',
  'client_id',
  'archived',
  'permanently_deleted',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'tms_connection',
  'custom_attributes',
]);

const ARRAY_COLUMNS = new Set(['isa', 'transaction_coordinator']);
const JSON_COLUMNS = new Set(['address_details', 'co_broker']);

const HEADER_ALIASES: Record<string, string> = {
  tms_id: 'tms_id',
  tmsid: 'tms_id',
  transaction_id: 'tms_id',
  deal_id: 'tms_id',
  status: 'transaction_status',
  transaction_status: 'transaction_status',
  side: 'transaction_side',
  transaction_side: 'transaction_side',
  address: 'property_address',
  property: 'property_address',
  property_address: 'property_address',
  agent: 'agent_id',
  primary_agent: 'agent_id',
  agent_name: 'agent_id',
  agent_id: 'agent_id',
  gci: 'gci_amount',
  gci_amount: 'gci_amount',
  gci_percent: 'gci_perc',
  gci_percentage: 'gci_perc',
  gci_perc: 'gci_perc',
  close_date: 'closing_date',
  closed_date: 'closing_date',
  closing_date: 'closing_date',
  sale_price: 'sales_price',
  sales_price: 'sales_price',
  purchase_price: 'sales_price',
  list_price: 'list_price',
  client: 'client_name',
  client_name: 'client_name',
  lead_source: 'lead_source',
  finance_status: 'finance_status',
  transaction_fee: 'transaction_fee',
  total_commission: 'total_commission',
  notes: 'notes',
};

export interface SyncFieldCatalogEntry {
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  storageType: 'CORE_COLUMN' | 'CUSTOM_JSON';
}

export interface FormulaSyncField extends SyncFieldCatalogEntry {
  calculationFormula: string;
}

export interface ConfiguredTransactionField {
  field_key?: string | null;
  field_label?: string | null;
  field_type?: string | null;
  storage_type?: string | null;
  calculation_formula?: string | null;
}

export interface SyncMapping {
  sourceHeader: string;
  fieldKey: string | null;
  policy: SyncPolicy;
}

export interface SheetSyncRow {
  rowNumber: number;
  cells: Record<string, string>;
}

export interface SyncAgent {
  id: string;
  tmsId: string | null;
  email: string | null;
  name: string | null;
}

export interface SyncProtection {
  transactionId: string;
  fieldKey: string;
  protection: 'locked' | 'keep_until_tms';
}

export interface ExistingSyncTransaction {
  id: string;
  tmsId: string;
  deal: Record<string, unknown>;
}

export type PlannedOutcome = 'create' | 'update' | 'skip' | 'error' | 'unchanged';

export interface PlannedWrite {
  fieldKey: string;
  storageType: 'CORE_COLUMN' | 'CUSTOM_JSON';
  value: unknown;
  previous?: unknown;
  /** Formula results are recalculated in Soleox and are not TMS edits. */
  origin?: 'tms' | 'formula';
}

export interface PlannedSyncRow {
  rowNumber: number;
  tmsId: string | null;
  outcome: PlannedOutcome;
  reason?: string;
  transactionId?: string;
  writes: PlannedWrite[];
  clearProtections: string[];
  /** Address from the sheet row, when that column is mapped. */
  propertyAddress?: string | null;
  /** Side from the sheet row, when that column is mapped. */
  transactionSide?: string | null;
}

export interface SyncPlan {
  rows: PlannedSyncRow[];
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  unchanged: number;
  /** Sheet rows with a blank TMS ID. They are not inserted and they do not remove anything. */
  ignored: number;
  /** Lowercase TMS IDs that appeared on the source, including rows that were not written. */
  sourceTmsIds: string[];
}

export type TmsConnection = 'connected' | 'disconnected';

export interface TmsLinkUpdate {
  transactionId: string;
  tmsConnection: TmsConnection;
}

function roundCurrency(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function isSyncableField(fieldKey: string): boolean {
  return Boolean(fieldKey) && !UNSYNCABLE_FIELDS.has(fieldKey);
}

export function isBlankValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** Blank is always included. Zero applies to number, currency, and percent fields. The text "0" is a real value. */
export function isBlankOrZero(value: unknown, fieldType: string): boolean {
  if (isBlankValue(value)) return true;
  if (fieldType === 'NUMBER' || fieldType === 'CURRENCY' || fieldType === 'PERCENT') {
    const amount = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(amount) && amount === 0;
  }
  return false;
}

function parseCustom(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export function readMappedField(
  row: Record<string, unknown> | null,
  fieldKey: string,
  storageType: 'CORE_COLUMN' | 'CUSTOM_JSON',
): unknown {
  if (!row) return null;
  if (storageType === 'CUSTOM_JSON') {
    return parseCustom(row.custom_attributes)[fieldKey] ?? null;
  }
  return row[fieldKey] ?? null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function syncValuesEqual(left: unknown, right: unknown, fieldType: string): boolean {
  if (isBlankValue(left) && isBlankValue(right)) return true;
  if (isBlankValue(left) || isBlankValue(right)) return false;
  if (fieldType === 'NUMBER' || fieldType === 'CURRENCY') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
    return roundCurrency(leftNumber) === roundCurrency(rightNumber);
  }
  if (fieldType === 'PERCENT') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
    return roundPercentRate(leftNumber) === roundPercentRate(rightNumber);
  }
  if (fieldType === 'DATE') {
    return String(left).slice(0, 10) === String(right).slice(0, 10);
  }
  if (fieldType === 'BOOLEAN') return Boolean(left) === Boolean(right);
  if (Array.isArray(left) || Array.isArray(right) || (left && typeof left === 'object') || (right && typeof right === 'object')) {
    return stable(left ?? null) === stable(right ?? null);
  }
  return String(left).trim() === String(right).trim();
}

function parseNumber(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[$,%\s]/g, '').replace(/[()]/g, '');
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return 'invalid';
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return 'invalid';
  return negative ? -Math.abs(amount) : amount;
}

function parsePercent(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (!text) return null;
  const hasSign = text.includes('%');
  const amount = parseNumber(text);
  if (amount === 'invalid' || amount === null) return amount;
  if (hasSign || Math.abs(amount) > 1) return roundPercentRate(amount / 100);
  return roundPercentRate(amount);
}

function parseDate(raw: string): string | null | 'invalid' {
  const text = raw.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'invalid';
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const year = Number(us[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'invalid';
    return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return 'invalid';
}

function parseBoolean(raw: string): boolean | null | 'invalid' {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  if (['true', 'yes', 'y', '1'].includes(text)) return true;
  if (['false', 'no', 'n', '0'].includes(text)) return false;
  return 'invalid';
}

export function coerceSyncValue(
  raw: string,
  fieldKey: string,
  fieldType: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const text = raw.trim();
  if (ARRAY_COLUMNS.has(fieldKey)) {
    if (!text) return { ok: true, value: null };
    const items = text.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
    return { ok: true, value: items.length > 0 ? items : null };
  }
  if (JSON_COLUMNS.has(fieldKey)) {
    if (!text) return { ok: true, value: null };
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, message: `${fieldKey} must be a JSON object.` };
      }
      return { ok: true, value: parsed };
    } catch {
      return { ok: false, message: `${fieldKey} must be a JSON object.` };
    }
  }
  if (fieldType === 'CURRENCY' || fieldType === 'NUMBER') {
    const amount = parseNumber(text);
    if (amount === 'invalid') return { ok: false, message: `${fieldKey} is not a number.` };
    return { ok: true, value: amount === null ? null : fieldType === 'CURRENCY' ? roundCurrency(amount) : amount };
  }
  if (fieldType === 'PERCENT') {
    const rate = parsePercent(text);
    if (rate === 'invalid') return { ok: false, message: `${fieldKey} is not a percent.` };
    return { ok: true, value: rate };
  }
  if (fieldType === 'DATE') {
    const date = parseDate(text);
    if (date === 'invalid') return { ok: false, message: `${fieldKey} is not a date.` };
    return { ok: true, value: date };
  }
  if (fieldType === 'BOOLEAN') {
    const flag = parseBoolean(text);
    if (flag === 'invalid') return { ok: false, message: `${fieldKey} is not true or false.` };
    return { ok: true, value: flag };
  }
  return { ok: true, value: text || null };
}

export function resolveSyncAgent(
  raw: unknown,
  agents: SyncAgent[],
): { id: string } | { error: string } | { blank: true } {
  if (isBlankValue(raw)) return { blank: true };
  const text = String(raw).trim();
  if (text.startsWith('AGT_')) {
    const match = agents.find((agent) => agent.id === text);
    return match ? { id: match.id } : { error: `No agent matches ${text}.` };
  }
  const byTms = agents.filter((agent) => agent.tmsId && agent.tmsId.toLowerCase() === text.toLowerCase());
  if (byTms.length === 1) return { id: byTms[0].id };
  if (byTms.length > 1) return { error: `More than one agent has TMS ID ${text}.` };
  if (text.includes('@')) {
    const byEmail = agents.filter((agent) => agent.email && agent.email.toLowerCase() === text.toLowerCase());
    if (byEmail.length === 1) return { id: byEmail[0].id };
    if (byEmail.length > 1) return { error: `More than one agent has email ${text}.` };
    return { error: `No agent matches ${text}.` };
  }
  const normalized = normalizeAgentName(text).toLowerCase();
  const byName = agents.filter((agent) => agent.name && normalizeAgentName(agent.name).toLowerCase() === normalized);
  if (byName.length === 1) return { id: byName[0].id };
  if (byName.length > 1) return { error: `More than one agent is named ${normalizeAgentName(text)}.` };
  return { error: `No agent matches ${text}.` };
}

export function suggestFieldKey(header: string, fields: SyncFieldCatalogEntry[]): string | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  const byKey = fields.find((field) => normalizeHeader(field.fieldKey) === normalized && isSyncableField(field.fieldKey));
  if (byKey) return byKey.fieldKey;
  const byLabel = fields.find((field) => normalizeHeader(field.fieldLabel) === normalized && isSyncableField(field.fieldKey));
  if (byLabel) return byLabel.fieldKey;
  const alias = HEADER_ALIASES[normalized];
  if (alias && fields.some((field) => field.fieldKey === alias && isSyncableField(alias))) return alias;
  return null;
}

const CORE_FIELD_KEYS = new Set(DB_TRANSACTION_COLUMNS.map((column) => column.field_key));

/** Fields the Transactions Schema page always shows, even when a client has not saved a row for them. */
const SCHEMA_MANDATORY_KEYS = [
  'transaction_status',
  'agent_id',
  'transaction_side',
  'property_address',
  'sales_price',
  'gci_type',
  'gci_perc',
  'gci_amount',
  'total_commission',
];

const FORMULA_FIELD_TYPES = new Set(['CURRENCY', 'NUMBER', 'PERCENT']);

export function formulaText(field: { calculation_formula?: string | null }): string {
  return String(field.calculation_formula || '').trim();
}

/** A core numeric field with a formula is calculated. Custom fields stay mappable. */
export function isFormulaDriven(field: ConfiguredTransactionField): boolean {
  const fieldKey = String(field.field_key || '').trim();
  if (!fieldKey || fieldKey === 'agent_id') return false;
  if (!CORE_FIELD_KEYS.has(fieldKey) || field.storage_type === 'CUSTOM_JSON') return false;
  const fieldType = fieldKey === 'gci_perc' ? 'PERCENT' : String(field.field_type || '');
  return FORMULA_FIELD_TYPES.has(fieldType) && formulaText(field).length > 0;
}

function storageTypeFor(fieldKey: string, configured?: string | null): 'CORE_COLUMN' | 'CUSTOM_JSON' {
  if (CORE_FIELD_KEYS.has(fieldKey)) return 'CORE_COLUMN';
  return configured === 'CORE_COLUMN' ? 'CORE_COLUMN' : 'CUSTOM_JSON';
}

function catalogEntry(field: ConfiguredTransactionField, fallback?: { field_label: string; field_type: string }): SyncFieldCatalogEntry {
  const fieldKey = String(field.field_key || '').trim();
  return {
    fieldKey,
    fieldLabel: String(field.field_label || fallback?.field_label || fieldKey),
    fieldType: fieldKey === 'gci_perc' ? 'PERCENT' : String(field.field_type || fallback?.field_type || 'TEXT'),
    storageType: storageTypeFor(fieldKey, field.storage_type),
  };
}

/**
 * Mappable Soleox fields: everything configured for transactions, including custom fields.
 * Formula-driven fields are omitted. Callers pass them to the sync separately so the sheet cannot overwrite them.
 */
export function catalogFromFields(configured: ConfiguredTransactionField[]): SyncFieldCatalogEntry[] {
  if (configured.length === 0) {
    return DB_TRANSACTION_COLUMNS
      .filter((column) => isSyncableField(column.field_key))
      .map((column) => catalogEntry(column));
  }

  const byKey = new Map<string, SyncFieldCatalogEntry>();
  configured.forEach((field) => {
    const fieldKey = String(field.field_key || '').trim();
    if (!isSyncableField(fieldKey) || isFormulaDriven(field)) return;
    byKey.set(fieldKey, catalogEntry(field, DB_TRANSACTION_COLUMNS.find((column) => column.field_key === fieldKey)));
  });
  SCHEMA_MANDATORY_KEYS.forEach((fieldKey) => {
    if (byKey.has(fieldKey) || !isSyncableField(fieldKey)) return;
    const saved = configured.find((field) => String(field.field_key || '').trim() === fieldKey);
    if (saved && isFormulaDriven(saved)) return;
    const column = DB_TRANSACTION_COLUMNS.find((item) => item.field_key === fieldKey);
    if (!column) return;
    byKey.set(fieldKey, catalogEntry(saved || column, column));
  });
  return Array.from(byKey.values());
}

export function formulaFieldsFromConfig(configured: ConfiguredTransactionField[]): FormulaSyncField[] {
  const fields: FormulaSyncField[] = [];
  configured.forEach((field) => {
    const calculationFormula = formulaText(field);
    const fieldKey = String(field.field_key || '').trim();
    if (!isFormulaDriven(field) || !isSyncableField(fieldKey)) return;
    fields.push({
      ...catalogEntry(field, DB_TRANSACTION_COLUMNS.find((column) => column.field_key === fieldKey)),
      calculationFormula,
    });
  });
  return fields;
}

function orderFormulaFields(fields: FormulaSyncField[]): FormulaSyncField[] {
  const pending = [...fields];
  const ordered: FormulaSyncField[] = [];
  while (pending.length > 0) {
    const ready = pending.filter((field) => !pending.some((other) => (
      other.fieldKey !== field.fieldKey && new RegExp(`\\b${other.fieldKey}\\b`).test(field.calculationFormula)
    )));
    const batch = ready.length > 0 ? ready : pending.slice(0, 1);
    ordered.push(...batch);
    const chosen = new Set(batch.map((field) => field.fieldKey));
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (chosen.has(pending[index].fieldKey)) pending.splice(index, 1);
    }
  }
  return ordered;
}

function formulaContext(deal: Record<string, unknown>): Record<string, unknown> {
  return { ...parseCustom(deal.custom_attributes), ...deal };
}

/** Same substitution the transaction form uses, so a sync stores the value the form would show. */
function evaluateTransactionFieldFormula(formula: string, context: Record<string, unknown>): number {
  let expression = formula.trim();
  const keys = Object.keys(context).sort((left, right) => right.length - left.length);
  keys.forEach((key) => {
    const value = context[key];
    const pattern = new RegExp(`\\b${key}\\b`, 'g');
    if (typeof value === 'number' && Number.isFinite(value)) expression = expression.replace(pattern, String(value));
    else if (typeof value === 'string') expression = expression.replace(pattern, `'${value.replace(/'/g, "\\'")}'`);
    else if (typeof value === 'boolean') expression = expression.replace(pattern, String(value));
    else expression = expression.replace(pattern, '0');
  });
  expression = expression.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => (
    ['true', 'false', 'null', 'undefined', 'Math', 'return', 'Infinity', 'NaN'].includes(match) ? match : '0'
  ));
  const result = Number(new Function(`"use strict"; return (${expression})`)());
  if (!Number.isFinite(result)) throw new Error('The formula did not return a number.');
  return roundCurrency(result);
}

function projectDeal(base: Record<string, unknown> | null, writes: PlannedWrite[]): Record<string, unknown> {
  const deal: Record<string, unknown> = { ...(base || {}) };
  const custom = { ...parseCustom(deal.custom_attributes) };
  writes.forEach((write) => {
    if (write.storageType === 'CUSTOM_JSON') custom[write.fieldKey] = write.value;
    else deal[write.fieldKey] = write.value;
  });
  deal.custom_attributes = custom;
  return deal;
}

export function formulaWrites(
  fields: FormulaSyncField[],
  base: Record<string, unknown> | null,
  pendingWrites: PlannedWrite[],
): PlannedWrite[] {
  if (fields.length === 0) return [];
  const projected = projectDeal(base, pendingWrites);
  const extra: PlannedWrite[] = [];
  orderFormulaFields(fields).forEach((field) => {
    let value: number;
    try {
      value = evaluateTransactionFieldFormula(field.calculationFormula, formulaContext(projected));
    } catch {
      return;
    }
    if (field.storageType === 'CUSTOM_JSON') {
      const custom = parseCustom(projected.custom_attributes);
      custom[field.fieldKey] = value;
      projected.custom_attributes = custom;
    } else {
      projected[field.fieldKey] = value;
    }
    const current = readMappedField(base, field.fieldKey, field.storageType);
    if (syncValuesEqual(current, value, field.fieldType)) return;
    extra.push({ fieldKey: field.fieldKey, storageType: field.storageType, value, previous: current, origin: 'formula' });
  });
  return extra;
}

function sheetIdentity(row: SheetSyncRow, mappings: SyncMapping[]): { propertyAddress: string | null; transactionSide: string | null } {
  const addressHeader = mappings.find((mapping) => mapping.fieldKey === 'property_address' && mapping.policy !== 'disconnected')?.sourceHeader;
  const sideHeader = mappings.find((mapping) => mapping.fieldKey === 'transaction_side' && mapping.policy !== 'disconnected')?.sourceHeader;
  const propertyAddress = addressHeader ? cellText(row.cells, addressHeader).trim() : '';
  const transactionSide = sideHeader ? cellText(row.cells, sideHeader).trim() : '';
  return {
    propertyAddress: propertyAddress || null,
    transactionSide: transactionSide || null,
  };
}

function cellText(cells: Record<string, string>, header: string): string {
  if (Object.prototype.hasOwnProperty.call(cells, header)) return cells[header] ?? '';
  const match = Object.keys(cells).find((key) => key.toLowerCase() === header.toLowerCase());
  return match ? cells[match] ?? '' : '';
}

/** Non-blank TMS IDs from the column mapped to TMS ID, compared case-insensitively. */
export function collectSourceTmsIds(rows: SheetSyncRow[], sourceHeader: string): string[] {
  const seen = new Set<string>();
  rows.forEach((row) => {
    const value = cellText(row.cells, sourceHeader).trim();
    if (value) seen.add(value.toLowerCase());
  });
  return [...seen];
}

function protectionFor(
  protections: SyncProtection[],
  transactionId: string | undefined,
  fieldKey: string,
): SyncProtection | undefined {
  if (!transactionId) return undefined;
  return protections.find((item) => item.transactionId === transactionId && item.fieldKey === fieldKey);
}

function finish(rows: PlannedSyncRow[]): Omit<SyncPlan, 'ignored' | 'sourceTmsIds'> {
  return {
    rows,
    created: rows.filter((row) => row.outcome === 'create').length,
    updated: rows.filter((row) => row.outcome === 'update').length,
    skipped: rows.filter((row) => row.outcome === 'skip').length,
    errors: rows.filter((row) => row.outcome === 'error').length,
    unchanged: rows.filter((row) => row.outcome === 'unchanged').length,
  };
}

function outsideViewReason(): string {
  return 'This transaction is outside the default view, so it was left unchanged.';
}

/**
 * Decides inserts and updates for one sheet. A sheet row that is not already in
 * Soleox is added even when it is outside the default view. An existing
 * transaction outside the default view is left unchanged.
 */
export function planTransactionSync(input: {
  formula: string;
  fieldTypes: Record<string, string>;
  catalog: SyncFieldCatalogEntry[];
  formulaFields?: FormulaSyncField[];
  mappings: SyncMapping[];
  rows: SheetSyncRow[];
  existingByTmsId: Map<string, ExistingSyncTransaction>;
  protections: SyncProtection[];
  agents: SyncAgent[];
}): SyncPlan {
  const formulaKeys = new Set((input.formulaFields ?? []).map((field) => field.fieldKey));
  const active = input.mappings.filter((mapping) => mapping.fieldKey && mapping.policy !== 'disconnected' && isSyncableField(mapping.fieldKey) && !formulaKeys.has(mapping.fieldKey));
  const tmsMapping = active.find((mapping) => mapping.fieldKey === 'tms_id');
  const agentMapping = active.find((mapping) => mapping.fieldKey === 'agent_id');
  const catalogByKey = new Map(input.catalog.map((field) => [field.fieldKey, field]));
  const seen = new Set<string>();
  const planned: PlannedSyncRow[] = [];
  let ignored = 0;

  for (const row of input.rows) {
    const identity = sheetIdentity(row, input.mappings);
    const push = (partial: PlannedSyncRow) => {
      planned.push({ ...partial, propertyAddress: identity.propertyAddress, transactionSide: identity.transactionSide });
    };
    if (!tmsMapping) {
      push({ rowNumber: row.rowNumber, tmsId: null, outcome: 'error', reason: 'Map a column to TMS ID before syncing.', writes: [], clearProtections: [] });
      continue;
    }
    const tmsId = cellText(row.cells, tmsMapping.sourceHeader).trim();
    if (!tmsId) {
      ignored += 1;
      continue;
    }
    const tmsKey = tmsId.toLowerCase();
    if (seen.has(tmsKey)) {
      push({ rowNumber: row.rowNumber, tmsId, outcome: 'error', reason: duplicateTmsIdReason(), writes: [], clearProtections: [] });
      continue;
    }
    seen.add(tmsKey);

    const existing = input.existingByTmsId.get(tmsKey);
    if (existing?.deal.permanently_deleted === true) continue;
    if (existing) {
      const decision: SyncViewResult = dealMatchesSyncView(existing.deal, input.formula, input.fieldTypes);
      if (decision === 'excluded') {
        push({ rowNumber: row.rowNumber, tmsId, outcome: 'skip', reason: outsideViewReason(), transactionId: existing.id, writes: [], clearProtections: [] });
        continue;
      }
      if (decision === 'error') {
        push({ rowNumber: row.rowNumber, tmsId, outcome: 'error', reason: 'The default view formula failed for this transaction, so it was left unchanged.', transactionId: existing.id, writes: [], clearProtections: [] });
        continue;
      }
    }

    const coerced: Array<{ mapping: SyncMapping; field: SyncFieldCatalogEntry; value: unknown }> = [];
    const coercionErrors: string[] = [];
    for (const mapping of active) {
      if (!mapping.fieldKey || mapping.fieldKey === 'tms_id') continue;
      const field = catalogByKey.get(mapping.fieldKey);
      if (!field) {
        coercionErrors.push(`${mapping.fieldKey} is not a transaction field.`);
        continue;
      }
      if (field.fieldKey === 'agent_id') continue;
      const result = coerceSyncValue(cellText(row.cells, mapping.sourceHeader), field.fieldKey, field.fieldType);
      if (result.ok === false) {
        coercionErrors.push(result.message);
        continue;
      }
      coerced.push({ mapping, field, value: result.value });
    }

    let agentId: string | null = null;
    let agentProblem: string | null = null;
    let agentBlank = !agentMapping;
    if (agentMapping) {
      const resolved = resolveSyncAgent(cellText(row.cells, agentMapping.sourceHeader), input.agents);
      if ('id' in resolved) agentId = resolved.id;
      else if ('error' in resolved) agentProblem = resolved.error;
      else agentBlank = true;
    }

    if (!existing) {
      if (coercionErrors.length > 0) {
        push({ rowNumber: row.rowNumber, tmsId, outcome: 'error', reason: coercionErrors.join(' '), writes: [], clearProtections: [] });
        continue;
      }
      if (agentProblem || agentBlank || !agentId) {
        push({
          rowNumber: row.rowNumber,
          tmsId,
          outcome: 'error',
          reason: agentProblem || 'This transaction has no matching primary agent, so it was not added.',
          writes: [],
          clearProtections: [],
        });
        continue;
      }
    } else if (coercionErrors.length > 0) {
      push({ rowNumber: row.rowNumber, tmsId, outcome: 'error', reason: coercionErrors.join(' '), transactionId: existing.id, writes: [], clearProtections: [] });
      continue;
    }

    const writes: PlannedWrite[] = [];
    const clearProtections: string[] = [];
    const currentDeal = existing?.deal ?? null;

    for (const item of coerced) {
      const policy = item.mapping.policy;
      const current = readMappedField(currentDeal, item.field.fieldKey, item.field.storageType);
      const protection = protectionFor(input.protections, existing?.id, item.field.fieldKey);
      if (policy === 'lock_on_edit' && protection?.protection === 'locked') continue;
      if (policy === 'keep_until_tms') {
        // A blank or zero from the TMS never replaces a value already here, whether or not a user typed it.
        if (isBlankOrZero(item.value, item.field.fieldType) && !isBlankOrZero(current, item.field.fieldType)) continue;
        if (protection?.protection === 'keep_until_tms' && !isBlankOrZero(item.value, item.field.fieldType)) {
          clearProtections.push(item.field.fieldKey);
        }
      }
      if (syncValuesEqual(current, item.value, item.field.fieldType)) continue;
      writes.push({
        fieldKey: item.field.fieldKey,
        storageType: item.field.storageType,
        value: item.value,
        previous: current,
        origin: 'tms',
      });
    }

    if (agentMapping && agentId) {
      const field = catalogByKey.get('agent_id') ?? {
        fieldKey: 'agent_id',
        fieldLabel: 'Primary Agent',
        fieldType: 'AGENT_PICKER',
        storageType: 'CORE_COLUMN' as const,
      };
      const current = readMappedField(currentDeal, 'agent_id', 'CORE_COLUMN');
      const protection = protectionFor(input.protections, existing?.id, 'agent_id');
      const policy = agentMapping.policy;
      const blocked = policy === 'lock_on_edit' && protection?.protection === 'locked';
      const kept = policy === 'keep_until_tms' && protection?.protection === 'keep_until_tms' && isBlankValue(agentId);
      if (!blocked && !kept) {
        if (policy === 'keep_until_tms' && protection?.protection === 'keep_until_tms') clearProtections.push('agent_id');
        if (!syncValuesEqual(current, agentId, field.fieldType)) {
          writes.push({ fieldKey: 'agent_id', storageType: 'CORE_COLUMN', value: agentId, previous: current, origin: 'tms' });
        }
      }
    }

    if (!existing) writes.unshift({ fieldKey: 'tms_id', storageType: 'CORE_COLUMN', value: tmsId, origin: 'tms' });
    writes.push(...formulaWrites(input.formulaFields ?? [], currentDeal, writes));

    if (!existing) {
      push({ rowNumber: row.rowNumber, tmsId, outcome: 'create', writes, clearProtections });
      continue;
    }

    if (agentProblem && writes.length === 0) {
      push({ rowNumber: row.rowNumber, tmsId, outcome: 'error', reason: `${agentProblem} The primary agent was left unchanged.`, transactionId: existing.id, writes: [], clearProtections });
      continue;
    }

    if (writes.length === 0) {
      push({
        rowNumber: row.rowNumber,
        tmsId,
        outcome: 'unchanged',
        reason: agentProblem ? `${agentProblem} The primary agent was left unchanged.` : undefined,
        transactionId: existing.id,
        writes: [],
        clearProtections,
      });
      continue;
    }

    push({
      rowNumber: row.rowNumber,
      tmsId,
      outcome: 'update',
      reason: agentProblem ? `${agentProblem} The primary agent was left unchanged.` : undefined,
      transactionId: existing.id,
      writes,
      clearProtections,
    });
  }

  return { ...finish(planned), ignored, sourceTmsIds: [...seen] };
}

/**
 * Flags default-view deals whose TMS ID is missing from the source.
 * Deals with no TMS ID are left alone. Nothing here deletes a transaction.
 * A deal outside the default view is marked connected when its ID is present, and is not marked disconnected when the ID is absent.
 */
export function planTmsLinkUpdates(input: {
  formula: string;
  fieldTypes: Record<string, string>;
  existing: ExistingSyncTransaction[];
  sourceTmsIds: Set<string>;
}): TmsLinkUpdate[] {
  const updates: TmsLinkUpdate[] = [];
  input.existing.forEach((row) => {
    if (row.deal.permanently_deleted === true) return;
    const tmsId = row.tmsId.trim();
    if (!tmsId) return;
    const inSource = input.sourceTmsIds.has(tmsId.toLowerCase());
    const current = row.deal.tms_connection === 'connected' || row.deal.tms_connection === 'disconnected'
      ? row.deal.tms_connection
      : null;
    if (inSource) {
      if (current !== 'connected') updates.push({ transactionId: row.id, tmsConnection: 'connected' });
      return;
    }
    if (dealMatchesSyncView(row.deal, input.formula, input.fieldTypes) !== 'match') return;
    if (current !== 'disconnected') updates.push({ transactionId: row.id, tmsConnection: 'disconnected' });
  });
  return updates;
}

export function parseCustomAttributes(value: unknown): Record<string, unknown> {
  return parseCustom(value);
}

export interface ProtectionChange {
  fieldKey: string;
  action: 'lock' | 'keep' | 'clear';
}

/** A user save locks or releases a mapped field. Sync writes never call this. */
export function userProtectionChanges(input: {
  mappings: SyncMapping[];
  catalog: SyncFieldCatalogEntry[];
  previous: Record<string, unknown> | null;
  next: Record<string, unknown>;
}): ProtectionChange[] {
  const catalogByKey = new Map(input.catalog.map((field) => [field.fieldKey, field]));
  const changes: ProtectionChange[] = [];
  for (const mapping of input.mappings) {
    if (!mapping.fieldKey || mapping.fieldKey === 'tms_id') continue;
    if (mapping.policy !== 'lock_on_edit' && mapping.policy !== 'keep_until_tms') continue;
    const field = catalogByKey.get(mapping.fieldKey);
    if (!field) continue;
    const nextValue = readMappedField(input.next, field.fieldKey, field.storageType);
    const submitted = field.storageType === 'CUSTOM_JSON'
      ? Object.prototype.hasOwnProperty.call(parseCustom(input.next.custom_attributes), field.fieldKey)
      : Object.prototype.hasOwnProperty.call(input.next, field.fieldKey);
    if (!submitted) continue;
    const previousValue = readMappedField(input.previous, field.fieldKey, field.storageType);
    if (syncValuesEqual(previousValue, nextValue, field.fieldType)) continue;
    if (mapping.policy === 'lock_on_edit') {
      changes.push({ fieldKey: field.fieldKey, action: 'lock' });
      continue;
    }
    changes.push({
      fieldKey: field.fieldKey,
      action: isBlankOrZero(nextValue, field.fieldType) ? 'clear' : 'keep',
    });
  }
  return changes;
}
