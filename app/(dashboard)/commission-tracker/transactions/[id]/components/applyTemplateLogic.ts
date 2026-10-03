import { evaluateFormula, type FormulaValue } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { DynamicRule, roundCurrency } from '../types';

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
}

export interface NamedParty {
  id: string;
  name: string;
  isTeamLead?: boolean;
}

export interface AppliedAgentSplit {
  name: string;
  splitType: 'AMOUNT';
  splitVal: number;
}

export interface AppliedTemplateRules {
  offTheTopRules?: DynamicRule[];
  preSplitRules?: DynamicRule[];
  postSplitRulesByAgent?: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent?: Record<string, DynamicRule[]>;
  agentSplits?: AppliedAgentSplit[];
}

type Bucket = 'offTheTop' | 'preSplit' | 'postSplit' | 'postSplit2' | 'agentSplit';

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
}: {
  steps: TemplateLogicStep[];
  parameters: Record<string, string>;
  deal: Record<string, unknown> | null;
  entities: NamedParty[];
  rosterAgents: NamedParty[];
  dealAgents: NamedParty[];
  totalCommission: number;
}): AppliedTemplateRules {
  const ordered = [...steps].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
  const offTheTopRules: DynamicRule[] = [];
  const preSplitRules: DynamicRule[] = [];
  const postSplitRulesByAgent: Record<string, DynamicRule[]> = {};
  const postSplit2RulesByAgent: Record<string, DynamicRule[]> = {};
  const agentSplits: AppliedAgentSplit[] = [];
  let offTopSum = 0;
  let preSplitSum = 0;
  const postSums: Record<string, number> = {};
  const post2Sums: Record<string, number> = {};

  const ruleResults: Record<string, FormulaValue> = {};
  const parties = [...dealAgents, ...rosterAgents];
  const resolve = (baseline: number, priorAmounts: number) => (name: string): FormulaValue => {
    const key = name.toLowerCase();
    if (key === 'baseline') return { type: 'number', value: baseline };
    if (key === 'prior_amounts') return { type: 'number', value: priorAmounts };
    if (key === 'total_commission') return { type: 'number', value: totalCommission };
    const ruleHit = Object.keys(ruleResults).find((ruleKey) => ruleKey.toLowerCase() === key);
    if (ruleHit) return ruleResults[ruleHit];
    if (Object.prototype.hasOwnProperty.call(parameters, key) || parameters[key] !== undefined) {
      const match = Object.keys(parameters).find((parameterKey) => parameterKey.toLowerCase() === key);
      if (match !== undefined) return storedValue(parameters[match]);
    }
    return storedValue(readDeal(deal, key));
  };
  const rememberRule = (ruleKey: string | null | undefined, amount: number) => {
    const key = ruleKey?.trim();
    if (key) ruleResults[key] = { type: 'number', value: amount };
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

  const evaluateNumber = (source: string, baseline: number, priorAmounts: number, label: string) => {
    const result = evaluateFormula(source, resolve(baseline, priorAmounts), rosterAgents);
    const amount = toNumber(result);
    if (!result || result.type === 'error' || amount === null) {
      throw new Error(`${label} could not be calculated.`);
    }
    return amount;
  };

  for (const step of ordered) {
    const ruleName = step.rule_name?.trim() || 'Rule';
    const bucket = bucketFor(step.section);
    const prior = bucket === 'offTheTop'
      ? offTopSum
      : bucket === 'preSplit'
        ? preSplitSum
        : 0;
    const defaultBaseline = bucket === 'preSplit'
      ? totalCommission - offTopSum - preSplitSum
      : totalCommission - prior;

    const condition = (step.apply_condition || '').trim();
    let applies = true;
    if (condition) {
      const result = evaluateFormula(condition, resolve(defaultBaseline, prior), rosterAgents);
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
      continue;
    }

    if (!bucket) {
      const section = step.section?.trim() || 'No Section';
      throw new Error(`"${ruleName}" is in "${section}". Use Off-the-top, Pre-splits, Agent Splits, Level 1 Post-splits, or Level 2 Post-splits.`);
    }
    const custom = (step.custom_baseline || '').trim();
    const baseline = custom
      ? evaluateNumber(custom, defaultBaseline, prior, `Baseline for "${ruleName}"`)
      : defaultBaseline;
    const formula = (step.calculation_formula || '').trim();
    if (!formula) throw new Error(`"${ruleName}" needs an amount formula.`);
    const amount = roundCurrency(evaluateNumber(formula, baseline, prior, `Amount for "${ruleName}"`));
    rememberRule(step.rule_key, amount);
    if (amount === 0) continue;

    const payeeFormula = (step.payee_formula || '').trim();
    let entityName = step.payee_entity_id
      ? entities.find((entity) => entity.id === step.payee_entity_id)?.name || ''
      : '';
    let agentName = '';
    const agentKey = step.agent_key?.trim() || '';
    if (agentKey) {
      const result = resolve(baseline, prior)(agentKey);
      agentName = agentNameFrom(result);
      if (!result || result.type === 'error' || !agentName) {
        throw new Error(`Agent for "${ruleName}" could not be read from ${agentKey}.`);
      }
    }

    const sectionUsesEntity = bucket === 'offTheTop' || bucket === 'preSplit' || bucket === 'postSplit' || bucket === 'postSplit2';
    if (!entityName && sectionUsesEntity && payeeFormula) {
      const result = evaluateFormula(payeeFormula, resolve(baseline, prior), rosterAgents);
      entityName = namedParty(result, entities);
      if (!result || result.type === 'error' || !entityName) {
        throw new Error(`Entity for "${ruleName}" could not be calculated.`);
      }
    } else if (!agentName && payeeFormula) {
      const result = evaluateFormula(payeeFormula, resolve(baseline, prior), rosterAgents);
      agentName = agentNameFrom(result);
      if (!result || result.type === 'error' || !agentName) {
        throw new Error(`Agent for "${ruleName}" could not be calculated.`);
      }
    }

    const rule: DynamicRule = {
      id: `tpl_${step.id}`,
      name: ruleName,
      entity: entityName || ruleName,
      type: 'AMOUNT',
      value: amount,
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
      continue;
    }

    if (!agentName) throw new Error(`"${ruleName}" needs an agent.`);
    if (bucket === 'agentSplit') {
      agentSplits.push({ name: agentName, splitType: 'AMOUNT', splitVal: amount });
      continue;
    }

    if (!entityName) throw new Error(`"${ruleName}" needs an entity.`);
    const map = bucket === 'postSplit' ? postSplitRulesByAgent : postSplit2RulesByAgent;
    const sums = bucket === 'postSplit' ? postSums : post2Sums;
    map[agentName] = [...(map[agentName] || []), { ...rule, entity: entityName }];
    sums[agentName] = roundCurrency((sums[agentName] || 0) + amount);
  }

  return {
    offTheTopRules,
    preSplitRules,
    postSplitRulesByAgent,
    postSplit2RulesByAgent,
    agentSplits,
  };
}
