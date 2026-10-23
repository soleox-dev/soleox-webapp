/**
 * The commission waterfall for one deal: Total Commission, off-the-top and pre-split deductions, agent splits (the
 * primary agent takes the remainder), team caps and sales volume, the submitted template's replay once a cap moved
 * money, post-splits at both levels, and what each payee is paid. See lib/commission-engine/README.md for which
 * value wins when saved lines, a typed split and the template disagree.
 */
import {
  roundCurrency,
  roundPercentRate,
  evaluateFormula,
  type AgentConfig,
  type DynamicRule,
  type EngineField,
} from './model';
import { normalizeAgentName } from '@/lib/id';
import { planDealAllocations, splitCapTotal, type DealAllocationContext, type DealAllocationLine } from '@/lib/agent-allocations';
import { applyTemplateLogic, type AppliedAgentSplit, type NamedParty, type TeamCapCreditMap, type TemplateLogicStep } from './template';
import type { FormulaLedgerRow, FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

export interface WaterfallInput {
  salesPrice: number;
  gciPerc: number;
  offTheTopRules: DynamicRule[];
  preSplitRules?: DynamicRule[];
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent?: Record<string, DynamicRule[]>;
  agents: AgentConfig[];
  primaryAgentId?: string | null;
  overviewFields: EngineField[];
  selectedDeal: any;
  overviewFormValues: Record<string, any>;
  clientType: string;
  allocation?: DealAllocationContext | null;
  templateReplay?: {
    steps: TemplateLogicStep[];
    parameters: Record<string, string>;
    parameterTypes?: Record<string, string | null | undefined>;
    entities: NamedParty[];
    rosterAgents: NamedParty[];
    ledger?: FormulaLedgerRow[];
    lookups?: FormulaLookups;
  } | null;
  /**
   * Each agent's saved split after team caps (the deal's stored AGENT_SPLIT lines), shown while the
   * template replay that recomputes them still waits for the commission ledger. Pass only for the
   * saved, unedited waterfall.
   */
  storedAgentSplits?: { agentId: string; amount: number }[] | null;
}

export function computeTransactionWaterfall({
  salesPrice,
  gciPerc,
  offTheTopRules,
  preSplitRules = [],
  postSplitRulesByAgent,
  postSplit2RulesByAgent = {},
  agents,
  primaryAgentId,
  overviewFields,
  selectedDeal,
  overviewFormValues,
  clientType,
  allocation = null,
  templateReplay = null,
  storedAgentSplits = null,
}: WaterfallInput) {
    const grossComm = roundCurrency(salesPrice * gciPerc);

    const currentContext = {
      transaction_fee: 0,
      sales_price: salesPrice,
      gci_amount: grossComm,
      gci_perc: gciPerc,
      ...selectedDeal,
      ...overviewFormValues,
      transaction_side: clientType || 'Seller',
    };

    const totCommSetting = overviewFields.find((f) => f.key === 'total_commission');
    
    // Baseline for waterfall starts strictly from Total Commission
    let baselineTotalComm = 0;
    let totalSource: TotalCommissionSource = 'gross';
    if (totCommSetting?.calculation_formula && totCommSetting.calculation_formula.trim().length > 0) {
      baselineTotalComm = evaluateFormula(totCommSetting.calculation_formula, currentContext);
      totalSource = 'formula';
    } else if (overviewFormValues?.total_commission !== undefined && overviewFormValues?.total_commission !== null && overviewFormValues?.total_commission !== '') {
      baselineTotalComm = Number(overviewFormValues.total_commission) || 0;
      totalSource = 'form';
    } else if (selectedDeal?.total_commission !== undefined && selectedDeal?.total_commission !== null && selectedDeal?.total_commission !== '') {
      baselineTotalComm = Number(selectedDeal.total_commission) || 0;
      totalSource = 'deal';
    } else {
      baselineTotalComm = grossComm;
    }

    if (isNaN(baselineTotalComm) || baselineTotalComm <= 0) {
      baselineTotalComm = grossComm;
      totalSource = 'gross';
    }
    baselineTotalComm = roundCurrency(baselineTotalComm);

    // 1. Off-The-Top Deductions calculated against Total Commission baseline
    const offTopCalculated = offTheTopRules.map((r) => {
      const amt = r.type === 'PERCENT' ? roundCurrency(baselineTotalComm * r.value) : roundCurrency(r.value);
      return { ...r, amount: amt };
    });

    const totalOffTop = offTopCalculated.reduce((sum, r) => sum + r.amount, 0);
    const netOffTopComm = roundCurrency(baselineTotalComm - totalOffTop);

    // 2. Pre-Split Deductions (after Off-The-Top, before Agent Splits)
    const preSplitCalculated = preSplitRules.map((r) => {
      const amt = r.type === 'PERCENT' ? roundCurrency(netOffTopComm * r.value) : roundCurrency(r.value);
      return { ...r, amount: amt };
    });

    const totalPreSplit = preSplitCalculated.reduce((sum, r) => sum + r.amount, 0);
    const netToSplit = roundCurrency(Math.max(0, netOffTopComm - totalPreSplit));

    // 3. Agent splits stay in list order. The primary agent — the transaction's
    // agent, or the step 1 agent split when the deal has no agent — receives
    // whatever commission remains after the other agent splits.
    const primaryKey = String(primaryAgentId || '').trim().toLowerCase();
    const matchedPrimary = primaryKey
      ? agents.findIndex((agent) => agent.id.toLowerCase() === primaryKey || agent.name.toLowerCase() === primaryKey)
      : -1;
    const balanceIndex = matchedPrimary >= 0 ? matchedPrimary : 0;
    let remainingSplitDollars = netToSplit;
    const splitCalculated: any[] = new Array(agents.length);

    agents.forEach((ag, idx) => {
      if (idx === balanceIndex) return;

      let requested = 0;
      let requestedRate = 0;

      if (ag.splitType === 'PERCENT') {
        requestedRate = roundPercentRate(ag.splitVal);
        requested = roundCurrency(netToSplit * requestedRate);
      } else {
        requested = roundCurrency(Math.max(0, ag.splitVal));
        requestedRate = netToSplit > 0 ? roundPercentRate(requested / netToSplit) : 0;
      }

      const room = roundCurrency(Math.max(0, remainingSplitDollars));
      const overAllocated = requested > room + 0.009;
      const dollarAmt = roundCurrency(Math.min(requested, room));
      remainingSplitDollars = roundCurrency(room - dollarAmt);

      splitCalculated[idx] = {
        agentId: ag.id,
        agentName: ag.name,
        splitType: ag.splitType,
        splitVal: ag.splitVal,
        percent: requestedRate,
        amount: dollarAmt,
        overAllocated,
        isPrimary: false,
        manualSplit: Boolean(ag.manualSplit),
      };
    });

    let allocationLines: DealAllocationLine[] = [];
    if (agents.length > 0) {
      const balanceAgent = agents[balanceIndex];
      const balanceDollars = roundCurrency(Math.max(0, remainingSplitDollars));
      const explicitSplits = splitCalculated.filter(Boolean);
      const allExplicitArePercent = explicitSplits.every((split) => split.splitType === 'PERCENT');
      const splitsExceedPool = explicitSplits.some((split) => split.overAllocated);
      const explicitPercent = explicitSplits.reduce((sum, split) => sum + (split.splitType === 'PERCENT' ? split.percent : 0), 0);
      const balancePercent = !splitsExceedPool && allExplicitArePercent && explicitSplits.length > 0
        ? Math.max(0, roundPercentRate(1 - explicitPercent))
        : (netToSplit > 0 ? roundPercentRate(balanceDollars / netToSplit) : 0);

      splitCalculated[balanceIndex] = {
        agentId: balanceAgent.id,
        agentName: balanceAgent.name,
        splitType: balanceAgent.splitType || 'PERCENT',
        splitVal: balancePercent,
        percent: balancePercent,
        amount: balanceDollars,
        isPrimary: true,
      };
    }

    if (allocation && splitCalculated.some(Boolean)) {
      const plan = planDealAllocations(allocation, splitCalculated.filter(Boolean).map((item) => ({
        agentId: item.agentId,
        amount: item.amount,
        isPrimary: Boolean(item.isPrimary),
      })));
      allocationLines = plan.lines;
    }

    const repriced = repriceTeamCapBaselines({
      level1: postSplitRulesByAgent,
      level2: postSplit2RulesByAgent,
      allocation,
      lines: allocationLines,
      agents,
      splits: splitCalculated,
      netToSplit,
      afterOffTheTop: netOffTopComm,
      replay: templateReplay,
      deal: { ...selectedDeal, ...overviewFormValues },
      totalCommission: baselineTotalComm,
    });
    const level1Rules = repriced.level1;
    const level2Rules = repriced.level2;
    // Only when a team cap actually moved money does the submitted template's replay change what shows.
    const capMovedMoney = Boolean(allocation) && Object.values(teamCapCredits(allocation as DealAllocationContext, allocationLines, agents))
      .some((cap) => Math.abs(cap.total) > 0.009);
    if (capMovedMoney && !templateReplay && storedAgentSplits) {
      applyStoredAgentSplits(splitCalculated.filter(Boolean), storedAgentSplits, netToSplit);
    }

    const postSplitCalculated: any[] = [];
    const postSplit2Calculated: any[] = [];
    const agentNetAfterLevel1: Record<string, number> = {};
    const netPayouts: Record<string, number> = {};

    agents.forEach((ag) => {
      const agSplitItem = splitCalculated.find((s) => s.agentId === ag.id);
      const agSplitAmt = agSplitItem ? agSplitItem.amount : 0;
      let agDeductions = 0;

      // 1. Level 1 Post-Split Deductions (from Agent Gross Split)
      const agentRules = rulesForAgent(level1Rules, ag.name);
      agentRules.forEach((r) => {
        const amt = r.type === 'PERCENT' ? roundCurrency(agSplitAmt * r.value) : roundCurrency(r.value);
        agDeductions += amt;

        postSplitCalculated.push({
          id: r.id,
          agentId: ag.id,
          agentName: ag.name,
          entity: r.entity,
          ruleName: r.name,
          note: r.note || '',
          type: r.type,
          value: r.value,
          amount: amt,
          level: 1,
          ...planFields(r),
        });
      });

      const netAfterLevel1 = roundCurrency(Math.max(0, agSplitAmt - agDeductions));
      agentNetAfterLevel1[ag.name] = netAfterLevel1;

      // 2. Level 2 Post-Split Deductions (e.g. Stock Program, from Net after Level 1)
      let agLevel2Deductions = 0;
      const agentLevel2Rules = rulesForAgent(level2Rules, ag.name);

      agentLevel2Rules.forEach((r2) => {
        const amt2 = r2.type === 'PERCENT' ? roundCurrency(netAfterLevel1 * r2.value) : roundCurrency(r2.value);
        agLevel2Deductions += amt2;

        postSplit2Calculated.push({
          id: r2.id,
          agentId: ag.id,
          agentName: ag.name,
          entity: r2.entity,
          ruleName: r2.name,
          note: r2.note || '',
          type: r2.type,
          value: r2.value,
          amount: amt2,
          level: 2,
          ...planFields(r2),
        });
      });

      const finalNetPayout = roundCurrency(Math.max(0, netAfterLevel1 - agLevel2Deductions));
      netPayouts[ag.name] = finalNetPayout;
    });

    offTopCalculated.forEach((r) => {
      netPayouts[r.entity] = roundCurrency((netPayouts[r.entity] || 0) + r.amount);
    });

    preSplitCalculated.forEach((r) => {
      netPayouts[r.entity] = roundCurrency((netPayouts[r.entity] || 0) + r.amount);
    });

    postSplitCalculated.forEach((r) => {
      netPayouts[r.entity] = roundCurrency((netPayouts[r.entity] || 0) + r.amount);
    });

    postSplit2Calculated.forEach((r2) => {
      netPayouts[r2.entity] = roundCurrency((netPayouts[r2.entity] || 0) + r2.amount);
    });

    // An agent other than the primary whose split comes to $0 once team caps are worked out, and who pays nothing
    // in any post-split, takes no part in the deal: a team cap recipient that the cap ends up not paying, for one.
    // The page leaves these agents out of the waterfall, the payments, and what it saves.
    const idleAgentIds = agents.flatMap((ag) => {
      const split = splitCalculated.find((item) => item?.agentId === ag.id);
      if (split?.isPrimary) return [];
      if (Math.abs(Number(split?.amount) || 0) >= 0.005) return [];
      const paysPostSplit = [...postSplitCalculated, ...postSplit2Calculated]
        .some((item) => item.agentId === ag.id && Math.abs(Number(item.amount) || 0) >= 0.005);
      return paysPostSplit ? [] : [ag.id];
    });

    const explanation = explainWaterfall({
      totalCommission: baselineTotalComm,
      totalSource,
      grossCommission: grossComm,
      offTheTop: offTopCalculated,
      preSplits: preSplitCalculated,
      afterOffTheTop: netOffTopComm,
      netToSplit,
      splits: splitCalculated,
      allocationLines,
      postSplits: postSplitCalculated,
      postSplits2: postSplit2Calculated,
      level1Rules,
      level2Rules,
      netPayouts,
    });

    const agentSplitTotal = roundCurrency(splitCalculated.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0));
    const agentSplitExcess = roundCurrency(Math.max(0, agentSplitTotal - netToSplit));

    return {
      grossCommission: grossComm,
      totalCommission: baselineTotalComm,
      offTheTopItems: offTopCalculated,
      commissionAfterOffTop: netOffTopComm,
      preSplitItems: preSplitCalculated,
      commissionAfterPreSplit: netToSplit,
      agentSplitItems: splitCalculated,
      allocationLines,
      postSplitItems: postSplitCalculated,
      postSplit2Items: postSplit2Calculated,
      agentNetAfterLevel1,
      netPayouts,
      agentSplitTotal,
      agentSplitExcess,
      idleAgentIds,
      displayPostSplitRulesByAgent: level1Rules,
      displayPostSplit2RulesByAgent: level2Rules,
      capMovedMoney,
      /** Where each number comes from, for the waterfall's hover notes and for debugging a payout. */
      explanation,
    };
}

