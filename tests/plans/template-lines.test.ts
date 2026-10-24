import { describe, expect, it } from 'vitest';
import {
  applyTemplateLogic,
  computePlanDeal,
  loadPlanPresets,
  planSidesFromTemplate,
  type NamedParty,
  type TemplateLogicStep,
} from '@/lib/commission-engine';

/** Bonus and credit lines in templates (migration 066), and template splits feeding Commission Plans. */
const presets = loadPlanPresets();

const agents: NamedParty[] = [
  { id: 'AGT_W', name: 'Winston' },
  { id: 'AGT_S', name: 'Skylar' },
  { id: 'AGT_K', name: 'Kyle' },
  { id: 'AGT_P', name: 'Patrick', isTeamLead: true },
];
const entities: NamedParty[] = [
  { id: 'ENT_REF', name: 'Referral' },
  { id: 'ENT_CREDIT', name: 'Client Credit' },
];

let stepNumber = 0;
const step = (rule: Partial<TemplateLogicStep> & Pick<TemplateLogicStep, 'rule_name' | 'section'>): TemplateLogicStep => ({
  id: `CTR_${++stepNumber}`,
  step_number: stepNumber,
  rule_key: rule.rule_name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  split_type: 'AMOUNT',
  ...rule,
});

const splits = [
  step({ rule_name: 'Agent 1 Split', section: 'Agent Splits', agent_key: 'agent_1', calculation_formula: 'baseline * 85%', split_type: 'PERCENT' }),
  step({ rule_name: 'Agent 2 Split', section: 'Agent Splits', agent_key: 'agent_2', calculation_formula: 'baseline * 1.5%', split_type: 'PERCENT' }),
  step({ rule_name: 'Agent 3 Split', section: 'Agent Splits', agent_key: 'agent_3', calculation_formula: 'baseline * 0.75%', split_type: 'PERCENT' }),
  step({ rule_name: 'Team Lead Split', section: 'Agent Splits', agent_key: 'team_lead', calculation_formula: 'baseline - agent_1_split - agent_2_split - agent_3_split', split_type: 'PERCENT' }),
];
const bonus = step({ rule_name: 'Agent 1 Bonus', section: 'Agent Splits', rule_kind: 'BONUS', agent_key: 'agent_1', from_agent_key: 'team_lead', calculation_formula: 'a1_bonus' });

const run = (steps: TemplateLogicStep[], parameters: Record<string, string> = {}, gci = 30900) =>
  applyTemplateLogic({
    steps,
    parameters: { team_lead: 'AGT_P', a1_bonus: '86.25', ...parameters },
    deal: { id: 'TXN_TEST' },
    entities,
    rosterAgents: agents,
    dealAgents: agents.slice(0, 3),
    totalCommission: gci,
  });

const amounts = (applied: ReturnType<typeof run>) => Object.fromEntries((applied.agentSplits || []).map((split) => [split.name, split.amount]));

describe('bonus lines', () => {
  it('move dollars from one split to another after every split is worked out', () => {
    const applied = run([...splits, bonus]);
    expect(amounts(applied)).toEqual({ Winston: 26351.25, Skylar: 463.5, Kyle: 231.75, Patrick: 3853.5 });
    expect(applied.bonuses).toEqual([{ name: 'Agent 1 Bonus', from: 'Patrick', to: 'Winston', amount: 86.25 }]);
  });

  it('can sit before the splits it moves money between', () => {
    expect(amounts(run([{ ...bonus, step_number: 0 }, ...splits]))).toEqual({ Winston: 26351.25, Skylar: 463.5, Kyle: 231.75, Patrick: 3853.5 });
  });

  it('a $0 bonus does nothing, and a template without bonus lines returns no bonuses', () => {
    const applied = run([...splits, bonus], { a1_bonus: '0' });
    expect(amounts(applied).Winston).toBe(26265);
    expect(applied.bonuses).toBeUndefined();
  });

  it('needs the agent who pays it', () => {
    expect(() => run([...splits, { ...bonus, from_agent_key: 'agent_5' }])).toThrow('needs the agent who pays the bonus');
  });
});

