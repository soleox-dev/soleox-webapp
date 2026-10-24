import { describe, expect, it } from 'vitest';
import {
  applyTemplateLogic,
  computeDealCommission,
  applyPlansToWaterfall,
  loadPlanPresets,
  planLineChanges,
  templatePaymentsChanged,
  waterfallAfterTemplate,
  waterfallFromCommissionItems,
  type CommissionEntityOption,
  type DealPlanContext,
  type KnownAgentInfo,
  type StoredCommissionItem,
  type TemplateLogicStep,
  type WaterfallState,
} from '@/lib/commission-engine';

/** Commission Plans inside the deal waterfall: computeDealCommission with a plan context. */
const presets = loadPlanPresets();
const knownAgents: KnownAgentInfo[] = [
  { id: 'AGT_W', name: 'Winston', isTeamLead: false },
  { id: 'AGT_S', name: 'Skylar', isTeamLead: false },
  { id: 'AGT_K', name: 'Kyle', isTeamLead: false },
  { id: 'AGT_P', name: 'Patrick', isTeamLead: true },
];
const knownEntities: CommissionEntityOption[] = [
  { id: 'ENT_EXP', name: 'eXp' },
  { id: 'ENT_STOCK', name: 'eXp Stock' },
  { id: 'ENT_TC', name: 'TC' },
];

let n = 0;
const step = (rule: Partial<TemplateLogicStep> & Pick<TemplateLogicStep, 'rule_name' | 'section'>): TemplateLogicStep => ({
  id: `CTR_${++n}`,
  step_number: n,
  rule_key: rule.rule_name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  split_type: 'AMOUNT',
  ...rule,
});
// The slim template: four splits, one bonus line, and Winston's TC fee. No eXp rules.
const slimTemplate = [
  step({ rule_name: 'Agent 1 Split', section: 'Agent Splits', agent_key: 'agent_1', calculation_formula: 'baseline * 85%', split_type: 'PERCENT' }),
  step({ rule_name: 'Agent 2 Split', section: 'Agent Splits', agent_key: 'agent_2', calculation_formula: 'baseline * 1.5%', split_type: 'PERCENT' }),
  step({ rule_name: 'Agent 3 Split', section: 'Agent Splits', agent_key: 'agent_3', calculation_formula: 'baseline * 0.75%', split_type: 'PERCENT' }),
  step({ rule_name: 'Team Lead Split', section: 'Agent Splits', agent_key: 'team_lead', calculation_formula: 'baseline - agent_1_split - agent_2_split - agent_3_split', split_type: 'PERCENT' }),
  step({ rule_name: 'Agent 1 Bonus', section: 'Agent Splits', rule_kind: 'BONUS', agent_key: 'agent_1', from_agent_key: 'team_lead', calculation_formula: '86.25' }),
  step({ rule_name: 'TC Fee', section: 'Level 2 Post-splits', agent_key: 'agent_1', payee_entity_id: 'ENT_TC', calculation_formula: '300' }),
];

const deal = { id: 'TXN_VERIFIED', total_commission: 30900, closing_date: '2026-06-15', transaction_status: 'Closed' };
// Plans from the database always carry the version in force on the Cap Date.
const planned = (left: number, plan: string, extra: Partial<DealPlanContext['agents'][string]> = {}) => ({
  plan: { ...presets[plan], versionId: `CPV_${plan}` },
  capYearStart: '2026-01-01',
  startingBalances: { capYearOf: '2026-01-01', amounts: { company_dollar: (presets[plan].lines[0] as { capAmount: number }).capAmount - left } },
  ...extra,
});
const context = (active = true): DealPlanContext => ({
  active,
  capDate: '2026-06-15',
  agents: {
    AGT_W: planned(3255, 'exp-4000'),
    AGT_S: planned(0, 'exp-4000'),
    AGT_K: planned(100, 'exp-4000'),
    AGT_P: planned(1000, 'exp-16000-team-lead', { roles: ['team_lead'], optedIn: ['stock'] }),
  },
  history: [],
});

