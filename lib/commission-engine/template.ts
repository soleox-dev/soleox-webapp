/**
 * Runs a commission template's rules in step order: Off-the-top, Pre-splits, Agent Splits and the post-split levels,
 * with the template's parameters, the deal, the ledger and lookup tables. Pure: callers load the data.
 */
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
import { roundCurrency, roundPercentRate, type DynamicRule } from './model';
import type { Adjustment } from './stages';

export { formulaDataNeeds };

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
  /** 'BONUS' (Agent Splits): moves the amount from from_agent_key's agent to this rule's agent. */
  rule_kind?: string | null;
  from_agent_key?: string | null;
  /** Off-the-top or Pre-splits: the credit comes out of these agents' splits instead of off the top. */
  paid_by_agent_keys?: string[] | null;
  /**
   * How the Paid By agents share the credit or adjustment: 'split' (default), 'equal', 'custom' (paid_shares are
   * percents) or 'typed' (paid_shares are each payer's dollars).
   */
  paid_share_by?: string | null;
  /**
   * Post-splits: 'BEFORE_PLAN' or 'AFTER_PLAN' makes the rule an adjustment (stages.ts) paid by paid_by_agent_keys,
   * or by every agent when it names no agent at all. Null: a post-split for agent_key, as before.
   */
  stage?: string | null;
  /** The level within the stage; null is the section's (Post-splits 1, Level 2 post-splits 2). */
  level?: number | null;
  /** For paid_share_by 'split': 'split', 'after_before_plan', 'after_plan' or 'at_level' (stages.ts ShareBasis). */
  share_basis?: string | null;
  /** For paid_share_by 'custom' or 'typed': one formula per paid_by_agent_keys entry, in the same order. */
  paid_shares?: string[] | null;
}

/** A bonus line: dollars moved from one agent's split to another's. */
export interface AppliedBonus {
  name: string;
  from: string;
  to: string;
  amount: number;
}

