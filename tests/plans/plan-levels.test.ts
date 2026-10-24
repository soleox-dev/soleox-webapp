import { describe, expect, it } from 'vitest';
import {
  agentLineStage,
  computePlanDeal,
  loadPlanPresets,
  planLineLevel,
  type CommissionPlan,
  type PercentOfNetLine,
  type PlanDealInput,
} from '@/lib/commission-engine';

/** Plan levels and agent stages (docs/commission-model-redesign.md, sections 3 and 5). */
const presets = loadPlanPresets();
const exp16000 = presets['exp-16000'];

const deal = (plan: CommissionPlan): PlanDealInput => ({
  id: 'TXN_LEVELS',
  gci: 20000,
  capDate: '2026-06-15',
  agents: [{ id: 'a', name: 'A', splitPercent: 100, plan, capYearStart: '2026-01-01', optedIn: ['stock'] }],
});

describe('plan line levels', () => {
  it("eXp's stock (5% of the net after every earlier line) is Level 2; the rest is Level 1", () => {
    expect(exp16000.lines.map((line) => [line.key, planLineLevel(line, exp16000.lines)])).toEqual([
      ['company_dollar', 1],
      ['post_cap_fee', 1],
      ['risk_management', 1],
      ['broker_review', 1],
      ['stock', 2],
    ]);
    const result = computePlanDeal(deal(exp16000), []);
    expect(result.agents[0].lines.find((line) => line.key === 'stock')?.level).toBe(2);
  });

  it('a Level 2 percent-of-net line without its own list takes the net after every Level 1 line', () => {
    const levelled: CommissionPlan = {
      ...exp16000,
      lines: exp16000.lines.map((line) => (line.key === 'stock' ? { ...(line as PercentOfNetLine), after: [], level: 2 } : line)),
    };
    const listed = computePlanDeal(deal(exp16000), []).agents[0].lines;
    const byLevel = computePlanDeal(deal(levelled), []).agents[0].lines;
    expect(byLevel.map((line) => line.amount)).toEqual(listed.map((line) => line.amount));
    expect(byLevel.find((line) => line.key === 'stock')?.amount).toBeGreaterThan(0);
  });

  it('an explicit level wins over the derived one', () => {
    const line: PercentOfNetLine = { key: 'bonus_pool', name: 'Bonus Pool', payee: 'Pool', type: 'percent_of_net', rate: 0.01, after: [], level: 3 };
    expect(planLineLevel(line, [...exp16000.lines, line])).toBe(3);
  });
});

describe('agent stages', () => {
  const rule = (extra: object) => ({ id: 'r', entity: 'E', type: 'AMOUNT' as const, value: 1, ...extra });
  it('on a plan: credits before the plan, plan lines in it, everything else after it', () => {
    expect(agentLineStage(rule({ beforePlan: true }), true)).toBe('BEFORE_PLAN');
    expect(agentLineStage(rule({ planLineKey: 'company_dollar' }), true)).toBe('PLAN');
    expect(agentLineStage(rule({}), true)).toBe('AFTER_PLAN');
  });
  it('without a plan every line is Before Plan (Post-Splits), and a rule\'s own stage always wins', () => {
    expect(agentLineStage(rule({}), false)).toBe('BEFORE_PLAN');
    expect(agentLineStage(rule({ stage: 'AFTER_PLAN' }), false)).toBe('AFTER_PLAN');
  });
});

describe('Applies When', () => {
  const lease = (side: string): PlanDealInput => ({
    ...deal(withLeaseRule(exp16000)),
    fields: { transaction_side: side },
  });
  function withLeaseRule(plan: CommissionPlan): CommissionPlan {
    return {
      ...plan,
      lines: plan.lines.map((line) => (line.key === 'broker_review' ? { ...line, appliesWhen: 'AND(transaction_side <> "Tenant", transaction_side <> "Landlord")' } : line)),
    };
  }
  const brokerReview = (input: PlanDealInput) => computePlanDeal(input, []).agents[0].lines.find((line) => line.key === 'broker_review')!;

  it('charges the line when the condition is true', () => {
    const line = brokerReview(lease('Buyer'));
    expect(line.amount).toBe(25);
    expect(line.notApplied).toBeUndefined();
  });

  it('makes the line $0 when the condition is false, keeping the calculated amount and saying why', () => {
    const line = brokerReview(lease('Tenant'));
    expect(line.amount).toBe(0);
    expect(line.calculated).toBe(25);
    expect(line.notApplied).toBe(true);
    expect(line.explanation).toContain('does not apply to this deal');
  });

  it('a typed amount still wins over Applies When', () => {
    const input = lease('Tenant');
    input.agents[0] = { ...input.agents[0], overrides: { broker_review: 10 } };
    expect(brokerReview(input).amount).toBe(10);
  });
});