export type WaterfallResult = ReturnType<typeof computeTransactionWaterfall>;

/** Commission Plan markers a post-split carries into the result and the save, present only when set. */
function planFields(rule: DynamicRule): Partial<Pick<DynamicRule, 'planLineKey' | 'planVersionId' | 'planTyped' | 'planWaived' | 'beforePlan'>> {
  return {
    ...(rule.planLineKey ? { planLineKey: rule.planLineKey } : {}),
    ...(rule.planVersionId ? { planVersionId: rule.planVersionId } : {}),
    ...(rule.planTyped ? { planTyped: true } : {}),
    ...(rule.planWaived ? { planWaived: true } : {}),
    ...(rule.beforePlan ? { beforePlan: true } : {}),
  };
}

function rulesForAgent(rules: Record<string, DynamicRule[]>, agentName: string): DynamicRule[] {
  return rules[agentName]
    || rules[normalizeAgentName(agentName)]
    || Object.entries(rules).find(([key]) => normalizeAgentName(key).toLowerCase() === normalizeAgentName(agentName).toLowerCase())?.[1]
    || [];
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function teamCapCredits(allocation: DealAllocationContext, lines: DealAllocationLine[], agents: AgentConfig[]): TeamCapCreditMap {
  const credits: TeamCapCreditMap = {};
  const keysOf = (agentId: string) => {
    const agent = agents.find((item) => item.id === agentId);
    return [...new Set(
      [agentId, agent?.name, agent?.name ? normalizeAgentName(agent.name) : '']
        .map((name) => String(name || '').trim().toLowerCase())
        .filter(Boolean),
    )];
  };
  allocation.teamCaps.forEach((cap) => {
    const key = cap.key?.trim().toLowerCase();
    if (!key) return;
    credits[key] = { total: 0, byAgent: {} };
  });
  lines.forEach((line) => {
    if (line.kind !== 'team_cap' || !line.team_cap_id) return;
    const cap = allocation.teamCaps.find((item) => item.id === line.team_cap_id);
    const key = cap?.key?.trim().toLowerCase();
    if (!key || !credits[key]) return;
    const amount = roundCurrency(Number(line.amount) || 0);
    credits[key].total = roundCurrency(credits[key].total + amount);
    const agent = agents.find((item) => item.id === line.agent_id);
    const agentKeys = new Set(
      [line.agent_id, agent?.name, agent?.name ? normalizeAgentName(agent.name) : '']
        .map((name) => String(name || '').trim().toLowerCase())
        .filter(Boolean),
    );
    agentKeys.forEach((agentKey) => {
      credits[key].byAgent[agentKey] = roundCurrency((credits[key].byAgent[agentKey] || 0) + amount);
    });
  });
  // A cap that pays several agents gives each their share of the total.
  allocation.teamCaps.forEach((cap) => {
    const key = cap.key?.trim().toLowerCase();
    if (!key || !credits[key]) return;
    credits[key].receipts = [...splitCapTotal(credits[key].total, cap.recipients)]
      .map(([agentId, amount]) => ({ keys: keysOf(agentId), amount }));
  });
  return credits;
}

function mergeTeamCapRules(
  saved: Record<string, DynamicRule[]>,
  replayed: Record<string, DynamicRule[]>,
  capFormulasOnly: boolean,
): Record<string, DynamicRule[]> {
  const groups = new Map<string, { label: string; saved: DynamicRule[]; replayed: DynamicRule[] }>();
  const groupFor = (name: string) => {
    const key = normalizeAgentName(name).trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) return existing;
    const created = { label: name, saved: [] as DynamicRule[], replayed: [] as DynamicRule[] };
    groups.set(key, created);
    return created;
  };
  Object.entries(saved).forEach(([name, rules]) => {
    const group = groupFor(name);
    group.label = name;
    group.saved = rules;
  });
  Object.entries(replayed).forEach(([name, rules]) => {
    const group = groupFor(name);
    group.replayed = rules;
    if (group.saved.length === 0) group.label = name;
  });

  const next: Record<string, DynamicRule[]> = {};
  groups.forEach(({ label, saved: savedRules, replayed: fresh }) => {
    const used = new Set<number>();
    const merged = savedRules.map((rule) => {
      const index = fresh.findIndex((item, itemIndex) => !used.has(itemIndex) && (!capFormulasOnly || item.fromTeamCapBaseline) && sameName(item.entity, rule.entity));
      if (index < 0) return rule;
      used.add(index);
      // The replay's post-splits use the agent split after the team cap is taken
      // or added. Saved rows and the rows just submitted both follow that amount.
      // A line with no replayed counterpart keeps the amount on the deal.
      const replayed = { ...rule, type: fresh[index].type, value: fresh[index].value };
      ruleSources.set(replayed, 'template-replay');
      return replayed;
    });
    if (!capFormulasOnly) {
      fresh.forEach((item, index) => {
        if (used.has(index)) return;
        ruleSources.set(item, 'template-replay');
        merged.push(item);
      });
    }
    if (merged.length > 0) next[label] = merged;
  });
  return next;
}