/** A credit paid by chosen agents: one agent's share, taken from their split before their other post-splits. */
export interface AppliedAgentCredit {
  name: string;
  agentName: string;
  entity: string;
  amount: number;
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
  /** Present only when the template has bonus lines that applied. */
  bonuses?: AppliedBonus[];
  /** Present only when the template has credits paid by chosen agents that applied. */
  agentCredits?: AppliedAgentCredit[];
  /** Present only when the template has adjustments (post-split rules with a stage) that applied. */
  adjustments?: Adjustment[];
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
  /** What each agent the cap pays receives of the total, with that agent's lowercased id and names. */
  receipts?: { keys: string[]; amount: number }[];
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
  // Lowercased agent name → rule key of their agent split, to keep agentSplitNets in step when a split moves.
  const agentSplitNetKeys = new Map<string, string>();
  let agentSplitNetsFlushed = false;
  const postSums: Record<string, number> = {};
  const post2Sums: Record<string, number> = {};
  const pendingBonuses: AppliedBonus[] = [];
  const pendingCredits: { name: string; entity: string; amount: number; payers: string[]; shareBy: 'split' | 'equal' }[] = [];
  const bonuses: AppliedBonus[] = [];
  const agentCredits: AppliedAgentCredit[] = [];
  const adjustments: Adjustment[] = [];

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
      const received = (cap.receipts || []).find((receipt) => receipt.keys.some((item) => keys.has(item)))?.amount || 0;
      delta += received - paid;
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
    applyBonusesAndCredits();
  };
  const splitPool = () => (waterfallPool
    ? roundCurrency(waterfallPool.afterPreSplits)
    : roundCurrency(totalCommission - offTopSum - preSplitSum));
  const moveSplit = (agentName: string, delta: number, label: string) => {
    const entry = agentSplits.find((split) => split.name.trim().toLowerCase() === agentName.trim().toLowerCase());
    const pool = splitPool();
    if (!entry) {
      if (delta < 0) throw new Error(`${agentName} pays "${label}" but has no agent split.`);
      agentSplits.push({ name: agentName, splitType: 'AMOUNT', splitVal: delta, amount: delta });
    } else {
      entry.amount = roundCurrency(entry.amount + delta);
      entry.splitVal = appliedSplitValue(entry.splitType, entry.amount, pool);
    }
    const key = Object.keys(agentAmounts).find((name) => name.trim().toLowerCase() === agentName.trim().toLowerCase()) || agentName;
    agentAmounts[key] = roundCurrency((agentAmounts[key] || 0) + delta);
  };
  // Credits are shared by the payers' splits before bonuses; bonuses then move dollars between splits.
  // Both run once every agent split is known and before any post-split.
  const applyBonusesAndCredits = () => {
    for (const credit of pendingCredits.splice(0)) {
      const splits = credit.payers.map((name) => recorded(agentAmounts, name));
      const splitTotal = splits.reduce((sum, amount) => sum + amount, 0);
      const shares = credit.payers.map((_, index) => roundCurrency(
        credit.amount * (credit.shareBy === 'split' && splitTotal > 0 ? splits[index] / splitTotal : 1 / credit.payers.length),
      ));
      // The credit is paid in full: a rounding cent goes to the first payer.
      shares[0] = roundCurrency(shares[0] + credit.amount - shares.reduce((sum, amount) => sum + amount, 0));
      credit.payers.forEach((agentName, index) => {
        if (!shares[index]) return;
        const pool = recorded(agentAmounts, agentName);
        postSplitRulesByAgent[agentName] = [
          { id: `tpl_credit_${credit.name}_${index}`, name: credit.name, entity: credit.entity, type: 'AMOUNT', value: appliedSplitValue('AMOUNT', shares[index], pool), beforePlan: true },
          ...(postSplitRulesByAgent[agentName] || []),
        ];
        postSums[agentName] = roundCurrency((postSums[agentName] || 0) + shares[index]);
        agentCredits.push({ name: credit.name, agentName, entity: credit.entity, amount: shares[index] });
      });
    }
    for (const bonus of pendingBonuses.splice(0)) {
      moveSplit(bonus.from, -bonus.amount, bonus.name);
      moveSplit(bonus.to, bonus.amount, bonus.name);
      bonuses.push(bonus);
    }
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
    const kind = String(step.rule_kind || '').trim().toUpperCase();
    if (kind === 'BONUS' && bucket === 'agentSplit') {
      rememberRule(step.rule_key, formulaAmount);
      // A bonus slot with nothing in it (no agent, or $0) does nothing.
      if (formulaAmount === 0) return;
      const fromKey = step.from_agent_key?.trim() || '';
      const fromResult = fromKey ? resolve(fromKey) : null;
      const fromName = fromResult && fromResult.type !== 'error' ? agentNameFrom(fromResult) : '';
      if (!fromName) throw new Error(`"${ruleName}" needs the agent who pays the bonus.`);
      if (!agentName) throw new Error(`"${ruleName}" needs the agent who receives the bonus.`);
      if (fromName.trim().toLowerCase() === agentName.trim().toLowerCase()) throw new Error(`"${ruleName}" pays the bonus to the agent who pays it.`);
      pendingBonuses.push({ name: ruleName, from: fromName, to: agentName, amount: formulaAmount });
      if (agentSplitNetsFlushed) applyBonusesAndCredits();
      return;
    }
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
    // Agent splits are rounded one by one, so a remainder split (a team lead's "baseline - agent_1_split - ...")
    // can come out a cent or two below zero when the splits before it all round up. That residue comes off the
    // largest earlier split, and the remainder lands on $0.00.
    let splitFormulaAmount = formulaAmount;
    if (bucket === 'agentSplit' && formulaAmount < 0 && formulaAmount > -0.025 && agentSplits.length) {
      const largest = agentSplits.reduce((best, split) => (split.amount > best.amount ? split : best));
      moveSplit(largest.name, formulaAmount, ruleName);
      agentSplitDollars = roundCurrency(agentSplitDollars + formulaAmount);
      const largestKey = agentSplitNetKeys.get(largest.name.trim().toLowerCase());
      if (largestKey) agentSplitNets.set(largestKey, roundCurrency((agentSplitNets.get(largestKey) || 0) + formulaAmount));
      if (remembered === formulaAmount) remembered = 0;
      splitFormulaAmount = 0;
    }
    const amount = bucket === 'agentSplit'
      ? roundCurrency(splitFormulaAmount + unreferencedCapShare(agentName))
      : formulaAmount;
    if (bucket === 'agentSplit' && step.rule_key?.trim()) {
      agentSplitNets.set(step.rule_key.trim(), amount);
      if (agentName.trim()) agentSplitNetKeys.set(agentName.trim().toLowerCase(), step.rule_key.trim());
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

    const payerKeys = (step.paid_by_agent_keys || []).map((key) => key.trim()).filter(Boolean);
    if (payerKeys.length && (bucket === 'offTheTop' || bucket === 'preSplit')) {
      if (!entityName) throw new Error(`"${ruleName}" needs an entity.`);
      const payers = payerKeys.flatMap((key) => {
        const result = resolve(key);
        const name = result && result.type !== 'error' ? agentNameFrom(result) : '';
        return name ? [name] : [];
      });
      // A Paid By slot with no agent on this deal (an empty agent_3) simply does not pay.
      if (!payers.length) throw new Error(`"${ruleName}" is paid by agents who are not on this deal.`);
      pendingCredits.push({ name: ruleName, entity: entityName, amount: formulaAmount, payers, shareBy: step.paid_share_by === 'equal' ? 'equal' : 'split' });
      if (agentSplitNetsFlushed) applyBonusesAndCredits();
      return;
    }

    const adjustmentStage = step.stage === 'BEFORE_PLAN' || step.stage === 'AFTER_PLAN' ? step.stage : null;
    if (adjustmentStage && (bucket === 'postSplit' || bucket === 'postSplit2')) {
      if (!entityName) throw new Error(`"${ruleName}" needs an entity.`);
      // Paid by the named agents, or by every agent when the rule names none (no Paid By and no agent).
      const payers = payerKeys.length
        ? payerKeys.flatMap((key) => {
          const result = resolve(key);
          const name = result && result.type !== 'error' ? agentNameFrom(result) : '';
          return name ? [name] : [];
        })
        : agentName ? [agentName] : [];
      if (payerKeys.length && !payers.length) throw new Error(`"${ruleName}" is paid by agents who are not on this deal.`);
      const divide = (['split', 'equal', 'custom', 'typed'] as const).find((option) => option === step.paid_share_by) ?? 'split';
      const shares: Record<string, number> = {};
      if (divide === 'custom' || divide === 'typed') {
        payerKeys.forEach((key, index) => {
          const source = step.paid_shares?.[index]?.trim();
          const payer = payers[index];
          if (!source || !payer) return;
          shares[payer] = evaluateNumber(source, `${ruleName}: ${payer}'s share`);
        });
      }
      // A percent adjustment is each payer's own rate of their stage base, known only in the waterfall: the formula
      // gives the rate.
      const percent = splitKind(step.split_type) === 'PERCENT';
      let value = formulaAmount;
      if (percent) {
        const result = evaluateFormula(formula, resolve, rosterAgents, ledger, lookups);
        if (!result || result.type !== 'percent') throw new Error(`"${ruleName}" is a percent adjustment, so its formula must give a percent.`);
        value = Number(result.value) || 0;
      }
      if (!percent && divide !== 'typed' && value === 0) return;
      const basis = (['split', 'after_before_plan', 'after_plan', 'at_level'] as const).find((option) => option === step.share_basis);
      const level = Number(step.level);
      adjustments.push({
        id: `tpl_adj_${step.id}`,
        name: ruleName,
        entity: entityName,
        stage: adjustmentStage,
        level: Number.isInteger(level) && level >= 1 ? level : bucket === 'postSplit2' ? 2 : 1,
        type: percent ? 'PERCENT' : 'AMOUNT',
        value,
        payers,
        divide,
        ...(basis ? { basis } : {}),
        ...(Object.keys(shares).length ? { shares } : {}),
      });
      return;
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
  applyBonusesAndCredits();

  return {
    offTheTopRules,
    preSplitRules,
    postSplitRulesByAgent,
    postSplit2RulesByAgent,
    agentSplits,
    calculations,
    ...(bonuses.length ? { bonuses } : {}),
    ...(agentCredits.length ? { agentCredits } : {}),
    ...(adjustments.length ? { adjustments } : {}),
  };
}

/** A raw ledger line (GET /api/transaction-commission-items?view=ledger). */
export type LedgerItem = Record<string, unknown>;

function ledgerValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function closingDay(value: unknown): string {
  const text = ledgerValue(value).trim();
  return text.length >= 10 ? text.slice(0, 10) : text;
}

/** Ledger lines as SUMIFS reads them: commission line, entity name, and the transaction's date and status. */
export function labelLedgerRows(items: LedgerItem[], entities: { id: string; name: string }[]): FormulaLedgerRow[] {
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
    for (const formula of [step.calculation_formula, step.payee_formula, step.apply_condition, step.custom_baseline, step.show_when_formula]) {
      if (formula && formula.trim()) sources.push(formula);
    }
  }
  for (const parameter of parameters) {
    if (parameter.autofill_formula && parameter.autofill_formula.trim()) sources.push(parameter.autofill_formula);
  }
  return sources;
}

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
