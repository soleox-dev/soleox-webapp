import { evaluateFormula, type FormulaValue } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

export interface TransactionSortRule {
  fieldKey: string;
  direction: 'asc' | 'desc';
}

export interface TransactionDefaultView {
  filterFormula: string;
  sortRules: TransactionSortRule[];
}

/** DEMO keeps open work: not cancelled, and not a closed deal that is already paid. */
export const DEMO_TRANSACTION_DEFAULT_VIEW: TransactionDefaultView = {
  filterFormula: 'AND(transaction_status<>"Cancelled", NOT(AND(transaction_status="Closed", finance_status="Paid")))',
  sortRules: [{ fieldKey: 'closing_date', direction: 'asc' }],
};

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

export function transactionDefaultViewFromSettings(settings: unknown, clientId: string): TransactionDefaultView {
  const record = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
  const stored = parseTransactionDefaultView(record.transaction_default_view);
  if (stored) return stored;
  if (clientId === 'DEMO') return DEMO_TRANSACTION_DEFAULT_VIEW;
  return emptyTransactionDefaultView();
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
export function dealMatchesDefaultView(
  deal: Record<string, unknown>,
  filterFormula: string,
  fieldTypes: Record<string, string> = {},
): boolean {
  const formula = filterFormula.trim();
  if (!formula) return true;
  const result = evaluateFormula(formula, (name) => {
    const key = name.toLowerCase() === 'status' ? 'transaction_status' : name;
    return toFormulaValue(readDealField(deal, name), fieldTypes[key]);
  });
  if (!result || result.type === 'error') return true;
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
