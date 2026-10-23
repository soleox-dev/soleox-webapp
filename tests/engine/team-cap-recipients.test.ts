import { describe, expect, it } from 'vitest';
import {
  capProgressIds,
  capPayoutRulesFromRow,
  capRecipientsFromRow,
  dealTeamCaps,
  planDealAllocations,
  splitCapTotal,
  type DealAllocationContext,
  type TeamCapRule,
} from '@/lib/agent-allocations';
import { capRecipientShortfalls } from '@/lib/commission-engine/save';

// TATH: Dylan's Team Cap pays Dylan; the Las Vegas Team Cap pays Dylan 50%, Yvonne 35% and Paul 15%, and counts
// toward the same $12,000 cap as Dylan's.
const DYLAN = 'AGT_00000000000D';
const YVONNE = 'AGT_00000000000Y';
const PAUL = 'AGT_00000000000P';
const AGENT = 'AGT_00000000000A';

const dylanCap: TeamCapRule = {
  id: 'CTC_000000000001',
  name: "Dylan's Team Cap",
  key: 'dylan_team_cap',
  enabled: true,
  qualifyingFormula: null,
  splitPercentFieldKey: 'team_split',
  capAmountFieldKey: 'team_cap_amount',
  resetDateFieldKey: 'cap_date',
  payoutRules: [{ name: null, condition: null, recipients: [{ agentId: DYLAN, share: 100 }] }],
  progressCapId: null,
};

const vegasCap: TeamCapRule = {
  ...dylanCap,
  id: 'CTC_000000000002',
  name: 'Las Vegas Team Cap',
  key: 'las_vegas_team_cap',
  payoutRules: [{ name: null, condition: null, recipients: [{ agentId: DYLAN, share: 50 }, { agentId: YVONNE, share: 35 }, { agentId: PAUL, share: 15 }] }],
  progressCapId: dylanCap.id,
};

function context(overrides: Partial<DealAllocationContext> = {}): DealAllocationContext {
  return {
    teamCaps: [dylanCap, vegasCap],
    selectedTeamCapIds: [vegasCap.id],
    salesVolume: null,
    fieldTypes: {},
    profiles: [
      { agentId: AGENT, fields: { team_split: '20', team_cap_amount: '12000', cap_date: '2026-01-01' } },
      { agentId: YVONNE, fields: { team_split: '20', team_cap_amount: '12000', cap_date: '2026-01-01' } },
    ],
    history: [],
    overrides: [],
    deal: {},
    dealDate: '2026-10-01',
    salesPrice: 0,
    units: 1,
    ...overrides,
  };
}

const shares = [
  { agentId: AGENT, amount: 10000, isPrimary: true },
  { agentId: DYLAN, amount: 0, isPrimary: false },
  { agentId: YVONNE, amount: 0, isPrimary: false },
  { agentId: PAUL, amount: 0, isPrimary: false },
];

describe('team caps that pay several agents', () => {
  it('reads a stored recipients list, or the single recipient at 100%', () => {
    expect(capRecipientsFromRow([{ agent_id: DYLAN, share: 50 }, { agent_id: PAUL, share: 50 }], null))
      .toEqual([{ agentId: DYLAN, share: 50 }, { agentId: PAUL, share: 50 }]);
    expect(capRecipientsFromRow(null, DYLAN)).toEqual([{ agentId: DYLAN, share: 100 }]);
    expect(capRecipientsFromRow(null, null)).toEqual([]);
  });

  it('splits a total by share, the leftover cent to the first recipient', () => {
    expect(Object.fromEntries(splitCapTotal(2000, vegasCap.payoutRules[0].recipients))).toEqual({ [DYLAN]: 1000, [YVONNE]: 700, [PAUL]: 300 });
    const odd = splitCapTotal(0.01, [{ agentId: DYLAN, share: 50 }, { agentId: PAUL, share: 50 }]);
    expect(odd.get(DYLAN)! + odd.get(PAUL)!).toBeCloseTo(0.01, 5);
  });

  it('takes the agent percent once and leaves recipients out of the cap they receive', () => {
    const { lines } = planDealAllocations(context(), shares);
    expect(lines.map((line) => [line.agent_id, line.amount])).toEqual([[AGENT, 2000]]);
  });

  it('applies only when every recipient is on the deal, unless the cap was chosen', () => {
    const withoutPaul = shares.filter((share) => share.agentId !== PAUL);
    expect(planDealAllocations(context({ teamCaps: [vegasCap], selectedTeamCapIds: null }), withoutPaul).lines).toEqual([]);
    expect(planDealAllocations(context(), withoutPaul).lines).toHaveLength(1);
  });

  it('counts what the agent paid into the cap it counts toward', () => {
    const history = [{ agentId: AGENT, amount: 11000, periodStart: '2026-01-01', teamCapId: dylanCap.id }];
    const { lines } = planDealAllocations(context({ history }), shares);
    expect(lines[0].amount).toBe(1000);
    expect(lines[0].prior_amount).toBe(11000);
  });

  it('groups a cap with the cap it counts toward, from either side', () => {
    expect(capProgressIds([dylanCap, vegasCap], dylanCap.id).sort()).toEqual([dylanCap.id, vegasCap.id]);
    expect(capProgressIds([dylanCap, vegasCap], vegasCap.id).sort()).toEqual([dylanCap.id, vegasCap.id]);
    expect(capProgressIds([dylanCap, { ...vegasCap, progressCapId: null }], vegasCap.id)).toEqual([vegasCap.id]);
  });

  it('blocks save when a recipient has less than their share', () => {
    const { lines } = planDealAllocations(context(), shares);
    const shortfalls = capRecipientShortfalls(
      { allocationLines: lines, agentSplitItems: [{ agentId: DYLAN, amount: 1000 }, { agentId: YVONNE, amount: 700 }, { agentId: PAUL, amount: 100 }] },
      dealTeamCaps([dylanCap, vegasCap], {}, {}),
      [{ id: PAUL, name: 'Paul Patane' }] as never,
    );
    expect(shortfalls).toEqual([{ recipientId: PAUL, name: 'Paul Patane', receives: 300, has: 100 }]);
  });
});

