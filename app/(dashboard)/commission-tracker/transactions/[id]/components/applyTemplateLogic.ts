import {
  evaluateFormula,
  formulaDataNeeds,
  isConfiguredOrExistingField,
  type FormulaLedgerRow,
  type FormulaLookups,
  type FormulaLookupCell,
  type FormulaLookupRow,
  type FormulaValue,
} from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { FORMULA_LOOKUP_TABLES, formulaLookupSource } from '@/lib/formula-lookup-tables';
import { DynamicRule, roundCurrency, roundPercentRate } from '../types';

export interface TemplateParameterRecord {
  id: string;
  parameter_name: string;
  parameter_key: string;
  data_type?: string | null;
  autofill_formula?: string | null;
  validation_rule?: string | null;
  is_required?: boolean | null;
  is_user_editable?: boolean | null;
  sort_order?: number | null;
  section?: string | null;
  /** A line under this parameter in the Commission Template form, starting a new group. */
  divider_below?: boolean | null;
  dropdown_options?: string[] | null;
}

export interface TemplateBundle {
  parameters: TemplateParameterRecord[];
  steps: TemplateLogicStep[];
}

const templateBundles = new Map<string, { promise: Promise<TemplateBundle> | null; bundle: TemplateBundle | null }>();

export function peekTemplateBundle(templateId: string): TemplateBundle | null {
  return templateBundles.get(templateId)?.bundle ?? null;
}

/** Rules and parameters for one template. Later reads reuse the first request unless refresh is requested. */
export function loadTemplateBundle(templateId: string, options?: { refresh?: boolean }): Promise<TemplateBundle> {
  const existing = templateBundles.get(templateId);
  if (!options?.refresh && existing?.promise) return existing.promise;
  const promise = (async () => {
    const [parametersResponse, logicResponse] = await Promise.all([
      fetch(`/api/commission-template-parameters?template_id=${encodeURIComponent(templateId)}`, { cache: 'no-store' }),
      fetch(`/api/commission-template-logic?template_id=${encodeURIComponent(templateId)}`, { cache: 'no-store' }),
    ]);
    const data = await parametersResponse.json();
    const logicData = await logicResponse.json();
    if (!parametersResponse.ok || !data.success) throw new Error(data.error || 'Failed to load parameters.');
    if (!logicResponse.ok || !logicData.success) throw new Error(logicData.error || 'Failed to load rules.');
    return {
      parameters: (data.parameters || []) as TemplateParameterRecord[],
      steps: (logicData.logic_steps || []) as TemplateLogicStep[],
    };
  })().then((bundle) => {
    const current = templateBundles.get(templateId);
    if (current?.promise === promise) current.bundle = bundle;
    return bundle;
  }).catch((error) => {
    const current = templateBundles.get(templateId);
    if (current?.promise === promise) {
      current.promise = null;
      if (!current.bundle) templateBundles.delete(templateId);
    }
    throw error;
  });
  templateBundles.set(templateId, { promise, bundle: options?.refresh ? existing?.bundle ?? null : null });
  return promise;
}

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
  result_type?: string | null;
  show_in_popup?: boolean | null;
  popup_section?: string | null;
  show_when_formula?: string | null;
  divider_below?: boolean | null;
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
  amount: number;
  remainder?: boolean;
}

