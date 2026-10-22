import { describe, expect, it } from 'vitest';
import {
  capDateOf,
  computePlanDeal,
  computePlanDealsInOrder,
  loadPlanPresets,
  roundHalfUpCents,
  validatePlan,
  type CommissionPlan,
  type FormulaPlanLine,
  type PlanAgentInput,
  type PlanAgentResult,
  type OffTheTopItem,
  type PlanDealInput,
  type PlanDealResult,
  type PlanLine,
} from '@/lib/commission-engine';

/**
 * Commission Plans acceptance tests (design: Commission Plans, phase 1). Every number must match to the cent.
 * Test 1 is a real eXp statement; the others cover the rules the design lists.
 */
const presets = loadPlanPresets();
const exp4000 = presets['exp-4000'];
const exp8000 = presets['exp-8000'];
const exp16000 = presets['exp-16000'];
const teamLead = presets['exp-16000-team-lead'];

const line = (agent: PlanAgentResult, key: string) => {
  const found = agent.lines.find((item) => item.key === key);
  if (!found) throw new Error(`${agent.name} has no ${key} line`);
  return found;
};
const amounts = (agents: PlanAgentResult[], key: string) => agents.map((agent) => (agent.lines.length ? line(agent, key).amount : 0));
const byName = (agents: PlanAgentResult[], name: string) => agents.find((agent) => agent.name === name)!;

const YEAR = '2026-01-01';
const agent = (input: Partial<PlanAgentInput> & Pick<PlanAgentInput, 'id' | 'plan' | 'splitPercent'>): PlanAgentInput => ({
  name: input.id,
  capYearStart: YEAR,
  ...input,
});
/** Puts an agent `left` dollars from their company dollar cap in the deal's cap year. */
const leftToCap = (plan: CommissionPlan, left: number, extra: Record<string, number> = {}) => ({
  capYearOf: YEAR,
  amounts: { company_dollar: (plan.lines[0] as { capAmount: number }).capAmount - left, ...extra },
});

describe('the verified eXp deal', () => {
  const deal: PlanDealInput = {
    id: 'TXN_VERIFIED',
    gci: 30900,
    capDate: '2026-06-15',
    bonuses: [{ fromAgentId: 'patrick', toAgentId: 'winston', amount: 86.25 }],
    agents: [
      agent({ id: 'winston', name: 'Winston', splitPercent: 85, plan: exp4000, startingBalances: leftToCap(exp4000, 3255), afterPlan: [{ name: 'TC fee', amount: 300, payee: 'TC' }] }),
      agent({ id: 'skylar', name: 'Skylar', splitPercent: 1.5, plan: exp4000, startingBalances: leftToCap(exp4000, 0) }),
      agent({ id: 'kyle', name: 'Kyle', splitPercent: 0.75, plan: exp4000, startingBalances: leftToCap(exp4000, 100) }),
      agent({ id: 'patrick', name: 'Patrick', splitPercent: 12.75, plan: teamLead, roles: ['team_lead'], optedIn: ['stock'], startingBalances: leftToCap(teamLead, 1000) }),
    ],
  };
  const result = computePlanDeal(deal);
  const agents = result.agents;

  it('sides after the concession', () => {
    expect(agents.map((item) => item.sideAfterBonuses)).toEqual([26351.25, 463.5, 231.75, 3853.5]);
  });

  it('company dollar and post-cap fraction', () => {
    expect(amounts(agents, 'company_dollar')).toEqual([3255, 0, 46.35, 770.7]);
    const fractions = agents.map((item) => Number((line(item, 'company_dollar').postCapFraction! * 100).toFixed(2)));
    expect(fractions).toEqual([38.24, 100, 0, 0]);
    expect(line(agents[0], 'company_dollar').explanation).toContain('$3,255.00 left of the $4,000.00 cap');
  });

  it('fees shared by the original split %', () => {
    expect(amounts(agents, 'post_cap_fee')).toEqual([24.38, 1.13, 0, 0]);
    expect(amounts(agents, 'risk_management')).toEqual([51, 0.9, 0.45, 7.65]);
    expect(amounts(agents, 'broker_review')).toEqual([21.25, 0.38, 0.19, 3.19]);
  });

  it('stock on the side after the eXp lines', () => {
    expect(amounts(agents, 'stock')).toEqual([0, 0, 0, 153.6]);
    expect(line(byName(agents, 'Patrick'), 'stock').explanation).toContain('5% of $3,071.96');
  });

  it('net cash and payee totals add up to GCI', () => {
    expect(agents.map((item) => item.netCash)).toEqual([22699.62, 461.09, 184.76, 2918.36]);
    expect(result.payeeTotals).toEqual({ eXp: 4182.57, 'eXp Stock': 153.6, TC: 300 });
    expect(result.accountedFor).toBe(30900);
  });
});