describe('a remainder split rounded below zero', () => {
  // 75% and 25% of $737.50 both round up ($553.13 + $184.38), leaving the team lead's remainder at -$0.01.
  const roundedUp = [
    step({ rule_name: 'Agent 1 Split', section: 'Agent Splits', agent_key: 'agent_1', calculation_formula: 'baseline * 75%', split_type: 'PERCENT' }),
    step({ rule_name: 'Agent 2 Split', section: 'Agent Splits', agent_key: 'agent_2', calculation_formula: 'baseline * 25%', split_type: 'PERCENT' }),
    step({ rule_name: 'Agent 3 Split', section: 'Agent Splits', agent_key: 'agent_3', calculation_formula: 'baseline * 0%', split_type: 'PERCENT' }),
    step({ rule_name: 'Team Lead Split', section: 'Agent Splits', agent_key: 'team_lead', calculation_formula: 'baseline - agent_1_split - agent_2_split - agent_3_split', split_type: 'PERCENT' }),
  ];

  it('takes the cent off the largest split, so the remainder is $0.00 and the splits still add up', () => {
    const split = amounts(run(roundedUp, {}, 737.5));
    expect(split).toEqual({ Winston: 553.12, Skylar: 184.38 });
    expect(Object.values(split).reduce((sum, value) => sum + value, 0)).toBeCloseTo(737.5, 2);
  });

  it('leaves a real negative remainder alone', () => {
    const over = [{ ...roundedUp[0], calculation_formula: 'baseline * 80%' }, ...roundedUp.slice(1)];
    expect(amounts(run(over, {}, 737.5)).Patrick).toBe(-36.88);
  });
});

describe('credits paid by chosen agents', () => {
  const credit = (paidBy: string[], shareBy?: string) =>
    // Step 0: credits run before the agent splits, as Off-the-top and Pre-splits rules do.
    step({ rule_name: 'Client Credit', section: 'Pre-splits', payee_entity_id: 'ENT_CREDIT', calculation_formula: '500', paid_by_agent_keys: paidBy, paid_share_by: shareBy, step_number: 0 });

  it('come out of only those agents\' splits, before their post-splits, not off the top', () => {
    const applied = run([credit(['agent_1']), ...splits]);
    expect(applied.preSplitRules).toEqual([]);
    expect(amounts(applied).Winston).toBe(26265);
    expect(applied.postSplitRulesByAgent?.Winston?.[0]).toMatchObject({ name: 'Client Credit', entity: 'Client Credit', type: 'AMOUNT', value: 500 });
    expect(applied.agentCredits).toEqual([{ name: 'Client Credit', agentName: 'Winston', entity: 'Client Credit', amount: 500 }]);
  });

  it('are shared by the payers\' split % or equally, and paid in full', () => {
    const bySplit = run([credit(['agent_1', 'team_lead']), ...splits]).agentCredits!.map((item) => item.amount);
    // Winston 26,265.00 and Patrick's remainder 3,939.75.
    expect(bySplit).toEqual([434.78, 65.22]);
    const equal = run([credit(['agent_1', 'agent_2', 'agent_3'], 'equal'), ...splits], {}, 30900).agentCredits!.map((item) => item.amount);
    expect(equal).toEqual([166.66, 166.67, 166.67]);
  });

  it('a shared credit with no Paid By still comes off the top', () => {
    const applied = run([step({ rule_name: 'Credit', section: 'Off-the-top', payee_entity_id: 'ENT_CREDIT', calculation_formula: '900', step_number: 0 }), ...splits]);
    expect(applied.offTheTopRules?.[0]).toMatchObject({ entity: 'Client Credit', value: 900 });
    expect(amounts(applied).Winston).toBe(25500);
    expect(applied.agentCredits).toBeUndefined();
  });
});

