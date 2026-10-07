const FUNCTION_ARITY: Record<string, { min: number; max: number; even?: boolean; pairsAfterFirst?: boolean }> = {
  IF: { min: 3, max: 3 },
  IFERROR: { min: 2, max: 2 },
  AND: { min: 1, max: 20 },
  OR: { min: 1, max: 20 },
  NOT: { min: 1, max: 1 },
  COUNTIFS: { min: 2, max: 40, even: true },
  SUMIFS: { min: 3, max: 41, pairsAfterFirst: true },
  MIN: { min: 1, max: 20 },
  MAX: { min: 1, max: 20 },
  ISNUMBER: { min: 1, max: 1 },
  ISNULL: { min: 1, max: 1 },
  YEAR: { min: 1, max: 1 },
  TODAY: { min: 0, max: 0 },
  NUMBERVALUE: { min: 1, max: 1 },
  LEN: { min: 1, max: 1 },
  SEARCH: { min: 2, max: 3 },
  TEXTAFTER: { min: 2, max: 3 },
  TEXTBEFORE: { min: 2, max: 3 },
  TRIM: { min: 1, max: 1 },
  SUBSTITUTE: { min: 3, max: 4 },
  XLOOKUP: { min: 3, max: 3 },
};

type Token =
  | { type: 'number' | 'string' | 'name' | 'op'; value: string }
  | { type: 'lparen' | 'rparen' | 'comma' | 'eof' };

/** Reads an Excel text value. A doubled quote inside the text is one quote character. */
export function readExcelString(source: string, start: number): { end: number; value: string } | null {
  let index = start + 1;
  let value = '';
  while (index < source.length) {
    if (source[index] === '"') {
      if (source[index + 1] === '"') {
        value += '"';
        index += 2;
        continue;
      }
      return { end: index + 1, value };
    }
    value += source[index];
    index += 1;
  }
  return null;
}

function lex(source: string): { tokens: Token[]; error: string | null } {
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
      if (!text) return { tokens, error: 'A text value is missing its closing quote.' };
      tokens.push({ type: 'string', value: source.slice(index, text.end) });
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
    if (char === '(') {
      tokens.push({ type: 'lparen' });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen' });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma' });
      index += 1;
      continue;
    }
    return { tokens, error: `Unexpected character "${char}".` };
  }

  tokens.push({ type: 'eof' });
  return { tokens, error: null };
}

const RESERVED_WORDS = new Set(['TRUE', 'FALSE']);

function readName(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
  if (source[index] === '.' && /[A-Za-z_]/.test(source[index + 1] || '')) {
    index += 2;
    while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
  }
  return index;
}

/** Uppercases functions, lowercases field names, and spaces commas that stay on the same line. */
export function normalizeFormula(source: string, cursor = source.length): { text: string; cursor: number } {
  const functions = new Set(Object.keys(FUNCTION_ARITY));
  let text = '';
  let nextCursor = cursor;
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      const textValue = readExcelString(source, index);
      if (!textValue) {
        text += source.slice(index);
        break;
      }
      text += source.slice(index, textValue.end);
      index = textValue.end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const end = readName(source, index);
      const raw = source.slice(index, end);
      const upper = raw.toUpperCase();
      text += functions.has(upper) || RESERVED_WORDS.has(upper) ? upper : raw.toLowerCase();
      index = end;
      continue;
    }
    if (char === ',') {
      text += ',';
      index += 1;
      if (index < source.length && !/\s/.test(source[index])) {
        text += ' ';
        if (cursor >= index) nextCursor += 1;
      }
      continue;
    }
    text += char;
    index += 1;
  }

  return { text, cursor: Math.min(nextCursor, text.length) };
}

function isKnownName(name: string, known: Set<string>): boolean {
  const lower = name.toLowerCase();
  if (lower === 'true' || lower === 'false' || lower === 'agents.id') return true;
  if (known.has(lower)) return true;
  const dot = lower.indexOf('.');
  if (dot <= 0 || dot !== lower.lastIndexOf('.')) return false;
  const table = lower.slice(0, dot);
  const field = lower.slice(dot + 1);
  if (!/^[a-z_][a-z0-9_]*$/.test(table) || !/^[a-z_][a-z0-9_]*$/.test(field)) return false;
  return true;
}

