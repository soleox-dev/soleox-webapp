import { useMemo } from 'react';
import {
  AgentConfig,
  DynamicRule,
  FieldSetting,
  roundCurrency,
  roundPercentRate,
  evaluateFormula,
} from '../types';
import { normalizeAgentName } from '@/lib/id';
import { planDealAllocations, type DealAllocationContext, type DealAllocationLine } from '@/lib/agent-allocations';
import { applyTemplateLogic, type AppliedAgentSplit, type NamedParty, type TeamCapCreditMap, type TemplateLogicStep } from '../components/applyTemplateLogic';
import type { FormulaLedgerRow, FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

interface UseTransactionWaterfallProps {
  salesPrice: number;
  gciPerc: number;
  offTheTopRules: DynamicRule[];
  preSplitRules?: DynamicRule[];
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent?: Record<string, DynamicRule[]>;
  agents: AgentConfig[];
  primaryAgentId?: string | null;
  overviewFields: FieldSetting[];
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
}: UseTransactionWaterfallProps) {
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
    if (totCommSetting?.calculation_formula && totCommSetting.calculation_formula.trim().length > 0) {
      baselineTotalComm = evaluateFormula(totCommSetting.calculation_formula, currentContext);
    } else if (overviewFormValues?.total_commission !== undefined && overviewFormValues?.total_commission !== null && overviewFormValues?.total_commission !== '') {
      baselineTotalComm = Number(overviewFormValues.total_commission) || 0;
    } else if (selectedDeal?.total_commission !== undefined && selectedDeal?.total_commission !== null && selectedDeal?.total_commission !== '') {
      baselineTotalComm = Number(selectedDeal.total_commission) || 0;
    } else {
      baselineTotalComm = grossComm;
    }

    if (isNaN(baselineTotalComm) || baselineTotalComm <= 0) {
      baselineTotalComm = grossComm;
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
      displayPostSplitRulesByAgent: level1Rules,
      displayPostSplit2RulesByAgent: level2Rules,
    };
}

export function useTransactionWaterfall(props: UseTransactionWaterfallProps) {
  return useMemo(() => computeTransactionWaterfall(props), [
    props.salesPrice,
    props.gciPerc,
    props.offTheTopRules,
    props.preSplitRules,
    props.postSplitRulesByAgent,
    props.postSplit2RulesByAgent,
    props.agents,
    props.primaryAgentId,
    props.overviewFields,
    props.selectedDeal,
    props.overviewFormValues,
    props.clientType,
    props.allocation,
    props.templateReplay,
  ]);
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
  allocation.teamCaps.forEach((cap) => {
    const key = cap.key?.trim().toLowerCase();
    if (!key) return;
    const recipient = agents.find((agent) => agent.id === cap.recipientAgentId);
    const recipientKeys = [...new Set(
      [cap.recipientAgentId, recipient?.name, recipient?.name ? normalizeAgentName(recipient.name) : '']
        .map((name) => String(name || '').trim().toLowerCase())
        .filter(Boolean),
    )];
    credits[key] = { total: 0, byAgent: {}, recipientKeys };
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
      return { ...rule, type: fresh[index].type, value: fresh[index].value };
    });
    if (!capFormulasOnly) {
      fresh.forEach((item, index) => {
        if (!used.has(index)) merged.push(item);
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
  splits.forEach((item) => {
    const name = String(item.agentName || '').trim().toLowerCase();
    const normalized = normalizeAgentName(name).trim().toLowerCase();
    const nextAmount = dollars.get(name) ?? dollars.get(normalized);
    if (nextAmount == null || Math.abs(nextAmount - Number(item.amount || 0)) <= 0.009) return;
    item.grossAmount = item.amount;
    item.displayPercent = netToSplit > 0 ? roundPercentRate(nextAmount / netToSplit) : 0;
    item.capAdjusted = true;
    item.amount = nextAmount;
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
    const name = String(item.agentName || '').trim().toLowerCase();
    const normalized = normalizeAgentName(name).trim().toLowerCase();
    if (!name || replayedNames.has(name) || (normalized && replayedNames.has(normalized))) return;
    const keys = new Set([name, normalized, String(item.agentId || '').trim().toLowerCase()].filter(Boolean));
    const received = roundCurrency(Object.entries(credits).reduce((sum, [key, cap]) => {
      if (referencedTotals.has(key)) return sum;
      if (!(cap.recipientKeys || []).some((recipient) => keys.has(recipient))) return sum;
      return sum + cap.total;
    }, 0));
    if (received <= 0.009 || Math.abs(received - Number(item.amount || 0)) <= 0.009) return;
    item.grossAmount = item.amount;
    item.displayPercent = netToSplit > 0 ? roundPercentRate(received / netToSplit) : 0;
    item.capAdjusted = true;
    item.amount = received;
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
  replay: UseTransactionWaterfallProps['templateReplay'];
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
    return {
      level1: mergeTeamCapRules(level1, applied.postSplitRulesByAgent || {}, false),
      level2: mergeTeamCapRules(level2, applied.postSplit2RulesByAgent || {}, false),
    };
  } catch {
    return { level1, level2 };
  }
}