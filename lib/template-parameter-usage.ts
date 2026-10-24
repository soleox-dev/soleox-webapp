/**
 * Where a template parameter is used: the rules and other parameters whose formulas or agent fields name its key.
 * Deleting a parameter that is still used would make those formulas fail to calculate, so Settings refuses it.
 */

export interface UsageRule {
  rule_name: string;
  agent_key?: string | null;
  from_agent_key?: string | null;
  paid_by_agent_keys?: string[] | null;
  payee_formula?: string | null;
  apply_condition?: string | null;
  custom_baseline?: string | null;
  calculation_formula?: string | null;
  show_when_formula?: string | null;
  /** An adjustment's per-payer share formulas (migration 081). */
  paid_shares?: string[] | null;
}

export interface UsageParameter {
  parameter_name: string;
  parameter_key: string;
  autofill_formula?: string | null;
  validation_rule?: string | null;
}

/** Whether a formula names the key: as a whole word, outside quoted text, and not as a table field (agents.key). */
export function formulaUsesKey(formula: string | null | undefined, key: string): boolean {
  const wanted = key.trim().toLowerCase();
  if (!formula || !wanted) return false;
  const code = formula.replace(/"[^"]*"/g, '""').toLowerCase();
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9_.])${escaped}(?![a-z0-9_])`).test(code);
}

/** The names of the rules, then the other parameters, that use the parameter with this key. */
export function parameterUsedBy(key: string, rules: UsageRule[], parameters: UsageParameter[]): string[] {
  const wanted = key.trim().toLowerCase();
  const same = (value: string | null | undefined) => String(value || '').trim().toLowerCase() === wanted;
  const ruleNames = rules
    .filter((rule) =>
      same(rule.agent_key)
      || same(rule.from_agent_key)
      || (rule.paid_by_agent_keys || []).some(same)
      || [rule.payee_formula, rule.apply_condition, rule.custom_baseline, rule.calculation_formula, rule.show_when_formula, ...(rule.paid_shares || [])].some((formula) => formulaUsesKey(formula, key)))
    .map((rule) => rule.rule_name);
  const parameterNames = parameters
    .filter((parameter) => !same(parameter.parameter_key))
    .filter((parameter) => formulaUsesKey(parameter.autofill_formula, key) || formulaUsesKey(parameter.validation_rule, key))
    .map((parameter) => parameter.parameter_name);
  return [...new Set([...ruleNames, ...parameterNames])];
}

/** The message shown when a used parameter cannot be deleted. */
export function parameterInUseMessage(name: string, usedBy: string[]): string {
  const shown = usedBy.slice(0, 5).join(', ');
  const more = usedBy.length > 5 ? ` and ${usedBy.length - 5} more` : '';
  return `${name} can't be deleted while it is used by ${shown}${more}. Remove it from ${usedBy.length === 1 ? 'that formula' : 'those formulas'} first.`;
}