/** One agent with a 50% split whose company dollar leaves a post-cap fraction of 86.67%. */
function blendedDeal(plan: CommissionPlan, postCapFeesPaid: number, roles?: string[]): PlanDealInput {
  return {
    id: 'TXN_BLEND',
    gci: 10000,
    capDate: '2026-06-15',
    agents: [agent({ id: 'a', splitPercent: 50, plan, roles, startingBalances: leftToCap(plan, 133.3, { post_cap_fee: postCapFeesPaid }) })],
  };
}

describe('post-cap fee bucket', () => {
  it('blends the deal that finishes the $5,000 bucket', () => {
    const [a] = computePlanDeal(blendedDeal(exp8000, 4950)).agents;
    expect(line(a, 'company_dollar').postCapFraction).toBeCloseTo(0.8667, 10);
    expect(line(a, 'post_cap_fee').amount).toBe(67.5);
    expect(line(a, 'post_cap_fee').explanation).toContain('only $50.00 is left before $5,000.00');
  });

  it('charges $250 before the bucket and $75 after it', () => {
    expect(line(computePlanDeal(blendedDeal(exp16000, 0)).agents[0], 'post_cap_fee').amount).toBe(108.34);
    expect(line(computePlanDeal(blendedDeal(exp16000, 5000)).agents[0], 'post_cap_fee').amount).toBe(32.5);
  });

  it('Team Lead and $4,000 plans skip the bucket', () => {
    expect(line(computePlanDeal(blendedDeal(teamLead, 0)).agents[0], 'post_cap_fee').amount).toBe(32.5);
    expect(line(computePlanDeal(blendedDeal(exp4000, 0)).agents[0], 'post_cap_fee').amount).toBe(32.5);
  });

  it('the plan decides, not the role: a team lead on the $16,000 plan pays the $250 tier', () => {
    expect(line(computePlanDeal(blendedDeal(exp16000, 0, ['team_lead'])).agents[0], 'post_cap_fee').amount).toBe(108.34);
  });

  it('a plan can still let chosen roles skip its tiers', () => {
    const fee = exp16000.lines[1] as Extract<PlanLine, { type: 'per_deal_fee' }>;
    const skipping: CommissionPlan = { ...exp16000, lines: [exp16000.lines[0], { ...fee, skipTiersForRoles: ['team_lead'] }] };
    expect(line(computePlanDeal(blendedDeal(skipping, 0, ['team_lead'])).agents[0], 'post_cap_fee').amount).toBe(32.5);
    expect(line(computePlanDeal(blendedDeal(skipping, 0)).agents[0], 'post_cap_fee').amount).toBe(108.34);
  });
});

