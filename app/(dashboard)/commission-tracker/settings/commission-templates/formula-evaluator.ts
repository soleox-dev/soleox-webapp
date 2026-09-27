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
}

function agentField(agent: FormulaAgent, field: string): FormulaValue {
  if (field === 'id') return agent.id ? { type: 'text', value: agent.id } : { type: 'blank' };
  if (field === 'agent_name' || field === 'name') return agent.name ? { type: 'text', value: agent.name } : { type: 'blank' };
  if (field === 'is_team_lead') return { type: 'boolean', value: Boolean(agent.isTeamLead) };
  return { type: 'error' };
}

function callFunction(
  name: string,
  args: FormulaValue[],
  rawArgs: Expr[],
  evalExpr: (expr: Expr) => FormulaValue,
  agents: FormulaAgent[],
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
  if (name === 'ISNUMBER') {
    const value = args[0];
    return { type: 'boolean', value: value?.type === 'number' || value?.type === 'percent' };
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
    if (!lookup || !keyColumn || !returnColumn || keyColumn.table !== 'agents' || returnColumn.table !== 'agents') {
      return { type: 'error' };
    }
    const match = agents.find((agent) => {
      if (valuesEqual(lookup, agentField(agent, keyColumn.field))) return true;
      return keyColumn.field === 'id' && lookup.type === 'text' && agent.name.toLowerCase() === lookup.value.toLowerCase();
    });
    if (!match) return { type: 'error' };
    return agentField(match, returnColumn.field);
  }
  return { type: 'error' };
}

function evaluateExpr(expr: Expr, resolveName: (name: string) => FormulaValue, agents: FormulaAgent[]): FormulaValue {
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
      return { type: 'number', value: node.op === '-' ? -amount : amount };
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
      const left = asNumber(visit(node.left));
      const right = asNumber(visit(node.right));
      if (left === null || right === null) return { type: 'error' };
      if (node.op === '/' && right === 0) return { type: 'error' };
      const value = node.op === '+' ? left + right : node.op === '-' ? left - right : node.op === '*' ? left * right : left / right;
      return { type: 'number', value };
    }
    if (node.name === 'IF') return callFunction(node.name, [], node.args, visit, agents);
    const args = node.args.map((arg) => visit(arg));
    return callFunction(node.name, args, node.args, visit, agents);
  };
  return visit(expr);
}

export function evaluateFormula(
  source: string,
  resolveName: (name: string) => FormulaValue,
  agents: FormulaAgent[] = [],
): FormulaValue | null {
  const body = source.trim().replace(/^=/, '').trim();
  if (!body) return { type: 'blank' };
  const expr = parseFormula(body);
  if (!expr) return null;
  return evaluateExpr(expr, resolveName, agents);
}

export function formulaValueToInput(value: FormulaValue, dataType?: string | null): string {
  if (value.type === 'blank' || value.type === 'error') return '';
  if (value.type === 'boolean') return value.value ? 'Yes' : 'No';
  if (value.type === 'text') return value.value;
  if (value.type === 'percent') return `${trimNumber(value.value * 100)}%`;
  if (dataType === 'PERCENT') return `${trimNumber(value.value)}%`;
  if (dataType === 'CURRENCY') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value.value);
  }
  return trimNumber(value.value);
}
