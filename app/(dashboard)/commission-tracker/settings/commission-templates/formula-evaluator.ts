import { FORMULA_LOOKUP_TABLES } from '@/lib/formula-lookup-tables';
import { readExcelString } from './formula-validator';

export type FormulaValue =
  | { type: 'blank' }
  | { type: 'text'; value: string }
  | { type: 'number'; value: number }
  | { type: 'percent'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'error' };

type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'percent'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'name'; name: string }
  | { kind: 'call'; name: string; args: Expr[] }
  | { kind: 'unary'; op: '+' | '-'; expr: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr };

type Token =
  | { type: 'number' | 'string' | 'name' | 'op'; value: string }
  | { type: 'lparen' | 'rparen' | 'comma' | 'eof' };

function lex(source: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"') {
      const text = readExcelString(source, index);
      if (!text) return null;
      tokens.push({ type: 'string', value: text.value });
      index = text.end;
      continue;
    }
    const number = source.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)%?/);
    if (number) {
      tokens.push({ type: 'number', value: number[0] });
      index += number[0].length;
      continue;
    }
    const operator = source.slice(index).match(/^(<>|<=|>=|[=<>&+\-*/])/);
    if (operator) {
      tokens.push({ type: 'op', value: operator[0] });
      index += operator[0].length;
      continue;
    }
    const name = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/);
    if (name) {
      tokens.push({ type: 'name', value: name[0] });
      index += name[0].length;
      continue;
    }
    if (char === '(' || char === ')' || char === ',') {
      tokens.push({ type: char === '(' ? 'lparen' : char === ')' ? 'rparen' : 'comma' });
      index += 1;
      continue;
    }
    return null;
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

function parseFormula(source: string): Expr | null {
  const tokens = lex(source.trim().replace(/^=/, '').trim());
  if (!tokens) return null;
  let index = 0;
  const peek = () => tokens[index];
  const eat = () => tokens[index++];

  const parseComparison = (): Expr | null => {
    let left = parseConcat();
    if (!left) return null;
    while (peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value;
      const right = parseConcat();
      if (!right) return null;
      left = { kind: 'binary', op, left, right };
    }
    return left;
  };

  const parseConcat = (): Expr | null => {
    let left = parseAdd();
    if (!left) return null;
    while (peek().type === 'op' && (peek() as { value: string }).value === '&') {
      eat();
      const right = parseAdd();
      if (!right) return null;
      left = { kind: 'binary', op: '&', left, right };
    }
    return left;
  };

  const parseAdd = (): Expr | null => {
    let left = parseMul();
    if (!left) return null;
    while (peek().type === 'op' && ['+', '-'].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value;
      const right = parseMul();
      if (!right) return null;
      left = { kind: 'binary', op, left, right };
    }
    return left;
  };

  const parseMul = (): Expr | null => {
    let left = parseUnary();
    if (!left) return null;
    while (peek().type === 'op' && ['*', '/'].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value;
      const right = parseUnary();
      if (!right) return null;
      left = { kind: 'binary', op, left, right };
    }
    return left;
  };

  const parseUnary = (): Expr | null => {
    if (peek().type === 'op' && ['+', '-'].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value as '+' | '-';
      const expr = parseUnary();
      if (!expr) return null;
      return { kind: 'unary', op, expr };
    }
    return parsePrimary();
  };

  const parsePrimary = (): Expr | null => {
    const token = peek();
    if (token.type === 'number') {
      eat();
      if (token.value.endsWith('%')) {
        return { kind: 'percent', value: Number(token.value.slice(0, -1)) / 100 };
      }
      return { kind: 'number', value: Number(token.value) };
    }
    if (token.type === 'string') {
      eat();
      return { kind: 'string', value: token.value };
    }
    if (token.type === 'lparen') {
      eat();
      const inner = parseComparison();
      if (!inner || peek().type !== 'rparen') return null;
      eat();
      return inner;
    }
    if (token.type === 'name') {
      eat();
      if (peek().type === 'lparen') {
        eat();
        const args: Expr[] = [];
        if (peek().type !== 'rparen') {
          while (true) {
            const arg = parseComparison();
            if (!arg) return null;
            args.push(arg);
            if (peek().type === 'comma') {
              eat();
              continue;
            }
            break;
          }
        }
        if (peek().type !== 'rparen') return null;
        eat();
        return { kind: 'call', name: token.value.toUpperCase(), args };
      }
      return { kind: 'name', name: token.value };
    }
    return null;
  };

  const expr = parseComparison();
  if (!expr || peek().type !== 'eof') return null;
  return expr;
}