describe('post-cap fee limit', () => {
  it('is never more than 20% of the split: an agent alone on a $300 split pays $60, not $75', () => {
    const deal: PlanDealInput = {
      id: 'TXN_SMALL',
      gci: 300,
      capDate: '2026-06-15',
      agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000, startingBalances: leftToCap(exp4000, 0) })],
    };
    const fee = line(computePlanDeal(deal).agents[0], 'post_cap_fee');
    expect(fee.amount).toBe(60);
    expect(fee.explanation).toContain('more than 20% of the $300.00 split, so $60.00');
  });

  it('uses the split before bonuses; a 50% Fee Share brings the fee under the limit', () => {
    const deal: PlanDealInput = {
      id: 'TXN_SMALL_BONUS',
      gci: 300,
      capDate: '2026-06-15',
      bonuses: [{ fromAgentId: 'b', toAgentId: 'a', amount: 100 }],
      agents: [
        agent({ id: 'a', splitPercent: 50, plan: exp4000, startingBalances: leftToCap(exp4000, 0) }),
        agent({ id: 'b', splitPercent: 50, plan: exp4000, startingBalances: leftToCap(exp4000, 0) }),
      ],
    };
    // $75 × 50% = $37.50 each, but 20% of the $150 split before bonuses is $30.
    expect(computePlanDeal(deal).agents.map((item) => line(item, 'post_cap_fee').amount)).toEqual([30, 30]);
    expect(computePlanDeal({ ...deal, feeSharePercent: 50 }).agents.map((item) => line(item, 'post_cap_fee').amount)).toEqual([18.75, 18.75]);
  });
});

describe('waived lines', () => {
  it('a deal can waive broker review and risk management: $0, not typed, and not counted toward the year', () => {
    const base: PlanDealInput = {
      id: 'TXN_RENTAL',
      gci: 2000,
      capDate: '2026-03-01',
      waivedLines: ['broker_review', 'risk_management'],
      agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000 })],
    };
    const [a] = computePlanDeal(base).agents;
    expect([line(a, 'broker_review').amount, line(a, 'broker_review').calculated, line(a, 'broker_review').waived, line(a, 'broker_review').edited]).toEqual([0, 25, true, false]);
    expect(line(a, 'risk_management').explanation).toBe('Risk management: waived on this deal, so $0.00 (the plan calculates $60.00).');
    expect(line(a, 'company_dollar').amount).toBe(400);
    const next: PlanDealInput = { ...base, id: 'TXN_NEXT', capDate: '2026-04-01', waivedLines: undefined };
    const { results } = computePlanDealsInOrder([base, next]);
    expect(line(results.TXN_NEXT.agents[0], 'risk_management').ytdBefore).toBe(0);
  });

  it('a typed amount still wins over a waiver', () => {
    const deal: PlanDealInput = { id: 'TXN_W', gci: 2000, capDate: '2026-03-01', waivedLines: ['broker_review'], agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000, overrides: { broker_review: 12.5 } })] };
    expect(line(computePlanDeal(deal).agents[0], 'broker_review')).toMatchObject({ amount: 12.5, edited: true });
    expect(line(computePlanDeal(deal).agents[0], 'broker_review').waived).toBeUndefined();
  });
});

describe('risk management limit', () => {
  it('an agent at $749.99 pays $0.01', () => {
    const deal: PlanDealInput = {
      id: 'TXN_RISK',
      gci: 10000,
      capDate: '2026-06-15',
      agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000, startingBalances: { capYearOf: YEAR, amounts: { risk_management: 749.99 } } })],
    };
    const risk = line(computePlanDeal(deal).agents[0], 'risk_management');
    expect(risk.amount).toBe(0.01);
    expect(risk.explanation).toContain('Only $0.01 is left');
  });
});

