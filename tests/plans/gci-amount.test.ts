import { describe, expect, it } from 'vitest';
import { computeTransactionWaterfall } from '@/lib/commission-engine';

/** GCI % is stored to four decimals, so price × rate can miss the deal's own GCI amount by a few dollars. */
const run = (salesPrice: number, gciPerc: number, deal: Record<string, unknown>) =>
  computeTransactionWaterfall({
    salesPrice,
    gciPerc,
    offTheTopRules: [],
    postSplitRulesByAgent: {},
    agents: [],
    primaryAgentId: null,
    overviewFields: [],
    selectedDeal: deal,
    overviewFormValues: {},
    clientType: 'Buyer',
  } as unknown as Parameters<typeof computeTransactionWaterfall>[0]);

const deal = { sales_price: 220000, gci_perc: 0.0091, gci_amount: 2000, gci_type: 'PERCENTAGE' };

describe('GCI amount on a percentage deal', () => {
  it('keeps the stored GCI amount when the rounded rate explains it', () => {
    expect(run(220000, 0.0091, deal).grossCommission).toBe(2000);
  });

  it('recalculates when the sales price or rate is typed on the Overview', () => {
    expect(run(230000, 0.0091, deal).grossCommission).toBe(2093);
    expect(run(220000, 0.01, deal).grossCommission).toBe(2200);
  });

  it('recalculates when the stored amount is further off than the rate rounding allows', () => {
    expect(run(220000, 0.0091, { ...deal, gci_amount: 1500 }).grossCommission).toBe(2002);
  });
});
