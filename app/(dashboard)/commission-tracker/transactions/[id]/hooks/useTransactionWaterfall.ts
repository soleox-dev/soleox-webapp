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

    const postSplitCalculated: any[] = [];
    const postSplit2Calculated: any[] = [];
    const agentNetAfterLevel1: Record<string, number> = {};
    const netPayouts: Record<string, number> = {};

    agents.forEach((ag) => {
      const agSplitItem = splitCalculated.find((s) => s.agentId === ag.id);
      const agSplitAmt = agSplitItem ? agSplitItem.amount : 0;
      let agDeductions = 0;

      // 1. Level 1 Post-Split Deductions (from Agent Gross Split)
      const agentRules =
        postSplitRulesByAgent[ag.name] ||
        postSplitRulesByAgent[normalizeAgentName(ag.name)] ||
        Object.entries(postSplitRulesByAgent).find(
          ([k]) => normalizeAgentName(k).toLowerCase() === normalizeAgentName(ag.name).toLowerCase()
        )?.[1] ||
        [];
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
      const agentLevel2Rules =
        postSplit2RulesByAgent[ag.name] ||
        postSplit2RulesByAgent[normalizeAgentName(ag.name)] ||
        Object.entries(postSplit2RulesByAgent).find(
          ([k]) => normalizeAgentName(k).toLowerCase() === normalizeAgentName(ag.name).toLowerCase()
        )?.[1] ||
        [];

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

    return {
      grossCommission: grossComm,
      totalCommission: baselineTotalComm,
      offTheTopItems: offTopCalculated,
      commissionAfterOffTop: netOffTopComm,
      preSplitItems: preSplitCalculated,
      commissionAfterPreSplit: netToSplit,
      agentSplitItems: splitCalculated,
      postSplitItems: postSplitCalculated,
      postSplit2Items: postSplit2Calculated,
      agentNetAfterLevel1,
      netPayouts,
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
  ]);
}