export interface AppliedCalculation {
  id: string;
  name: string;
  section: string;
  value: FormulaValue | null;
  resultType?: string | null;
  error?: string;
  /** A line is drawn below this result in its section's calculations list. */
  dividerBelow?: boolean;
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

function isBooleanType(dataType: string | null | undefined): boolean {
  const key = String(dataType || '').trim().toUpperCase();
  return key === 'BOOLEAN' || key === 'YES_NO';
}

function storedValue(raw: unknown, asBoolean = false): FormulaValue {
  if (raw === undefined || raw === null || raw === '') return { type: 'blank' };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { type: 'number', value: raw } : { type: 'error' };
  if (typeof raw === 'boolean') return { type: 'boolean', value: raw };
  const text = String(raw).trim();
  if (!text) return { type: 'blank' };
  if (asBoolean) {
    const flag = text.toLowerCase();
    if (flag === 'true' || flag === 'yes') return { type: 'boolean', value: true };
    if (flag === 'false' || flag === 'no') return { type: 'boolean', value: false };
  }
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
/** Dollars a team cap moved on this deal, keyed by the cap's formula key. */
export type TeamCapCreditMap = Record<string, {
  total: number;
  byAgent: Record<string, number>;
  /** Lowercased id and name of the agent who receives this cap. */
  recipientKeys?: string[];
}>;

const TEAM_CAP_CREDIT = /^([a-z_][a-z0-9_]*)\.(agent|total)$/i;
const TEAM_CAP_CREDIT_IN_FORMULA = /\b[a-z_][a-z0-9_]*\.(agent|total)\b/i;

function teamCapCreditValue(
  name: string,
  agentName: string,
  credits: TeamCapCreditMap | undefined,
  ignoreAgentCredit = false,
): FormulaValue | null {
  if (!credits) return null;
  const match = TEAM_CAP_CREDIT.exec(name.trim());
  if (!match) return null;
  const cap = credits[match[1].toLowerCase()];
  if (!cap) return null;
  if (match[2].toLowerCase() === 'total') return { type: 'number', value: cap.total };
  if (ignoreAgentCredit) return { type: 'number', value: 0 };
  return { type: 'number', value: cap.byAgent[agentName.trim().toLowerCase()] || 0 };
}

export function applyTemplateLogic({
  steps,
  parameters,
  parameterTypes = {},
  deal,
  entities,
  rosterAgents,
  dealAgents,
  totalCommission,
  ledger = [],
  lookups,
  continueOnError = false,
  teamCapCredits,
  waterfallPool,
}: {
  steps: TemplateLogicStep[];
  parameters: Record<string, string>;
  parameterTypes?: Record<string, string | null | undefined>;
  deal: Record<string, unknown> | null;
  entities: NamedParty[];
  rosterAgents: NamedParty[];
  dealAgents: NamedParty[];
  totalCommission: number;
  ledger?: FormulaLedgerRow[];
  lookups?: FormulaLookups;
  continueOnError?: boolean;
  teamCapCredits?: TeamCapCreditMap;
  // The waterfall's current off-the-top and pre-split deductions. Agent-split
  // baselines follow this pool, including when those deductions were edited
  // on the deal and no longer match the template.
  waterfallPool?: { afterOffTheTop: number; afterPreSplits: number };
}): AppliedTemplateRules {
  const ordered = [...steps].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
  const referencedCapKeys = new Set<string>();
  ordered.forEach((step) => {
    if (bucketFor(step.section) !== 'agentSplit') return;
    const source = `${step.custom_baseline || ''}\n${step.calculation_formula || ''}`;
    for (const match of source.matchAll(/\b([a-z_][a-z0-9_]*)\.(?:agent|total)\b/gi)) {
      referencedCapKeys.add(match[1].toLowerCase());
    }
  });
  const offTheTopRules: DynamicRule[] = [];
  const preSplitRules: DynamicRule[] = [];
  const postSplitRulesByAgent: Record<string, DynamicRule[]> = {};
  const postSplit2RulesByAgent: Record<string, DynamicRule[]> = {};
  const agentSplits: AppliedAgentSplit[] = [];
  let offTopSum = 0;
  let preSplitSum = 0;
  let agentSplitDollars = 0;
  const agentAmounts: Record<string, number> = {};
  const agentSplitNets = new Map<string, number>();
  let agentSplitNetsFlushed = false;
  const postSums: Record<string, number> = {};
  const post2Sums: Record<string, number> = {};

  const ruleResults: Record<string, FormulaValue> = {};
  const suppressedKeys = new Set<string>();
  let touchedSuppressed = false;
  const suppress = (ruleKey: string | null | undefined) => {
    const key = ruleKey?.trim().toLowerCase();
    if (key) suppressedKeys.add(key);
  };
  const parties = [...dealAgents, ...rosterAgents];
  // A cap the agent-split formulas already name is moved there. Any other
  // selected cap still leaves the payer and is added to that cap's recipient.
  const unreferencedCapShare = (name: string) => {
    if (!teamCapCredits || !name.trim()) return 0;
    const party = parties.find((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase());
    const keys = new Set(
      [name, party?.id, party?.name]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean),
    );
    let delta = 0;
    Object.entries(teamCapCredits).forEach(([key, cap]) => {
      if (referencedCapKeys.has(key)) return;
      const paidKey = [...keys].find((item) => cap.byAgent[item] != null);
      const paid = paidKey ? cap.byAgent[paidKey] : 0;
      const receives = (cap.recipientKeys || []).some((item) => keys.has(item));
      delta += (receives ? cap.total : 0) - paid;
    });
    return roundCurrency(delta);
  };
  const context = {
    baseline: 0,
    prior: 0,
    afterOffTheTop: 0,
    afterPreSplits: 0,
    afterAgentSplits: 0,
    afterL1PostSplits: 0,
    agentName: '',
    ignoreAgentCapCredit: false,
  };
  const resolve = (name: string): FormulaValue => {
    const capCredit = teamCapCreditValue(name, context.agentName, teamCapCredits, context.ignoreAgentCapCredit);
    if (capCredit) return capCredit;
    const key = name.toLowerCase();
    if (key === 'baseline') return { type: 'number', value: context.baseline };
    if (key === 'baseline_after_off_the_top') return { type: 'number', value: context.afterOffTheTop };
    if (key === 'baseline_after_pre_splits') return { type: 'number', value: context.afterPreSplits };
    if (key === 'baseline_after_agent_splits') return { type: 'number', value: context.afterAgentSplits };
    if (key === 'baseline_after_l1_post_splits') return { type: 'number', value: context.afterL1PostSplits };
    if (key === 'prior_amounts') return { type: 'number', value: context.prior };
    if (key === 'total_commission') return { type: 'number', value: totalCommission };
    if (key === 'gross_commission') return { type: 'number', value: Number((deal as any)?.gross_commission || (deal as any)?.gci_amount || totalCommission) };
    const ruleHit = Object.keys(ruleResults).find((ruleKey) => ruleKey.toLowerCase() === key);
    if (ruleHit) {
      const stored = ruleResults[ruleHit];
      if (stored.type === 'error' && suppressedKeys.has(ruleHit.toLowerCase())) touchedSuppressed = true;
      return stored;
    }
    if (Object.prototype.hasOwnProperty.call(parameters, key) || parameters[key] !== undefined) {
      const match = Object.keys(parameters).find((parameterKey) => parameterKey.toLowerCase() === key);
      if (match !== undefined) {
        const typeKey = Object.keys(parameterTypes).find((parameterKey) => parameterKey.toLowerCase() === match.toLowerCase());
        return storedValue(parameters[match], isBooleanType(typeKey ? parameterTypes[typeKey] : undefined));
      }
    }
    const stepHit = steps.some((step) => step.rule_key?.trim().toLowerCase() === key);
    if (stepHit) {
      return { type: 'blank' };
    }
    if (key === 'primary_agent' || key === 'agent_1') {
      const agent = dealAgents[0] || rosterAgents.find((a) => a.id === (deal as any)?.agent_id || a.name === (deal as any)?.primary_agent);
      if (agent) return { type: 'text', value: agent.id || agent.name };
      return { type: 'blank' };
    }
    if (key.startsWith('agent_')) {
      const idx = parseInt(key.slice(6), 10);
      if (!Number.isNaN(idx) && idx >= 1) {
        const agent = dealAgents[idx - 1];
        if (agent) return { type: 'text', value: agent.id || agent.name };
        return { type: 'blank' };
      }
    }
    const dealVal = readDeal(deal, key);
    if (dealVal !== undefined && dealVal !== null && dealVal !== '') {
      return storedValue(dealVal);
    }
    const dealRow = deal ? [formulaLookupRow(lookups?.clientId || '', deal)].filter(Boolean) as FormulaLookupRow[] : [];
    if (
      isConfiguredOrExistingField('transactions', key, dealRow, lookups) ||
      (deal && (key in deal || (deal.custom_attributes && typeof deal.custom_attributes === 'object' && key in (deal.custom_attributes as Record<string, unknown>))))
    ) {
      return { type: 'blank' };
    }
    return { type: 'error' };
  };
  const rememberValue = (ruleKey: string | null | undefined, value: FormulaValue) => {
    const key = ruleKey?.trim();
    if (key) ruleResults[key] = value;
  };
  const rememberRule = (ruleKey: string | null | undefined, amount: number) => {
    rememberValue(ruleKey, { type: 'number', value: amount });
  };
  const flushAgentSplitNets = () => {
    if (agentSplitNetsFlushed) return;
    agentSplitNetsFlushed = true;
    agentSplitNets.forEach((net, key) => rememberRule(key, net));
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
  const isCalculationStep = (step: TemplateLogicStep) => {
    const sectionKey = (step.section || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    return sectionKey === 'calculation' || sectionKey === 'nosection';
  };
  const shownInPopup = (step: TemplateLogicStep) => {
    if (!step.show_in_popup) return false;
    const showWhen = (step.show_when_formula || '').trim();
    if (!showWhen) return true;
    try {
      const result = evaluateFormula(showWhen, resolve, rosterAgents, ledger, lookups);
      if (result?.type === 'boolean') return result.value;
      if (result?.type === 'number' || result?.type === 'percent') return result.value !== 0;
      return false;
    } catch {
      return false;
    }
  };
  const flushShown = () => {
    const pending = previousShown;
    previousShown = null;
    if (!pending || !shownInPopup(pending.step)) return;
    const key = pending.step.rule_key?.trim();
    const stored = key ? ruleResults[key] : undefined;
    calculations.push({
      id: pending.step.id,
      name: pending.step.rule_name?.trim() || 'Rule',
      section: pending.step.popup_section?.trim() || '',
      value: pending.error ? null : (stored || { type: 'blank' }),
      resultType: pending.step.result_type,
      error: pending.error,
      dividerBelow: Boolean(pending.step.divider_below),
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
    context.agentName = agentName;
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
    if (waterfallPool) {
      context.afterOffTheTop = roundCurrency(waterfallPool.afterOffTheTop);
      context.afterPreSplits = roundCurrency(waterfallPool.afterPreSplits);
    }
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
    const formulaAmount = roundCurrency(evaluateNumber(formula, `Amount for "${ruleName}"`));
    // A later agent split, such as a team-lead remainder, needs the share
    // before this cap is taken off. Post-splits need the net share, so that
    // amount is stored and written back once every agent split has run.
    let remembered = formulaAmount;
    if (bucket === 'agentSplit' && /\.agent\b/i.test(`${custom}\n${formula}`)) {
      context.ignoreAgentCapCredit = true;
      try {
        const grossBaseline = custom
          ? evaluateNumber(custom, `Baseline for "${ruleName}"`)
          : defaultBaseline;
        context.baseline = grossBaseline;
        remembered = roundCurrency(evaluateNumber(formula, `Amount for "${ruleName}"`));
      } finally {
        context.ignoreAgentCapCredit = false;
        context.baseline = baseline;
      }
    }
    const amount = bucket === 'agentSplit'
      ? roundCurrency(formulaAmount + unreferencedCapShare(agentName))
      : formulaAmount;
    if (bucket === 'agentSplit' && step.rule_key?.trim()) {
      agentSplitNets.set(step.rule_key.trim(), amount);
    }
    rememberRule(step.rule_key, remembered);
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
    const agentPool = waterfallPool
      ? roundCurrency(waterfallPool.afterPreSplits)
      : roundCurrency(totalCommission - offTopSum - preSplitSum);
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
        amount,
        remainder,
      });
      return;
    }

    if (!entityName) throw new Error(`"${ruleName}" needs an entity.`);
    const map = bucket === 'postSplit' ? postSplitRulesByAgent : postSplit2RulesByAgent;
    const sums = bucket === 'postSplit' ? postSums : post2Sums;
    const fromTeamCapBaseline = TEAM_CAP_CREDIT_IN_FORMULA.test(`${custom}\n${formula}`);
    map[agentName] = [...(map[agentName] || []), { ...rule, entity: entityName, fromTeamCapBaseline }];
    sums[agentName] = roundCurrency((sums[agentName] || 0) + amount);
  };

  for (let index = 0; index < ordered.length; index += 1) {
    const step = ordered[index];
    const agentSplitsRemain = ordered.slice(index).some((later) => bucketFor(later.section) === 'agentSplit');
    if (!agentSplitsRemain) flushAgentSplitNets();
    flushShown();
    previousShown = { step };
    touchedSuppressed = false;
    try {
      runStep(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not calculate.';
      previousShown = { step, error: message };
      const failedFromHidden = touchedSuppressed;
      const shown = shownInPopup(step);
      if ((isCalculationStep(step) && !shown) || (failedFromHidden && !shown)) {
        rememberValue(step.rule_key, { type: 'error' });
        suppress(step.rule_key);
        continue;
      }
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

type LedgerParty = { id: string; name: string };

type LedgerItem = Record<string, unknown>;

/**
 * The raw ledger, once per client: one 8 MB download however many callers ask, and while one is in flight
 * later callers share it. Entity names only label the rows, so each entity list gets its own labelled copy.
 */
type LedgerCacheEntry = {
  items: LedgerItem[] | null;
  promise: Promise<LedgerItem[]> | null;
  labelled: Map<string, FormulaLedgerRow[]>;
};

const ledgerCache = new Map<string, LedgerCacheEntry>();

function ledgerEntitiesKey(entities: LedgerParty[]): string {
  return entities.map((entity) => `${entity.id}\t${entity.name}`).join('\n');
}

async function fetchCommissionLedgerItems(clientId: string): Promise<LedgerItem[]> {
  const response = await fetch(`/api/transaction-commission-items?client_id=${encodeURIComponent(clientId)}&view=ledger`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.error || 'Failed to load commission lines.');
  return Array.isArray(data.items) ? data.items as LedgerItem[] : [];
}

function labelLedger(entry: LedgerCacheEntry, items: LedgerItem[], entities: LedgerParty[]): FormulaLedgerRow[] {
  const key = ledgerEntitiesKey(entities);
  const cached = entry.labelled.get(key);
  if (cached) return cached;
  const entityNames = new Map(entities.map((entity) => [entity.id, entity.name]));
  const rows = items.map((item) => {
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
  entry.labelled.set(key, rows);
  return rows;
}

/** Rows already loaded for this client. The popup can calculate while a refresh is still running. */
export function peekCommissionLedger(clientId: string, entities: LedgerParty[]): FormulaLedgerRow[] | null {
  const entry = ledgerCache.get(clientId);
  if (!entry?.items) return null;
  return labelLedger(entry, entry.items, entities);
}

/** Commission lines joined to their transaction, for SUMIFS in calculation rules. */
export function loadCommissionLedger(
  clientId: string,
  entities: LedgerParty[],
  options?: { refresh?: boolean },
): Promise<FormulaLedgerRow[]> {
  let entry = ledgerCache.get(clientId);
  if (!entry) {
    entry = { items: null, promise: null, labelled: new Map() };
    ledgerCache.set(clientId, entry);
  }
  const current = entry;
  // A refresh while a download is already running shares it; otherwise reuse what is loaded.
  if (current.promise && (!options?.refresh || !current.items)) {
    return current.promise.then((items) => labelLedger(current, items, entities));
  }
  if (current.items && !options?.refresh) {
    return Promise.resolve(labelLedger(current, current.items, entities));
  }
  const promise = fetchCommissionLedgerItems(clientId).then((items) => {
    if (current.promise === promise) {
      current.items = items;
      current.labelled = new Map();
      current.promise = null;
    }
    return items;
  }).catch((error) => {
    if (current.promise === promise) {
      current.promise = null;
      if (!current.items) ledgerCache.delete(clientId);
    }
    throw error;
  });
  current.promise = promise;
  return promise.then((items) => labelLedger(current, items, entities));
}

export function templateFormulaSources(
  steps: TemplateLogicStep[],
  parameters: { autofill_formula?: string | null }[],
): string[] {
  const sources: string[] = [];
  for (const step of steps) {
    for (const formula of [step.calculation_formula, step.payee_formula, step.apply_condition, step.custom_baseline, step.show_when_formula]) {
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

const lookupTableCache = new Map<string, { promise: Promise<FormulaLookupRow[]>; rows: FormulaLookupRow[] | null }>();

async function fetchFormulaLookupTable(clientId: string, table: string): Promise<FormulaLookupRow[]> {
  const pageSize = 1000;
  const rows: FormulaLookupRow[] = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const response = await fetch(`/api/formula-lookups?table=${encodeURIComponent(table)}&client_id=${encodeURIComponent(clientId)}&offset=${offset}&limit=${pageSize}`, {
      headers: { 'x-client-id': clientId },
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.error || `Failed to load ${table}.`);
    const returnedClientId = String(data.client_id || '').trim();
    if (clientId && clientId !== 'DEMO' && returnedClientId && returnedClientId !== clientId) {
      throw new Error('Formula lookup returned a different client.');
    }
    const effectiveClientId = returnedClientId || clientId;
    const batch = Array.isArray(data.rows) ? data.rows as Record<string, unknown>[] : [];
    for (const record of batch) {
      const row = formulaLookupRow(effectiveClientId, record);
      if (row) rows.push(row);
    }
    if (batch.length < pageSize) break;
  }
  return rows;
}

function loadFormulaLookupTable(clientId: string, table: string, options?: { refresh?: boolean }): Promise<FormulaLookupRow[]> {
  const cacheKey = `${clientId}:${table}`;
  const existing = lookupTableCache.get(cacheKey);
  if (!options?.refresh && existing) return existing.promise;
  const promise = fetchFormulaLookupTable(clientId, table).then((rows) => {
    const current = lookupTableCache.get(cacheKey);
    if (current?.promise === promise) current.rows = rows;
    return rows;
  }).catch((error) => {
    const current = lookupTableCache.get(cacheKey);
    if (current?.promise === promise) lookupTableCache.delete(cacheKey);
    throw error;
  });
  lookupTableCache.set(cacheKey, { promise, rows: options?.refresh ? existing?.rows ?? null : null });
  return promise;
}

/** Lookup rows already loaded for these tables. */
export function peekFormulaLookups(clientId: string, tables: readonly string[]): FormulaLookups | null {
  const loaded: FormulaLookups['tables'] = {};
  for (const table of tables) {
    const entry = lookupTableCache.get(`${clientId}:${table}`);
    if (!entry?.rows) return null;
    loaded[table] = entry.rows;
  }
  const configEntry = lookupTableCache.get(`${clientId}:client_field_configurations`);
  if (configEntry?.rows) {
    loaded['client_field_configurations'] = configEntry.rows;
  }
  return { clientId, tables: loaded };
}

/** Client-scoped rows for the tables a formula's XLOOKUP actually reads. */
export async function loadFormulaLookups(
  clientId: string,
  tablesToLoad: readonly string[] = FORMULA_LOOKUP_TABLES,
  options?: { refresh?: boolean },
): Promise<FormulaLookups> {
  const tablesWithConfigs = [...new Set([...tablesToLoad, 'client_field_configurations'])];
  const requested = tablesWithConfigs.flatMap((table) => {
    const source = formulaLookupSource(table);
    return source ? [{ key: table, source }] : [];
  });
  const loaded = await Promise.all(requested.map(async ({ key, source }) => [key, await loadFormulaLookupTable(clientId, source, options)] as const));
  const tables: FormulaLookups['tables'] = {};
  for (const [table, rows] of loaded) tables[table] = rows;
  return { clientId, tables };
}

/** Clears all module-level in-memory caches so subsequent calculations re-fetch fresh data. */
export function clearCommissionModuleCache(): void {
  templateBundles.clear();
  ledgerCache.clear();
  lookupTableCache.clear();
}

export function invalidateTemplateBundle(templateId?: string): void {
  if (templateId) templateBundles.delete(templateId);
  else templateBundles.clear();
}

export function invalidateFormulaLookups(clientId?: string, table?: string): void {
  if (clientId && table) {
    lookupTableCache.delete(`${clientId}:${table}`);
  } else if (clientId) {
    for (const key of lookupTableCache.keys()) {
      if (key.startsWith(`${clientId}:`)) lookupTableCache.delete(key);
    }
  } else {
    lookupTableCache.clear();
  }
}

export function invalidateCommissionLedger(clientId?: string): void {
  if (clientId) ledgerCache.delete(clientId);
  else ledgerCache.clear();
}