describe('Fee Share', () => {
  const capped = (feeSharePercent: number): PlanDealInput => ({
    id: 'TXN_SHARE',
    gci: 10000,
    capDate: '2026-06-15',
    feeSharePercent,
    agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000, startingBalances: leftToCap(exp4000, 0) })],
  });

  it('50% on a double end booked as one transaction', () => {
    const [a] = computePlanDeal(capped(50)).agents;
    expect([line(a, 'company_dollar').amount, line(a, 'post_cap_fee').amount, line(a, 'risk_management').amount, line(a, 'broker_review').amount]).toEqual([0, 37.5, 30, 12.5]);
  });

  it('80% when an eXp agent outside the team gets a referral; company dollar is untouched', () => {
    const deal = capped(80);
    deal.agents[0].startingBalances = leftToCap(exp4000, 4000);
    const [a] = computePlanDeal(deal).agents;
    expect([line(a, 'company_dollar').amount, line(a, 'post_cap_fee').amount, line(a, 'risk_management').amount, line(a, 'broker_review').amount]).toEqual([2000, 0, 48, 20]);
  });
});

describe('year-to-date totals', () => {
  it('a typed fee counts as paid on the next deal', () => {
    const first: PlanDealInput = {
      id: 'TXN_1',
      gci: 10000,
      capDate: '2026-03-01',
      agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000, overrides: { risk_management: 700 } })],
    };
    const second: PlanDealInput = { ...first, id: 'TXN_2', capDate: '2026-04-01', agents: [{ ...first.agents[0], overrides: undefined }] };
    const { results } = computePlanDealsInOrder([second, first]);
    const typed = line(results.TXN_1.agents[0], 'risk_management');
    expect([typed.amount, typed.calculated, typed.edited]).toEqual([700, 60, true]);
    expect(line(results.TXN_2.agents[0], 'risk_management').amount).toBe(50);
    expect(line(results.TXN_2.agents[0], 'risk_management').ytdBefore).toBe(700);
  });

  it('orders deals by the Cap Date field, here a Payment Date', () => {
    const rows = [
      { id: 'TXN_A', closing_date: '2026-03-01', custom_attributes: { payment_date: '2026-05-01' } },
      { id: 'TXN_B', closing_date: '2026-04-01', custom_attributes: { payment_date: '2026-04-10' } },
    ];
    const run = (capDateField: string) =>
      computePlanDealsInOrder(
        rows.map((row) => ({
          id: row.id,
          gci: 4000,
          capDate: capDateOf(row, capDateField),
          agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000, startingBalances: leftToCap(exp4000, 1000) })],
        })),
      ).results;
    const byPayment = run('payment_date');
    expect([line(byPayment.TXN_A.agents[0], 'company_dollar').amount, line(byPayment.TXN_B.agents[0], 'company_dollar').amount]).toEqual([200, 800]);
    const byClosing = run('closing_date');
    expect([line(byClosing.TXN_A.agents[0], 'company_dollar').amount, line(byClosing.TXN_B.agents[0], 'company_dollar').amount]).toEqual([800, 200]);
  });

  it('deals with the same Cap Date count in save order', () => {
    const deal = (id: string, savedAt: string): PlanDealInput => ({
      id,
      gci: 4000,
      capDate: '2026-05-01',
      savedAt,
      agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000, startingBalances: leftToCap(exp4000, 1000) })],
    });
    const { results } = computePlanDealsInOrder([deal('TXN_LATE', '2026-05-02T10:00:00Z'), deal('TXN_EARLY', '2026-05-02T09:00:00Z')]);
    expect(line(results.TXN_EARLY.agents[0], 'company_dollar').amount).toBe(800);
    expect(line(results.TXN_LATE.agents[0], 'company_dollar').amount).toBe(200);
  });

  it('a starting balance stops counting at the next anniversary', () => {
    const deal = (capDate: string): PlanDealInput => ({
      id: `TXN_${capDate}`,
      gci: 10000,
      capDate,
      agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000, capYearStart: '2025-07-01', startingBalances: { capYearOf: '2025-09-01', amounts: { company_dollar: 4000 } } })],
    });
    const before = computePlanDeal(deal('2026-06-30')).agents[0];
    const after = computePlanDeal(deal('2026-07-01')).agents[0];
    expect(before.capYear).toEqual({ start: '2025-07-01', end: '2026-07-01' });
    expect(line(before, 'company_dollar').amount).toBe(0);
    expect(after.capYear).toEqual({ start: '2026-07-01', end: '2027-07-01' });
    expect(line(after, 'company_dollar').amount).toBe(2000);
  });

  it('an agent with no Cap Year Start gets a warning instead of a guessed cap year', () => {
    const result = computePlanDeal({
      id: 'TXN_NO_CAP_YEAR',
      gci: 10000,
      capDate: '2026-06-15',
      agents: [agent({ id: 'a', name: 'Avery', splitPercent: 50, plan: exp4000, capYearStart: null }), agent({ id: 'b', splitPercent: 50, plan: exp4000 })],
    });
    expect(result.complete).toBe(false);
    expect(result.warnings).toEqual([{ code: 'missing_cap_year_start', agentId: 'a', message: 'Enter Cap Year Start for Avery to calculate their eXp $4,000 plan.' }]);
    const [a, b] = result.agents;
    expect([a.capYear, a.lines.length, a.netCash]).toEqual([null, 0, 5000]);
    expect(line(b, 'company_dollar').amount).toBe(1000);
  });

  it('a plan with no yearly totals does not need Cap Year Start', () => {
    const plan: CommissionPlan = { id: 'review', name: 'Review only', lines: [exp4000.lines[3]] };
    const result = computePlanDeal({ id: 'TXN_REVIEW', gci: 10000, capDate: '2026-06-15', agents: [agent({ id: 'a', splitPercent: 100, plan, capYearStart: null })] });
    expect(result.complete).toBe(true);
    expect(line(result.agents[0], 'broker_review').amount).toBe(25);
  });

  it('recalculating a saved deal does not count itself', () => {
    const deal: PlanDealInput = { id: 'TXN_SELF', gci: 10000, capDate: '2026-05-01', savedAt: '2026-05-01T00:00:00Z', agents: [agent({ id: 'a', splitPercent: 100, plan: exp4000 })] };
    const { history } = computePlanDealsInOrder([deal]);
    expect(line(computePlanDeal(deal, history).agents[0], 'company_dollar').amount).toBe(2000);
  });
});

