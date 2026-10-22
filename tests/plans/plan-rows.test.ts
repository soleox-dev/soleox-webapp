import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computePlanDeal,
  defaultFeeSharePercent,
  loadPlanPresets,
  planAgentFromRow,
  planHistoryFromItems,
  planInForce,
  type CommissionPlanRow,
  type CommissionPlanVersionRow,
  type PlanSettingsRow,
} from '@/lib/commission-engine';

/** Commission Plans phase 2: database rows (migration 065) to plan engine input. */
const presets = loadPlanPresets();

describe('migration 065', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'db/migrations/065_commission_plans.sql'), 'utf8');

  it('seeds the four eXp presets with the same lines as presets/exp-plans.json', () => {
    const seeded: Record<string, unknown> = {};
    const insert = /WHERE p\.client_id IS NULL AND p\.preset_key = '([^']+)'/g;
    const lines = /DATE '2000-01-01', '((?:[^']|'')*)'::jsonb/g;
    const keys = [...sql.matchAll(insert)].map((match) => match[1]);
    const bodies = [...sql.matchAll(lines)].map((match) => JSON.parse(match[1].replace(/''/g, "'")));
    keys.forEach((key, index) => (seeded[key] = bodies[index]));
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
      ],
      [
        { id: 'TXN_A', created_at: '2026-01-05T10:00:00Z', closing_date: '2026-01-01', custom_attributes: { payment_date: '2026-02-01' } },
        { id: 'TXN_NO_DATE', closing_date: '2026-01-01' },
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