function isAgentSplitStep(step: TemplateLogicStep): boolean {
  const key = (step.section || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return key === 'agentsplit' || key === 'agentsplits';
}

type WaterfallSplit = {
  agentId?: string;
  agentName?: string;
  amount?: number;
  grossAmount?: number;
  displayPercent?: number;
  capAdjusted?: boolean;
  /** Typed by hand in the waterfall: the template's formula does not replace it. */
  manualSplit?: boolean;
  isPrimary?: boolean;
};

function applyFormulaAgentSplits(splits: WaterfallSplit[], replayed: AppliedAgentSplit[], netToSplit: number) {
  const dollars = new Map<string, number>();
  replayed.forEach((split) => {
    const key = split.name.trim().toLowerCase();
    if (!key) return;
    dollars.set(key, roundCurrency((dollars.get(key) || 0) + split.amount));
    const normalized = normalizeAgentName(split.name).trim().toLowerCase();
    if (normalized && normalized !== key) dollars.set(normalized, roundCurrency((dollars.get(normalized) || 0) + split.amount));
  });
  // Once a split was typed by hand, the primary agent keeps the remaining balance worked out from the splits as they
  // stand, not the template's figure, so the splits still add up to the pool.
  const anyManual = splits.some((item) => item.manualSplit);
  splits.forEach((item) => {
    if (item.manualSplit || (anyManual && item.isPrimary)) return;
    const name = String(item.agentName || '').trim().toLowerCase();
    const normalized = normalizeAgentName(name).trim().toLowerCase();
    const nextAmount = dollars.get(name) ?? dollars.get(normalized);
    if (nextAmount == null || Math.abs(nextAmount - Number(item.amount || 0)) <= 0.009) return;
    item.grossAmount = item.amount;
    item.displayPercent = netToSplit > 0 ? roundPercentRate(nextAmount / netToSplit) : 0;
    item.capAdjusted = true;
    item.amount = nextAmount;
    splitSources.set(item, 'template');
  });
}

// With a split typed by hand, the primary agent gets what the other splits leave of the pool, as they stand after
// the template and team caps, so the splits still add up to the pool.
function balancePrimaryAfterManualSplits(splits: WaterfallSplit[], netToSplit: number) {
  if (!splits.some((item) => item.manualSplit)) return;
  const primary = splits.find((item) => item.isPrimary);
  if (!primary) return;
  const others = roundCurrency(splits.reduce((sum, item) => (item === primary ? sum : sum + (Number(item.amount) || 0)), 0));
  const nextAmount = roundCurrency(Math.max(0, netToSplit - others));
  if (Math.abs(nextAmount - Number(primary.amount || 0)) <= 0.009) return;
  primary.grossAmount = primary.amount;
  primary.displayPercent = netToSplit > 0 ? roundPercentRate(nextAmount / netToSplit) : 0;
  primary.capAdjusted = true;
  primary.amount = nextAmount;
  splitSources.set(primary, 'remainder-after-typed');
}

// The saved split after team caps, the same shape the replay gives, until the replay is ready.
function applyStoredAgentSplits(splits: WaterfallSplit[], stored: { agentId: string; amount: number }[], netToSplit: number) {
  const dollars = new Map<string, number>();
  stored.forEach((line) => {
    if (line.agentId) dollars.set(line.agentId, roundCurrency((dollars.get(line.agentId) || 0) + line.amount));
  });
  splits.forEach((item) => {
    const nextAmount = item.agentId ? dollars.get(item.agentId) : undefined;
    if (nextAmount == null || Math.abs(nextAmount - Number(item.amount || 0)) <= 0.009) return;
    item.grossAmount = item.amount;
    item.displayPercent = netToSplit > 0 ? roundPercentRate(nextAmount / netToSplit) : 0;
    item.capAdjusted = true;
    item.amount = nextAmount;
    splitSources.set(item, 'saved-after-caps');
  });
}

// A team-cap recipient the template did not list still gets an agent split from
// the engine. The payers were already reduced. That received amount belongs on
// the split the engine created. A cap whose total a template formula already
// names stays on that formula's agent.
function assignEngineCapReceipts(
  splits: WaterfallSplit[],
  replayed: AppliedAgentSplit[],
  credits: TeamCapCreditMap,
  steps: TemplateLogicStep[],
  netToSplit: number,
) {
  const referencedTotals = new Set<string>();
  steps.forEach((step) => {
    if (!isAgentSplitStep(step)) return;
    const source = `${step.custom_baseline || ''}\n${step.calculation_formula || ''}`;
    for (const match of source.matchAll(/\b([a-z_][a-z0-9_]*)\.total\b/gi)) {
      referencedTotals.add(match[1].toLowerCase());
    }
  });
  const replayedNames = new Set<string>();
  replayed.forEach((split) => {
    const key = split.name.trim().toLowerCase();
    if (key) replayedNames.add(key);
    const normalized = normalizeAgentName(split.name).trim().toLowerCase();
    if (normalized) replayedNames.add(normalized);
  });
  splits.forEach((item) => {
    if (item.manualSplit) return;
    const name = String(item.agentName || '').trim().toLowerCase();
    const normalized = normalizeAgentName(name).trim().toLowerCase();
    if (!name || replayedNames.has(name) || (normalized && replayedNames.has(normalized))) return;
    const keys = new Set([name, normalized, String(item.agentId || '').trim().toLowerCase()].filter(Boolean));
    const received = roundCurrency(Object.entries(credits).reduce((sum, [key, cap]) => {
      if (referencedTotals.has(key)) return sum;
      const receipt = (cap.receipts || []).find((item) => item.keys.some((recipient) => keys.has(recipient)));
      return receipt ? sum + receipt.amount : sum;
    }, 0));
    if (received <= 0.009 || Math.abs(received - Number(item.amount || 0)) <= 0.009) return;
    item.grossAmount = item.amount;
    item.displayPercent = netToSplit > 0 ? roundPercentRate(received / netToSplit) : 0;
    item.capAdjusted = true;
    item.amount = received;
    splitSources.set(item, 'cap-receipt');
  });
}

function repriceTeamCapBaselines({
  level1,
  level2,
  allocation,
  lines,
  agents,
  splits,
  netToSplit,
  afterOffTheTop,
  replay,
  deal,
  totalCommission,
}: {
  level1: Record<string, DynamicRule[]>;
  level2: Record<string, DynamicRule[]>;
  allocation: DealAllocationContext | null;
  lines: DealAllocationLine[];
  agents: AgentConfig[];
  splits: WaterfallSplit[];
  netToSplit: number;
  afterOffTheTop: number;
  replay: WaterfallInput['templateReplay'];
  deal: Record<string, unknown>;
  totalCommission: number;
}): { level1: Record<string, DynamicRule[]>; level2: Record<string, DynamicRule[]> } {
  if (!replay || !allocation || replay.steps.length === 0) return { level1, level2 };
  const credits = teamCapCredits(allocation, lines, agents);
  const capMovedMoney = Object.values(credits).some((cap) => Math.abs(cap.total) > 0.009);
  // A named cap that took nothing still appears in the formulas. Replacing the
  // waterfall with that replay would put an older full-pool share back on the
  // primary agent. Once a cap actually moved money, the replay is the split
  // after those dollars, including a cap the formulas never name.
  if (!capMovedMoney) return { level1, level2 };
  try {
    const applied = applyTemplateLogic({
      steps: replay.steps,
      parameters: replay.parameters,
      parameterTypes: replay.parameterTypes,
      deal,
      entities: replay.entities,
      rosterAgents: replay.rosterAgents,
      dealAgents: agents.map((agent) => ({ id: agent.id, name: agent.name })),
      totalCommission,
      ledger: replay.ledger,
      lookups: replay.lookups,
      continueOnError: true,
      teamCapCredits: credits,
      waterfallPool: { afterOffTheTop, afterPreSplits: netToSplit },
    });
    applyFormulaAgentSplits(splits, applied.agentSplits || [], netToSplit);
    assignEngineCapReceipts(splits, applied.agentSplits || [], credits, replay.steps, netToSplit);
    balancePrimaryAfterManualSplits(splits, netToSplit);
    return {
      level1: mergeTeamCapRules(level1, applied.postSplitRulesByAgent || {}, false),
      level2: mergeTeamCapRules(level2, applied.postSplit2RulesByAgent || {}, false),
    };
  } catch {
    return { level1, level2 };
  }
}
// ---------------------------------------------------------------------------------------------------------
// Explanation: where each number comes from
// ---------------------------------------------------------------------------------------------------------

type TotalCommissionSource = 'formula' | 'form' | 'deal' | 'gross';

/**
 * Why an agent split has its amount.
 * - split: the agent's split type and value (percent of the pool after pre-splits, or dollars).
 * - remainder: the primary agent gets what the other splits leave of the pool.
 * - typed: typed by hand in the waterfall (manualSplit); the template replay does not replace it.
 * - remainder-after-typed: with a typed split, the primary agent gets what the splits as they stand leave.
 * - template: the submitted template replayed after a team cap moved money.
 * - cap-receipt: a team cap recipient the template does not list receives the cap total (their share of it).
 * - saved-after-caps: the saved split after team caps, shown until the template replay has loaded.
 */
export type SplitSource = 'split' | 'remainder' | 'typed' | 'remainder-after-typed' | 'template' | 'cap-receipt' | 'saved-after-caps';

/** A post-split from the deal's lines (rule), or one whose value the template replay set after a team cap. */
export type RuleSource = 'rule' | 'template-replay';

export type ExplainedNumber = {
  /** Stable key: total, off_the_top:<rule id>, pre_split:<id>, agent_split:<agent id>, team_cap:<line id>, … */
  key: string;
  label: string;
  amount: number;
  source: SplitSource | RuleSource | TotalCommissionSource | 'allocation' | 'override' | 'payout';
  detail: string;
};

const splitSources = new WeakMap<object, SplitSource>();
const ruleSources = new WeakMap<object, RuleSource>();

function percentText(rate: number): string {
  return `${roundCurrency(rate * 100 * 1000) / 1000}%`;
}

function dollars(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function explainWaterfall({
  totalCommission,
  totalSource,
  grossCommission,
  offTheTop,
  preSplits,
  afterOffTheTop,
  netToSplit,
  splits,
  allocationLines,
  postSplits,
  postSplits2,
  level1Rules,
  level2Rules,
  netPayouts,
}: {
  totalCommission: number;
  totalSource: TotalCommissionSource;
  grossCommission: number;
  offTheTop: { id: string; entity: string; type: string; value: number; amount: number }[];
  preSplits: { id: string; entity: string; type: string; value: number; amount: number }[];
  afterOffTheTop: number;
  netToSplit: number;
  splits: any[];
  allocationLines: DealAllocationLine[];
  postSplits: any[];
  postSplits2: any[];
  level1Rules: Record<string, DynamicRule[]>;
  level2Rules: Record<string, DynamicRule[]>;
  netPayouts: Record<string, number>;
}): ExplainedNumber[] {
  const out: ExplainedNumber[] = [];
  const totalDetail: Record<TotalCommissionSource, string> = {
    formula: 'Total Commission formula from Settings.',
    form: 'Total Commission typed on the deal.',
    deal: "The deal's saved Total Commission.",
    gross: `Gross commission (sales price × GCI %), ${dollars(grossCommission)}.`,
  };
  out.push({ key: 'total', label: 'Total Commission', amount: totalCommission, source: totalSource, detail: totalDetail[totalSource] });
  const ruleDetail = (rule: { type: string; value: number }, base: string) => (
    rule.type === 'PERCENT' ? `${percentText(rule.value)} of ${base}.` : 'Fixed amount.'
  );
  offTheTop.forEach((rule) => out.push({ key: `off_the_top:${rule.id}`, label: rule.entity, amount: rule.amount, source: 'rule', detail: ruleDetail(rule, `Total Commission (${dollars(totalCommission)})`) }));
  preSplits.forEach((rule) => out.push({ key: `pre_split:${rule.id}`, label: rule.entity, amount: rule.amount, source: 'rule', detail: ruleDetail(rule, `commission after off-the-top (${dollars(afterOffTheTop)})`) }));
  splits.filter(Boolean).forEach((item) => {
    const marked = splitSources.get(item);
    const source: SplitSource = marked ?? (item.manualSplit ? 'typed' : item.isPrimary ? 'remainder' : 'split');
    const detail: Record<SplitSource, string> = {
      split: item.splitType === 'PERCENT'
        ? `${percentText(item.percent)} of the pool after pre-splits (${dollars(netToSplit)})${item.overAllocated ? ', cut to what was left' : ''}.`
        : `Fixed amount${item.overAllocated ? ', cut to what was left' : ''}.`,
      remainder: `Primary agent: what the other splits leave of ${dollars(netToSplit)}.`,
      typed: 'Typed by hand; the template does not replace it until it is submitted again.',
      'remainder-after-typed': 'Primary agent: what the splits leave after a split typed by hand.',
      template: `The submitted template after team caps (was ${dollars(Number(item.grossAmount) || 0)}).`,
      'cap-receipt': 'Team cap money this agent receives; the template does not list them.',
      'saved-after-caps': 'The saved split after team caps, until the template replay loads.',
    };
    out.push({ key: `agent_split:${item.agentId}`, label: `${item.agentName} Split`, amount: Number(item.amount) || 0, source, detail: detail[source] });
  });
  allocationLines.forEach((line) => {
    const kind = line.kind === 'team_cap' ? (line.cap_name || 'Team Cap') : 'Sales Volume';
    let detail: string;
    if (line.is_override) detail = `Typed on the deal (calculated ${dollars(line.calculated_amount)}).`;
    else if (line.kind === 'sales_volume') detail = 'Sales volume credited to this agent.';
    else if (!line.tracked) detail = 'Paid to the team lead; no yearly cap is tracked.';
    else if (line.cap_amount != null) detail = `${line.team_percent ?? 0}% of the split, up to what is left of the ${dollars(Number(line.cap_amount))} yearly cap (${dollars(Number(line.prior_amount) || 0)} already counted).`;
    else detail = `${line.team_percent ?? 0}% of the split.`;
    out.push({ key: `${line.kind}:${line.id}`, label: kind, amount: line.amount, source: line.is_override ? 'override' : 'allocation', detail });
  });
  const ruleSource = (rules: Record<string, DynamicRule[]>, id: string): RuleSource => {
    for (const list of Object.values(rules)) {
      const rule = list.find((item) => item.id === id);
      if (rule) return ruleSources.get(rule) ?? 'rule';
    }
    return 'rule';
  };
  postSplits.forEach((item) => {
    const source = ruleSource(level1Rules, item.id);
    out.push({ key: `post_split:${item.agentId}:${item.id}`, label: item.entity, amount: item.amount, source, detail: `${source === 'template-replay' ? 'Template replay after team caps: ' : ''}${ruleDetail(item, `${item.agentName}'s split`)}` });
  });
  postSplits2.forEach((item) => {
    const source = ruleSource(level2Rules, item.id);
    out.push({ key: `post_split_l2:${item.agentId}:${item.id}`, label: item.entity, amount: item.amount, source, detail: `${source === 'template-replay' ? 'Template replay after team caps: ' : ''}${ruleDetail(item, `${item.agentName}'s net after level 1`)}` });
  });
  Object.entries(netPayouts).forEach(([payee, amount]) => {
    out.push({ key: `payout:${payee}`, label: payee, amount, source: 'payout', detail: 'Net after post-splits for an agent; the sum of its lines for an entity.' });
  });
  return out;
}