describe('typed lines', () => {
  const deal = (overrides: Record<string, number>): PlanDealInput => ({
    id: 'TXN_TYPED',
    gci: 30900,
    capDate: '2026-06-15',
    bonuses: [{ fromAgentId: 'b', toAgentId: 'w', amount: 86.25 }],
    agents: [
      agent({ id: 'w', splitPercent: 85, plan: exp4000, optedIn: ['stock'], startingBalances: leftToCap(exp4000, 3255), overrides }),
      agent({ id: 'b', splitPercent: 15, plan: exp16000 }),
    ],
  });

  it('a typed company dollar recalculates the post-cap fee and stock below it', () => {
    const [w] = computePlanDeal(deal({ company_dollar: 3000 })).agents;
    expect(line(w, 'company_dollar').calculated).toBe(3255);
    expect(line(w, 'company_dollar').postCapFraction).toBeCloseTo(1 - 3000 / 5270.25, 12);
    expect(line(w, 'post_cap_fee').amount).toBe(27.46);
    expect(line(w, 'stock').amount).toBe(1162.58);
  });

  it('a typed post-cap fee below it wins, and stock follows it', () => {
    const [w] = computePlanDeal(deal({ company_dollar: 3000, post_cap_fee: 20 })).agents;
    expect([line(w, 'post_cap_fee').amount, line(w, 'post_cap_fee').calculated, line(w, 'post_cap_fee').edited]).toEqual([20, 27.46, true]);
    expect(line(w, 'stock').amount).toBe(1162.95);
  });
});

