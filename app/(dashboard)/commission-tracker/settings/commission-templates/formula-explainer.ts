import { readExcelString } from './formula-validator';

type Expr =
  | { kind: 'num'; raw: string }
  | { kind: 'str'; raw: string }
  | { kind: 'name'; raw: string }
  | { kind: 'unary'; op: string; arg: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] };

type Token =
  | { type: 'number' | 'string' | 'name' | 'op'; value: string }
  | { type: 'lparen' | 'rparen' | 'comma' | 'eof' };

const COMPARISONS = ['=', '<>', '<', '<=', '>', '>='];

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
    while (peek().type === 'op' && COMPARISONS.includes((peek() as { value: string }).value)) {
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
      const op = (eat() as { value: string }).value;
      const arg = parseUnary();
      if (!arg) return null;
      return { kind: 'unary', op, arg };
    }
    return parsePrimary();
  };

  const parsePrimary = (): Expr | null => {
    const token = peek();
    if (token.type === 'number') {
      eat();
      return { kind: 'num', raw: token.value };
    }
    if (token.type === 'string') {
      eat();
      return { kind: 'str', raw: token.value };
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
      return { kind: 'name', raw: token.value };
    }
    return null;
  };

  const expr = parseComparison();
  if (!expr || peek().type !== 'eof') return null;
  return expr;
}

function isCall(expr: Expr, name: string): expr is Extract<Expr, { kind: 'call' }> {
  return expr.kind === 'call' && expr.name === name;
}

function isBlankString(expr: Expr): boolean {
  return expr.kind === 'str' && expr.raw === '';
}

type Reading = {
  labels: Map<string, string>;
  counts: Map<string, number>;
  shorts: Map<string, string>;
  textAlias: number;
};

export function explainFormula(source: string, names: { name: string; label: string }[]): string | null {
  const trimmed = source.trim();
  if (!trimmed) return null;
  const parsed = parseFormula(trimmed);
  if (!parsed) return 'This formula is not valid yet, so it cannot be read in plain language.';

  const expr = tighten(parsed);
  const reading: Reading = {
    labels: new Map(names.map((item) => [item.name.toLowerCase(), item.label])),
    counts: new Map(),
    shorts: new Map(),
    textAlias: 0,
  };
  countExpr(expr, reading.counts);
  return compactBlank(sentences(expr, reading)).join('\n\n');
}

function tighten(expr: Expr): Expr {
  if (expr.kind === 'unary') return { ...expr, arg: tighten(expr.arg) };
  if (expr.kind === 'binary') return { ...expr, left: tighten(expr.left), right: tighten(expr.right) };
  if (expr.kind !== 'call') return expr;
  const args = expr.args.map(tighten);
  if (expr.name !== 'IF' || args.length !== 3) return { ...expr, args };
  const conds: Expr[] = [args[0]];
  let yes = args[1];
  const no = args[2];
  while (isCall(yes, 'IF') && yes.args.length === 3 && isBlankString(yes.args[2]) && isBlankString(no)) {
    conds.push(yes.args[0]);
    yes = yes.args[1];
  }
  const condition = conds.length === 1 ? conds[0] : { kind: 'call' as const, name: 'AND', args: flattenAnd(conds) };
  return { kind: 'call', name: 'IF', args: [dropRedundantContains(condition), yes, no] };
}

function flattenAnd(args: Expr[]): Expr[] {
  return args.flatMap((arg) => (isCall(arg, 'AND') ? arg.args : [arg]));
}

function dropRedundantContains(expr: Expr): Expr {
  if (!isCall(expr, 'AND')) return expr;
  const starts = new Set(expr.args.map(startsWithKey).filter((key): key is string => Boolean(key)));
  const args = expr.args.filter((arg) => {
    const key = containsKey(arg);
    return !(key && starts.has(key));
  });
  return args.length === 1 ? args[0] : { ...expr, args };
}

function searchPair(expr: Expr): { needle: Expr; haystack: Expr } | null {
  if (!isCall(expr, 'SEARCH') || expr.args.length < 2) return null;
  return { needle: expr.args[0], haystack: expr.args[1] };
}

function startsWithKey(expr: Expr): string | null {
  if (expr.kind !== 'binary' || expr.op !== '=' || expr.right.kind !== 'num' || expr.right.raw !== '1') return null;
  const pair = searchPair(expr.left);
  return pair ? exprKey(pair.needle) + '|' + exprKey(pair.haystack) : null;
}

function containsKey(expr: Expr): string | null {
  if (!isCall(expr, 'ISNUMBER') || expr.args.length !== 1) return null;
  const pair = searchPair(expr.args[0]);
  return pair ? exprKey(pair.needle) + '|' + exprKey(pair.haystack) : null;
}

function countExpr(expr: Expr, counts: Map<string, number>): void {
  const key = exprKey(expr);
  counts.set(key, (counts.get(key) || 0) + 1);
  if (expr.kind === 'unary') countExpr(expr.arg, counts);
  if (expr.kind === 'binary') {
    countExpr(expr.left, counts);
    countExpr(expr.right, counts);
  }
  if (expr.kind === 'call') expr.args.forEach((arg) => countExpr(arg, counts));
}

