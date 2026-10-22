import { evaluateFormula, type FormulaLookups, type FormulaValue } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

export interface TransactionSortRule {
  fieldKey: string;
  direction: 'asc' | 'desc';
}

export interface TransactionDefaultView {
  filterFormula: string;
  sortRules: TransactionSortRule[];
}

export interface TransactionView {
  id: string;
  name: string;
  filterFormula: string;
  sortRules: TransactionSortRule[];
}

export interface TransactionViewsConfig {
  views: TransactionView[];
  defaultViewId: string;
}

export const MAX_TRANSACTION_VIEWS = 4;
export const TRANSACTIONS_LIST_STATE_KEY = 'soleox-transactions-list';

/** DEMO keeps open work: not cancelled, and not a closed deal that is already paid. */
export const DEMO_TRANSACTION_DEFAULT_VIEW: TransactionDefaultView = {
  filterFormula: 'AND(transaction_status<>"Cancelled", NOT(AND(transaction_status="Closed", finance_status="Paid")))',
  sortRules: [{ fieldKey: 'closing_date', direction: 'asc' }],
};

/** The complement of the DEMO unfinished formula: cancelled, or closed and paid. */
export const DEMO_FINISHED_VIEW_FORMULA = 'OR(transaction_status="Cancelled", AND(transaction_status="Closed", finance_status="Paid"))';

const RESERVED_VIEW_NAME_KEYS = new Set(['all', 'just synced', 'deleted']);

export function transactionViewNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function transactionViewNameError(name: string, otherNames: string[]): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Enter a view name.';
  if (trimmed.length > 40) return 'Use 40 characters or fewer.';
  const key = transactionViewNameKey(trimmed);
  if (RESERVED_VIEW_NAME_KEYS.has(key)) return 'All, Just synced, and Deleted are system views.';
  if (otherNames.some((other) => transactionViewNameKey(other) === key)) return 'View names have to be different.';
  return null;
}

function finishedFormulaFor(unfinishedFormula: string): string {
  const formula = unfinishedFormula.trim();
  if (!formula) return 'AND(transaction_status="Cancelled", transaction_status<>"Cancelled")';
  if (formula === DEMO_TRANSACTION_DEFAULT_VIEW.filterFormula) return DEMO_FINISHED_VIEW_FORMULA;
  return `NOT(${formula})`;
}

export function seededTransactionViews(clientId: string, stored?: TransactionDefaultView | null): TransactionViewsConfig {
  const unfinished = stored ?? (clientId === 'DEMO' ? DEMO_TRANSACTION_DEFAULT_VIEW : emptyTransactionDefaultView());
  const sortRules = unfinished.sortRules.length > 0 ? unfinished.sortRules : [{ fieldKey: 'closing_date', direction: 'asc' as const }];
  return {
    defaultViewId: 'unfinished',
    views: [
      {
        id: 'finished',
        name: 'Finished',
        filterFormula: finishedFormulaFor(unfinished.filterFormula),
        sortRules,
      },
      {
        id: 'unfinished',
        name: 'Unfinished',
        filterFormula: unfinished.filterFormula,
        sortRules,
      },
    ],
  };
}

export function emptyTransactionDefaultView(): TransactionDefaultView {
  return { filterFormula: '', sortRules: [] };
}

export function parseTransactionDefaultView(value: unknown): TransactionDefaultView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const filterFormula = typeof record.filter_formula === 'string'
    ? record.filter_formula
    : typeof record.filterFormula === 'string'
      ? record.filterFormula
      : null;
  const rawRules = Array.isArray(record.sort_rules)
    ? record.sort_rules
    : Array.isArray(record.sortRules)
      ? record.sortRules
      : null;
  if (filterFormula === null || rawRules === null) return null;

  const sortRules: TransactionSortRule[] = [];
  for (const rule of rawRules) {
    if (!rule || typeof rule !== 'object') continue;
    const item = rule as Record<string, unknown>;
    const fieldKey = String(item.field_key || item.fieldKey || '').trim();
    const direction = item.direction === 'desc' ? 'desc' : item.direction === 'asc' ? 'asc' : null;
    if (!fieldKey || !direction) continue;
    sortRules.push({ fieldKey, direction });
  }
  return { filterFormula, sortRules };
}

function parseSortRules(rawRules: unknown): TransactionSortRule[] | null {
  if (!Array.isArray(rawRules)) return null;
  const sortRules: TransactionSortRule[] = [];
  for (const rule of rawRules) {
    if (!rule || typeof rule !== 'object') continue;
    const item = rule as Record<string, unknown>;
    const fieldKey = String(item.field_key || item.fieldKey || '').trim();
    const direction = item.direction === 'desc' ? 'desc' : item.direction === 'asc' ? 'asc' : null;
    if (!fieldKey || !direction) continue;
    sortRules.push({ fieldKey, direction });
  }
  return sortRules;
}