export function validateFormula(source: string, knownNames: string[]): string | null {
  const trimmed = source.trim().replace(/^=/, '').trim();
  if (!trimmed) return null;

  const { tokens, error } = lex(trimmed);
  if (error) return error;

  const known = new Set(knownNames.map((name) => name.toLowerCase()));
  let index = 0;
  const peek = () => tokens[index];
  const eat = () => tokens[index++];

  const fail = (message: string): never => {
    throw new Error(message);
  };

  const parseComparison = (): void => {
    parseConcat();
    while (peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes((peek() as { value: string }).value)) {
      eat();
      if (peek().type === 'eof' || peek().type === 'comma' || peek().type === 'rparen') {
        fail('A comparison is missing the value on the right.');
      }
      parseConcat();
    }
  };

  const parseConcat = (): void => {
    parseAdd();
    while (peek().type === 'op' && (peek() as { value: string }).value === '&') {
      eat();
      if (peek().type === 'eof' || peek().type === 'comma' || peek().type === 'rparen') {
        fail('Text is missing after &.');
      }
      parseAdd();
    }
  };

  const parseAdd = (): void => {
    parseMul();
    while (peek().type === 'op' && ['+', '-'].includes((peek() as { value: string }).value)) {
      eat();
      if (peek().type === 'eof' || peek().type === 'comma' || peek().type === 'rparen') {
        fail('A value is missing after the + or - sign.');
      }
      parseMul();
    }
  };

  const parseMul = (): void => {
    parseUnary();
    while (peek().type === 'op' && ['*', '/'].includes((peek() as { value: string }).value)) {
      eat();
      if (peek().type === 'eof' || peek().type === 'comma' || peek().type === 'rparen') {
        fail('A value is missing after the * or / sign.');
      }
      parseUnary();
    }
  };

  const parseUnary = (): void => {
    if (peek().type === 'op' && ['+', '-'].includes((peek() as { value: string }).value)) {
      eat();
      parseUnary();
      return;
    }
    parsePrimary();
  };

  const parsePrimary = (): void => {
    const token = peek();
    if (token.type === 'number' || token.type === 'string') {
      eat();
      return;
    }
    if (token.type === 'lparen') {
      eat();
      parseComparison();
      if (peek().type !== 'rparen') fail('A parenthesis is missing.');
      eat();
      return;
    }
    if (token.type === 'name') {
      eat();
      const upper = token.value.toUpperCase();
      if (peek().type === 'lparen') {
        const rule = FUNCTION_ARITY[upper];
        if (!rule) fail(`Unknown function ${token.value}.`);
        eat();
        const count = parseArguments();
        if (peek().type !== 'rparen') fail(`${token.value} is missing a closing parenthesis.`);
        eat();
        if (count < rule.min || count > rule.max) {
          if (rule.max === 0) fail(`${upper} does not take a value.`);
          fail(rule.min === rule.max
            ? `${upper} needs ${rule.min} value${rule.min === 1 ? '' : 's'}.`
            : `${upper} needs at least ${rule.min} value${rule.min === 1 ? '' : 's'}.`);
        }
        if (rule.even && count % 2 !== 0) fail(`${upper} needs pairs of a field and a criteria.`);
        if (rule.pairsAfterFirst && (count - 1) % 2 !== 0) fail(`${upper} needs a sum field, then pairs of a field and a criteria.`);
        return;
      }
      if (FUNCTION_ARITY[upper]) fail(`${upper} needs parentheses.`);
      if (!isKnownName(token.value, known)) fail(`Unknown name "${token.value}".`);
      return;
    }
    if (token.type === 'eof' || token.type === 'comma' || token.type === 'rparen') {
      fail('The formula is missing a value.');
    }
    fail('The formula could not be read.');
  };

  const parseArguments = (): number => {
    if (peek().type === 'rparen') return 0;
    let count = 0;
    while (true) {
      if (peek().type === 'comma' || peek().type === 'rparen' || peek().type === 'eof') {
        fail('A function argument is missing.');
      }
      parseComparison();
      count += 1;
      if (peek().type === 'comma') {
        eat();
        continue;
      }
      break;
    }
    return count;
  };

  try {
    parseComparison();
    if (peek().type !== 'eof') return 'Unexpected text after the formula.';
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'The formula could not be read.';
  }
}
