// Helper function to prevent JavaScript floating-point errors (e.g. 2521.6400000000003 -> 2521.64)
const roundCurrency = (val: number): number => Math.round(val * 100) / 100;

export interface WaterfallParameters {
  salesPrice: number;
  gciPerc: number;
  referralPerc?: number;
  riskMgmtFee?: number;
  brokerReviewFee?: number;
  tcFee?: number;
  tcResponsibility?: 'SHARED_PERCENT' | 'AGENT_1_ONLY' | 'HOUSE_ONLY';
  agent1SplitPerc: number;
  agent2SplitPerc?: number;
}

export interface AgentCapState {
  agentId: string;
  agentName: string;
  brokerCapLimit: number;
  brokerCapPaidYTD: number;
  brokerCapRate?: number; // e.g. 0.20 for 20% broker split up to cap
  riskMgmtCapLimit: number;
  riskMgmtPaidYTD: number;
  stockDeductionPerc?: number; // e.g. 0.05 for 5% stock purchase
}

export interface LineItemResult {
  section: 'OFF_THE_TOP' | 'AGENT_SPLIT' | 'POST_SPLIT';
  entity: string;
  ruleName: string;
  percent?: number;
  amount: number;
  agentName?: string;
}

export interface DisbursementSummary {
  grossCommission: number;
  unallocatedCommission: number;
  lineItems: LineItemResult[];
  netPayouts: { [agentOrEntity: string]: number };
  status: 'PASS' | 'FAIL_BALANCING_ERROR';
}