describe('template splits feeding Commission Plans', () => {
  it('a slim template with one bonus line and the eXp plans reproduce the verified statement', () => {
    const applied = run([...splits, bonus]);
    const { splitPercent, sides } = planSidesFromTemplate(applied, 30900);
    expect(splitPercent.Winston).toBeCloseTo(85, 10);
    expect(splitPercent.Patrick).toBeCloseTo(12.75, 10);
    const left = (cap: number, remaining: number) => ({ capYearOf: '2026-01-01', amounts: { company_dollar: cap - remaining } });
    const plans: Record<string, { plan: string; left: number }> = {
      Winston: { plan: 'exp-4000', left: 3255 },
      Skylar: { plan: 'exp-4000', left: 0 },
      Kyle: { plan: 'exp-4000', left: 100 },
      Patrick: { plan: 'exp-16000-team-lead', left: 1000 },
    };
    const result = computePlanDeal({
      id: 'TXN_TEST',
      gci: 30900,
      capDate: '2026-06-15',
      sides,
      agents: Object.entries(plans).map(([name, { plan, left: remaining }]) => ({
        id: name,
        name,
        splitPercent: splitPercent[name],
        plan: presets[plan],
        roles: name === 'Patrick' ? ['team_lead'] : [],
        capYearStart: '2026-01-01',
        startingBalances: left(presets[plan].lines[0].type === 'capped_percent' ? (presets[plan].lines[0] as { capAmount: number }).capAmount : 0, remaining),
        optedIn: name === 'Patrick' ? ['stock'] : [],
        afterPlan: name === 'Winston' ? [{ name: 'TC fee', amount: 300, payee: 'TC' }] : [],
      })),
    });
    const line = (key: string) => result.agents.map((agent) => agent.lines.find((item) => item.key === key)?.amount);
    expect(line('company_dollar')).toEqual([3255, 0, 46.35, 770.7]);
    expect(line('post_cap_fee')).toEqual([24.38, 1.13, 0, 0]);
    expect(line('risk_management')).toEqual([51, 0.9, 0.45, 7.65]);
    expect(line('broker_review')).toEqual([21.25, 0.38, 0.19, 3.19]);
    expect(line('stock')).toEqual([0, 0, 0, 153.6]);
    expect(result.agents.map((agent) => agent.netCash)).toEqual([22699.62, 461.09, 184.76, 2918.36]);
    expect(result.payeeTotals).toEqual({ eXp: 4182.57, 'eXp Stock': 153.6, TC: 300 });
    expect(result.agents[0].explanation[0]).toContain('Split before bonuses: $26,265.00');
  });

  it('a credit paid by one agent reduces only that side before the 20%', () => {
    const applied = run([step({ rule_name: 'Client Credit', section: 'Pre-splits', payee_entity_id: 'ENT_CREDIT', calculation_formula: '500', paid_by_agent_keys: ['agent_1'], step_number: 0 }), ...splits]);
    const { splitPercent, sides } = planSidesFromTemplate(applied, 30900);
    expect(splitPercent.Winston).toBeCloseTo(85, 10);
    expect(sides.Winston).toMatchObject({ side: 25765, sideAfterBonuses: 25765 });
    const result = computePlanDeal({
      id: 'TXN_CREDIT',
      gci: 30900,
      capDate: '2026-06-15',
      sides: { Winston: sides.Winston },
      agents: [{ id: 'Winston', name: 'Winston', splitPercent: splitPercent.Winston, plan: presets['exp-16000'], capYearStart: '2026-01-01' }],
    });
    expect(result.agents[0].lines[0].amount).toBe(5153);
    expect(result.agents[0].lines.find((item) => item.key === 'risk_management')?.amount).toBe(51);
  });
});

describe('adjustment rules', () => {
  const tcEntity = [...entities, { id: 'ENT_TC', name: 'TC' }];
  const runWith = (steps: TemplateLogicStep[], parameters: Record<string, string> = {}) =>
    applyTemplateLogic({
      steps,
      parameters: { team_lead: 'AGT_P', ...parameters },
      deal: { id: 'TXN_TEST' },
      entities: tcEntity,
      rosterAgents: agents,
      dealAgents: agents.slice(0, 3),
      totalCommission: 30900,
    });

  it('a TC fee paid by the agent the parameter names becomes an After Plan adjustment', () => {
    const applied = runWith([...splits, step({ rule_name: 'TC Fee', section: 'Post-splits', stage: 'AFTER_PLAN', payee_entity_id: 'ENT_TC', paid_by_agent_keys: ['tc_paid_by'], calculation_formula: '300' })], { tc_paid_by: 'AGT_W' });
    expect(applied.adjustments).toEqual([
      { id: expect.stringContaining('tpl_adj_'), name: 'TC Fee', entity: 'TC', stage: 'AFTER_PLAN', level: 1, type: 'AMOUNT', value: 300, payers: ['Winston'], divide: 'split' },
    ]);
    expect(applied.postSplitRulesByAgent?.Winston ?? []).toEqual([]);
  });

  it('a credit shared by every agent, after the plan, by what each has after the plan', () => {
    const applied = runWith([...splits, step({ rule_name: 'Client Credit', section: 'Post-splits', stage: 'AFTER_PLAN', payee_entity_id: 'ENT_CREDIT', share_basis: 'after_plan', calculation_formula: '1000' })]);
    expect(applied.adjustments?.[0]).toMatchObject({ stage: 'AFTER_PLAN', payers: [], divide: 'split', basis: 'after_plan', value: 1000 });
  });

  it('typed dollars per payer and percent adjustments', () => {
    const typed = runWith([...splits, step({
      rule_name: 'Client Credit', section: 'Post-splits', stage: 'BEFORE_PLAN', payee_entity_id: 'ENT_CREDIT',
      paid_by_agent_keys: ['agent_1', 'agent_2'], paid_share_by: 'typed', paid_shares: ['300', '200'], calculation_formula: '500',
    })]);
    expect(typed.adjustments?.[0]).toMatchObject({ divide: 'typed', payers: ['Winston', 'Skylar'], shares: { Winston: 300, Skylar: 200 } });
    const percent = runWith([...splits, step({ rule_name: 'Marketing', section: 'Post-splits', stage: 'AFTER_PLAN', payee_entity_id: 'ENT_CREDIT', split_type: 'PERCENT', calculation_formula: '2%' })]);
    expect(percent.adjustments?.[0]).toMatchObject({ type: 'PERCENT', value: 0.02, payers: [] });
  });
});