export function parseTransactionViews(value: unknown): TransactionViewsConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rawViews = Array.isArray(record.views) ? record.views : null;
  const defaultViewId = String(record.default_view_id || record.defaultViewId || '').trim();
  if (!rawViews || !defaultViewId) return null;

  const views: TransactionView[] = [];
  const seen = new Set<string>();
  for (const raw of rawViews) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const id = String(item.id || '').trim();
    const name = String(item.name || '').trim().replace(/\s+/g, ' ');
    const filterFormula = typeof item.filter_formula === 'string'
      ? item.filter_formula
      : typeof item.filterFormula === 'string'
        ? item.filterFormula
        : null;
    const sortRules = parseSortRules(item.sort_rules ?? item.sortRules);
    if (!id || !name || filterFormula === null || !sortRules || seen.has(id)) continue;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue;
    seen.add(id);
    views.push({ id, name, filterFormula, sortRules });
    if (views.length === MAX_TRANSACTION_VIEWS) break;
  }
  if (views.length === 0 || !views.some((view) => view.id === defaultViewId)) return null;
  return { views, defaultViewId };
}

export function transactionViewsFromSettings(settings: unknown, clientId: string): TransactionViewsConfig {
  const record = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
  const storedViews = parseTransactionViews(record.transaction_views);
  if (storedViews) return storedViews;
  return seededTransactionViews(clientId, parseTransactionDefaultView(record.transaction_default_view));
}

export function defaultTransactionView(config: TransactionViewsConfig): TransactionView {
  return config.views.find((view) => view.id === config.defaultViewId) || config.views[0];
}

/** A saved list tab, or the default view when the saved name is no longer a view. */
export function resolveStoredLedgerView(stored: string, config: TransactionViewsConfig): string {
  if (stored === 'ALL' || stored === 'SYNCED' || stored === 'DELETED') return stored;
  if (config.views.some((view) => view.id === stored)) return stored;
  if (stored === 'FINISHED') {
    const finished = config.views.find((view) => view.id === 'finished' || transactionViewNameKey(view.name) === 'finished');
    if (finished) return finished.id;
  }
  return config.defaultViewId;
}

export function transactionDefaultViewFromSettings(settings: unknown, clientId: string): TransactionDefaultView {
  const view = defaultTransactionView(transactionViewsFromSettings(settings, clientId));
  return { filterFormula: view.filterFormula, sortRules: view.sortRules };
}

