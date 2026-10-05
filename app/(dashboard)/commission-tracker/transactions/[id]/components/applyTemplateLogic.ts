import { evaluateFormula, formulaDataNeeds, type FormulaLedgerRow, type FormulaLookups, type FormulaLookupCell, type FormulaLookupRow, type FormulaValue } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { FORMULA_LOOKUP_TABLES } from '@/lib/formula-lookup-tables';
import { DynamicRule, roundCurrency, roundPercentRate } from '../types';

export interface TemplateLogicStep {
  id: string;
  step_number?: number | null;
  rule_name: string;
  rule_key?: string | null;
  section?: string | null;
  payee_entity_id?: string | null;
  agent_key?: string | null;
  payee_formula?: string | null;
  apply_condition?: string | null;
  custom_baseline?: string | null;
  calculation_formula?: string | null;
  split_type?: string | null;
  show_in_popup?: boolean | null;
  popup_section?: string | null;
}

export interface NamedParty {
  id: string;
  name: string;
  isTeamLead?: boolean;
  clientId?: string;
  fields?: Record<string, string>;
}

export interface AppliedAgentSplit {
  name: string;
  splitType: 'PERCENT' | 'AMOUNT';
  splitVal: number;
  remainder?: boolean;
}

export interface AppliedCalculation {
  id: string;
  name: string;
  section: string;
  value: FormulaValue | null;
  error?: string;
}

export interface AppliedTemplateRules {
  offTheTopRules?: DynamicRule[];
  preSplitRules?: DynamicRule[];
  postSplitRulesByAgent?: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent?: Record<string, DynamicRule[]>;
  agentSplits?: AppliedAgentSplit[];
  calculations?: AppliedCalculation[];
}

type Bucket = 'offTheTop' | 'preSplit' | 'postSplit' | 'postSplit2' | 'agentSplit';

function splitKind(value: string | null | undefined): 'PERCENT' | 'AMOUNT' {
  return String(value || '').trim().toUpperCase() === 'PERCENT' ? 'PERCENT' : 'AMOUNT';
}

/** Percent lines are a rate of the pool the waterfall multiplies. Amount lines stay in dollars. */
function appliedSplitValue(kind: 'PERCENT' | 'AMOUNT', dollars: number, pool: number): number {
  if (kind === 'AMOUNT') return dollars;
  if (!(pool > 0)) return 0;
  return roundPercentRate(dollars / pool);
}