function templateWaterfall(): WaterfallState {
  const applied = applyTemplateLogic({
    steps: slimTemplate,
    parameters: { team_lead: 'AGT_P' },
    deal,
    entities: knownEntities,
    rosterAgents: knownAgents,
    dealAgents: knownAgents.slice(0, 3),
    totalCommission: 30900,
  });
  return waterfallAfterTemplate(applied, [], knownAgents, 'AGT_W');
}

const run = (waterfall: WaterfallState, plans: DealPlanContext | null) =>
  computeDealCommission(
    { deal, salesPrice: 0, gciPerc: 0, clientType: 'TEAM', fields: [], waterfall, primaryAgentId: 'AGT_W', plans },
    { knownAgents, knownEntities, primaryAgentFallback: '', paymentDate: '2026-06-20', templateQualifies: true },
  );

// An agent's plan lines at every level (stock is Level 2), in plan order.
const planItems = (result: ReturnType<typeof run>) =>
  [...result.postSplitItems, ...result.postSplit2Items].filter((item: { planLineKey?: string }) => item.planLineKey);
const lines = (result: ReturnType<typeof run>, agent: string) =>
  planItems(result).filter((item: { agentName: string }) => item.agentName === agent).map((item: { ruleName: string; amount: number }) => `${item.ruleName} ${item.amount}`);

