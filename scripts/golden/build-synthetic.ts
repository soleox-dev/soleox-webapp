/**
 * Builds the SYNTH golden client: made-up agents, caps, a small template and seven deals, so the golden tests
 * cover team caps, a reached cap, an unchecked cap, referrals, pre-splits, level 2 post-splits and a cancelled
 * deal without any client data. Each deal's saved commission lines are what submitting its template writes
 * (or, for "stale" deals, an older version), so the out-of-date check has both outcomes.
 *
 *   npx tsx scripts/golden/build-synthetic.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ClientFixture, DealFixture } from '../../tests/engine/fixtures';

const root = path.join(process.cwd(), 'tests/engine/fixtures/SYNTH');
const C = 'SYNTH';

const agent = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `AGT_00000000000${n.toString(16).toUpperCase()}`,
  client_id: C,
  agent_name: `Fn00${n} Ln00${n}`,
  first_name: `Fn00${n}`,
  last_name: `Ln00${n}`,
  agent_email: null,
  agent_phone: null,
  group_id: 'West',
  agent_status: 'Active',
  is_team_lead: false,
  archived: false,
  created_at: `2024-01-0${n}T00:00:00Z`,
  custom_exp_cap_date: '2026-03-01',
  custom_team_cap_split: 20,
  custom_team_cap_amount: 6000,
  custom_east_cap_split: '10%',
  custom_east_cap_amount: null,
  ...extra,
});
const AG = {
  lead: agent(1, { is_team_lead: true, custom_team_cap_split: null }),
  lead2: agent(2, { is_team_lead: true, group_id: 'East', custom_east_cap_split: null }),
  a: agent(3),
  b: agent(4, { group_id: 'East' }),
  c: agent(5, { custom_team_cap_amount: 1500 }),
};
const agents = Object.values(AG);
const lookupAgents = agents.map(({ ...row }) => row);

const entities = [
  { id: 'ENT_00000000000A', client_id: C, entity_name: 'Company Comm', entity_type: 'BROKERAGE', waterfall_sort_order: 1 },
  { id: 'ENT_00000000000B', client_id: C, entity_name: 'Referral Partner', entity_type: 'REFERRAL', waterfall_sort_order: 2 },
  { id: 'ENT_00000000000C', client_id: C, entity_name: 'TC Fee', entity_type: 'VENDOR', waterfall_sort_order: 3 },
  { id: 'ENT_00000000000D', client_id: C, entity_name: 'Stock Program', entity_type: 'PROGRAM', waterfall_sort_order: 4 },
];

const TPL = 'TPL_SYNTH0000001';
const parameter = (key: string, type: string, sort: number) => ({ id: `TPP_${key}`, template_id: TPL, parameter_name: key, parameter_key: key, data_type: type, sort_order: sort, is_user_editable: true });
const parameters = [
  parameter('agent_1', 'AGENT_PICKER', 1),
  parameter('a1_split_percent', 'PERCENT', 2),
  parameter('agent_2', 'AGENT_PICKER', 3),
  parameter('a2_split_percent', 'PERCENT', 4),
  parameter('team_lead', 'AGENT_PICKER', 5),
  parameter('referral_amount', 'CURRENCY', 6),
  parameter('a1_cap_reset', 'DATE', 7),
  parameter('stock_option', 'SELECT', 8),
];
const step = (n: number, fields: Record<string, unknown>) => ({ id: `TPR_${String(n).padStart(3, '0')}`, template_id: TPL, step_number: n, show_in_popup: false, ...fields });
const steps = [
  step(1, { rule_name: 'Referral', rule_key: 'referral', section: 'Off-the-top', payee_entity_id: 'ENT_00000000000B', apply_condition: 'referral_amount > 0', calculation_formula: 'referral_amount', split_type: 'AMOUNT' }),
  step(2, { rule_name: 'TC Fee', rule_key: 'tc_fee', section: 'Pre-splits', payee_entity_id: 'ENT_00000000000C', calculation_formula: '250', split_type: 'AMOUNT' }),
  step(3, { rule_name: 'Agent 1 Split', rule_key: 'a1_split', section: 'Agent Splits', agent_key: 'agent_1', calculation_formula: 'baseline * a1_split_percent', split_type: 'PERCENT' }),
  step(4, { rule_name: 'Agent 2 Split', rule_key: 'a2_split', section: 'Agent Splits', agent_key: 'agent_2', apply_condition: 'agent_2 <> ""', calculation_formula: 'baseline * a2_split_percent', split_type: 'PERCENT' }),
  step(5, { rule_name: 'Team Lead Split', rule_key: 'tl_split', section: 'Agent Splits', agent_key: 'team_lead', apply_condition: 'team_lead <> ""', calculation_formula: 'IFERROR(team_cap.total, 0)', split_type: 'AMOUNT' }),
  step(6, { rule_name: 'A1 Company Comm', rule_key: 'a1_company', section: 'Level 1 Post-splits', agent_key: 'agent_1', payee_entity_id: 'ENT_00000000000A', calculation_formula: 'MIN(baseline * 20%, MAX(0, 5000 - SUMIFS(transaction_commission_items.final_amount, transaction_commission_items.agent_id, agent_1, commission_entities.entity_name, "Company Comm", transactions.closing_date, ">=" & a1_cap_reset, transactions.closing_date, "<" & closing_date, transactions.transaction_status, "Closed")))', split_type: 'PERCENT' }),
  step(7, { rule_name: 'A2 Company Comm', rule_key: 'a2_company', section: 'Level 1 Post-splits', agent_key: 'agent_2', payee_entity_id: 'ENT_00000000000A', apply_condition: 'agent_2 <> ""', calculation_formula: 'baseline * 20%', split_type: 'PERCENT' }),
  step(8, { rule_name: 'A1 Stock', rule_key: 'a1_stock', section: 'Level 2 Post-splits', agent_key: 'agent_1', payee_entity_id: 'ENT_00000000000D', apply_condition: 'stock_option = "Yes"', calculation_formula: 'baseline * 5%', split_type: 'PERCENT' }),
];

const teamCaps = [
  { id: 'CTC_000000000001', name: 'Fn001 Team Cap', key: 'team_cap', enabled: true, qualifying_formula: 'AND(lead_source="#Agent Lead", transaction_side <> "Tenant")', split_percent_field_key: 'custom_team_cap_split', cap_amount_field_key: 'custom_team_cap_amount', reset_date_field_key: 'custom_exp_cap_date', recipient_agent_id: AG.lead.id },
  { id: 'CTC_000000000002', name: 'East Cap', key: 'east_cap', enabled: true, qualifying_formula: 'XLOOKUP(agent_id, agents.id, agents.group_id) = "East"', split_percent_field_key: 'custom_east_cap_split', cap_amount_field_key: 'custom_east_cap_amount', reset_date_field_key: 'custom_exp_cap_date', recipient_agent_id: AG.lead2.id },
];

const field = (key: string, type: string, sort: number) => ({ id: `CFC_${key}`, client_id: C, target_table: 'transactions', field_key: key, field_label: key, field_type: type, section_name: 'General', is_enabled: true, sort_order: sort });
const catalog = [
  field('sales_price', 'CURRENCY', 1), field('gci_perc', 'PERCENT', 2), field('total_commission', 'CURRENCY', 3),
  field('lead_source', 'SELECT', 4), field('transaction_side', 'SELECT', 5), field('closing_date', 'DATE', 6),
  field('agent_id', 'AGENT_PICKER', 7), field('transaction_status', 'SELECT', 8),
];

const client: ClientFixture = {
  clientId: C,
  agents,
  lookupAgents,
  fieldConfigurations: catalog,
  schema: { catalog },
  entities,
  templates: [{ id: TPL, client_id: C, template_name: 'Synthetic Template', is_active: true, eligibility_formula: 'transaction_status <> "Cancelled"' }],
  bundles: { [TPL]: { parameters, steps } },
  allocationConfig: { teamCaps, agentCaps: [], salesVolume: null },
  teamCapHistory: [
    { agentId: AG.c.id, amount: 1500, periodStart: '2026-03-01', teamCapId: 'CTC_000000000001', transactionId: 'TXN_SYNTH_PRIOR1' },
    { agentId: AG.a.id, amount: 1000, periodStart: '2026-03-01', teamCapId: 'CTC_000000000001', transactionId: 'TXN_SYNTH_PRIOR2' },
  ],
};

type Line = { section: string; agent?: string; entity?: string; type: 'PERCENT' | 'AMOUNT'; value: number; amount: number; manual?: boolean };
let lineId = 0;
const items = (dealId: string, lines: Line[]) => lines.map((line, index) => ({
  id: `TCI_${dealId.slice(-6)}${String(++lineId).padStart(6, '0')}`,
  client_id: C,
  transaction_id: dealId,
  submission_id: null,
  step_number: index + 1,
  section: line.section,
  split_type: line.type,
  split_value: line.value,
  payee_type: line.agent && line.section === 'AGENT_SPLIT' ? 'AGENT' : 'ENTITY',
  payee_entity_id: line.entity ?? null,
  agent_id: line.agent ?? null,
  final_amount: line.amount,
  archived: false,
  custom_attributes: line.manual ? { manual_split: true } : {},
}));
const submission = (dealId: string, parameters: Record<string, string>) => [{ id: `CTS_${dealId.slice(-8)}`, client_id: C, transaction_id: dealId, template_id: TPL, submitted_parameters: parameters, status: 'SUBMITTED', archived: false }];
const deal = (id: string, fields: Record<string, unknown>) => ({
  id, client_id: C, tms_id: null, transaction_status: 'Closed', transaction_side: 'Buyer', property_address: `${id.slice(-3)} Example Street`,
  client_name: 'Client', lead_source: 'Zillow', sales_price: 1000000, gci_perc: 0.03, gci_amount: 30000, total_commission: 30000,
  closing_date: '2026-06-15', agent_id: AG.a.id, custom_attributes: {}, archived: false, ...fields,
});
const ledger = (rows: [number, string, string, string][]): DealFixture['ledger'] =>
  rows.map(([amount, agentId, closing, status], index) => [amount, agentId, 'ENT_00000000000A', 'POST_SPLIT', `TXN_SYNTH_L${index}`, closing, status]);
const priorLedger = ledger([[3000, AG.a.id, '2026-04-01', 'Closed'], [800, AG.a.id, '2026-05-01', 'Closed'], [999, AG.a.id, '2026-05-02', 'Pending'], [2000, AG.a.id, '2025-12-01', 'Closed']]);

const deals: Record<string, DealFixture> = {
  // One agent, no team cap, saved lines match the template.
  TXN_SYNTH_PLAIN1: {
    deal: deal('TXN_SYNTH_PLAIN1', {}),
    items: items('TXN_SYNTH_PLAIN1', [
      { section: 'PRE_SPLIT', entity: 'ENT_00000000000C', type: 'AMOUNT', value: 250, amount: 250 },
      { section: 'AGENT_SPLIT', agent: AG.a.id, type: 'PERCENT', value: 1, amount: 29750 },
      { section: 'POST_SPLIT', agent: AG.a.id, entity: 'ENT_00000000000A', type: 'PERCENT', value: 0.0067, amount: 200 },
    ]),
    submissions: submission('TXN_SYNTH_PLAIN1', { agent_1: AG.a.id, a1_split_percent: '100%', agent_2: '', a2_split_percent: '', team_lead: '', referral_amount: '', a1_cap_reset: '2026-03-01', stock_option: 'No' }),
    teamCapRows: [], allocationRows: [], ledger: priorLedger,
  },
  // Two agents on an agent lead: the team cap takes 20% of agent 2 for the lead, who is named in the template.
  TXN_SYNTH_TEAMCAP: {
    deal: deal('TXN_SYNTH_TEAMCAP', { lead_source: '#Agent Lead', agent_id: AG.a.id }),
    items: items('TXN_SYNTH_TEAMCAP', [
      { section: 'PRE_SPLIT', entity: 'ENT_00000000000C', type: 'AMOUNT', value: 250, amount: 250 },
      { section: 'AGENT_SPLIT', agent: AG.a.id, type: 'PERCENT', value: 0.6, amount: 13850 },
      { section: 'AGENT_SPLIT', agent: AG.c.id, type: 'PERCENT', value: 0.4, amount: 11800 },
      { section: 'AGENT_SPLIT', agent: AG.lead.id, type: 'AMOUNT', value: 4100, amount: 4100 },
      { section: 'POST_SPLIT', agent: AG.a.id, entity: 'ENT_00000000000A', type: 'PERCENT', value: 0.0866, amount: 1200 },
      { section: 'POST_SPLIT', agent: AG.c.id, entity: 'ENT_00000000000A', type: 'PERCENT', value: 0.2, amount: 2360 },
    ]),
    submissions: submission('TXN_SYNTH_TEAMCAP', { agent_1: AG.a.id, a1_split_percent: '60%', agent_2: AG.c.id, a2_split_percent: '40%', team_lead: AG.lead.id, referral_amount: '', a1_cap_reset: '2026-03-01', stock_option: 'No' }),
    teamCapRows: [], allocationRows: [], ledger: priorLedger,
  },
  // Agent 2 already reached the yearly cap: the cap line is tracked at $0.
  TXN_SYNTH_CAPREACHED: {
    deal: deal('TXN_SYNTH_CAPREACHED', { lead_source: '#Agent Lead', agent_id: AG.c.id, closing_date: '2026-09-01' }),
    items: items('TXN_SYNTH_CAPREACHED', [
      { section: 'AGENT_SPLIT', agent: AG.c.id, type: 'PERCENT', value: 1, amount: 29750 },
      { section: 'PRE_SPLIT', entity: 'ENT_00000000000C', type: 'AMOUNT', value: 250, amount: 250 },
    ]),
    submissions: submission('TXN_SYNTH_CAPREACHED', { agent_1: AG.c.id, a1_split_percent: '100%', agent_2: '', a2_split_percent: '', team_lead: '', referral_amount: '', a1_cap_reset: '2026-03-01', stock_option: 'No' }),
    teamCapRows: [], allocationRows: [], ledger: [],
  },
  // Both caps qualify; the submission unchecked the team cap and kept East Cap, whose lead the template does not name.
  TXN_SYNTH_UNCHECKED: {
    deal: deal('TXN_SYNTH_UNCHECKED', { lead_source: '#Agent Lead', agent_id: AG.b.id }),
    items: items('TXN_SYNTH_UNCHECKED', [
      { section: 'AGENT_SPLIT', agent: AG.b.id, type: 'PERCENT', value: 0.9, amount: 26775 },
      { section: 'AGENT_SPLIT', agent: AG.lead2.id, type: 'PERCENT', value: 0.1, amount: 2975 },
      { section: 'PRE_SPLIT', entity: 'ENT_00000000000C', type: 'AMOUNT', value: 250, amount: 250 },
    ]),
    submissions: submission('TXN_SYNTH_UNCHECKED', { agent_1: AG.b.id, a1_split_percent: '100%', agent_2: '', a2_split_percent: '', team_lead: '', referral_amount: '', a1_cap_reset: '2026-03-01', stock_option: 'No', __team_cap_ids: JSON.stringify(['CTC_000000000002']) }),
    teamCapRows: [{ id: 'TTC_1', agent_id: AG.b.id, amount: 2000, calculated_amount: 2975, is_override: true, period_start: null, team_cap_id: 'CTC_000000000002' }],
    allocationRows: [], ledger: [],
  },
  // A referral off the top, the TC fee, two agents and the stock program (level 2). Saved before the referral changed.
  TXN_SYNTH_REFERRAL: {
    deal: deal('TXN_SYNTH_REFERRAL', { agent_id: AG.a.id, transaction_side: 'Seller', sales_price: 750000, gci_perc: 0.025, total_commission: null }),
    items: items('TXN_SYNTH_REFERRAL', [
      { section: 'OFF_THE_TOP', entity: 'ENT_00000000000B', type: 'AMOUNT', value: 3000, amount: 3000 },
      { section: 'PRE_SPLIT', entity: 'ENT_00000000000C', type: 'AMOUNT', value: 250, amount: 250 },
      { section: 'AGENT_SPLIT', agent: AG.a.id, type: 'PERCENT', value: 0.5, amount: 7750 },
      { section: 'AGENT_SPLIT', agent: AG.b.id, type: 'PERCENT', value: 0.5, amount: 7750 },
      { section: 'POST_SPLIT', agent: AG.a.id, entity: 'ENT_00000000000A', type: 'PERCENT', value: 0.0258, amount: 200 },
      { section: 'POST_SPLIT', agent: AG.b.id, entity: 'ENT_00000000000A', type: 'PERCENT', value: 0.2, amount: 1550 },
      { section: 'POST_SPLIT_L2', agent: AG.a.id, entity: 'ENT_00000000000D', type: 'PERCENT', value: 0.05, amount: 377.5 },
    ]),
    submissions: submission('TXN_SYNTH_REFERRAL', { agent_1: AG.a.id, a1_split_percent: '50%', agent_2: AG.b.id, a2_split_percent: '50%', team_lead: '', referral_amount: '2500', a1_cap_reset: '2026-03-01', stock_option: 'Yes' }),
    teamCapRows: [], allocationRows: [], ledger: priorLedger,
  },
  // Cancelled, never submitted: only the saved lines.
  TXN_SYNTH_CANCELLED: {
    deal: deal('TXN_SYNTH_CANCELLED', { transaction_status: 'Cancelled', agent_id: AG.b.id, closing_date: null }),
    items: items('TXN_SYNTH_CANCELLED', [
      { section: 'AGENT_SPLIT', agent: AG.b.id, type: 'PERCENT', value: 0.7, amount: 21000 },
      { section: 'AGENT_SPLIT', agent: AG.c.id, type: 'AMOUNT', value: 9000, amount: 9000 },
    ]),
    submissions: [], teamCapRows: [], allocationRows: [], ledger: [],
  },
  // A split saved as typed by hand, beside a team cap the template does not name (the lead is added by the engine).
  TXN_SYNTH_MANUAL: {
    deal: deal('TXN_SYNTH_MANUAL', { lead_source: '#Agent Lead', agent_id: AG.a.id }),
    items: items('TXN_SYNTH_MANUAL', [
      { section: 'AGENT_SPLIT', agent: AG.a.id, type: 'PERCENT', value: 0.65, amount: 19337.5 },
      { section: 'AGENT_SPLIT', agent: AG.c.id, type: 'AMOUNT', value: 10000, amount: 10000, manual: true },
      { section: 'AGENT_SPLIT', agent: AG.lead.id, type: 'PERCENT', value: 0, amount: 412.5 },
      { section: 'PRE_SPLIT', entity: 'ENT_00000000000C', type: 'AMOUNT', value: 250, amount: 250 },
    ]),
    submissions: submission('TXN_SYNTH_MANUAL', { agent_1: AG.a.id, a1_split_percent: '70%', agent_2: AG.c.id, a2_split_percent: '30%', team_lead: '', referral_amount: '', a1_cap_reset: '2026-03-01', stock_option: 'No', __team_cap_ids: JSON.stringify(['CTC_000000000001']) }),
    teamCapRows: [], allocationRows: [], ledger: priorLedger,
  },
};

fs.mkdirSync(path.join(root, 'deals'), { recursive: true });
fs.writeFileSync(path.join(root, 'shared.json'), `${JSON.stringify(client, null, 2)}\n`);
for (const [id, fixture] of Object.entries(deals)) {
  fs.writeFileSync(path.join(root, 'deals', `${id}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
}
console.log(`Wrote ${Object.keys(deals).length} SYNTH deals to ${path.relative(process.cwd(), root)}`);