function bucketFor(section: string | null | undefined): Bucket | null {
  const key = (section || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (key === 'offthetop') return 'offTheTop';
  if (key === 'presplit' || key === 'presplits') return 'preSplit';
  if (key === 'agentsplit' || key === 'agentsplits') return 'agentSplit';
  if (key === 'postsplit' || key === 'postsplits' || key === 'level1' || key === 'level1postsplit' || key === 'level1postsplits') return 'postSplit';
  if (key === 'postsplit2' || key === 'level2' || key === 'level2postsplit' || key === 'level2postsplits') return 'postSplit2';
  return null;
}

function storedValue(raw: unknown): FormulaValue {
  if (raw === undefined || raw === null || raw === '') return { type: 'blank' };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { type: 'number', value: raw } : { type: 'error' };
  if (typeof raw === 'boolean') return { type: 'boolean', value: raw };
  const text = String(raw).trim();
  if (!text) return { type: 'blank' };
  if (text === 'Yes') return { type: 'boolean', value: true };
  if (text === 'No') return { type: 'boolean', value: false };
  if (text.endsWith('%')) {
    const amount = Number(text.slice(0, -1).replace(/[$,]/g, ''));
    return Number.isFinite(amount) ? { type: 'percent', value: amount / 100 } : { type: 'text', value: text };
  }
  const numeric = Number(text.replace(/[$,]/g, ''));
  if (Number.isFinite(numeric) && /^-?\$?[\d,]+(?:\.\d+)?$/.test(text)) return { type: 'number', value: numeric };
  return { type: 'text', value: text };
}

function toNumber(value: FormulaValue | null): number | null {
  if (!value || value.type === 'error') return null;
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

function readText(value: FormulaValue | null): string {
  if (!value || value.type === 'error' || value.type === 'blank') return '';
  if (value.type === 'text') return value.value.trim();
  if (value.type === 'boolean') return value.value ? 'Yes' : 'No';
  if (value.type === 'percent') return String(value.value);
  if (value.type === 'number') return String(value.value);
  return '';
}

function readDeal(deal: Record<string, unknown> | null, key: string): unknown {
  if (!deal) return undefined;
  const direct = deal[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  const attributes = deal.custom_attributes;
  if (attributes && typeof attributes === 'object') {
    const custom = (attributes as Record<string, unknown>)[key];
    if (custom !== undefined && custom !== null && custom !== '') return custom;
  }
  return undefined;
}

/**
 * Runs a template's logic in step order and returns every waterfall split it produces.
 * Empty sections are included so the caller can replace the deal's splits entirely.
 */
export function applyTemplateLogic({
  steps,
  parameters,
  deal,
  entities,
  rosterAgents,
  dealAgents,
  totalCommission,
  ledger = [],
  lookups,
  continueOnError = false,
}: {
  steps: TemplateLogicStep[];
  parameters: Record<string, string>;
  deal: Record<string, unknown> | null;
  entities: NamedParty[];
  rosterAgents: NamedParty[];
  dealAgents: NamedParty[];
  totalCommission: number;
  ledger?: FormulaLedgerRow[];
  lookups?: FormulaLookups;
  continueOnError?: boolean;
}): AppliedTemplateRules {
  const ordered = [...steps].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
  const offTheTopRules: DynamicRule[] = [];
  const preSplitRules: DynamicRule[] = [];
  const postSplitRulesByAgent: Record<string, DynamicRule[]> = {};
  const postSplit2RulesByAgent: Record<string, DynamicRule[]> = {};
  const agentSplits: AppliedAgentSplit[] = [];
  let offTopSum = 0;
  let preSplitSum = 0;
  let agentSplitDollars = 0;
  const agentAmounts: Record<string, number> = {};
  const postSums: Record<string, number> = {};
  const post2Sums: Record<string, number> = {};

  const ruleResults: Record<string, FormulaValue> = {};
  const parties = [...dealAgents, ...rosterAgents];
  const context = {
    baseline: 0,
    prior: 0,
    afterOffTheTop: 0,
    afterPreSplits: 0,
    afterAgentSplits: 0,
    afterL1PostSplits: 0,
  };
  const resolve = (name: string): FormulaValue => {
    const key = name.toLowerCase();
    if (key === 'baseline') return { type: 'number', value: context.baseline };
    if (key === 'baseline_after_off_the_top') return { type: 'number', value: context.afterOffTheTop };
    if (key === 'baseline_after_pre_splits') return { type: 'number', value: context.afterPreSplits };
    if (key === 'baseline_after_agent_splits') return { type: 'number', value: context.afterAgentSplits };
    if (key === 'baseline_after_l1_post_splits') return { type: 'number', value: context.afterL1PostSplits };
    if (key === 'prior_amounts') return { type: 'number', value: context.prior };
    if (key === 'total_commission') return { type: 'number', value: totalCommission };
    const ruleHit = Object.keys(ruleResults).find((ruleKey) => ruleKey.toLowerCase() === key);
    if (ruleHit) return ruleResults[ruleHit];
    if (Object.prototype.hasOwnProperty.call(parameters, key) || parameters[key] !== undefined) {
      const match = Object.keys(parameters).find((parameterKey) => parameterKey.toLowerCase() === key);
      if (match !== undefined) return storedValue(parameters[match]);
    }
    return storedValue(readDeal(deal, key));
  };
  const rememberValue = (ruleKey: string | null | undefined, value: FormulaValue) => {
    const key = ruleKey?.trim();
    if (key) ruleResults[key] = value;
  };
  const rememberRule = (ruleKey: string | null | undefined, amount: number) => {
    rememberValue(ruleKey, { type: 'number', value: amount });
  };
  const namedParty = (value: FormulaValue | null, list: NamedParty[]) => {
    const text = readText(value);
    if (!text) return '';
    const byId = list.find((item) => item.id === text);
    if (byId) return byId.name;
    const byName = list.find((item) => item.name.trim().toLowerCase() === text.trim().toLowerCase());
    return byName?.name || '';
  };
  const agentNameFrom = (value: FormulaValue | null) => namedParty(value, parties) || readText(value);

  const evaluateNumber = (source: string, label: string) => {
    const result = evaluateFormula(source, resolve, rosterAgents, ledger, lookups);
    const amount = toNumber(result);
    if (!result || result.type === 'error' || amount === null) {
      throw new Error(`${label} could not be calculated.`);
    }
    return amount;
  };
  const recorded = (amounts: Record<string, number>, name: string) => {
    if (!name) return 0;
    if (amounts[name] !== undefined) return amounts[name];
    const match = Object.keys(amounts).find((key) => key.trim().toLowerCase() === name.trim().toLowerCase());
    return match ? amounts[match] : 0;
  };

  const calculations: AppliedCalculation[] = [];
  let previousShown: { step: TemplateLogicStep; error?: string } | null = null;
  const flushShown = () => {
    const pending = previousShown;
    previousShown = null;
    if (!pending?.step.show_in_popup) return;
    const key = pending.step.rule_key?.trim();
    const stored = key ? ruleResults[key] : undefined;
    calculations.push({
      id: pending.step.id,
      name: pending.step.rule_name?.trim() || 'Rule',
      section: pending.step.popup_section?.trim() || '',
      value: pending.error ? null : (stored || { type: 'blank' }),
      error: pending.error,
    });
  };

  const runStep = (step: TemplateLogicStep) => {
    const ruleName = step.rule_name?.trim() || 'Rule';
    const bucket = bucketFor(step.section);
    const agentKey = step.agent_key?.trim() || '';
    // Agent balances depend on the assigned agent. The agent key is a
    // parameter lookup, so it can be read before those balances are known.
    let agentName = '';
    if (agentKey && (bucket === 'agentSplit' || bucket === 'postSplit' || bucket === 'postSplit2')) {
      const result = resolve(agentKey);
      agentName = !result || result.type === 'error' ? '' : agentNameFrom(result);
    }
    const prior = bucket === 'offTheTop'
      ? offTopSum
      : bucket === 'preSplit'
        ? preSplitSum
        : 0;
    // A blank custom baseline is the section default, shared by every rule in
    // that section. Earlier rules in the same section do not reduce it.
    const agentSplitAmount = recorded(agentAmounts, agentName);
    context.afterOffTheTop = roundCurrency(totalCommission - offTopSum);
    context.afterPreSplits = roundCurrency(context.afterOffTheTop - preSplitSum);
    context.afterAgentSplits = agentSplitAmount;
    context.afterL1PostSplits = roundCurrency(agentSplitAmount - recorded(postSums, agentName));
    context.prior = prior;
    const defaultBaseline = bucket === 'offTheTop'
      ? totalCommission
      : bucket === 'preSplit'
        ? context.afterOffTheTop
        : bucket === 'agentSplit'
          ? context.afterPreSplits
          : bucket === 'postSplit'
            ? context.afterAgentSplits
            : bucket === 'postSplit2'
              ? context.afterL1PostSplits
              : totalCommission;
    context.baseline = defaultBaseline;

    const condition = (step.apply_condition || '').trim();
    let applies = true;
    if (condition) {
      const result = evaluateFormula(condition, resolve, rosterAgents, ledger, lookups);
      if (!result || result.type === 'error') throw new Error(`Condition for "${ruleName}" could not be calculated.`);
      if (result.type === 'boolean') applies = result.value;
      else {
        const amount = toNumber(result);
        if (amount === null) throw new Error(`Condition for "${ruleName}" could not be calculated.`);
        applies = amount !== 0;
      }
    }
    if (!applies) {
      rememberRule(step.rule_key, 0);
      return;
    }

    if (!bucket) {
      const sectionKey = (step.section || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (sectionKey !== 'calculation' && sectionKey !== 'nosection') {
        const section = step.section?.trim() || 'No Section';
        throw new Error(`"${ruleName}" is in "${section}". Use Off-the-top, Pre-splits, Agent Splits, Level 1 Post-splits, Level 2 Post-splits, or Calculation.`);
      }
      const formula = (step.calculation_formula || '').trim();
      if (!formula) throw new Error(`"${ruleName}" needs a formula.`);
      const formulaResult = evaluateFormula(formula, resolve, rosterAgents, ledger, lookups);
      if (!formulaResult || formulaResult.type === 'error') {
        throw new Error(`"${ruleName}" could not be calculated.`);
      }
      rememberValue(step.rule_key, formulaResult);
      return;
    }
    const custom = (step.custom_baseline || '').trim();
    const baseline = custom
      ? evaluateNumber(custom, `Baseline for "${ruleName}"`)
      : defaultBaseline;
    context.baseline = baseline;
    const formula = (step.calculation_formula || '').trim();
    if (!formula) throw new Error(`"${ruleName}" needs an amount formula.`);
    const formulaResult = evaluateFormula(formula, resolve, rosterAgents, ledger, lookups);
    if (formulaResult?.type === 'text') {
      rememberValue(step.rule_key, formulaResult);
      return;
    }
    const amount = roundCurrency(evaluateNumber(formula, `Amount for "${ruleName}"`));
    rememberRule(step.rule_key, amount);
    if (amount === 0) return;

    const payeeFormula = (step.payee_formula || '').trim();
    let entityName = step.payee_entity_id
      ? entities.find((entity) => entity.id === step.payee_entity_id)?.name || ''
      : '';
    if (agentKey && !agentName) {
      const result = resolve(agentKey);
      agentName = agentNameFrom(result);
      if (!result || result.type === 'error' || !agentName) {
        throw new Error(`Agent for "${ruleName}" could not be read from ${agentKey}.`);
      }
    }

    const sectionUsesEntity = bucket === 'offTheTop' || bucket === 'preSplit' || bucket === 'postSplit' || bucket === 'postSplit2';
    if (!entityName && sectionUsesEntity && payeeFormula) {
      const result = evaluateFormula(payeeFormula, resolve, rosterAgents, ledger, lookups);
      entityName = namedParty(result, entities);
      if (!result || result.type === 'error' || !entityName) {
        throw new Error(`Entity for "${ruleName}" could not be calculated.`);
      }
    } else if (!agentName && payeeFormula) {
      const result = evaluateFormula(payeeFormula, resolve, rosterAgents, ledger, lookups);
      agentName = agentNameFrom(result);
      if (!result || result.type === 'error' || !agentName) {
        throw new Error(`Agent for "${ruleName}" could not be calculated.`);
      }
    }

    const splitType = splitKind(step.split_type);
    const agentPool = roundCurrency(totalCommission - offTopSum - preSplitSum);
    const pool = bucket === 'offTheTop'
      ? totalCommission
      : bucket === 'preSplit'
        ? roundCurrency(totalCommission - offTopSum)
        : bucket === 'agentSplit'
          ? agentPool
          : bucket === 'postSplit'
            ? recorded(agentAmounts, agentName)
            : roundCurrency(recorded(agentAmounts, agentName) - recorded(postSums, agentName));
    const rule: DynamicRule = {
      id: `tpl_${step.id}`,
      name: ruleName,
      entity: entityName || ruleName,
      type: splitType,
      value: appliedSplitValue(splitType, amount, pool),
    };

    if (bucket === 'offTheTop' || bucket === 'preSplit') {
      if (!entityName) throw new Error(`"${ruleName}" needs an entity.`);
      rule.entity = entityName;
      if (bucket === 'offTheTop') {
        offTheTopRules.push(rule);
        offTopSum = roundCurrency(offTopSum + amount);
      } else {
        preSplitRules.push(rule);
        preSplitSum = roundCurrency(preSplitSum + amount);
      }
      return;
    }

    if (!agentName) throw new Error(`"${ruleName}" needs an agent.`);
    if (bucket === 'agentSplit') {
      const remainder = agentSplitDollars > 0
        && Math.abs(amount - roundCurrency(agentPool - agentSplitDollars)) < 0.02;
      agentSplitDollars = roundCurrency(agentSplitDollars + amount);
      agentAmounts[agentName] = roundCurrency((agentAmounts[agentName] || 0) + amount);
      agentSplits.push({
        name: agentName,
        splitType,
        splitVal: appliedSplitValue(splitType, amount, agentPool),
        remainder,
      });
      return;
    }

    if (!entityName) throw new Error(`"${ruleName}" needs an entity.`);
    const map = bucket === 'postSplit' ? postSplitRulesByAgent : postSplit2RulesByAgent;
    const sums = bucket === 'postSplit' ? postSums : post2Sums;
    map[agentName] = [...(map[agentName] || []), { ...rule, entity: entityName }];
    sums[agentName] = roundCurrency((sums[agentName] || 0) + amount);
  };

  for (const step of ordered) {
    flushShown();
    previousShown = { step };
    try {
      runStep(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not calculate.';
      previousShown = { step, error: message };
      if (!continueOnError) throw error;
    }
  }
  flushShown();

  return {
    offTheTopRules,
    preSplitRules,
    postSplitRulesByAgent,
    postSplit2RulesByAgent,
    agentSplits,
    calculations,
  };
}

function ledgerValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function closingDay(value: unknown): string {
  const text = ledgerValue(value).trim();
  return text.length >= 10 ? text.slice(0, 10) : text;
}

/** Commission lines joined to their transaction, for SUMIFS in calculation rules. */
export async function loadCommissionLedger(
  clientId: string,
  entities: { id: string; name: string }[],
): Promise<FormulaLedgerRow[]> {
  const response = await fetch(`/api/transaction-commission-items?client_id=${encodeURIComponent(clientId)}&view=ledger`);
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.error || 'Failed to load commission lines.');
  const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
  const entityNames = new Map(entities.map((entity) => [entity.id, entity.name]));

  return items.map((item) => {
    const fields: Record<string, string> = {
      'transaction_commission_items.final_amount': ledgerValue(item.final_amount),
      'transaction_commission_items.agent_id': ledgerValue(item.agent_id),
      'transaction_commission_items.payee_entity_id': ledgerValue(item.payee_entity_id),
      'transaction_commission_items.section': ledgerValue(item.section),
      'commission_entities.entity_name': entityNames.get(ledgerValue(item.payee_entity_id)) || '',
      'transactions.closing_date': closingDay(item.closing_date),
      'transactions.transaction_status': ledgerValue(item.transaction_status),
      'transactions.id': ledgerValue(item.transaction_id),
    };
    return { fields };
  });
}

export function templateFormulaSources(
  steps: TemplateLogicStep[],
  parameters: { autofill_formula?: string | null }[],
): string[] {
  const sources: string[] = [];
  for (const step of steps) {
    for (const formula of [step.calculation_formula, step.payee_formula, step.apply_condition, step.custom_baseline]) {
      if (formula && formula.trim()) sources.push(formula);
    }
  }
  for (const parameter of parameters) {
    if (parameter.autofill_formula && parameter.autofill_formula.trim()) sources.push(parameter.autofill_formula);
  }
  return sources;
}

export { formulaDataNeeds };

export function formulaLookupRow(clientId: string, record: Record<string, unknown>): FormulaLookupRow | null {
  const rowClient = record.client_id == null ? '' : String(record.client_id).trim();
  if (!clientId || rowClient !== clientId) return null;
  const source: Record<string, unknown> = { ...record };
  const custom = source.custom_attributes;
  if (typeof custom === 'string') {
    try {
      const parsed = JSON.parse(custom) as unknown;
      if (parsed && typeof parsed === 'object') Object.assign(source, parsed);
    } catch {
      // Keep the row's own columns when custom attributes are not JSON.
    }
  } else if (custom && typeof custom === 'object') {
    Object.assign(source, custom);
  }
  const fields: Record<string, FormulaLookupCell> = {};
  for (const [key, value] of Object.entries(source)) {
    // A null column is an empty value. Dropping it makes XLOOKUP treat the field as missing.
    if (value === null) {
      fields[key] = '';
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') fields[key] = value;
  }
  return { clientId: rowClient, fields };
}

async function loadFormulaLookupTable(clientId: string, table: string): Promise<FormulaLookupRow[]> {
  const pageSize = 1000;
  const rows: FormulaLookupRow[] = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const response = await fetch(`/api/formula-lookups?table=${encodeURIComponent(table)}&client_id=${encodeURIComponent(clientId)}&offset=${offset}&limit=${pageSize}`);
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.error || `Failed to load ${table}.`);
    if (String(data.client_id || '') !== clientId) throw new Error('Formula lookup returned a different client.');
    const batch = Array.isArray(data.rows) ? data.rows as Record<string, unknown>[] : [];
    for (const record of batch) {
      const row = formulaLookupRow(clientId, record);
      if (row) rows.push(row);
    }
    if (batch.length < pageSize) break;
  }
  return rows;
}

/** Client-scoped rows for the tables a formula's XLOOKUP actually reads. */
export async function loadFormulaLookups(clientId: string, tablesToLoad: readonly string[] = FORMULA_LOOKUP_TABLES): Promise<FormulaLookups> {
  const requested = [...new Set(tablesToLoad)].filter((table) => (FORMULA_LOOKUP_TABLES as readonly string[]).includes(table));
  const loaded = await Promise.all(requested.map(async (table) => [table, await loadFormulaLookupTable(clientId, table)] as const));
  const tables: FormulaLookups['tables'] = {};
  for (const [table, rows] of loaded) tables[table] = rows;
  return { clientId, tables };
}
