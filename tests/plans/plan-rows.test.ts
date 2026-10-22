import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computePlanDeal,
  defaultFeeSharePercent,
  loadPlanPresets,
  planAgentFromRow,
  planHistoryFromItems,
  buildDealPlanContext,
  feeShareFor,
  planInForce,
  proposedExpPresetKey,
  type DealPlanIngredients,
  type WaterfallResult,
  type CommissionPlanRow,
  type CommissionPlanVersionRow,
  type PlanSettingsRow,
} from '@/lib/commission-engine';

/** Commission Plans phase 2: database rows (migration 065) to plan engine input. */
const presets = loadPlanPresets();

describe('migration 065', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'db/migrations/065_commission_plans.sql'), 'utf8');

  it('seeds the four eXp presets with the same lines as presets/exp-plans.json (after 067)', () => {
    const seeded: Record<string, unknown> = {};
    const insert = /WHERE p\.client_id IS NULL AND p\.preset_key = '([^']+)'/g;
    const lines = /DATE '2000-01-01', '((?:[^']|'')*)'::jsonb/g;
    const keys = [...sql.matchAll(insert)].map((match) => match[1]);
    const bodies = [...sql.matchAll(lines)].map((match) => JSON.parse(match[1].replace(/''/g, "'")));
    // 067 adds the post-cap fee's 20% split limit to the seeded presets.
    const after067 = (lines: Record<string, unknown>[]) =>
      lines.map((line) => (line.key === 'post_cap_fee' && line.type === 'per_deal_fee' ? { ...line, maxPercentOfSide: 0.2 } : line));
    expect(fs.readFileSync(path.join(process.cwd(), 'db/migrations/067_post_cap_fee_split_limit.sql'), 'utf8')).toContain(`'{"maxPercentOfSide": 0.2}'`);
    keys.forEach((key, index) => (seeded[key] = after067(bodies[index])));
    expect(Object.keys(seeded).sort()).toEqual(Object.keys(presets).sort());
    for (const [key, plan] of Object.entries(presets)) expect(seeded[key]).toEqual(plan.lines);
  });
});

const planRow: CommissionPlanRow = { id: 'CPL_4000', client_id: 'TATH', name: 'eXp $4,000' };
const versions: CommissionPlanVersionRow[] = [
  { id: 'CPV_OLD', plan_id: 'CPL_4000', effective_from: '2025-01-01', lines: presets['exp-4000'].lines.map((line) => (line.key === 'risk_management' ? { ...line, amount: 50 } : line)) },
  { id: 'CPV_NEW', plan_id: 'CPL_4000', effective_from: '2026-03-01', lines: presets['exp-4000'].lines },
];

describe('plan versions', () => {
  it('a deal uses the version in force on its Cap Date', () => {
    expect(planInForce(planRow, versions, '2026-02-28').versionId).toBe('CPV_OLD');
    expect(planInForce(planRow, versions, '2026-03-01').versionId).toBe('CPV_NEW');
  });

  it('no version yet in force is an error, never a later version', () => {
    expect(() => planInForce(planRow, versions, '2024-12-31')).toThrow('eXp $4,000 has no version in force on 2024-12-31');
  });

  it('lines that do not fit the plan shape are rejected', () => {
    expect(() => planInForce(planRow, [{ id: 'CPV_BAD', plan_id: 'CPL_4000', effective_from: '2025-01-01', lines: [{ key: 'x', type: 'mystery' }] }], '2026-01-01')).toThrow();
  });
});

const settings: PlanSettingsRow = {
  cap_date_field_key: 'payment_date',
  cap_year_start_field_key: 'custom_exp_cap_date',
  starting_balances_for_field_key: 'custom_starting_balances_for',
  starting_balance_field_keys: { company_dollar: 'custom_starting_company_dollar', risk_management: 'custom_starting_risk_management' },
  opt_in_field_keys: { stock: 'custom_plan_stock' },
  cap_amount_field_keys: { company_dollar: 'custom_own_cap' },
};