/** The fields a filter formula reads, in order and once each, such as ["transaction_status", "finance_status"]. */
export function formulaFieldNames(formula: string): string[] {
  const withoutText = formula.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const names: string[] = [];
  for (const match of withoutText.matchAll(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/g)) {
    const rest = withoutText.slice((match.index ?? 0) + match[0].length);
    if (/^\s*\(/.test(rest)) continue;
    if (/^(true|false)$/i.test(match[0])) continue;
    const name = match[0].toLowerCase() === 'status' ? 'transaction_status' : match[0];
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** A deal's value for a formula field, looking in custom attributes too. */
export function dealFieldValue(deal: Record<string, unknown>, name: string): unknown {
  return readDealField(deal, name);
}

function readDealField(deal: Record<string, unknown>, name: string): unknown {
  const key = name.toLowerCase() === 'status' ? 'transaction_status' : name;
  const direct = deal[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  const custom = deal.custom_attributes;
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    const nested = (custom as Record<string, unknown>)[key];
    if (nested !== undefined && nested !== null && nested !== '') return nested;
  }
  return direct;
}

function toFormulaValue(raw: unknown, fieldType?: string): FormulaValue {
  if (raw === undefined || raw === null || raw === '') return { type: 'blank' };
  if (typeof raw === 'boolean' || fieldType === 'BOOLEAN') {
    return { type: 'boolean', value: raw === true || raw === 'true' };
  }
  if (fieldType === 'PERCENT' && typeof raw === 'number') return { type: 'percent', value: raw };
  if (typeof raw === 'number') return { type: 'number', value: raw };
  if (fieldType === 'NUMBER' || fieldType === 'CURRENCY') {
    const amount = Number(String(raw).replace(/[$,\s]/g, ''));
    if (Number.isFinite(amount)) return { type: 'number', value: amount };
  }
  return { type: 'text', value: String(raw) };
}

export type TemplateBoltTone = 'submitted' | 'ready' | 'ineligible' | 'drift';

export interface TemplateBoltSource {
  id: string;
  template_name: string;
  eligibility_formula?: string | null;
  is_active?: boolean | null;
}

/**
 * Same priority as the transactions-list lightning icon.
 * Null means the transaction is not eligible and nothing has been submitted.
 */
export function templateBoltTone(
  deal: Record<string, unknown>,
  templates: TemplateBoltSource[],
  submittedTemplateIds: string[],
  fieldTypes: Record<string, string>,
  paymentsWouldChange: boolean,
): { tone: TemplateBoltTone; label: string } | null {
  if (submittedTemplateIds.length > 0) {
    const submitted = submittedTemplateIds.map((id) => templates.find((template) => template.id === id));
    const stillEligible = submitted.filter((template): template is TemplateBoltSource => (
      Boolean(template) && transactionQualifiesForTemplate(deal, template?.eligibility_formula || '', fieldTypes)
    ));
    const noLongerEligible = submitted.filter((template) => (
      !template || !transactionQualifiesForTemplate(deal, template.eligibility_formula || '', fieldTypes)
    ));
    if (noLongerEligible.length > 0) {
      const names = noLongerEligible
        .map((template) => template?.template_name)
        .filter((name): name is string => Boolean(name));
      return {
        tone: 'ineligible',
        label: names.length > 0 ? `No longer eligible: ${names.join(', ')}` : 'Submitted template is no longer eligible',
      };
    }
    const names = stillEligible.map((template) => template.template_name);
    if (paymentsWouldChange) {
      return { tone: 'drift', label: names.length > 0 ? `Payments would change: ${names.join(', ')}` : 'Submitting again would change the payments' };
    }
    return { tone: 'submitted', label: names.length > 0 ? `Template submitted: ${names.join(', ')}` : 'Template submitted' };
  }

  const ready = templates.filter((template) => (
    template.is_active !== false
    && transactionQualifiesForTemplate(deal, template.eligibility_formula || '', fieldTypes)
  ));
  if (ready.length === 0) return null;
  return { tone: 'ready', label: `Ready to submit: ${ready.map((template) => template.template_name).join(', ')}` };
}

/**
 * A blank formula does not qualify a transaction.
 * Only an explicit true result qualifies. Errors and other values do not.
 */
export function transactionQualifiesForTemplate(
  deal: Record<string, unknown>,
  eligibilityFormula: string,
  fieldTypes: Record<string, string> = {},
): boolean {
  const formula = eligibilityFormula.trim();
  if (!formula) return false;
  const result = evaluateFormula(formula, (name) => {
    const key = name.toLowerCase() === 'status' ? 'transaction_status' : name;
    return toFormulaValue(readDealField(deal, name), fieldTypes[key]);
  });
  return result?.type === 'boolean' && result.value;
}

export type SyncViewResult = 'match' | 'excluded' | 'error';

/**
 * Sync eligibility is the opposite of a blank or failed list filter.
 * A blank formula, a formula error, or any result other than true does not match.
 */
export function dealMatchesSyncView(
  deal: Record<string, unknown>,
  filterFormula: string,
  fieldTypes: Record<string, string> = {},
): SyncViewResult {
  const formula = filterFormula.trim();
  if (!formula) return 'error';
  const result = evaluateFormula(formula, (name) => {
    const key = name.toLowerCase() === 'status' ? 'transaction_status' : name;
    return toFormulaValue(readDealField(deal, name), fieldTypes[key]);
  });
  if (!result || result.type === 'error') return 'error';
  if (result.type === 'boolean' && result.value) return 'match';
  return 'excluded';
}

/** A blank formula includes every transaction. Anything other than true is left out. */
/**
 * Whether a deal passes a filter formula. `lookups` lets XLOOKUP read other tables (agents). A formula that cannot
 * be calculated lets every deal through, so a broken view still shows deals; with `strict` it lets none through,
 * for rules that move money (team caps, sales volume).
 */
export function dealMatchesDefaultView(
  deal: Record<string, unknown>,
  filterFormula: string,
  fieldTypes: Record<string, string> = {},
  options: { lookups?: FormulaLookups | null; strict?: boolean } = {},
): boolean {
  const formula = filterFormula.trim();
  if (!formula) return true;
  const result = evaluateFormula(formula, (name) => {
    const key = name.toLowerCase() === 'status' ? 'transaction_status' : name;
    return toFormulaValue(readDealField(deal, name), fieldTypes[key]);
  }, [], [], options.lookups ?? undefined);
  if (!result || result.type === 'error') return !options.strict;
  return result.type === 'boolean' && result.value;
}

export function isBlankSortValue(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/** Blank values stay at the bottom in either direction. */
export function compareSortValues(left: unknown, right: unknown, direction: 'asc' | 'desc'): number {
  const leftBlank = isBlankSortValue(left);
  const rightBlank = isBlankSortValue(right);
  if (leftBlank || rightBlank) {
    if (leftBlank && rightBlank) return 0;
    return leftBlank ? 1 : -1;
  }
  let result = 0;
  if (typeof left === 'number' && typeof right === 'number') {
    result = left - right;
  } else {
    result = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
  }
  return direction === 'asc' ? result : -result;
}

export function compareBySortRules(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  rules: TransactionSortRule[],
  valueOf: (deal: Record<string, unknown>, fieldKey: string) => unknown,
): number {
  for (const rule of rules) {
    const result = compareSortValues(valueOf(left, rule.fieldKey), valueOf(right, rule.fieldKey), rule.direction);
    if (result !== 0) return result;
  }
  return 0;
}