// One team cap for TATH: the same 20% up to $12,000 for every agent, paid out by region.
describe('payout rules on one team cap', () => {
  const oneCap: TeamCapRule = {
    ...dylanCap,
    name: 'Team Cap',
    key: 'team_cap',
    progressCapId: null,
    payoutRules: [
      { name: 'Las Vegas', condition: 'region = "Las Vegas"', recipients: vegasCap.payoutRules[0].recipients },
      { name: null, condition: null, recipients: [{ agentId: DYLAN, share: 100 }] },
    ],
  };
  const vegas = { region: 'Las Vegas' };
  const elsewhere = { region: 'Phoenix' };
  const run = (deal: Record<string, unknown>, history: DealAllocationContext['history'] = []) =>
    planDealAllocations(context({ teamCaps: [oneCap], selectedTeamCapIds: null, deal, fieldTypes: { region: 'TEXT' }, history }), shares);

  it('reads stored rules, or the recipients from before rules as one rule with no condition', () => {
    expect(capPayoutRulesFromRow([{ condition: ' region = "Las Vegas" ', recipients: [{ agent_id: PAUL, share: 100 }] }], null, null))
      .toEqual([{ name: null, condition: 'region = "Las Vegas"', recipients: [{ agentId: PAUL, share: 100 }] }]);
    expect(capPayoutRulesFromRow(null, [{ agent_id: DYLAN, share: 100 }], null)).toEqual([{ name: null, condition: null, recipients: [{ agentId: DYLAN, share: 100 }] }]);
    expect(capPayoutRulesFromRow(null, null, DYLAN)).toEqual([{ name: null, condition: null, recipients: [{ agentId: DYLAN, share: 100 }] }]);
  });

  it('uses the first rule whose condition is true', () => {
    expect(dealTeamCaps([oneCap], vegas, { region: 'TEXT' })[0].recipients.map((item) => item.agentId)).toEqual([DYLAN, YVONNE, PAUL]);
    expect(dealTeamCaps([oneCap], elsewhere, { region: 'TEXT' })[0].recipients).toEqual([{ agentId: DYLAN, share: 100 }]);
  });

  it('labels the matching rule by name, or by its place, only when there are several', () => {
    expect(dealTeamCaps([oneCap], vegas, { region: 'TEXT' })[0].payoutRuleLabel).toBe('Las Vegas');
    expect(dealTeamCaps([oneCap], elsewhere, { region: 'TEXT' })[0].payoutRuleLabel).toBe('Payout Rule 2');
    expect(dealTeamCaps([dylanCap], {}, {})[0].payoutRuleLabel).toBeNull();
    expect(run(vegas).lines[0].payout_rule).toBe('Las Vegas');
  });

  it('pays nothing when no rule matches', () => {
    const vegasOnly: TeamCapRule = { ...oneCap, payoutRules: [oneCap.payoutRules[0]] };
    expect(dealTeamCaps([vegasOnly], elsewhere, { region: 'TEXT' })[0].recipients).toEqual([]);
    const { lines } = planDealAllocations(context({ teamCaps: [vegasOnly], selectedTeamCapIds: [oneCap.id], deal: elsewhere, fieldTypes: { region: 'TEXT' } }), shares);
    expect(lines).toEqual([]);
  });

  it('takes 20% under either rule and leaves out only the matching rule\'s recipients', () => {
    expect(run(vegas).lines.map((line) => [line.agent_id, line.amount])).toEqual([[AGENT, 2000]]);
    // Outside Las Vegas, Yvonne is not a recipient, so she pays into the cap like any agent (here her share is $0).
    expect(run(elsewhere).lines.map((line) => line.agent_id)).toEqual([AGENT, YVONNE]);
  });

  it('keeps one cap total when the agent changes region', () => {
    const history = [{ agentId: AGENT, amount: 11000, periodStart: '2026-01-01', teamCapId: oneCap.id }];
    expect(run(vegas, history).lines[0].amount).toBe(1000);
    expect(run(elsewhere, history).lines[0].amount).toBe(1000);
  });
});