/** Addition and subtraction stay percentages when either side is one. A percentage times a percentage stays a percentage. Dividing a percentage by a number stays a percentage. */
function percentResult(op: string, left: FormulaValue, right: FormulaValue): boolean {
  const leftPercent = left.type === 'percent';
  const rightPercent = right.type === 'percent';
  if (op === '+' || op === '-') return leftPercent || rightPercent;
  if (op === '*') return leftPercent && rightPercent;
  if (op === '/') return leftPercent && !rightPercent;
  return false;
}

function asNumber(value: FormulaValue): number | null {
  if (value.type === 'number' || value.type === 'percent') return value.value;
  if (value.type === 'boolean') return value.value ? 1 : 0;
  if (value.type === 'blank') return 0;
  if (value.type === 'text') {
    const cleaned = value.value.replace(/[$,]/g, '').trim();
    if (!cleaned) return 0;
    if (cleaned.endsWith('%')) {
      const amount = Number(cleaned.slice(0, -1));
      return Number.isFinite(amount) ? amount / 100 : null;
    }
    const amount = Number(cleaned);
    return Number.isFinite(amount) ? amount : null;
  }
  return null;
}

function asText(value: FormulaValue): string | null {
  if (value.type === 'error') return null;
  if (value.type === 'blank') return '';
  if (value.type === 'text') return value.value;
  if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
  if (value.type === 'percent') return `${trimNumber(value.value * 100)}%`;
  if (value.type === 'number') return trimNumber(value.value);
  return null;
}