describe('off the top', () => {
  it('a client credit paid by one agent reduces only that side before the 20%', () => {
    const deal: PlanDealInput = {
      id: 'TXN_CREDIT',
      gci: 10000,
      capDate: '2026-06-15',
      offTheTop: [{ name: 'Client credit', amount: 500, paidBy: ['a'] }],
      agents: [agent({ id: 'a', splitPercent: 50, plan: exp16000 }), agent({ id: 'b', splitPercent: 50, plan: exp16000 })],
    };
    const result = computePlanDeal(deal);
    expect(result.agents.map((item) => item.side)).toEqual([4500, 5000]);
    expect(amounts(result.agents, 'company_dollar')).toEqual([900, 1000]);
    expect(amounts(result.agents, 'risk_management')).toEqual([30, 30]);
    expect(result.accountedFor).toBe(10000);
  });

  const creditDeal = (credit: Partial<OffTheTopItem>): PlanDealInput => ({
    id: 'TXN_SHARED_CREDIT',
    gci: 10000,
    capDate: '2026-06-15',
    offTheTop: [{ name: 'Client credit', amount: 500, paidBy: ['a', 'b'], ...credit }],
    agents: [
      agent({ id: 'a', splitPercent: 60, plan: exp16000 }),
      agent({ id: 'b', splitPercent: 20, plan: exp16000 }),
      agent({ id: 'c', splitPercent: 20, plan: exp16000 }),
    ],
  });
  /** What each agent paid of the credit: their share of the $10,000 GCI less their side. */
  const credits = (result: PlanDealResult) => result.agents.map((item) => Math.round((item.splitPercent * 100 - item.side) * 100) / 100);

  it('a credit paid by several agents is shared by their split %, equally, or as typed', () => {
    expect(credits(computePlanDeal(creditDeal({})))).toEqual([375, 125, 0]);
    expect(credits(computePlanDeal(creditDeal({ shareBy: 'equal' })))).toEqual([250, 250, 0]);
    expect(credits(computePlanDeal(creditDeal({ shareBy: 'amounts', paidAmounts: { a: 450, b: 50 } })))).toEqual([450, 50, 0]);
  });

  it('a shared credit is paid in full: the rounding cent goes to the first payer', () => {
    const result = computePlanDeal(creditDeal({ amount: 100, paidBy: ['a', 'b', 'c'], shareBy: 'equal' }));
    expect(credits(result)).toEqual([33.34, 33.33, 33.33]);
    expect(result.accountedFor).toBe(10000);
  });

  it('typed amounts must add up to the credit', () => {
    expect(() => computePlanDeal(creditDeal({ shareBy: 'amounts', paidAmounts: { a: 400, b: 50 } }))).toThrow('add up to $450.00, not $500.00');
    expect(() => computePlanDeal(creditDeal({ shareBy: 'amounts', paidAmounts: { a: 500 } }))).toThrow('needs the amount b pays');
  });

  it('a referral shared by split % comes off GCI', () => {
    const deal: PlanDealInput = {
      id: 'TXN_REFERRAL',
      gci: 10000,
      capDate: '2026-06-15',
      offTheTop: [{ name: 'Referral', amount: 2500 }],
      agents: [agent({ id: 'a', splitPercent: 60, plan: exp16000 }), agent({ id: 'b', splitPercent: 40, plan: exp16000 })],
    };
    const result = computePlanDeal(deal);
    expect(result.agents.map((item) => item.side)).toEqual([4500, 3000]);
    expect(amounts(result.agents, 'company_dollar')).toEqual([900, 600]);
    expect(result.accountedFor).toBe(10000);
  });
});

