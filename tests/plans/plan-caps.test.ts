import { describe, expect, it } from 'vitest';
import { loadPlanPresets, planCapMismatches, proposePlanFor, type AgentCapSource } from '@/lib/commission-engine';

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