describe('agents rows', () => {
  const plan = planInForce(planRow, versions, '2026-06-15');

  it('reads Cap Year Start, starting balances, opt-ins and caps from the fields the settings name', () => {
    const agent = planAgentFromRow(
      {
        id: 'AGT_1',
        agent_name: 'Winston',
        is_team_lead: true,
        commission_plan_id: 'CPL_4000',
        custom_attributes: {
          custom_exp_cap_date: '2025-07-01',
          custom_starting_balances_for: '2025-08-15',
          custom_starting_company_dollar: '$1,200.50',
          custom_starting_risk_management: '',
          custom_plan_stock: 'Yes',
        },
      },
      { plan, settings, splitPercent: 85 },
    );
    expect(agent).toMatchObject({
      id: 'AGT_1',
      roles: ['team_lead'],
      capYearStart: '2025-07-01',
      startingBalances: { capYearOf: '2025-08-15', amounts: { company_dollar: 1200.5 } },
      optedIn: ['stock'],
    });
    expect(agent.capAmounts).toBeUndefined();
  });

  it('an agent without Cap Year Start reaches the engine as missing, so the deal warns', () => {
    const agent = planAgentFromRow({ id: 'AGT_2', agent_name: 'Kyle', custom_attributes: { custom_own_cap: 2000 } }, { plan, settings, splitPercent: 100 });
    expect([agent.capYearStart, agent.capAmounts]).toEqual([null, { company_dollar: 2000 }]);
    const result = computePlanDeal({ id: 'TXN_1', gci: 10000, capDate: '2026-06-15', agents: [agent] });
    expect(result.warnings.map((warning) => warning.message)).toEqual(['Enter Cap Year Start for Kyle to calculate their eXp $4,000 plan.']);
    expect(result.agents[0].planVersionId).toBe('CPV_NEW');
  });
});

describe('year-to-date history from saved items', () => {
  it('places saved plan lines by the Cap Date field and first save time; typed amounts count as paid', () => {
    const history = planHistoryFromItems(
      [
        { transaction_id: 'TXN_A', agent_id: 'AGT_1', plan_line_key: 'company_dollar', final_amount: '3000' },
        { transaction_id: 'TXN_A', agent_id: 'AGT_1', plan_line_key: null, final_amount: 500 },
        { transaction_id: 'TXN_A', agent_id: 'AGT_1', plan_line_key: 'risk_management', final_amount: 60, archived: true },
        { transaction_id: 'TXN_NO_DATE', agent_id: 'AGT_1', plan_line_key: 'company_dollar', final_amount: 100 },
        { transaction_id: 'TXN_CANCELLED', agent_id: 'AGT_1', plan_line_key: 'company_dollar', final_amount: 900 },
      ],
      [
        { id: 'TXN_A', transaction_status: 'Closed', created_at: '2026-01-05T10:00:00Z', closing_date: '2026-01-01', custom_attributes: { payment_date: '2026-02-01' } },
        { id: 'TXN_NO_DATE', transaction_status: 'Closed', closing_date: '2026-01-01' },
        { id: 'TXN_CANCELLED', transaction_status: 'Cancelled', closing_date: '2026-01-15', custom_attributes: { payment_date: '2026-01-15' } },
      ],
      settings,
    );
    expect(history).toEqual([
      { dealId: 'TXN_A', agentId: 'AGT_1', capDate: '2026-02-01', savedAt: '2026-01-05T10:00:00Z', lineKey: 'company_dollar', amount: 3000 },
    ]);
    const agent = planAgentFromRow({ id: 'AGT_1', agent_name: 'Winston', custom_attributes: { custom_exp_cap_date: '2026-01-01' } }, { plan: planInForce(planRow, versions, '2026-06-15'), settings, splitPercent: 100 });
    const result = computePlanDeal({ id: 'TXN_B', gci: 10000, capDate: '2026-06-15', agents: [agent] }, history);
    expect(result.agents[0].lines[0].amount).toBe(1000);
  });
});