describe('Commission Plans in the deal waterfall', () => {
  it('a slim template plus the plans reproduces the verified statement on the deal', () => {
    const waterfall = templateWaterfall();
    expect(waterfall.agents.find((agent) => agent.id === 'AGT_W')?.bonusNet).toBe(86.25);
    const result = run(waterfall, context());
    expect(lines(result, 'Winston')).toEqual(['Company dollar 3255', 'Post-cap fee 24.38', 'Risk management 51', 'Broker review 21.25', 'Stock 0']);
    expect(lines(result, 'Patrick')).toEqual(['Company dollar 770.7', 'Post-cap fee 0', 'Risk management 7.65', 'Broker review 3.19', 'Stock 153.6']);
    expect(result.netPayouts).toMatchObject({ Winston: 22699.62, Skylar: 461.09, Kyle: 184.76, Patrick: 2918.36, eXp: 4182.57, 'eXp Stock': 153.6, TC: 300 });
    expect(result.save.blockers.blocked).toBe(false);
    const saved = result.save.commissionItems.filter((item) => 'plan_line_key' in item && item.plan_line_key);
    expect(saved).toHaveLength(20);
    expect(saved[0]).toMatchObject({ section: 'POST_SPLIT', plan_line_key: 'company_dollar', commission_plan_version_id: 'CPV_exp-4000', final_amount: 3255 });
  });

  it('saved and reloaded, the plan lines come back the same (bonuses and versions are kept)', () => {
    const first = run(templateWaterfall(), context());
    const rows = first.save.commissionItems.map((item: Record<string, unknown>, index: number) => ({ id: `TCI_${index}`, ...item })) as StoredCommissionItem[];
    const reloaded = waterfallFromCommissionItems(rows, knownAgents, knownEntities, 'AGT_W');
    expect(reloaded.agents.find((agent) => agent.id === 'AGT_W')?.bonusNet).toBe(86.25);
    const again = run(reloaded, context());
    expect(again.netPayouts).toEqual(first.netPayouts);
    expect(planItems(again)).toHaveLength(20);
    expect(again.postSplit2Items.filter((item: { planLineKey?: string }) => item.planLineKey).map((item: { ruleName: string }) => item.ruleName)).toEqual(['Stock', 'Stock', 'Stock', 'Stock']);
  });

  it('a FINISHED deal (plans inactive) keeps its saved lines exactly', () => {
    const first = run(templateWaterfall(), context());
    const rows = first.save.commissionItems.map((item: Record<string, unknown>, index: number) => ({ id: `TCI_${index}`, ...item })) as StoredCommissionItem[];
    // eXp later raises broker review; the finished deal must not move.
    const raised = { ...context(false), agents: Object.fromEntries(Object.entries(context().agents).map(([id, agent]) => [id, { ...agent, plan: { ...agent.plan, lines: agent.plan.lines.map((line) => (line.key === 'broker_review' ? { ...line, amount: 50 } : line)) } }])) };
    const finished = run(waterfallFromCommissionItems(rows, knownAgents, knownEntities, 'AGT_W'), raised);
    expect(finished.netPayouts).toEqual(first.netPayouts);
  });

  it('a typed plan line stays typed after reload, and the lines below follow it', () => {
    const waterfall = templateWaterfall();
    const first = run(waterfall, context());
    const rows = first.save.commissionItems.map((item: Record<string, unknown>, index: number) => ({ id: `TCI_${index}`, ...item })) as StoredCommissionItem[];
    const reloaded = waterfallFromCommissionItems(rows, knownAgents, knownEntities, 'AGT_W');
    // Patrick's company dollar is typed as $700 on the deal.
    reloaded.postSplitRulesByAgent.Patrick = reloaded.postSplitRulesByAgent.Patrick.map((rule) => (rule.planLineKey === 'company_dollar' ? { ...rule, value: 700, planTyped: true } : rule));
    const typed = run(reloaded, context());
    // $700 of the $770.70 base leaves 9.17% past the cap: a $0.88 post-cap fee, and stock on what is left.
    expect(lines(typed, 'Patrick')).toEqual(['Company dollar 700', 'Post-cap fee 0.88', 'Risk management 7.65', 'Broker review 3.19', 'Stock 157.09']);
    const saved = typed.save.commissionItems.find((item) => item.agent_id === 'AGT_P' && 'plan_line_key' in item && item.plan_line_key === 'company_dollar');
    expect(saved).toMatchObject({ final_amount: 700, custom_attributes: { plan_typed: true } });
  });

  it('a template line paying the same entity as a plan line blocks Save', () => {
    const waterfall = templateWaterfall();
    // The template still charges Winston an eXp line of its own.
    waterfall.postSplitRulesByAgent.Winston = [...(waterfall.postSplitRulesByAgent.Winston || []), { id: 'tpl_old', name: 'Company Comm', entity: 'eXp', type: 'AMOUNT', value: 3255 }];
    const result = run(waterfall, context());
    expect(result.save.blockers.blocked).toBe(true);
    expect(result.save.blockers.reason).toContain("Winston pays eXp twice: once by the plan and once by a template or typed line. Remove the template's eXp rule before saving.");
  });

  it('several entities paid twice by one agent make one message', () => {
    const waterfall = templateWaterfall();
    waterfall.postSplitRulesByAgent.Winston = [
      ...(waterfall.postSplitRulesByAgent.Winston || []),
      { id: 'tpl_old', name: 'Company Comm', entity: 'eXp', type: 'AMOUNT', value: 3255 },
      { id: 'tpl_review', name: 'Broker Review', entity: 'Review Co', type: 'AMOUNT', value: 25 },
    ];
    const base = context();
    const winston = base.agents.AGT_W;
    const agents = { ...base.agents, AGT_W: { ...winston, plan: { ...winston.plan, lines: winston.plan.lines.map((line) => (line.key === 'broker_review' ? { ...line, payee: 'Review Co' } : line)) } } };
    const result = run(waterfall, { ...base, agents });
    expect(result.save.blockers.reason).toContain("Winston pays eXp and Review Co twice: once by the plan and once by a template or typed line. Remove the template's eXp and Review Co rules before saving.");
    expect(result.planStep?.problems.filter((problem: string) => problem.startsWith('Winston pays'))).toHaveLength(1);
  });

  it('an agent without a plan blocks Save with the reason', () => {
    const { AGT_K: _kyle, ...rest } = context().agents;
    const result = run(templateWaterfall(), { ...context(), agents: rest });
    expect(result.save.blockers.blocked).toBe(true);
    expect(result.save.blockers.reason).toContain('Kyle has no Commission Plan. Assign one on Agents.');
  });

  it('lists what recalculating with plans would change on a deal saved with plans', () => {
    const first = run(templateWaterfall(), context());
    const rows = first.save.commissionItems.map((item: Record<string, unknown>, index: number) => ({ id: `TCI_${index}`, ...item })) as StoredCommissionItem[];
    const saved = waterfallFromCommissionItems(rows, knownAgents, knownEntities, 'AGT_W');
    const step = (plans: DealPlanContext) => applyPlansToWaterfall(saved, run(saved, null), plans, 'TXN_VERIFIED');
    expect(planLineChanges(saved, step(context()))).toEqual([]);
    // eXp raises broker review to $30: every agent's broker review would change.
    const raised = { ...context(), agents: Object.fromEntries(Object.entries(context().agents).map(([id, agent]) => [id, { ...agent, plan: { ...agent.plan, lines: agent.plan.lines.map((line) => (line.key === 'broker_review' ? { ...line, amount: 30 } : line)) } }])) };
    expect(planLineChanges(saved, step(raised))).toEqual([
      { agent: 'Winston', line: 'Broker review', saved: 21.25, now: 25.5 },
      { agent: 'Skylar', line: 'Broker review', saved: 0.38, now: 0.45 },
      { agent: 'Kyle', line: 'Broker review', saved: 0.19, now: 0.23 },
      { agent: 'Patrick', line: 'Broker review', saved: 3.19, now: 3.83 },
      { agent: 'Patrick', line: 'Stock', saved: 153.6, now: 153.57 },
    ]);
  });

  it('without a plan context nothing changes', () => {
    const result = run(templateWaterfall(), null);
    expect(result.postSplitItems.some((item: { planLineKey?: string }) => item.planLineKey)).toBe(false);
    expect(result.netPayouts.Winston).toBe(26051.25);
  });
});