describe('Formula line', () => {
  const plan: CommissionPlan = {
    id: 'custom',
    name: 'Custom',
    lines: [
      ...exp4000.lines.slice(0, 1),
      {
        key: 'team_fee',
        name: 'Team arrangement',
        type: 'formula',
        payee: 'Team',
        formula: 'IF(post_cap_fraction > 0, 100 * split_percent * fee_share, side_after_bonuses * 1%) + line_company_dollar * 0',
        yearlyLimit: 120,
      },
    ],
  };
  const deal = (left: number, paid = 0): PlanDealInput => ({
    id: 'TXN_FORMULA',
    gci: 10000,
    capDate: '2026-06-15',
    feeSharePercent: 50,
    agents: [agent({ id: 'a', splitPercent: 80, plan, startingBalances: { capYearOf: YEAR, amounts: { company_dollar: 4000 - left, team_fee: paid } } })],
  });

  it('reads the post-cap fraction, split %, Fee Share and side', () => {
    expect(line(computePlanDeal(deal(0)).agents[0], 'team_fee').amount).toBe(40);
    expect(line(computePlanDeal(deal(4000)).agents[0], 'team_fee').amount).toBe(80);
  });

  it('share_past_cap is the formula name; post_cap_fraction still works in saved formulas', () => {
    const named = (formula: string): CommissionPlan => ({ ...plan, lines: [plan.lines[0], { ...(plan.lines[1] as FormulaPlanLine), formula }] });
    const amount = (formula: string) => line(computePlanDeal({ ...deal(0), agents: [{ ...deal(0).agents[0], plan: named(formula) }] }).agents[0], 'team_fee').amount;
    expect(amount('100 * share_past_cap')).toBe(100);
    expect(amount('100 * post_cap_fraction')).toBe(100);
    expect(amount('100 * share_past_cap_company_dollar')).toBe(100);
    expect(validatePlan(named('100 * share_past_cap'))).toEqual([]);
  });

  it('keeps to its yearly limit', () => {
    expect(line(computePlanDeal(deal(4000, 100)).agents[0], 'team_fee').amount).toBe(20);
  });

  it('a formula that cannot be calculated stops the deal', () => {
    const broken: CommissionPlan = { ...plan, lines: [{ key: 'x', name: 'Broken', type: 'formula', payee: 'Team', formula: 'sid * 2' }] };
    expect(() => computePlanDeal({ ...deal(0), agents: [{ ...deal(0).agents[0], plan: broken }] })).toThrow('Broken could not be calculated');
  });
});

describe('rounding', () => {
  it('rounds half up to the cent despite binary noise', () => {
    expect(roundHalfUpCents(75 * 0.015)).toBe(1.13);
    expect(roundHalfUpCents(25 * 0.0075)).toBe(0.19);
    expect(roundHalfUpCents(1.005)).toBe(1.01);
    expect(roundHalfUpCents(2.344999)).toBe(2.34);
  });
});

describe('plan validation', () => {
  it('the four eXp presets are valid', () => {
    for (const plan of Object.values(presets)) expect(validatePlan(plan)).toEqual([]);
  });

  it('names each problem: keys, references to earlier lines, rates and formulas', () => {
    const plan: CommissionPlan = {
      id: 'bad',
      name: 'Bad',
      lines: [
        { key: 'fee', name: 'Fee', type: 'per_deal_fee', payee: 'eXp', amount: 75, multiplierFrom: 'company_dollar' },
        { key: 'company_dollar', name: 'Company dollar', type: 'capped_percent', payee: 'eXp', rate: 1.2, capAmount: 4000 },
        { key: 'fee', name: 'Fee again', type: 'per_deal_fee', payee: '', amount: 10 },
        { key: 'Stock X', name: 'Stock', type: 'percent_of_net', payee: 'eXp', rate: 0.05, after: ['later'] },
        { key: 'custom', name: 'Custom', type: 'formula', payee: 'Team', formula: 'line_custom + nope' },
      ],
    };
    expect(validatePlan(plan)).toEqual([
      'Fee: the share past the cap must come from a percentage-up-to-a-cap line above it.',
      'Company dollar: the rate must be between 0% and 100%.',
      'Fee again: the key fee is used by another line.',
      'Fee again needs a payee.',
      'Stock: the key must start with a letter and use only a-z, 0-9 and _.',
      'Stock: later must be lines above it.',
      expect.stringMatching(/^Custom: /),
    ]);
  });
});
