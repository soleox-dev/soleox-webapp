import { describe, expect, it } from 'vitest';
import { loadPlanPresets, planCapCells, planCapMismatches, proposePlanFor, type AgentCapSource, type PlanDealResult } from '@/lib/commission-engine';

const presets = loadPlanPresets();
// Demo's agent caps: the entity each tracks and the agent field with the amount.
const sources: AgentCapSource[] = [
  { name: 'Broker Cap', entityName: 'Broker Cap', fieldKey: 'broker_cap' },
  { name: 'Flat Cap Fee Cap', entityName: 'Flat Cap Fee', fieldKey: 'fee_cap' },
  { name: 'Risk Mgmt Cap', entityName: 'Risk Mgmt', fieldKey: 'risk_cap' },
];
// The presets pay generic names; a client's copy pays its own entities.
const asClient = (key: string) => ({
  ...presets[key],
  lines: presets[key].lines.map((line) => ({
    ...line,
    payee: line.key === 'company_dollar' ? 'Broker Cap' : line.key === 'post_cap_fee' ? 'Flat Cap Fee' : line.key === 'risk_management' ? 'Risk Mgmt' : line.payee,
  })),
});
const candidates = ['exp-4000', 'exp-8000', 'exp-16000', 'exp-16000-team-lead'].map((key) => ({ value: key, plan: asClient(key), own: true }));
const agent = (values: Record<string, unknown>) => (key: string) => values[key];

describe('plan caps against the agent record', () => {
  it('proposes the plan every agent cap agrees with', () => {
    expect(proposePlanFor(candidates, agent({ broker_cap: 8000, fee_cap: 5000, risk_cap: 750 }), sources)).toBe('exp-8000');
    expect(proposePlanFor(candidates, agent({ broker_cap: '16,000', fee_cap: 5000, risk_cap: 750 }), sources)).toBe('exp-16000');
    // No $250 tier for a team lead: a zero fee cap picks the plan without tiers.
    expect(proposePlanFor(candidates, agent({ broker_cap: 16000, fee_cap: 0, risk_cap: 750 }), sources)).toBe('exp-16000-team-lead');
    expect(proposePlanFor(candidates, agent({ broker_cap: 12000 }), sources)).toBe('');
    expect(proposePlanFor(candidates, agent({}), sources)).toBe('');
  });

  it('names each line whose cap differs, skipping lines Plan Settings reads from the agent', () => {
    const laura = agent({ broker_cap: 8000, fee_cap: 5000, risk_cap: 750 });
    expect(planCapMismatches(asClient('exp-16000'), laura, sources).mismatches).toEqual([
      { lineKey: 'company_dollar', lineName: presets['exp-16000'].lines[0].name, capName: 'Broker Cap', fieldKey: 'broker_cap', planCap: 16000, agentCap: 8000 },
    ]);
    expect(planCapMismatches(asClient('exp-16000'), laura, sources, new Set(['company_dollar'])).mismatches).toEqual([]);
    expect(planCapMismatches(asClient('exp-4000'), laura, sources).mismatches.map((item) => item.lineKey)).toEqual(['company_dollar', 'post_cap_fee']);
  });
});

describe('plan cap bars on the deal', () => {
  it('uses the plan cap (or the agent override) and the year-to-date the engine counted', () => {
    const plan = asClient('exp-8000');
    const results = {
      agents: [{
        agentId: 'AGT_L',
        lines: [
          { key: 'company_dollar', payee: 'Broker Cap', ytdBefore: 10144.96 },
          { key: 'post_cap_fee', payee: 'Flat Cap Fee', ytdBefore: 1901.96 },
          { key: 'broker_review', payee: plan.lines.find((line) => line.key === 'broker_review')!.payee, ytdBefore: 0 },
        ],
      }],
    } as unknown as PlanDealResult;
    expect(planCapCells(results, { AGT_L: { plan } })).toEqual({
      AGT_L: {
        'broker cap': { capAmount: 8000, prior: 10144.96 },
        'flat cap fee': { capAmount: 5000, prior: 1901.96 },
        [plan.lines.find((line) => line.key === 'broker_review')!.payee.toLowerCase()]: { capAmount: null, prior: 0 },
      },
    });
    expect(planCapCells(results, { AGT_L: { plan, capAmounts: { company_dollar: 16000 } } }).AGT_L['broker cap']).toEqual({ capAmount: 16000, prior: 10144.96 });
  });
});