function isTruthy(value: FormulaValue): boolean | null {
  if (value.type === 'error') return null;
  if (value.type === 'boolean') return value.value;
  if (value.type === 'blank') return false;
  const amount = asNumber(value);
  if (amount === null) return null;
  return amount !== 0;
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

function roundNumber(value: number, digits = 0, mode: 'round' | 'up' | 'down' = 'round'): number {
  if (!Number.isFinite(value)) return value;
  const d = Math.trunc(digits);
  if (d > 20) return value;
  if (d < -20) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const parts = `${abs}`.split('e');
  const exp = (parts[1] ? Number(parts[1]) : 0) + d;
  const fn = mode === 'up' ? Math.ceil : mode === 'down' ? Math.floor : Math.round;
  const shifted = fn(Number(`${parts[0]}e${exp}`));
  const unshiftedParts = `${shifted}`.split('e');
  const unshiftedExp = (unshiftedParts[1] ? Number(unshiftedParts[1]) : 0) - d;
  return sign * Number(`${unshiftedParts[0]}e${unshiftedExp}`);
}

function compare(left: FormulaValue, op: string, right: FormulaValue): FormulaValue {
  if (left.type === 'error' || right.type === 'error') return { type: 'error' };
  const leftText = left.type === 'text' || (left.type === 'blank' && right.type === 'text');
  const rightText = right.type === 'text' || (right.type === 'blank' && left.type === 'text');
  if (leftText || rightText) {
    const a = (asText(left) || '').toLowerCase();
    const b = (asText(right) || '').toLowerCase();
    const result = op === '=' ? a === b
      : op === '<>' ? a !== b
      : op === '<' ? a < b
      : op === '<=' ? a <= b
      : op === '>' ? a > b
      : a >= b;
    return { type: 'boolean', value: result };
  }
  const a = asNumber(left);
  const b = asNumber(right);
  if (a === null || b === null) return { type: 'error' };
  const result = op === '=' ? a === b
    : op === '<>' ? a !== b
    : op === '<' ? a < b
    : op === '<=' ? a <= b
    : op === '>' ? a > b
    : a >= b;
  return { type: 'boolean', value: result };
}

function searchText(find: string, within: string, start = 1): FormulaValue {
  const index = within.toLowerCase().indexOf(find.toLowerCase(), Math.max(0, start - 1));
  if (index < 0) return { type: 'error' };
  return { type: 'number', value: index + 1 };
}

function textAfter(text: string, delimiter: string, instance = 1): FormulaValue {
  if (!delimiter || instance < 1) return { type: 'error' };
  let from = 0;
  for (let count = 0; count < instance; count += 1) {
    const index = text.toLowerCase().indexOf(delimiter.toLowerCase(), from);
    if (index < 0) return { type: 'error' };
    from = index + delimiter.length;
  }
  return { type: 'text', value: text.slice(from) };
}

function textBefore(text: string, delimiter: string, instance = 1): FormulaValue {
  if (!delimiter || instance < 1) return { type: 'error' };
  let from = 0;
  let index = -1;
  for (let count = 0; count < instance; count += 1) {
    index = text.toLowerCase().indexOf(delimiter.toLowerCase(), from);
    if (index < 0) return { type: 'error' };
    from = index + delimiter.length;
  }
  return { type: 'text', value: text.slice(0, index) };
}

function substitute(text: string, oldText: string, newText: string, instance?: number): FormulaValue {
  if (!oldText) return { type: 'text', value: text };
  if (instance === undefined) {
    return { type: 'text', value: text.split(oldText).join(newText) };
  }
  if (instance < 1) return { type: 'error' };
  const lower = text.toLowerCase();
  const needle = oldText.toLowerCase();
  let from = 0;
  for (let count = 1; count <= instance; count += 1) {
    const index = lower.indexOf(needle, from);
    if (index < 0) return { type: 'text', value: text };
    if (count === instance) {
      return { type: 'text', value: text.slice(0, index) + newText + text.slice(index + oldText.length) };
    }
    from = index + needle.length;
  }
  return { type: 'text', value: text };
}

function columnRef(expr: Expr): { table: string; field: string } | null {
  if (expr.kind !== 'name' || !expr.name.includes('.')) return null;
  const [table, field] = expr.name.toLowerCase().split('.');
  if (!table || !field) return null;
  return { table, field };
}

const LOOKUP_TABLES = new Set<string>([...FORMULA_LOOKUP_TABLES, 'commission_template_logic']);

function visitFormula(expr: Expr, visit: (node: Expr) => void) {
  visit(expr);
  if (expr.kind === 'call') expr.args.forEach((arg) => visitFormula(arg, visit));
  else if (expr.kind === 'unary') visitFormula(expr.expr, visit);
  else if (expr.kind === 'binary') {
    visitFormula(expr.left, visit);
    visitFormula(expr.right, visit);
  }
}

/** Tables an XLOOKUP reads, and whether any formula sums the commission ledger. */
export function formulaDataNeeds(sources: string[]): { lookupTables: string[]; needsLedger: boolean } {
  const tables = new Set<string>();
  let needsLedger = false;
  for (const source of sources) {
    const body = source.trim().replace(/^=/, '').trim();
    if (!body) continue;
    const expr = parseFormula(body);
    if (!expr) return { lookupTables: [...FORMULA_LOOKUP_TABLES], needsLedger: true };
    visitFormula(expr, (node) => {
      if (node.kind !== 'call') return;
      if (node.name === 'SUMIFS' || node.name === 'COUNTIFS') needsLedger = true;
      if (node.name !== 'XLOOKUP') return;
      for (const arg of [node.args[1], node.args[2]]) {
        const ref = arg ? columnRef(arg) : null;
        if (ref && LOOKUP_TABLES.has(ref.table)) tables.add(ref.table);
      }
    });
  }
  if (tables.size > 0) {
    tables.add('client_field_configurations');
  }
  return { lookupTables: [...tables].sort(), needsLedger };
}

const KNOWN_TABLE_COLUMNS: Record<string, ReadonlySet<string>> = {
  agents: new Set([
    'id', 'agent_id', 'user_id', 'tms_id', 'agent_name', 'name', 'full_name',
    'agent_email', 'email', 'agent_phone', 'phone', 'group_id', 'agent_status',
    'is_team_lead', 'agent_onboard_date', 'agent_offboard_date', 'archived',
    'created_at', 'created_by', 'updated_at', 'updated_by', 'client_id',
  ]),
  transactions: new Set([
    'id', 'transaction_status', 'status', 'agent_id', 'primary_agent',
    'transaction_side', 'side', 'property_address', 'sales_price', 'gci_type',
    'gci_perc', 'gci_amount', 'total_commission', 'gross_commission', 'list_price', 'list_date',
    'acceptance_date', 'closing_date', 'lead_source', 'client_type',
    'client_name', 'escrow_number', 'tms_id', 'isa', 'transaction_coordinator',
    'notes', 'archived', 'created_at', 'created_by', 'updated_at', 'updated_by', 'client_id',
  ]),
  commission_entities: new Set([
    'id', 'entity_name', 'name', 'entity_type', 'type', 'waterfall_sort_order',
    'is_active', 'archived', 'client_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
  commission_templates: new Set([
    'id', 'template_name', 'description', 'eligibility_formula', 'is_default',
    'is_active', 'archived', 'client_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
  commission_template_parameters: new Set([
    'id', 'template_id', 'parameter_name', 'parameter_key', 'data_type',
    'autofill_formula', 'validation_rule', 'notes', 'is_required', 'sort_order',
    'section', 'dropdown_options', 'client_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
  commission_template_rules: new Set([
    'id', 'template_id', 'step_number', 'rule_name', 'rule_key', 'section',
    'payee_entity_id', 'agent_key', 'payee_formula', 'apply_condition',
    'custom_baseline', 'calculation_formula', 'split_type', 'result_type',
    'show_in_popup', 'popup_section', 'show_when_formula', 'client_id',
    'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
  payments: new Set([
    'id', 'transaction_id', 'recipient_name', 'amount', 'payment_status',
    'payment_date', 'notes', 'client_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
  transaction_commission_items: new Set([
    'id', 'transaction_id', 'agent_id', 'payee_entity_id', 'final_amount',
    'section', 'split_type', 'split_value', 'calculation_formula', 'client_id',
    'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
  client_field_configurations: new Set([
    'id', 'client_id', 'target_table', 'section_name', 'field_key',
    'field_label', 'field_type', 'is_required', 'is_enabled', 'sort_order',
    'archived', 'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
  client_lookup_values: new Set([
    'id', 'client_id', 'category', 'option_label', 'option_value',
    'sort_order', 'is_default', 'is_active', 'archived',
    'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
  client_user_roles: new Set([
    'id', 'user_id', 'client_id', 'role', 'is_active', 'archived',
    'created_at', 'created_by', 'updated_at', 'updated_by',
  ]),
};

export function isConfiguredOrExistingField(
  table: string,
  field: string,
  rows: FormulaLookupRow[] = [],
  lookups?: FormulaLookups,
): boolean {
  const normTable = (table === 'commission_template_logic' ? 'commission_template_rules' : table).toLowerCase();
  const normField = field.toLowerCase();

  // 1. Check known core database columns
  const knownColumns = KNOWN_TABLE_COLUMNS[normTable];
  if (knownColumns && knownColumns.has(normField)) return true;

  // 2. Check if configured in client_field_configurations lookup table
  const fieldConfigs = lookups?.tables?.client_field_configurations;
  if (fieldConfigs) {
    const isConfigured = fieldConfigs.some((row) => {
      const targetTable = String(row.fields.target_table || '').toLowerCase();
      const fieldKey = String(row.fields.field_key || '').toLowerCase();
      const isArchived = row.fields.archived === true || String(row.fields.archived || '').toLowerCase() === 'true';
      return targetTable === normTable && fieldKey === normField && !isArchived;
    });
    if (isConfigured) return true;
  }

  // 3. Check if the attribute exists on ANY object in the table's rows
  const existsOnAnyObject = rows.some((row) =>
    Object.keys(row.fields).some((key) => key.toLowerCase() === normField)
  );
  if (existsOnAnyObject) return true;

  return false;
}

function valuesEqual(left: FormulaValue, right: FormulaValue): boolean {
  if (left.type === 'error' || right.type === 'error') return false;
  if (left.type === 'boolean' || right.type === 'boolean') {
    return isTruthy(left) === isTruthy(right);
  }
  const leftText = left.type === 'text' || left.type === 'blank';
  const rightText = right.type === 'text' || right.type === 'blank';
  if (leftText && rightText) {
    return (asText(left) || '').toLowerCase() === (asText(right) || '').toLowerCase();
  }
  const a = asNumber(left);
  const b = asNumber(right);
  if (a !== null && b !== null) return a === b;
  const textA = asText(left);
  const textB = asText(right);
  return textA !== null && textB !== null && textA.toLowerCase() === textB.toLowerCase();
}

export interface FormulaAgent {
  id: string;
  name: string;
  isTeamLead?: boolean;
  clientId?: string;
  fields?: Record<string, string>;
}

export interface FormulaLedgerRow {
  fields: Record<string, string>;
}

export type FormulaLookupCell = string | number | boolean;

export interface FormulaLookupRow {
  clientId: string;
  fields: Record<string, FormulaLookupCell>;
}

export interface FormulaLookups {
  clientId: string;
  tables: Record<string, FormulaLookupRow[]>;
}

function calendarDay(value: string): string | null {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function criteriaMatches(cell: string, criteria: FormulaValue): boolean {
  const text = asText(criteria);
  if (text === null) return false;
  const operator = text.match(/^(<=|>=|<>|<|>|=)\s*([\s\S]*)$/);
  if (operator) {
    const raw = operator[2];
    const cellNumber = Number(cell.replace(/[$,]/g, ''));
    const rawNumber = Number(raw.replace(/[$,]/g, ''));
    const bothNumeric = cell.trim() !== '' && raw.trim() !== '' && Number.isFinite(cellNumber) && Number.isFinite(rawNumber) && !/[^\d.,$-]/.test(cell) && !/[^\d.,$%-]/.test(raw);
    const cellDay = calendarDay(cell);
    const rawDay = calendarDay(raw);
    const left: FormulaValue = bothNumeric
      ? { type: 'number', value: cellNumber }
      : { type: 'text', value: cellDay && rawDay ? cellDay : cell };
    const right: FormulaValue = bothNumeric
      ? { type: 'number', value: rawNumber }
      : raw === ''
        ? { type: 'blank' }
        : { type: 'text', value: cellDay && rawDay ? rawDay : raw };
    const result = compare(left, operator[1], right);
    return result.type === 'boolean' && result.value;
  }
  if (criteria.type === 'number' || criteria.type === 'percent') {
    const amount = Number(cell.replace(/[$,]/g, ''));
    return Number.isFinite(amount) && amount === criteria.value;
  }
  return valuesEqual(cell === '' ? { type: 'blank' } : { type: 'text', value: cell }, criteria);
}

const ledgerColumnIndex = new WeakMap<FormulaLedgerRow[], Map<string, Map<string, FormulaLedgerRow[]>>>();

/** Exact text criteria can use a column index. Comparisons still scan the rows that remain. */
function plainEqualityText(criteria: FormulaValue): string | null {
  if (criteria.type === 'blank') return '';
  if (criteria.type !== 'text') return null;
  if (/^(<=|>=|<>|<|>|=)/.test(criteria.value)) return null;
  return criteria.value.toLowerCase();
}

function rowsMatchingEquality(ledger: FormulaLedgerRow[], key: string, value: string): FormulaLedgerRow[] {
  let columns = ledgerColumnIndex.get(ledger);
  if (!columns) {
    columns = new Map();
    ledgerColumnIndex.set(ledger, columns);
  }
  let column = columns.get(key);
  if (!column) {
    column = new Map();
    for (const row of ledger) {
      const cell = (row.fields[key] ?? '').toLowerCase();
      const matches = column.get(cell);
      if (matches) matches.push(row);
      else column.set(cell, [row]);
    }
    columns.set(key, column);
  }
  return column.get(value) ?? [];
}

function sumIfs(rawArgs: Expr[], visit: (expr: Expr) => FormulaValue, ledger: FormulaLedgerRow[]): FormulaValue {
  if (rawArgs.length < 3 || (rawArgs.length - 1) % 2 !== 0) return { type: 'error' };
  const sumColumn = columnRef(rawArgs[0]);
  if (!sumColumn) return { type: 'error' };
  const sumKey = `${sumColumn.table}.${sumColumn.field}`;
  const filters: { key: string; criteria: FormulaValue }[] = [];
  for (let index = 1; index < rawArgs.length; index += 2) {
    const range = columnRef(rawArgs[index]);
    if (!range) return { type: 'error' };
    const criteria = visit(rawArgs[index + 1]);
    if (criteria.type === 'error') return { type: 'error' };
    filters.push({ key: `${range.table}.${range.field}`, criteria });
  }
  if (ledger.length > 0 && ledger.every((row) => row.fields[sumKey] === undefined)) return { type: 'error' };

  let rows = ledger;
  const checks = [...filters];
  let smallest: { filter: { key: string; criteria: FormulaValue }; rows: FormulaLedgerRow[] } | null = null;
  for (const filter of filters) {
    const text = plainEqualityText(filter.criteria);
    if (text === null) continue;
    const matches = rowsMatchingEquality(ledger, filter.key, text);
    if (!smallest || matches.length < smallest.rows.length) smallest = { filter, rows: matches };
  }
  if (smallest) {
    rows = smallest.rows;
    const chosen = smallest.filter;
    const index = checks.indexOf(chosen);
    if (index >= 0) checks.splice(index, 1);
  }

  let total = 0;
  for (const row of rows) {
    if (!checks.every((filter) => criteriaMatches(row.fields[filter.key] ?? '', filter.criteria))) continue;
    const amount = Number(String(row.fields[sumKey] ?? '').replace(/[$,]/g, ''));
    if (Number.isFinite(amount)) total += amount;
  }
  return { type: 'number', value: total };
}

function lookupCell(cell: FormulaLookupCell | undefined): FormulaValue {
  if (cell === undefined || cell === '') return { type: 'blank' };
  if (typeof cell === 'boolean') return { type: 'boolean', value: cell };
  if (typeof cell === 'number') return { type: 'number', value: cell };
  return { type: 'text', value: cell };
}

function agentsAsLookup(agents: FormulaAgent[], clientId: string): FormulaLookupRow[] {
  const rows: FormulaLookupRow[] = [];
  for (const agent of agents) {
    if (clientId && agent.clientId && agent.clientId !== clientId) continue;
    const effectiveClientId = agent.clientId || clientId;
    const fields: Record<string, FormulaLookupCell> = { ...(agent.fields || {}) };
    if (agent.id) fields.id = agent.id;
    if (agent.name) {
      fields.agent_name = agent.name;
      fields.name = agent.name;
    }
    fields.is_team_lead = Boolean(agent.isTeamLead);
    fields.client_id = effectiveClientId;
    rows.push({ clientId: effectiveClientId, fields });
  }
  return rows;
}

function lookupRows(table: string, agents: FormulaAgent[], lookups?: FormulaLookups): FormulaLookupRow[] {
  const clientId = lookups?.clientId?.trim() || '';
  if (!clientId) return [];
  const provided = lookups?.tables?.[table];
  const rows = provided ?? (table === 'agents' ? agentsAsLookup(agents, clientId) : []);
  return rows.filter((row) => row.clientId === clientId);
}

function namedAgentMatch(row: FormulaLookupRow, lookup: FormulaValue): boolean {
  return lookup.type === 'text'
    && typeof row.fields.agent_name === 'string'
    && row.fields.agent_name.toLowerCase() === lookup.value.toLowerCase();
}

function chooseNamedAgent(
  keyColumn: { table: string; field: string },
  lookup: FormulaValue,
  rows: FormulaLookupRow[],
): FormulaLookupRow | undefined {
  if (keyColumn.table !== 'agents' || keyColumn.field !== 'id' || lookup.type !== 'text') return undefined;
  const named = rows.filter((row) => namedAgentMatch(row, lookup));
  const active = named.filter((row) => row.fields.archived !== true);
  const pool = active.length > 0 ? active : named;
  return [...pool].sort((a, b) => String(b.fields.created_at || '').localeCompare(String(a.fields.created_at || '')))[0];
}

function callFunction(
  name: string,
  args: FormulaValue[],
  rawArgs: Expr[],
  evalExpr: (expr: Expr) => FormulaValue,
  agents: FormulaAgent[],
  ledger: FormulaLedgerRow[],
  lookups?: FormulaLookups,
): FormulaValue {
  if (name === 'IF') {
    if (rawArgs.length !== 3) return { type: 'error' };
    const condition = isTruthy(evalExpr(rawArgs[0]));
    if (condition === null) return { type: 'error' };
    return evalExpr(condition ? rawArgs[1] : rawArgs[2]);
  }
  if (name === 'AND' || name === 'OR') {
    let sawTrue = false;
    for (const arg of args) {
      const truth = isTruthy(arg);
      if (truth === null) return { type: 'error' };
      if (name === 'AND' && !truth) return { type: 'boolean', value: false };
      if (truth) sawTrue = true;
    }
    return { type: 'boolean', value: name === 'AND' ? true : sawTrue };
  }
  if (name === 'MIN' || name === 'MAX') {
    if (args.length === 0) return { type: 'error' };
    const amounts: number[] = [];
    for (const arg of args) {
      const amount = asNumber(arg);
      if (amount === null) return { type: 'error' };
      amounts.push(amount);
    }
    return { type: 'number', value: name === 'MIN' ? Math.min(...amounts) : Math.max(...amounts) };
  }
  if (name === 'ROUND' || name === 'ROUNDUP' || name === 'ROUNDDOWN') {
    const rawVal = args[0];
    if (!rawVal || rawVal.type === 'error') return { type: 'error' };
    const num = asNumber(rawVal);
    if (num === null) return { type: 'error' };
    const digits = args[1] !== undefined ? asNumber(args[1]) : 0;
    if (digits === null) return { type: 'error' };
    const mode = name === 'ROUNDUP' ? 'up' : name === 'ROUNDDOWN' ? 'down' : 'round';
    const result = roundNumber(num, digits, mode);
    return rawVal.type === 'percent'
      ? { type: 'percent', value: result }
      : { type: 'number', value: result };
  }
  if (name === 'ISNUMBER') {
    const value = args[0];
    return { type: 'boolean', value: value?.type === 'number' || value?.type === 'percent' };
  }
  if (name === 'ISNULL') {
    const value = args[0];
    if (!value || value.type === 'error') return { type: 'error' };
    return { type: 'boolean', value: value.type === 'blank' };
  }
  if (name === 'NOT') {
    const truth = isTruthy(args[0] || { type: 'error' });
    if (truth === null) return { type: 'error' };
    return { type: 'boolean', value: !truth };
  }
  if (name === 'LEN') {
    const text = asText(args[0] || { type: 'error' });
    if (text === null) return { type: 'error' };
    return { type: 'number', value: text.length };
  }
  if (name === 'IFERROR') {
    if (rawArgs.length !== 2) return { type: 'error' };
    const value = evalExpr(rawArgs[0]);
    if (!value || value.type === 'error') return evalExpr(rawArgs[1]);
    return value;
  }
  if (name === 'NUMBERVALUE') {
    const text = asText(args[0] || { type: 'error' });
    if (text === null) return { type: 'error' };
    const cleaned = text.replace(/[$,\s]/g, '');
    if (!cleaned) return { type: 'error' };
    if (cleaned.endsWith('%')) {
      const amount = Number(cleaned.slice(0, -1));
      return Number.isFinite(amount) ? { type: 'percent', value: amount / 100 } : { type: 'error' };
    }
    const amount = Number(cleaned);
    return Number.isFinite(amount) ? { type: 'number', value: amount } : { type: 'error' };
  }
  if (name === 'TRIM') {
    const text = asText(args[0] || { type: 'error' });
    if (text === null) return { type: 'error' };
    return { type: 'text', value: text.trim().replace(/\s+/g, ' ') };
  }
  if (name === 'SEARCH') {
    const find = asText(args[0] || { type: 'error' });
    const within = asText(args[1] || { type: 'error' });
    const start = args[2] ? asNumber(args[2]) : 1;
    if (find === null || within === null || start === null) return { type: 'error' };
    return searchText(find, within, start);
  }
  if (name === 'TEXTAFTER' || name === 'TEXTBEFORE') {
    const text = asText(args[0] || { type: 'error' });
    const delimiter = asText(args[1] || { type: 'error' });
    const instance = args[2] ? asNumber(args[2]) : 1;
    if (text === null || delimiter === null || instance === null) return { type: 'error' };
    return name === 'TEXTAFTER' ? textAfter(text, delimiter, instance) : textBefore(text, delimiter, instance);
  }
  if (name === 'SUBSTITUTE') {
    const text = asText(args[0] || { type: 'error' });
    const oldText = asText(args[1] || { type: 'error' });
    const newText = asText(args[2] || { type: 'error' });
    const instance = args[3] ? asNumber(args[3]) : undefined;
    if (text === null || oldText === null || newText === null || instance === null) return { type: 'error' };
    return substitute(text, oldText, newText, instance === undefined ? undefined : instance);
  }
  if (name === 'XLOOKUP') {
    const keyColumn = rawArgs[1] ? columnRef(rawArgs[1]) : null;
    const returnColumn = rawArgs[2] ? columnRef(rawArgs[2]) : null;
    const lookup = args[0];
    if (!lookup || !keyColumn || !returnColumn || keyColumn.table !== returnColumn.table) {
      return { type: 'error' };
    }
    const rows = lookupRows(keyColumn.table, agents, lookups);

    // Verify keyColumn.field is a valid configured or existing field on this table
    if (!isConfiguredOrExistingField(keyColumn.table, keyColumn.field, rows, lookups)) {
      return { type: 'error' };
    }

    const exact = rows.find((row) => {
      const keyName = Object.keys(row.fields).find((k) => k.toLowerCase() === keyColumn.field.toLowerCase());
      return keyName !== undefined && valuesEqual(lookup, lookupCell(row.fields[keyName]));
    });
    const match = exact ?? chooseNamedAgent(keyColumn, lookup, rows);

    // If the lookup value itself is blank (e.g. unassigned agent_2), and no match was found:
    // return blank if the return column is a valid attribute, else error
    if (!match) {
      if (lookup.type === 'blank' && isConfiguredOrExistingField(returnColumn.table, returnColumn.field, rows, lookups)) {
        return { type: 'blank' };
      }
      return { type: 'error' };
    }

    // Find the return column field on the matched row (case-insensitive)
    const matchedKey = Object.keys(match.fields).find((k) => k.toLowerCase() === returnColumn.field.toLowerCase());
    if (matchedKey !== undefined) {
      return lookupCell(match.fields[matchedKey]);
    }

    // If the field was not set on this specific matched object, differentiate whether it is
    // a valid configured/existing attribute that is simply blank for this object,
    // versus an invalid attribute that does not exist in configuration or for any objects.
    if (isConfiguredOrExistingField(returnColumn.table, returnColumn.field, rows, lookups)) {
      return { type: 'blank' };
    }

    return { type: 'error' };
  }
  if (name === 'SUMIFS') return sumIfs(rawArgs, evalExpr, ledger);
  if (name === 'TODAY') {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return { type: 'text', value: `${now.getFullYear()}-${month}-${day}` };
  }
  if (name === 'YEAR') {
    const value = args[0];
    if (!value || value.type === 'error') return { type: 'error' };
    if (value.type === 'blank') return { type: 'blank' };
    const text = value.type === 'text' ? value.value : value.type === 'number' ? String(Math.trunc(value.value)) : '';
    const match = text.trim().match(/^(\d{4})(?:-\d{2}-\d{2})?/);
    if (!match) return { type: 'blank' };
    return { type: 'number', value: Number(match[1]) };
  }
  return { type: 'error' };
}

function evaluateExpr(
  expr: Expr,
  resolveName: (name: string) => FormulaValue,
  agents: FormulaAgent[],
  ledger: FormulaLedgerRow[],
  lookups?: FormulaLookups,
): FormulaValue {
  const visit = (node: Expr): FormulaValue => {
    if (node.kind === 'number') return { type: 'number', value: node.value };
    if (node.kind === 'percent') return { type: 'percent', value: node.value };
    if (node.kind === 'string') return node.value === '' ? { type: 'blank' } : { type: 'text', value: node.value };
    if (node.kind === 'name') {
      const lower = node.name.toLowerCase();
      if (lower === 'true') return { type: 'boolean', value: true };
      if (lower === 'false') return { type: 'boolean', value: false };
      return resolveName(node.name);
    }
    if (node.kind === 'unary') {
      const value = visit(node.expr);
      const amount = asNumber(value);
      if (amount === null) return { type: 'error' };
      const next = node.op === '-' ? -amount : amount;
      return value.type === 'percent' ? { type: 'percent', value: next } : { type: 'number', value: next };
    }
    if (node.kind === 'binary') {
      if (node.op === '&') {
        const left = asText(visit(node.left));
        const right = asText(visit(node.right));
        if (left === null || right === null) return { type: 'error' };
        return { type: 'text', value: left + right };
      }
      if (['=', '<>', '<', '<=', '>', '>='].includes(node.op)) {
        return compare(visit(node.left), node.op, visit(node.right));
      }
      const leftValue = visit(node.left);
      const rightValue = visit(node.right);
      const left = asNumber(leftValue);
      const right = asNumber(rightValue);
      if (left === null || right === null) return { type: 'error' };
      if (node.op === '/' && right === 0) return { type: 'error' };
      const value = node.op === '+' ? left + right : node.op === '-' ? left - right : node.op === '*' ? left * right : left / right;
      return percentResult(node.op, leftValue, rightValue) ? { type: 'percent', value } : { type: 'number', value };
    }
    if (node.name === 'IF' || node.name === 'IFERROR' || node.name === 'SUMIFS') return callFunction(node.name, [], node.args, visit, agents, ledger, lookups);
    const args = node.args.map((arg) => visit(arg));
    return callFunction(node.name, args, node.args, visit, agents, ledger, lookups);
  };
  return visit(expr);
}

export function evaluateFormula(
  source: string,
  resolveName: (name: string) => FormulaValue,
  agents: FormulaAgent[] = [],
  ledger: FormulaLedgerRow[] = [],
  lookups?: FormulaLookups,
): FormulaValue | null {
  const body = source.trim().replace(/^=/, '').trim();
  if (!body) return { type: 'blank' };
  const expr = parseFormula(body);
  if (!expr) return null;
  return evaluateExpr(expr, resolveName, agents, ledger, lookups);
}

export function formulaValueToInput(value: FormulaValue, dataType?: string | null): string {
  if (value.type === 'blank' || value.type === 'error') return '';
  if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
  if (value.type === 'text') return value.value;
  if (value.type === 'percent') return `${trimNumber(value.value * 100)}%`;
  if (dataType === 'PERCENT') return `${trimNumber(value.value)}%`;
  if (dataType === 'CURRENCY') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value.value);
  }
  return trimNumber(value.value);
}
