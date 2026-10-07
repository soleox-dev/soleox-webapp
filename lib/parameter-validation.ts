import { evaluateFormula, type FormulaValue } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { validateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';

export type ValidationParameterType = 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE' | 'SELECT' | 'AGENT_PICKER' | 'BOOLEAN';

export const VALIDATION_RULE_HINT =
  'Write a formula that must be true, such as and(agent_2<>"", agent_2<>agent_3).';

type NumericUnit = 'number' | 'currency' | 'percent';

type Check =
  | { kind: 'range'; min: number; max: number }
  | { kind: 'compare'; op: '>=' | '>' | '<=' | '<' | '=' | '!='; value: number }
  | { kind: 'date-range'; min: string; max: string }
  | { kind: 'date-compare'; op: '>=' | '>' | '<=' | '<'; value: string }
  | { kind: 'length'; min: number; max: number }
  | { kind: 'matches'; source: string; flags: string }
  | { kind: 'one-of'; options: string[] }
  | { kind: 'boolean'; checked: boolean }
  | { kind: 'formula'; source: string };

export function validationParameterType(value?: string | null): ValidationParameterType {
  if (value === 'AGENT') return 'AGENT_PICKER';
  if (value === 'YES_NO') return 'BOOLEAN';
  if (
    value === 'TEXT' ||
    value === 'NUMBER' ||
    value === 'CURRENCY' ||
    value === 'PERCENT' ||
    value === 'DATE' ||
    value === 'SELECT' ||
    value === 'AGENT_PICKER' ||
    value === 'BOOLEAN'
  ) {
    return value;
  }
  return 'CURRENCY';
}

export function interpretValidationRule(
  rule: string | null | undefined,
  names?: string[],
): { ok: true; summary: string } | { ok: false; message: string } {
  const text = String(rule || '').trim();
  if (!text) return { ok: true, summary: '' };
  const issue = validateFormula(text, names || []);
  if (issue) return { ok: false, message: issue };
  return { ok: true, summary: 'Must satisfy the formula.' };
}

export function parameterValidationMessage(input: {
  dataType?: string | null;
  value: string;
  rule?: string | null;
  required?: boolean;
  parameters?: Record<string, string>;
  parameterTypes?: Record<string, string | null | undefined>;
  deal?: Record<string, unknown> | null;
}): string | null {
  const type = validationParameterType(input.dataType);
  const value = String(input.value ?? '');
  const text = String(input.rule || '').trim();
  if (!text) return isBlank(value) && input.required ? 'This field is required.' : null;
  const formulaNames = [
    ...Object.keys(input.parameters || {}),
    ...dealFieldNames(input.deal),
  ];
  if (!validateFormula(text, formulaNames)) {
    if (isBlank(value) && input.required) return 'This field is required.';
    const passed = formulaIsTrue(text, input.parameters || {}, input.parameterTypes || {}, input.deal);
    if (passed === null) return 'This validation rule needs to be fixed in the template.';
    return passed ? null : 'Does not satisfy the validation formula.';
  }
  const parsed = parseRule(text, type);
  if (parsed.ok === false) return 'This validation rule needs to be fixed in the template.';
  if (isBlank(value)) return input.required ? 'This field is required.' : null;
  for (const check of parsed.checks) {
    const message = checkValue(check, value, type);
    if (message) return message;
  }
  return null;
}

function parseRule(
  rule: string,
  type: ValidationParameterType,
  names?: string[],
): { ok: true; checks: Check[] } | { ok: false; message: string } {
  const text = normalizeDashes(rule).trim();
  const clauses = splitClauses(text);
  if (clauses.length === 0) return { ok: false, message: 'Enter a validation rule, or leave this blank.' };
  const checks: Check[] = [];
  for (const clause of clauses) {
    const parsed = parseClause(clause, type);
    if (parsed.ok === false) {
      const formula = formulaRule(text, names);
      if (formula) return formula;
      return { ok: false, message: parsed.message };
    }
    checks.push(parsed.check);
  }
  return { ok: true, checks };
}

function formulaRule(
  rule: string,
  names?: string[],
): { ok: true; checks: Check[] } | { ok: false; message: string } | null {
  if (!looksLikeFormula(rule)) return null;
  const issue = validateFormula(rule, names || []);
  if (issue) return { ok: false, message: issue };
  return { ok: true, checks: [{ kind: 'formula', source: rule }] };
}

function looksLikeFormula(rule: string): boolean {
  return /[()]/.test(rule) || /<>/.test(rule) || /\b(and|or|if)\s*\(/i.test(rule);
}

function formulaIsTrue(
  source: string,
  parameters: Record<string, string>,
  parameterTypes: Record<string, string | null | undefined>,
  deal?: Record<string, unknown> | null,
): boolean | null {
  const result = evaluateFormula(source, (name) => resolveParameter(name, parameters, parameterTypes, deal));
  if (!result || result.type === 'error') return null;
  if (result.type === 'boolean') return result.value;
  if (result.type === 'number' || result.type === 'percent') return result.value !== 0;
  if (result.type === 'blank') return false;
  return null;
}

function resolveParameter(
  name: string,
  parameters: Record<string, string>,
  parameterTypes: Record<string, string | null | undefined>,
  deal?: Record<string, unknown> | null,
): FormulaValue {
  const match = Object.keys(parameters).find((key) => key.toLowerCase() === name.toLowerCase());
  if (match !== undefined) {
    const typeKey = Object.keys(parameterTypes).find((key) => key.toLowerCase() === match.toLowerCase());
    return parameterFormulaValue(parameters[match] ?? '', typeKey ? parameterTypes[typeKey] : undefined);
  }
  const field = dealField(deal, name);
  return field === undefined ? { type: 'error' } : rawFormulaValue(field);
}

function dealFieldNames(deal?: Record<string, unknown> | null): string[] {
  if (!deal) return [];
  const names = Object.keys(deal);
  const attributes = deal.custom_attributes;
  if (attributes && typeof attributes === 'object') names.push(...Object.keys(attributes as Record<string, unknown>));
  return names;
}

function dealField(deal: Record<string, unknown> | null | undefined, name: string): unknown {
  if (!deal) return undefined;
  const key = Object.keys(deal).find((item) => item.toLowerCase() === name.toLowerCase());
  if (key !== undefined && key !== 'custom_attributes') return deal[key];
  const attributes = deal.custom_attributes;
  if (attributes && typeof attributes === 'object') {
    const custom = attributes as Record<string, unknown>;
    const customKey = Object.keys(custom).find((item) => item.toLowerCase() === name.toLowerCase());
    if (customKey !== undefined) return custom[customKey];
  }
  return undefined;
}

function rawFormulaValue(raw: unknown): FormulaValue {
  if (raw === undefined || raw === null || raw === '') return { type: 'blank' };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { type: 'number', value: raw } : { type: 'error' };
  if (typeof raw === 'boolean') return { type: 'boolean', value: raw };
  if (typeof raw === 'string') return parameterFormulaValue(raw);
  return { type: 'error' };
}

function parameterFormulaValue(raw: string, dataType?: string | null): FormulaValue {
  const text = String(raw ?? '').trim();
  if (!text) return { type: 'blank' };
  const type = String(dataType || '').trim().toUpperCase();
  if (type === 'BOOLEAN' || type === 'YES_NO') {
    const flag = text.toLowerCase();
    if (flag === 'true' || flag === 'yes' || flag === '1') return { type: 'boolean', value: true };
    if (flag === 'false' || flag === 'no' || flag === '0') return { type: 'boolean', value: false };
  }
  if (text.endsWith('%')) {
    const amount = Number(text.slice(0, -1).replace(/[$,]/g, ''));
    return Number.isFinite(amount) ? { type: 'percent', value: amount / 100 } : { type: 'text', value: text };
  }
  const numeric = Number(text.replace(/[$,]/g, ''));
  if (Number.isFinite(numeric) && /^-?\$?[\d,]+(?:\.\d+)?$/.test(text)) return { type: 'number', value: numeric };
  return { type: 'text', value: text };
}

function splitClauses(rule: string): string[] {
  const clauses: string[] = [];
  let buffer = '';
  let inRegex = false;
  for (let index = 0; index < rule.length; index += 1) {
    const char = rule[index];
    if (char === '/' && rule[index - 1] !== '\\') inRegex = !inRegex;
    const joiner = rule.slice(index, index + 5);
    if (!inRegex && joiner.toLowerCase() === ' and ') {
      clauses.push(buffer.trim());
      buffer = '';
      index += 4;
      continue;
    }
    if (!inRegex && char === ';') {
      clauses.push(buffer.trim());
      buffer = '';
      continue;
    }
    buffer += char;
  }
  clauses.push(buffer.trim());
  return clauses.filter(Boolean);
}

function parseClause(clause: string, type: ValidationParameterType): { ok: true; check: Check } | { ok: false; message: string } {
  const explicit = parseExplicitClause(clause);
  if (explicit) return explicit;
  if (type === 'NUMBER' || type === 'CURRENCY' || type === 'PERCENT') return parseNumericClause(clause);
  if (type === 'DATE') return parseDateClause(clause);
  if (type === 'BOOLEAN') return parseBooleanClause(clause);
  if (type === 'SELECT' || type === 'AGENT_PICKER') return parseChoiceClause(clause, 'List the allowed options, like one of Yes, No.');
  return { ok: false, message: 'Use length 1–40, matches ^[A-Z], or one of Yes, No.' };
}

function parseExplicitClause(clause: string): { ok: true; check: Check } | { ok: false; message: string } | null {
  if (/^length\b/i.test(clause)) {
    const length = clause.match(/^length\s+(\d+)\s*(?:-|to)\s*(\d+)$/i);
    if (!length) return { ok: false, message: 'Use length 1-100.' };
    const min = Number(length[1]);
    const max = Number(length[2]);
    if (min > max) return { ok: false, message: 'The shortest length has to be smaller than the longest length.' };
    return { ok: true, check: { kind: 'length', min, max } };
  }
  if (/^(min|max)\b/i.test(clause)) {
    const bound = clause.match(/^(min|max)\s+(\d+)$/i);
    if (!bound) return { ok: false, message: 'Use min 1 or max 40.' };
    const size = Number(bound[2]);
    return bound[1].toLowerCase() === 'min'
      ? { ok: true, check: { kind: 'length', min: size, max: Number.POSITIVE_INFINITY } }
      : { ok: true, check: { kind: 'length', min: 0, max: size } };
  }
  if (/^matches\b/i.test(clause)) {
    const matches = clause.match(/^matches\s+(.+)$/i);
    if (!matches) return { ok: false, message: 'Use matches ^[A-Z].' };
    return compileMatch(matches[1], '');
  }
  if (clause.startsWith('/')) {
    const wrapped = clause.match(/^\/(.+)\/([i]?)$/);
    if (!wrapped) return { ok: false, message: 'Close the pattern with /, like /^[A-Z]+$/.' };
    return compileMatch(wrapped[1], wrapped[2]);
  }
  if (/^(?:one of|in)\b/i.test(clause)) return parseChoiceClause(clause, 'List at least one allowed value after one of.');
  return null;
}

function parseNumericClause(clause: string): { ok: true; check: Check } | { ok: false; message: string } {
  const comparison = clause.match(/^(>=|<=|!=|==|>|<|=)\s*(-?\$?[\d,]+(?:\.\d+)?%?)$/);
  if (comparison) {
    const bound = parseNumberToken(comparison[2]);
    if (bound === null) return { ok: false, message: `"${clause}" is not a number comparison.` };
    const op = comparison[1] === '==' ? '=' : comparison[1];
    return { ok: true, check: { kind: 'compare', op: op as '>=' | '>' | '<=' | '<' | '=' | '!=', value: bound } };
  }
  const range = matchRange(clause);
  if (range) {
    if (range.min > range.max) return { ok: false, message: 'The low end of the range has to be smaller than the high end.' };
    return { ok: true, check: { kind: 'range', min: range.min, max: range.max } };
  }
  return { ok: false, message: 'Use a range like 0–100% or a comparison like >=0.' };
}

function parseDateClause(clause: string): { ok: true; check: Check } | { ok: false; message: string } {
  const comparison = clause.match(/^(>=|<=|>|<)\s*(\d{4}-\d{2}-\d{2})$/);
  if (comparison) {
    if (!isIsoDate(comparison[2])) return { ok: false, message: `${comparison[2]} is not a real date.` };
    return { ok: true, check: { kind: 'date-compare', op: comparison[1] as '>=' | '>' | '<=' | '<', value: comparison[2] } };
  }
  const range = clause.match(/^(\d{4}-\d{2}-\d{2})\s*(?:-|to)\s*(\d{4}-\d{2}-\d{2})$/i);
  if (range) {
    if (!isIsoDate(range[1]) || !isIsoDate(range[2])) return { ok: false, message: 'Use real dates, like 2024-01-01 to 2026-12-31.' };
    if (range[1] > range[2]) return { ok: false, message: 'The start date has to be on or before the end date.' };
    return { ok: true, check: { kind: 'date-range', min: range[1], max: range[2] } };
  }
  return { ok: false, message: 'Use a date range like 2024-01-01 to 2026-12-31, or a comparison like >=2024-01-01.' };
}

function parseBooleanClause(clause: string): { ok: true; check: Check } | { ok: false; message: string } {
  const key = clause.toLowerCase();
  if (key === 'checked' || key === 'true' || key === 'yes') return { ok: true, check: { kind: 'boolean', checked: true } };
  if (key === 'unchecked' || key === 'false' || key === 'no') return { ok: true, check: { kind: 'boolean', checked: false } };
  return { ok: false, message: 'Use checked or unchecked for a boolean parameter.' };
}

function parseChoiceClause(clause: string, fallback: string): { ok: true; check: Check } | { ok: false; message: string } {
  const match = clause.match(/^(?:one of|in)\s+(.+)$/i);
  if (!match) return { ok: false, message: fallback };
  const options = match[1].split(',').map((option) => option.trim()).filter(Boolean);
  if (options.length === 0) return { ok: false, message: 'List at least one allowed value after one of.' };
  return { ok: true, check: { kind: 'one-of', options } };
}


function compileMatch(source: string, flags: string): { ok: true; check: Check } | { ok: false; message: string } {
  try {
    RegExp(source, flags);
  } catch {
    return { ok: false, message: 'That pattern is not a valid regular expression.' };
  }
  return { ok: true, check: { kind: 'matches', source, flags } };
}

function checkValue(check: Check, value: string, type: ValidationParameterType): string | null {
  if (check.kind === 'range' || check.kind === 'compare') {
    const amount = parseNumberToken(value);
    if (amount === null) return 'Enter a number.';
    if (check.kind === 'range') {
      if (amount < check.min || amount > check.max) {
        return check.min === check.max
          ? `Must be ${formatNumber(check.min, type)}.`
          : `Must be from ${formatNumber(check.min, type)} to ${formatNumber(check.max, type)}.`;
      }
      return null;
    }
    const passed = compareNumber(amount, check.op, check.value);
    return passed ? null : numericExpectation(check.op, check.value, type);
  }
  if (check.kind === 'date-range' || check.kind === 'date-compare') {
    const date = value.trim().slice(0, 10);
    if (!isIsoDate(date)) return 'Enter a date.';
    if (check.kind === 'date-range') {
      return date >= check.min && date <= check.max ? null : `Must be from ${check.min} to ${check.max}.`;
    }
    const passed = compareText(date, check.op, check.value);
    return passed ? null : `Must be ${comparePhrase(check.op)} ${check.value}.`;
  }
  if (check.kind === 'length') {
    const size = value.trim().length;
    if (size < check.min || size > check.max) {
      if (check.max === Number.POSITIVE_INFINITY) return `Use at least ${check.min} characters.`;
      if (check.min === 0) return `Use at most ${check.max} characters.`;
      return `Use ${check.min} to ${check.max} characters.`;
    }
    return null;
  }
  if (check.kind === 'matches') {
    return new RegExp(check.source, check.flags).test(value) ? null : 'Does not match the required pattern.';
  }
  if (check.kind === 'one-of') {
    const found = check.options.some((option) => option.toLowerCase() === value.trim().toLowerCase());
    return found ? null : `Must be ${joinOptions(check.options)}.`;
  }
  if (check.kind === 'formula') return null;
  const checked = /^(true|yes|1)$/i.test(value.trim());
  if (check.checked === checked) return null;
  return check.checked ? 'This must be checked.' : 'This must be unchecked.';
}

function describeChecks(checks: Check[], type: ValidationParameterType): string {
  return checks.map((check) => describeCheck(check, type)).join(' ');
}

function describeCheck(check: Check, type: ValidationParameterType): string {
  if (check.kind === 'range') {
    return check.min === check.max
      ? `Must be ${formatNumber(check.min, type)}.`
      : `Must be from ${formatNumber(check.min, type)} to ${formatNumber(check.max, type)}.`;
  }
  if (check.kind === 'compare') return numericExpectation(check.op, check.value, type);
  if (check.kind === 'date-range') return `Must be from ${check.min} to ${check.max}.`;
  if (check.kind === 'date-compare') return `Must be ${comparePhrase(check.op)} ${check.value}.`;
  if (check.kind === 'length') {
    if (check.max === Number.POSITIVE_INFINITY) return `Must be at least ${check.min} characters.`;
    if (check.min === 0) return `Must be at most ${check.max} characters.`;
    return `Must be ${check.min} to ${check.max} characters.`;
  }
  if (check.kind === 'matches') return 'Must match the pattern.';
  if (check.kind === 'one-of') return `Must be ${joinOptions(check.options)}.`;
  if (check.kind === 'formula') return 'Must satisfy the formula.';
  return check.checked ? 'Must be checked.' : 'Must be unchecked.';
}

function matchRange(clause: string): { min: number; max: number } | null {
  const spaced = clause.match(/^(-?\$?[\d,]+(?:\.\d+)?%?)\s+(?:-|to)\s+(-?\$?[\d,]+(?:\.\d+)?%?)$/i);
  const tight = clause.match(/^(\$?[\d,]+(?:\.\d+)?%?)\s*(?:-|to)\s*(-?\$?[\d,]+(?:\.\d+)?%?)$/i);
  const match = spaced || tight;
  if (!match) return null;
  const min = parseNumberToken(match[1]);
  const max = parseNumberToken(match[2]);
  if (min === null || max === null) return null;
  return { min, max };
}

function parseNumberToken(token: string): number | null {
  const core = token.trim().replace(/[$,%\s]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(core)) return null;
  const amount = Number(core);
  return Number.isFinite(amount) ? amount : null;
}

function formatNumber(value: number, type: ValidationParameterType): string {
  if (type === 'PERCENT') {
    const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
    return `${text}%`;
  }
  if (type === 'CURRENCY') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}

function compareNumber(left: number, op: '>=' | '>' | '<=' | '<' | '=' | '!=', right: number): boolean {
  if (op === '>=') return left >= right;
  if (op === '>') return left > right;
  if (op === '<=') return left <= right;
  if (op === '<') return left < right;
  if (op === '!=') return left !== right;
  return left === right;
}

function compareText(left: string, op: '>=' | '>' | '<=' | '<', right: string): boolean {
  if (op === '>=') return left >= right;
  if (op === '>') return left > right;
  if (op === '<=') return left <= right;
  return left < right;
}

function numericExpectation(op: string, value: number, type: ValidationParameterType): string {
  const shown = formatNumber(value, type);
  if (op === '!=') return `Must not be ${shown}.`;
  return `Must be ${comparePhrase(op)} ${shown}.`;
}

function comparePhrase(op: string): string {
  if (op === '>=') return 'at least';
  if (op === '>') return 'greater than';
  if (op === '<=') return 'at most';
  if (op === '<') return 'less than';
  if (op === '!=') return 'not';
  return 'equal to';
}

function joinOptions(options: string[]): string {
  if (options.length === 1) return options[0];
  if (options.length === 2) return `${options[0]} or ${options[1]}`;
  return `${options.slice(0, -1).join(', ')}, or ${options[options.length - 1]}`;
}

function isBlank(value: string): boolean {
  return value.trim() === '';
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeDashes(value: string): string {
  return value.replace(/[–—−]/g, '-');
}
