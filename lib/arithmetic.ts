/**
 * Arithmetic typed into a number or percent field, such as "60/70" or "(1500 + 250) * 2", worked out when the
 * field is left or Enter is pressed. Only numbers, + - * /, parentheses and spaces are read; "$" and "," are
 * ignored. Nothing is passed to eval.
 */

const EXPRESSION_CHARS = /^[\d.,$\s+\-*/()]*$/;

/** True when the text is a calculation rather than a plain number: it has an operator after its first character. */
export function isArithmeticExpression(text: string): boolean {
  const body = text.trim();
  if (!body || !EXPRESSION_CHARS.test(body)) return false;
  return /[+\-*/()]/.test(body.slice(1)) || /[*/()]/.test(body[0]);
}

/** True when every character could belong to a calculation, so the field lets it be typed. */
export function mayBeArithmetic(text: string): boolean {
  return EXPRESSION_CHARS.test(text);
}

/** The result, or null when the text is not a complete calculation (or divides by zero). */
export function evaluateArithmetic(text: string): number | null {
  const source = text.replace(/[$,\s]/g, '');
  if (!source || !EXPRESSION_CHARS.test(source)) return null;
  let index = 0;

  const peek = () => source[index];
  const number = (): number | null => {
    const match = /^\d*\.?\d+|^\d+\.?/.exec(source.slice(index));
    if (!match) return null;
    index += match[0].length;
    return Number(match[0]);
  };
  const factor = (): number | null => {
    if (peek() === '-') { index += 1; const value = factor(); return value === null ? null : -value; }
    if (peek() === '+') { index += 1; return factor(); }
    if (peek() === '(') {
      index += 1;
      const value = sum();
      if (value === null || peek() !== ')') return null;
      index += 1;
      return value;
    }
    return number();
  };
  const product = (): number | null => {
    let value = factor();
    while (value !== null && (peek() === '*' || peek() === '/')) {
      const op = source[index];
      index += 1;
      const right = factor();
      if (right === null) return null;
      if (op === '/') {
        if (right === 0) return null;
        value /= right;
      } else {
        value *= right;
      }
    }
    return value;
  };
  function sum(): number | null {
    let value = product();
    while (value !== null && (peek() === '+' || peek() === '-')) {
      const op = source[index];
      index += 1;
      const right = product();
      if (right === null) return null;
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = sum();
  if (result === null || index !== source.length || !Number.isFinite(result)) return null;
  return result;
}

/**
 * A calculation typed into a percent field, in percent points. A plain number is already in points (70 is 70%).
 * A division whose result falls between -1 and 1 is a ratio, so 60/70 is 85.71%; any other result is in points,
 * so 50+20 is 70% and 100/4 is 25%.
 */
export function percentPointsFromArithmetic(text: string): number | null {
  const result = evaluateArithmetic(text);
  if (result === null) return null;
  return text.includes('/') && Math.abs(result) <= 1 ? result * 100 : result;
}