describe('The payments check (purple) on a deal saved with Commission Plans', () => {
  const savedRows = () => {
    const first = run(templateWaterfall(), context());
    return first.save.commissionItems.map((item: Record<string, unknown>, index: number) => ({ id: `TCI_${index}`, ...item })) as StoredCommissionItem[];
  };
  const check = (items: StoredCommissionItem[], plans: DealPlanContext | null) => templatePaymentsChanged({
    deal,
    submissions: [{ steps: slimTemplate, parameters: { team_lead: 'AGT_P' }, parameterTypes: {} }],
    items,
    agents: knownAgents,
    entities: knownEntities,
    overviewFields: [],
    plans,
  });

  it('with the plans, an unchanged deal is not flagged', () => {
    expect(check(savedRows(), context())).toBe(false);
  });

  it('without the plans the saved plan lines look like a change (the old check)', () => {
    expect(check(savedRows(), null)).toBe(true);
  });

  it('a plan edited since the save is flagged', () => {
    const raised = { ...context(), agents: Object.fromEntries(Object.entries(context().agents).map(([id, agent]) => [id, { ...agent, plan: { ...agent.plan, lines: agent.plan.lines.map((line) => (line.key === 'broker_review' ? { ...line, amount: 50 } : line)) } }])) };
    expect(check(savedRows(), raised)).toBe(true);
  });
});

describe('adjustments on a plan deal', () => {
  const adjustment = (extra: object) => ({ id: 'adj', name: 'Client Credit', entity: 'Client', type: 'AMOUNT' as const, value: 500, payers: ['Patrick'], divide: 'split' as const, stage: 'BEFORE_PLAN' as const, ...extra });
  const company = (result: ReturnType<typeof run>, agent: string) => lines(result, agent).find((line) => line.startsWith('Company dollar'));

  it('a Before Plan credit comes off the side first, so the plan charges 20% of less', () => {
    const base = run(templateWaterfall(), context());
    const credited = run({ ...templateWaterfall(), adjustments: [adjustment({})] }, context());
    expect(company(base, 'Patrick')).toBe('Company dollar 770.7');
    expect(company(credited, 'Patrick')).toBe('Company dollar 670.7');
    expect(credited.netPayouts.Client).toBe(500);
  });

  it('an After Plan adjustment leaves every plan line as it was', () => {
    const base = run(templateWaterfall(), context());
    const after = run({ ...templateWaterfall(), adjustments: [adjustment({ stage: 'AFTER_PLAN' })] }, context());
    expect(lines(after, 'Patrick')).toEqual(lines(base, 'Patrick'));
    expect(after.netPayouts.Patrick).toBe(Math.round((base.netPayouts.Patrick - 500) * 100) / 100);
  });
});