describe('deals saved before plans', () => {
  it('count toward caps through the entity each plan line was paid to', () => {
    const history = planHistoryFromItems(
      [
        { transaction_id: 'TXN_OLD', agent_id: 'AGT_1', plan_line_key: null, payee_entity_id: 'ENT_BROKER_CAP', final_amount: 3000 },
        { transaction_id: 'TXN_OLD', agent_id: 'AGT_1', plan_line_key: null, payee_entity_id: 'ENT_TC', final_amount: 300 },
        { transaction_id: 'TXN_NEW', agent_id: 'AGT_1', plan_line_key: 'company_dollar', payee_entity_id: 'ENT_BROKER_CAP', final_amount: 500 },
      ],
      [
        { id: 'TXN_OLD', transaction_status: 'Closed', closing_date: '2026-02-01' },
        { id: 'TXN_NEW', transaction_status: 'Pending', closing_date: '2026-03-01' },
      ],
      { cap_date_field_key: 'closing_date', history_entity_ids: { company_dollar: 'ENT_BROKER_CAP' } },
    );
    expect(history.map((line) => `${line.dealId} ${line.lineKey} ${line.amount}`)).toEqual(['TXN_OLD company_dollar 3000', 'TXN_NEW company_dollar 500']);
  });
});

describe('statuses that count', () => {
  const items = [
    { transaction_id: 'TXN_C', agent_id: 'AGT_1', plan_line_key: 'risk_management', final_amount: 60 },
    { transaction_id: 'TXN_P', agent_id: 'AGT_1', plan_line_key: 'risk_management', final_amount: 60 },
    { transaction_id: 'TXN_X', agent_id: 'AGT_1', plan_line_key: 'risk_management', final_amount: 60 },
  ];
  const deals = [
    { id: 'TXN_C', transaction_status: 'Closed', closing_date: '2026-02-01' },
    { id: 'TXN_P', transaction_status: 'pending', closing_date: '2026-02-02' },
    { id: 'TXN_X', transaction_status: 'Cancelled', closing_date: '2026-02-03' },
  ];

  it('Closed and Pending by default, in any letter case; a cancelled deal never counts', () => {
    expect(planHistoryFromItems(items, deals, { cap_date_field_key: 'closing_date' }).map((line) => line.dealId)).toEqual(['TXN_C', 'TXN_P']);
  });

  it('the client can choose the statuses', () => {
    expect(planHistoryFromItems(items, deals, { cap_date_field_key: 'closing_date', counting_statuses: ['Closed'] }).map((line) => line.dealId)).toEqual(['TXN_C']);
  });
});

describe('proposed eXp plans from today\'s cap fields', () => {
  it('follows the cap and the $250 fee cap, not the Team Lead flag', () => {
    expect(proposedExpPresetKey(4000, null)).toBe('exp-4000');
    expect(proposedExpPresetKey('$8,000', '5000')).toBe('exp-8000');
    expect(proposedExpPresetKey(16000, 5000)).toBe('exp-16000');
    expect(proposedExpPresetKey(16000, 0)).toBe('exp-16000-team-lead');
    expect(proposedExpPresetKey('16000', '')).toBe('exp-16000-team-lead');
    expect(proposedExpPresetKey('', 5000)).toBeNull();
    expect(proposedExpPresetKey(12000, 5000)).toBeNull();
  });

  it('a stock rate above zero counts as opted in', () => {
    const plan = planInForce(planRow, versions, '2026-06-15');
    const opted = (value: unknown) => planAgentFromRow({ id: 'A', agent_name: 'A', custom_attributes: { custom_plan_stock: value } }, { plan, settings, splitPercent: 100 }).optedIn;
    expect([opted(0.05), opted('0.05'), opted('Yes'), opted(0), opted(''), opted('No')]).toEqual([['stock'], ['stock'], ['stock'], [], [], []]);
  });
});