export class CommissionEngine {
  public static calculateWaterfall(
    params: WaterfallParameters,
    agent1Caps: AgentCapState,
    agent2Caps?: AgentCapState
  ): DisbursementSummary {
    const lineItems: LineItemResult[] = [];
    const netPayouts: { [key: string]: number } = {};

    // 1. Gross Commission Income (GCI)
    const gci = roundCurrency(params.salesPrice * params.gciPerc);
    let unallocated = gci;

    // 2. Off-the-Top Deductions
    if (params.referralPerc && params.referralPerc > 0) {
      const referralAmount = roundCurrency(gci * params.referralPerc);
      unallocated -= referralAmount;
      lineItems.push({
        section: 'OFF_THE_TOP',
        entity: 'Outside Referral',
        ruleName: 'Referral Fee',
        percent: params.referralPerc,
        amount: referralAmount,
      });
      netPayouts['Outside Referral'] = referralAmount;
    }

    // 3. Primary Splits
    const commAfterOffTop = unallocated;
    const a1GrossSplit = roundCurrency(commAfterOffTop * params.agent1SplitPerc);
    
    // 💡 Declare a2GrossSplit outside the if block so it's accessible below
    let a2GrossSplit = 0; 

    lineItems.push({
      section: 'AGENT_SPLIT',
      entity: agent1Caps.agentName,
      ruleName: 'Primary Agent Split',
      percent: params.agent1SplitPerc,
      amount: a1GrossSplit,
      agentName: agent1Caps.agentName,
    });

    let a1Net = a1GrossSplit;
    let a2Net = 0;

    if (params.agent2SplitPerc && params.agent2SplitPerc > 0 && agent2Caps) {
      a2GrossSplit = roundCurrency(commAfterOffTop * params.agent2SplitPerc);
      lineItems.push({
        section: 'AGENT_SPLIT',
        entity: agent2Caps.agentName,
        ruleName: 'Secondary Agent Split',
        percent: params.agent2SplitPerc,
        amount: a2GrossSplit,
        agentName: agent2Caps.agentName,
      });
      a2Net = a2GrossSplit;
    }

    // 4. Post-Split Waterfall Helper
    const processAgentPostSplits = (grossSplit: number, agentCaps: AgentCapState, splitPerc: number) => {
      let net = grossSplit;

      // Broker Cap
      const capRate = agentCaps.brokerCapRate || (1 - splitPerc);
      const remainingCap = Math.max(0, agentCaps.brokerCapLimit - agentCaps.brokerCapPaidYTD);
      const standardBrokerShare = roundCurrency(grossSplit * capRate);
      const actualBrokerDeduction = roundCurrency(Math.min(standardBrokerShare, remainingCap));

      if (actualBrokerDeduction > 0) {
        net -= actualBrokerDeduction;
        lineItems.push({
          section: 'POST_SPLIT',
          entity: 'Broker',
          ruleName: 'Broker Contribution',
          amount: actualBrokerDeduction,
          agentName: agentCaps.agentName,
        });
        netPayouts['Broker Share'] = roundCurrency((netPayouts['Broker Share'] || 0) + actualBrokerDeduction);
      }

      // Risk Management Fee
      if (params.riskMgmtFee && params.riskMgmtFee > 0) {
        const remainingRmCap = Math.max(0, agentCaps.riskMgmtCapLimit - agentCaps.riskMgmtPaidYTD);
        const actualRmDeduction = roundCurrency(Math.min(params.riskMgmtFee, remainingRmCap));

        if (actualRmDeduction > 0) {
          net -= actualRmDeduction;
          lineItems.push({
            section: 'POST_SPLIT',
            entity: 'Risk Management',
            ruleName: 'Risk Mgmt Fee',
            amount: actualRmDeduction,
            agentName: agentCaps.agentName,
          });
          netPayouts['Risk Management'] = roundCurrency((netPayouts['Risk Management'] || 0) + actualRmDeduction);
        }
      }

      // Broker Review Fee
      if (params.brokerReviewFee && params.brokerReviewFee > 0) {
        net -= params.brokerReviewFee;
        lineItems.push({
          section: 'POST_SPLIT',
          entity: 'Broker Review',
          ruleName: 'Broker Review Fee',
          amount: params.brokerReviewFee,
          agentName: agentCaps.agentName,
        });
        netPayouts['Broker Review'] = roundCurrency((netPayouts['Broker Review'] || 0) + params.brokerReviewFee);
      }

      // Stock Plan Deductions
      if (agentCaps.stockDeductionPerc && agentCaps.stockDeductionPerc > 0) {
        const stockDeduction = roundCurrency(net * agentCaps.stockDeductionPerc);
        net -= stockDeduction;
        lineItems.push({
          section: 'POST_SPLIT',
          entity: 'Stock Program',
          ruleName: 'Equity Purchase',
          percent: agentCaps.stockDeductionPerc,
          amount: stockDeduction,
          agentName: agentCaps.agentName,
        });
        netPayouts['Stock Program'] = roundCurrency((netPayouts['Stock Program'] || 0) + stockDeduction);
      }

      // TC Fee Allocation
      if (params.tcFee && params.tcFee > 0) {
        let agentTcFee = 0;
        if (params.tcResponsibility === 'SHARED_PERCENT') {
          agentTcFee = roundCurrency(params.tcFee * splitPerc);
        } else if (params.tcResponsibility === 'AGENT_1_ONLY' && agentCaps.agentId === agent1Caps.agentId) {
          agentTcFee = params.tcFee;
        }

        if (agentTcFee > 0) {
          net -= agentTcFee;
          lineItems.push({
            section: 'POST_SPLIT',
            entity: 'Transaction Coordinator',
            ruleName: 'TC Fee',
            amount: agentTcFee,
            agentName: agentCaps.agentName,
          });
          netPayouts['TC Services'] = roundCurrency((netPayouts['TC Services'] || 0) + agentTcFee);
        }
      }

      return roundCurrency(net);
    };

    // Run Post Splits
    a1Net = processAgentPostSplits(a1GrossSplit, agent1Caps, params.agent1SplitPerc);
    if (params.agent2SplitPerc && agent2Caps) {
      a2Net = processAgentPostSplits(a2GrossSplit, agent2Caps, params.agent2SplitPerc);
    }

    // Final Net Payouts
    netPayouts[agent1Caps.agentName] = a1Net;
    if (agent2Caps) {
      netPayouts[agent2Caps.agentName] = a2Net;
    }

    // Balancing Check
    const totalOutflow = roundCurrency(Object.values(netPayouts).reduce((sum, val) => sum + val, 0));
    const isBalanced = Math.abs(gci - totalOutflow) < 0.01;

    return {
      grossCommission: gci,
      unallocatedCommission: 0,
      lineItems,
      netPayouts,
      status: isBalanced ? 'PASS' : 'FAIL_BALANCING_ERROR',
    };
  }
}