function exprKey(expr: Expr): string {
  return JSON.stringify(expr);
}

function sentences(expr: Expr, reading: Reading): string[] {
  if (isCall(expr, 'IF') && expr.args.length === 3) return explainIf(expr, reading);
  return [`The result is ${phrase(expr, reading)}.`];
}

function explainIf(expr: Extract<Expr, { kind: 'call' }>, reading: Reading): string[] {
  const conditions: Expr[] = [];
  const elses: Expr[] = [];
  let current: Expr = expr;
  while (isCall(current, 'IF') && current.args.length === 3 && isCall(current.args[1], 'IF') && current.args[1].args.length === 3) {
    conditions.push(current.args[0]);
    elses.push(current.args[2]);
    current = current.args[1];
  }
  if (isCall(current, 'IF') && current.args.length === 3) {
    conditions.push(current.args[0]);
    elses.push(current.args[2]);
    current = current.args[1];
  }
  const condition = pruneConditions(conditions).map((item) => phrase(item, reading)).join(', and ');
  const lines = [`If ${condition}, the result is ${phrase(current, reading)}.`];
  let more: string[] = [];
  for (const elseExpr of [...elses].reverse()) {
    more = [...more, ...otherwise(sentences(elseExpr, reading))];
  }
  return compactBlank([...lines, ...more]);
}

function pruneConditions(conditions: Expr[]): Expr[] {
  const starts = new Set(conditions.map(startsWithKey).filter((key): key is string => Boolean(key)));
  const kept = conditions.filter((condition) => {
    const key = containsKey(condition);
    return !(key && starts.has(key));
  });
  return kept.length > 0 ? kept : conditions;
}

function compactBlank(lines: string[]): string[] {
  const compact: string[] = [];
  for (const line of lines) {
    if (line === 'Otherwise, the result is blank.' && compact[compact.length - 1] === line) continue;
    compact.push(line);
  }
  return compact;
}