describe('whether plans calculate a deal', () => {
  const ingredients = (over: Partial<DealPlanIngredients> = {}, settingsOver: Partial<PlanSettingsRow> = {}): DealPlanIngredients => ({
    settings: { ...settings, cap_date_field_key: 'closing_date', calculate_deals: true, calculate_from: '2026-01-01', ...settingsOver },
    plans: [planRow],
    versions,
    agents: [
      { id: 'AGT_1', agent_name: 'Winston', commission_plan_id: 'CPL_4000', custom_attributes: { custom_exp_cap_date: '2025-07-01', custom_plan_stock: 'Yes' } },
      { id: 'AGT_2', agent_name: 'Kyle', commission_plan_id: null },
    ],
    history: [],
    finished: false,
    doubleEnd: false,
    brokerageAgentEntities: ['External eXp Agent'],
    ...over,
  });
  const deal = { id: 'TXN_1', closing_date: '2026-06-15', created_at: '2026-06-01T00:00:00Z', waived_plan_lines: ['broker_review'] };

  it('builds the context: plan in force on the Cap Date, agent fields, waived lines', () => {
    const { context, reason } = buildDealPlanContext(deal, ingredients());
    expect(reason).toBe('');
    expect(context).toMatchObject({ active: true, capDate: '2026-06-15', waivedLines: ['broker_review'], feeSharePercent: null });
    expect(Object.keys(context!.agents)).toEqual(['AGT_1']);
    expect(context!.agents.AGT_1).toMatchObject({ capYearStart: '2025-07-01', optedIn: ['stock'] });
    expect(context!.agents.AGT_1.plan.versionId).toBe('CPV_NEW');
  });

  it('leaves the deal alone when switched off, FINISHED, before the start date, or without a Cap Date', () => {
    expect(buildDealPlanContext(deal, ingredients({}, { calculate_deals: false })).reason).toBe('Commission Plans are switched off for this client.');
    expect(buildDealPlanContext(deal, ingredients({ finished: true })).reason).toBe('This deal is finished, so its saved lines stay as they are.');
    expect(buildDealPlanContext(deal, ingredients({}, { calculate_from: '2026-07-01' })).reason).toBe('Commission Plans calculate deals from 2026-07-01; this deal is on 2026-06-15.');
    expect(buildDealPlanContext({ id: 'TXN_2' }, ingredients()).context).toBeNull();
  });

  it('the default Fee Share: 50% on a double end, less a brokerage agent\'s share of Total Commission', () => {
    const first = { totalCommission: 10000, offTheTopItems: [{ entity: 'External eXp Agent', amount: 2000 }], preSplitItems: [] } as unknown as WaterfallResult;
    expect(feeShareFor({ feeShareDefault: { doubleEnd: false, brokerageAgentEntities: ['External eXp Agent'] } }, first)).toBe(80);
    expect(feeShareFor({ feeShareDefault: { doubleEnd: true, brokerageAgentEntities: ['External eXp Agent'] } }, first)).toBe(40);
    expect(feeShareFor({ feeSharePercent: 100, feeShareDefault: { doubleEnd: true, brokerageAgentEntities: [] } }, first)).toBe(100);
  });
});

describe('default Fee Share', () => {
  const deal = { id: 'TXN_1', property_address: '12 Main St', closing_date: '2026-05-01', transaction_side: 'Buyer' };

  it('100% for a deal the team carries alone', () => {
    expect(defaultFeeSharePercent({ deal, otherDeals: [], gci: 10000, brokerageAgentAmount: 0 }).percent).toBe(100);
  });

  it('50% when the other side of the same address and closing date is another deal', () => {
    const other = { id: 'TXN_2', property_address: ' 12  main st ', closing_date: '2026-05-01T00:00:00Z', transaction_side: 'Seller' };
    const result = defaultFeeSharePercent({ deal, otherDeals: [other], gci: 10000, brokerageAgentAmount: 0 });
    expect(result.percent).toBe(50);
    expect(result.explanation).toContain('deal TXN_2');
    expect(defaultFeeSharePercent({ deal, otherDeals: [{ ...other, closing_date: '2026-05-02' }], gci: 10000, brokerageAgentAmount: 0 }).percent).toBe(100);
  });

  it('80% after a 20% referral to an eXp agent outside the team', () => {
    expect(defaultFeeSharePercent({ deal, otherDeals: [], gci: 10000, brokerageAgentAmount: 2000 }).percent).toBe(80);
  });
});
