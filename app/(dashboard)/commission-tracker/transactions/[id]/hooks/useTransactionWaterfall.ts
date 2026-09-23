import { useMemo } from 'react';
import {
  AgentConfig,
  DynamicRule,
  FieldSetting,
  roundCurrency,
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
  overviewFields: FieldSetting[];
  selectedDeal: any;
  overviewFormValues: Record<string, any>;
  clientType: string;
}

export function useTransactionWaterfall({
  salesPrice,
  gciPerc,
  offTheTopRules,
  preSplitRules = [],
  postSplitRulesByAgent,
  postSplit2RulesByAgent = {},
  agents,
  overviewFields,
  selectedDeal,
  overviewFormValues,
  clientType,
}: UseTransactionWaterfallProps) {
  return useMemo(() => {
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
      const rate = r.value > 1 ? r.value / 100 : r.value;
      const amt = r.type === 'PERCENT' ? roundCurrency(baselineTotalComm * rate) : roundCurrency(r.value);
      return { ...r, amount: amt };
    });

    const totalOffTop = offTopCalculated.reduce((sum, r) => sum + r.amount, 0);
    const netOffTopComm = roundCurrency(baselineTotalComm - totalOffTop);

    // 2. Pre-Split Deductions (after Off-The-Top, before Agent Splits)
    const preSplitCalculated = preSplitRules.map((r) => {
      const rate = r.value > 1 ? r.value / 100 : r.value;
      const amt = r.type === 'PERCENT' ? roundCurrency(netOffTopComm * rate) : roundCurrency(r.value);
      return { ...r, amount: amt };
    });

    const totalPreSplit = preSplitCalculated.reduce((sum, r) => sum + r.amount, 0);
    const netToSplit = roundCurrency(Math.max(0, netOffTopComm - totalPreSplit));

    // 3. Agent Splits (from Net Commission after Pre-Splits)
    let totalSecondarySplitDollars = 0;
    const splitCalculated: any[] = [];

    agents.forEach((ag, idx) => {
      if (idx === 0) return;

      let dollarAmt = 0;
      let effectivePerc = 0;

      if (ag.splitType === 'PERCENT') {
        const rate = ag.splitVal > 1 ? ag.splitVal / 100 : ag.splitVal;
        const cleanRate = Number(rate.toFixed(4));
        dollarAmt = roundCurrency(netToSplit * cleanRate);
        effectivePerc = cleanRate;
      } else {
        dollarAmt = roundCurrency(ag.splitVal);
        effectivePerc = netToSplit > 0 ? Number((dollarAmt / netToSplit).toFixed(4)) : 0;
      }

      totalSecondarySplitDollars += dollarAmt;

      splitCalculated.push({
        agentId: ag.id,
        agentName: ag.name,
        splitType: ag.splitType,
        splitVal: ag.splitVal,
        percent: effectivePerc,
        amount: dollarAmt,
        isPrimary: false,
      });
    });

    const primaryDollarAmt = roundCurrency(Math.max(0, netToSplit - totalSecondarySplitDollars));
    const allSecondaryArePercent = agents.slice(1).every((a) => a.splitType === 'PERCENT');
    const totalSecondaryPercent = splitCalculated.reduce((sum, s) => sum + (s.splitType === 'PERCENT' ? s.percent : 0), 0);
    const primaryEffectivePerc = allSecondaryArePercent && agents.length > 1
      ? Math.max(0, Number((1 - totalSecondaryPercent).toFixed(4)))
      : (netToSplit > 0 ? Number((primaryDollarAmt / netToSplit).toFixed(4)) : 0);

    if (agents.length > 0) {
      splitCalculated.unshift({
        agentId: agents[0].id,
        agentName: agents[0].name,
        splitType: agents[0].splitType || 'PERCENT',
        splitVal: primaryEffectivePerc,
        percent: primaryEffectivePerc,
        amount: primaryDollarAmt,
        isPrimary: true,
      });
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
        const rate = r.value > 1 ? r.value / 100 : r.value;
        const amt = r.type === 'PERCENT' ? roundCurrency(agSplitAmt * rate) : roundCurrency(r.value);
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
        const rate2 = r2.value > 1 ? r2.value / 100 : r2.value;
        const amt2 = r2.type === 'PERCENT' ? roundCurrency(netAfterLevel1 * rate2) : roundCurrency(r2.value);
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
      status: 'CALCULATED_OK',
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
  }, [salesPrice, gciPerc, offTheTopRules, preSplitRules, postSplitRulesByAgent, postSplit2RulesByAgent, agents, overviewFields, selectedDeal, overviewFormValues, clientType]);
}