function otherwise(lines: string[]): string[] {
  if (lines.length === 0) return [];
  const [first, ...rest] = lines;
  return [`Otherwise, ${lowerFirst(first)}`, ...rest];
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function phrase(expr: Expr, reading: Reading): string {
  const key = exprKey(expr);
  const repeated = (reading.counts.get(key) || 0) > 1 && isAliasCandidate(expr);
  const known = reading.shorts.get(key);
  if (repeated && known) return known;
  const full = phraseOnce(expr, reading);
  if (!repeated) return full;
  const short = shortLabel(expr, reading);
  reading.shorts.set(key, short);
  return full;
}

function isAliasCandidate(expr: Expr): boolean {
  return isCall(expr, 'XLOOKUP') || segmentSource(expr) !== null;
}

function shortLabel(expr: Expr, reading: Reading): string {
  if (isCall(expr, 'XLOOKUP') && expr.args[2]?.kind === 'name') {
    return `the matching ${fieldName(expr.args[2], reading.labels)}`;
  }
  reading.textAlias += 1;
  return 'that text';
}

function phraseOnce(expr: Expr, reading: Reading): string {
  if (isBlankString(expr)) return 'blank';
  if (expr.kind === 'num') return expr.raw;
  if (expr.kind === 'str') return `"${expr.raw}"`;
  if (expr.kind === 'name') {
    const lower = expr.raw.toLowerCase();
    if (lower === 'true' || lower === 'false') return lower;
    return fieldName(expr, reading.labels);
  }
  if (expr.kind === 'unary') return expr.op === '-' ? `negative ${phrase(expr.arg, reading)}` : phrase(expr.arg, reading);
  if (expr.kind === 'binary') {
    const starts = startsWithPhrase(expr, reading);
    if (starts) return starts;
    return `${phrase(expr.left, reading)} ${operatorWord(expr.op)} ${phrase(expr.right, reading)}`;
  }
  if (expr.kind === 'call') return callPhrase(expr, reading);
  return '';
}

function startsWithPhrase(expr: Extract<Expr, { kind: 'binary' }>, reading: Reading): string | null {
  if (expr.op !== '=' || expr.right.kind !== 'num' || expr.right.raw !== '1') return null;
  const pair = searchPair(expr.left);
  if (!pair) return null;
  const haystack = phrase(pair.haystack, reading);
  const pause = haystack.includes(',') ? ', ' : ' ';
  return `${haystack}${pause}starts with ${phrase(pair.needle, reading)}`;
}

function segmentSource(expr: Expr): { source: Expr; needle: Expr; delimiter: Expr } | null {
  if (!isCall(expr, 'TEXTBEFORE') || expr.args.length < 2) return null;
  const inner = expr.args[0];
  if (!isCall(inner, 'TEXTAFTER') || inner.args.length < 2) return null;
  const delimiter = expr.args[1];
  let source = inner.args[0];
  if (source.kind === 'binary' && source.op === '&' && exprKey(source.right) === exprKey(delimiter)) source = source.left;
  return { source, needle: inner.args[1], delimiter };
}

function callPhrase(expr: Extract<Expr, { kind: 'call' }>, reading: Reading): string {
  const segment = segmentSource(expr);
  if (segment) {
    return `the text in ${phrase(segment.source, reading)} after ${phrase(segment.needle, reading)}, up to the next ${phrase(segment.delimiter, reading)}`;
  }
  const args = expr.args;
  if (expr.name === 'AND') return args.map((arg) => phrase(arg, reading)).join(', and ');
  if (expr.name === 'OR') return args.map((arg) => phrase(arg, reading)).join(', or ');
  if (expr.name === 'ISNUMBER' && args.length === 1) {
    const pair = searchPair(args[0]);
    if (pair) return `${phrase(pair.haystack, reading)} contains ${phrase(pair.needle, reading)}`;
    return `${phrase(args[0], reading)} is a number`;
  }
  if (expr.name === 'XLOOKUP' && args.length >= 3) {
    return `the ${phrase(args[2], reading)} where ${phrase(args[1], reading)} matches ${phrase(args[0], reading)}`;
  }
  if (expr.name === 'TEXTBEFORE' && args.length >= 2) {
    return `the part of ${phrase(args[0], reading)} before ${phrase(args[1], reading)}`;
  }
  if (expr.name === 'TEXTAFTER' && args.length >= 2) {
    return `the part of ${phrase(args[0], reading)} after ${phrase(args[1], reading)}`;
  }
  if (expr.name === 'TRIM' && args.length === 1) return phrase(args[0], reading);
  if (expr.name === 'NUMBERVALUE' && args.length === 1) {
    const cleaned = removedPieces(args[0]);
    if (cleaned.removed.length > 0) {
      return `the number in ${phrase(cleaned.base, reading)} after removing ${joinList([...cleaned.removed].reverse().map((item) => removalWord(item) || phrase(item, reading)))}`;
    }
    return `the number in ${phrase(args[0], reading)}`;
  }
  if (expr.name === 'SUBSTITUTE' && args.length >= 3) {
    const cleaned = removedPieces(expr);
    if (cleaned.removed.length > 0 && cleaned.replacements.length === 0) {
      return `${phrase(cleaned.base, reading)} with ${joinList(cleaned.removed.map((item) => phrase(item, reading)))} removed`;
    }
  }
  if (expr.name === 'COUNTIFS' && args.length >= 2) {
    const checks: string[] = [];
    for (let index = 0; index + 1 < args.length; index += 2) {
      checks.push(`${phrase(args[index], reading)} matches ${phrase(args[index + 1], reading)}`);
    }
    return `the number of rows where ${joinList(checks)}`;
  }
  if (expr.name === 'SEARCH' && args.length >= 2) {
    return `the position of ${phrase(args[0], reading)} in ${phrase(args[1], reading)}`;
  }
  const rendered = args.map((arg) => phrase(arg, reading));
  return rendered.length === 0 ? expr.name : `${expr.name}(${rendered.join(', ')})`;
}

function removalWord(expr: Expr): string | null {
  if (expr.kind !== 'str') return null;
  if (expr.raw === '$') return 'dollar signs';
  if (expr.raw === ',') return 'commas';
  if (expr.raw === '%') return 'percent signs';
  return null;
}

function removedPieces(expr: Expr): { base: Expr; removed: Expr[]; replacements: Expr[] } {
  const removed: Expr[] = [];
  const replacements: Expr[] = [];
  let current = expr;
  while (isCall(current, 'TRIM') && current.args.length === 1) current = current.args[0];
  while (isCall(current, 'SUBSTITUTE') && current.args.length >= 3) {
    if (isBlankString(current.args[2])) removed.push(current.args[1]);
    else replacements.push(current.args[1]);
    current = current.args[0];
    while (isCall(current, 'TRIM') && current.args.length === 1) current = current.args[0];
  }
  return { base: current, removed, replacements };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function fieldName(expr: Extract<Expr, { kind: 'name' }>, labels: Map<string, string>): string {
  const direct = labels.get(expr.raw.toLowerCase());
  if (direct) return direct;
  const dot = expr.raw.indexOf('.');
  if (dot === -1) return expr.raw.replace(/_/g, ' ');
  const field = expr.raw.slice(dot + 1);
  return labels.get(field.toLowerCase()) || `${expr.raw.slice(0, dot)}.${field.replace(/_/g, ' ')}`;
}

function operatorWord(op: string): string {
  if (op === '=') return 'is';
  if (op === '<>') return 'is not';
  if (op === '>') return 'is greater than';
  if (op === '>=') return 'is at least';
  if (op === '<') return 'is less than';
  if (op === '<=') return 'is at most';
  if (op === '&') return 'followed by';
  if (op === '+') return 'plus';
  if (op === '-') return 'minus';
  if (op === '*') return 'multiplied by';
  return 'divided by';
}
