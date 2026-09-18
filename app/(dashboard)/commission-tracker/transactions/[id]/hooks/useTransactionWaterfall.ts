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
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
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
  postSplitRulesByAgent,
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
    const computedTotalComm = totCommSetting?.calculation_formula
      ? evaluateFormula(totCommSetting.calculation_formula, currentContext)
      : grossComm;

    const offTopCalculated = offTheTopRules.map((r) => {
      const amt = r.type === 'PERCENT' ? roundCurrency(grossComm * r.value) : r.value;
      return { ...r, amount: amt };
    });

    const totalOffTop = offTopCalculated.reduce((sum, r) => sum + r.amount, 0);
    const netOffTopComm = roundCurrency(grossComm - totalOffTop);

    let totalSecondarySplitDollars = 0;
    const splitCalculated: any[] = [];

    agents.forEach((ag, idx) => {
      if (idx === 0) return;

      let dollarAmt = 0;
      let effectivePerc = 0;

      if (ag.splitType === 'PERCENT') {
        dollarAmt = roundCurrency(netOffTopComm * ag.splitVal);
        effectivePerc = ag.splitVal;
      } else {
        dollarAmt = ag.splitVal;
        effectivePerc = netOffTopComm > 0 ? dollarAmt / netOffTopComm : 0;
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

    const primaryDollarAmt = roundCurrency(Math.max(0, netOffTopComm - totalSecondarySplitDollars));
    const primaryEffectivePerc = netOffTopComm > 0 ? primaryDollarAmt / netOffTopComm : 0;

    if (agents.length > 0) {
      splitCalculated.unshift({
        agentId: agents[0].id,
        agentName: agents[0].name,
        splitType: 'PERCENT',
        splitVal: primaryEffectivePerc,
        percent: primaryEffectivePerc,
        amount: primaryDollarAmt,
        isPrimary: true,
      });
    }

    const postSplitCalculated: any[] = [];
    const netPayouts: Record<string, number> = {};

    agents.forEach((ag) => {
      const agSplitItem = splitCalculated.find((s) => s.agentId === ag.id);
      const agSplitAmt = agSplitItem ? agSplitItem.amount : 0;
      let agDeductions = 0;

      const agentRules =
        postSplitRulesByAgent[ag.name] ||
        postSplitRulesByAgent[normalizeAgentName(ag.name)] ||
        Object.entries(postSplitRulesByAgent).find(
          ([k]) => normalizeAgentName(k).toLowerCase() === normalizeAgentName(ag.name).toLowerCase()
        )?.[1] ||
        [];
      agentRules.forEach((r) => {
        const amt = r.type === 'PERCENT' ? roundCurrency(agSplitAmt * r.value) : r.value;
        agDeductions += amt;

        postSplitCalculated.push({
          id: r.id,
          agentName: ag.name,
          entity: r.entity,
          ruleName: r.name,
          type: r.type,
          value: r.value,
          amount: amt,
        });
      });

      netPayouts[ag.name] = roundCurrency(Math.max(0, agSplitAmt - agDeductions));
    });

    offTopCalculated.forEach((r) => {
      netPayouts[r.entity] = roundCurrency((netPayouts[r.entity] || 0) + r.amount);
    });

    postSplitCalculated.forEach((r) => {
      netPayouts[r.entity] = roundCurrency((netPayouts[r.entity] || 0) + r.amount);
    });

    return {
      status: 'CALCULATED_OK',
      grossCommission: grossComm,
      totalCommission: computedTotalComm,
      offTheTopItems: offTopCalculated,
      agentSplitItems: splitCalculated,
      postSplitItems: postSplitCalculated,
      netPayouts,
    };
  }, [salesPrice, gciPerc, offTheTopRules, postSplitRulesByAgent, agents, overviewFields, selectedDeal, overviewFormValues, clientType]);
}