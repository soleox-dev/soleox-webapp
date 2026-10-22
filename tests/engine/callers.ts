/**
 * Runs a golden fixture through the commission engine the way each screen does, and returns what the screen
 * shows or saves. The fixture is the API responses; the wiring here is the screens' own (each block names the
 * caller it follows), so a change in what a screen computes shows up as a golden diff.
 */
import { normalizeAgentName } from '@/lib/id';
import {
  configuredTeamCaps,
  qualifyingTeamCaps,
  readTeamCapSelection,
  TEAM_CAP_SELECTION_KEY,
  writeTeamCapSelection,
  allocationLookupTables,
  type DealAllocationContext,
} from '@/lib/agent-allocations';
import {
  allocationForReplay,
  payoutSignature,
  replayedPaymentSignature,
  savedPayouts,
} from '@/lib/template-payment-drift';
import { transactionQualifiesForTemplate } from '@/lib/transaction-default-view';
import { formulaLookupSource } from '@/lib/formula-lookup-tables';
import { computeTransactionWaterfall } from '@/app/(dashboard)/commission-tracker/transactions/[id]/hooks/useTransactionWaterfall';
import {
  applyTemplateLogic,
  formulaDataNeeds,
  formulaLookupRow,
  templateFormulaSources,
  type AppliedTemplateRules,
  type NamedParty,
  type TemplateLogicStep,
} from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/applyTemplateLogic';
import {
  isPrimaryAgent,
  resolvePrimaryAgentId,
  waterfallFromCommissionItems,
  type StoredCommissionItem,
} from '@/app/(dashboard)/commission-tracker/transactions/[id]/commissionItemState';
import {
  readTransactionField,
  roundCurrency,
  roundPercentRate,
  type AgentConfig,
  type CommissionEntityOption,
  type FieldSetting,
  type KnownAgentInfo,
} from '@/app/(dashboard)/commission-tracker/transactions/[id]/types';
import type { FormulaLedgerRow, FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import type { ApiRow, ClientFixture, DealFixture } from './fixtures';

type Ctx = { client: ClientFixture; fx: DealFixture; dealId: string };

// ---------------------------------------------------------------------------------------------------------
// API responses → what each screen loads (fetch + map). These follow the screens' own mapping code.
// ---------------------------------------------------------------------------------------------------------

const AGENT_DIRECTORY_KEYS = new Set([
  'id', 'agent_id', 'client_id', 'user_id', 'tms_id', 'agent_name', 'name', 'full_name', 'agent_email', 'email',
  'agent_phone', 'phone', 'group_id', 'agent_status', 'is_team_lead', 'isTeamLead', 'agent_onboard_date',
  'agent_offboard_date', 'custom_attributes', 'commission_attributes', 'archived', 'created_at', 'created_by',
  'updated_at', 'updated_by',
]);

/** useTransactionData agentFormulaFields */
function agentFormulaFields(agent: Record<string, unknown>): Record<string, string> {
  const source: Record<string, unknown> = { ...agent };
  const custom = source.custom_attributes;
  if (typeof custom === 'string') {
    try {
      const parsed = JSON.parse(custom) as unknown;
      if (parsed && typeof parsed === 'object') Object.assign(source, parsed);
    } catch {
      // ignored, as on the page
    }
  } else if (custom && typeof custom === 'object') {
    Object.assign(source, custom);
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (AGENT_DIRECTORY_KEYS.has(key) || value === null || value === undefined || value === '') continue;
    if (typeof value === 'object') continue;
    fields[key] = String(value);
  }
  return fields;
}

/** Transaction Detail: useTransactionData knownAgents */
export function pageKnownAgents(client: ClientFixture): KnownAgentInfo[] {
  return client.agents.map((ag) => ({
    id: ag.id || `AGT_${ag.agent_name}`,
    name: ag.agent_name || ag.name || ag.full_name || 'Unnamed Agent',
    email: ag.agent_email || ag.email,
    isTeamLead: Boolean(ag.is_team_lead || ag.isTeamLead),
    clientId: ag.client_id ? String(ag.client_id) : undefined,
    fields: agentFormulaFields(ag),
  }));
}

/** Transaction Detail: useTransactionData knownEntities */
export function pageKnownEntities(client: ClientFixture): CommissionEntityOption[] {
  return client.entities.map((e) => ({
    id: e.id,
    name: e.entity_name || e.name || 'Unnamed Entity',
    type: e.entity_type || e.type,
    waterfallSortOrder: e.waterfall_sort_order == null ? null : Number(e.waterfall_sort_order),
  }));
}

/** Transaction Detail: useTransactionData loadSchema */
function pageOverviewFields(client: ClientFixture): FieldSetting[] {
  return (client.schema.catalog || [])
    .filter((f) => f.is_enabled !== false)
    .map((f, idx) => ({
      id: f.id || `schema_${idx}`,
      label: f.field_label || f.field_key,
      key: f.field_key,
      type: f.field_type || 'TEXT',
      section: f.section_name || f.section || f.section_title || f.group_name || f.group || 'General Info',
      storage_type: f.storage_type || 'CUSTOM_JSON',
      is_required: Boolean(f.is_required),
      options: f.dropdown_options || f.options || [],
      calculation_formula: f.calculation_formula && f.calculation_formula.trim().length > 0 ? f.calculation_formula.trim() : undefined,
      key_terms_position: f.key_terms_position ?? null,
    }));
}

/** GET /api/transactions/[id]/items selects these columns and casts the numbers. */
function pageItems(items: ApiRow[]): StoredCommissionItem[] {
  const columns = ['id', 'client_id', 'transaction_id', 'submission_id', 'step_number', 'section', 'split_type', 'split_value', 'payee_type', 'payee_entity_id', 'agent_id', 'final_amount'];
  return [...items]
    .sort((a, b) => Number(a.step_number || 0) - Number(b.step_number || 0))
    .map((row) => {
      const picked: Record<string, unknown> = {};
      columns.forEach((key) => { picked[key] = row[key] ?? null; });
      return {
        ...picked,
        step_number: Number(row.step_number || 0),
        split_value: row.split_value === null || row.split_value === undefined || row.split_value === '' ? null : Number(row.split_value),
        final_amount: Number(row.final_amount || 0),
      } as StoredCommissionItem;
    });
}

/** loadFormulaLookups: the fixture holds the agents and field configuration tables. */
function lookupsFor(client: ClientFixture, tables: readonly string[]): FormulaLookups {
  const wanted = [...new Set([...tables, 'client_field_configurations'])];
  const result: FormulaLookups['tables'] = {};
  for (const table of wanted) {
    const source = formulaLookupSource(table);
    if (!source) continue;
    const rows = source === 'agents' ? client.lookupAgents : source === 'client_field_configurations' ? client.fieldConfigurations : null;
    if (!rows) throw new Error(`The fixture has no ${source} lookup table.`);
    result[table] = rows.flatMap((record) => {
      const row = formulaLookupRow(client.clientId, record);
      return row ? [row] : [];
    });
  }
  return { clientId: client.clientId, tables: result };
}

/** applyTemplateLogic labelLedger */
function ledgerFor(fx: DealFixture, entities: { id: string; name: string }[]): FormulaLedgerRow[] {
  const names = new Map(entities.map((entity) => [entity.id, entity.name]));
  const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  return fx.ledger.map(([finalAmount, agentId, entityId, section, transactionId, closingDate, status]) => {
    const closing = text(closingDate).trim();
    return {
      fields: {
        'transaction_commission_items.final_amount': text(finalAmount),
        'transaction_commission_items.agent_id': text(agentId),
        'transaction_commission_items.payee_entity_id': text(entityId),
        'transaction_commission_items.section': text(section),
        'commission_entities.entity_name': names.get(text(entityId)) || '',
        'transactions.closing_date': closing.length >= 10 ? closing.slice(0, 10) : closing,
        'transactions.transaction_status': text(status),
        'transactions.id': text(transactionId),
      },
    };
  });
}

function parameterRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    record[key] = raw === undefined || raw === null ? '' : String(raw);
  }
  return record;
}

function stripParameters(value: unknown): Record<string, string> {
  const { [TEAM_CAP_SELECTION_KEY]: omitted, ...parameters } = parameterRecord(value);
  void omitted;
  return parameters;
}

function teamCapFromRow(row: ApiRow) {
  return {
    id: String(row.id || ''),
    name: String(row.name || 'Team Cap'),
    key: row.key ? String(row.key) : null,
    enabled: Boolean(row.enabled),
    qualifyingFormula: row.qualifying_formula || null,
    splitPercentFieldKey: row.split_percent_field_key || null,
    capAmountFieldKey: row.cap_amount_field_key || null,
    resetDateFieldKey: row.reset_date_field_key || null,
    recipientAgentId: row.recipient_agent_id || null,
  };
}

function volumeFromRow(row: ApiRow | null): DealAllocationContext['salesVolume'] {
  if (!row) return null;
  return {
    enabled: Boolean(row.enabled),
    qualifyingFormula: row.qualifying_formula || null,
    anchor: row.anchor === 'sales_price_x_units' ? 'sales_price_x_units' : 'sales_price',
    assignment: row.assignment === 'primary_agent' ? 'primary_agent' : 'agent_share',
  };
}

function storedOverrides(fx: DealFixture): DealAllocationContext['overrides'] {
  return [
    ...fx.teamCapRows.flatMap((row) => (!row.is_override || !row.agent_id ? [] : [{ agentId: row.agent_id, kind: 'team_cap' as const, amount: Number(row.amount) || 0, teamCapId: row.team_cap_id || null }])),
    ...fx.allocationRows.flatMap((row) => (!row.is_override || !row.agent_id ? [] : [{ agentId: row.agent_id, kind: 'sales_volume' as const, amount: Number(row.amount) || 0, teamCapId: null }])),
  ];
}

// ---------------------------------------------------------------------------------------------------------
// Transaction Detail
// ---------------------------------------------------------------------------------------------------------

type PendingSubmission = {
  template_id: string;
  submitted_parameters: Record<string, string>;
  team_cap_ids?: string[];
  team_cap_recipients?: { id: string; name: string; isTeamLead: boolean }[];
};

type PageState = {
  agents: AgentConfig[];
  offTheTopRules: ReturnType<typeof waterfallFromCommissionItems>['offTheTopRules'];
  preSplitRules: ReturnType<typeof waterfallFromCommissionItems>['preSplitRules'];
  postSplitRulesByAgent: ReturnType<typeof waterfallFromCommissionItems>['postSplitRulesByAgent'];
  postSplit2RulesByAgent: ReturnType<typeof waterfallFromCommissionItems>['postSplit2RulesByAgent'];
  selectedTeamCapIds: string[] | null;
  pending: PendingSubmission | null;
  /** True for the saved, unedited waterfall (storedAgentSplits is passed). */
  showingSaved: boolean;
};

function pageBase(ctx: Ctx) {
  const { client, fx } = ctx;
  const deal = fx.deal;
  const knownAgents = pageKnownAgents(client);
  const knownEntities = pageKnownEntities(client);
  const overviewFields = pageOverviewFields(client);
  const rawAgent = deal.agent_id || deal.primary_agent || '';
  const foundAgent = knownAgents.find((a) => a.id === rawAgent || a.name.toLowerCase() === String(rawAgent).toLowerCase());
  const primaryAgent = foundAgent ? foundAgent.name : (deal.primary_agent || rawAgent);
  const commissionItems = pageItems(fx.items);
  const submitted = fx.submissions[0];
  return {
    deal,
    knownAgents,
    knownEntities,
    overviewFields,
    primaryAgent,
    foundAgent,
    commissionItems,
    submitted,
    salesPrice: deal.sales_price ? Math.abs(Number(deal.sales_price)) : 0,
    gciPerc: Number(deal.gci_perc) || 0,
    clientType: deal.client_type || deal.deal_type || deal.transaction_side || '',
    closingDate: deal.closing_date ? String(deal.closing_date).substring(0, 10) : '',
  };
}

function savedPageState(ctx: Ctx): PageState {
  const base = pageBase(ctx);
  const waterfall = waterfallFromCommissionItems(base.commissionItems, base.knownAgents, base.knownEntities, base.foundAgent?.id || base.deal.agent_id || null);
  return {
    ...waterfall,
    // CommissionTemplatePanel loadSubmission → onTeamCapSelection
    selectedTeamCapIds: base.submitted ? readTeamCapSelection(parameterRecord(base.submitted.submitted_parameters)) : null,
    pending: null,
    showingSaved: true,
  };
}

function templateReplayFor(ctx: Ctx, base: ReturnType<typeof pageBase>, pending: PendingSubmission | null) {
  // useSubmittedTemplateReplay
  const templateId = pending?.template_id || String(base.submitted?.template_id || '').trim();
  if (!templateId) return null;
  const bundle = ctx.client.bundles[templateId];
  if (!bundle) throw new Error(`Fixture has no bundle for ${templateId}.`);
  const steps = bundle.steps as TemplateLogicStep[];
  const needs = formulaDataNeeds(templateFormulaSources(steps, bundle.parameters));
  return {
    steps,
    parameters: pending ? stripParameters(pending.submitted_parameters) : stripParameters(base.submitted?.submitted_parameters),
    parameterTypes: Object.fromEntries(bundle.parameters.map((parameter) => [String(parameter.parameter_key || ''), parameter.data_type || ''])),
    entities: base.knownEntities as NamedParty[],
    rosterAgents: base.knownAgents as NamedParty[],
    ledger: needs.needsLedger ? ledgerFor(ctx.fx, base.knownEntities) : [],
    lookups: needs.lookupTables.length > 0 ? lookupsFor(ctx.client, needs.lookupTables) : { clientId: ctx.client.clientId, tables: {} },
  };
}

function allocationInputFor(ctx: Ctx, base: ReturnType<typeof pageBase>, agents: AgentConfig[]): DealAllocationContext {
  // useAgentAllocationInput
  const teamCaps = (ctx.client.allocationConfig.teamCaps || []).map(teamCapFromRow).filter((cap) => cap.id);
  const salesVolume = volumeFromRow(ctx.client.allocationConfig.salesVolume);
  const tables = allocationLookupTables(teamCaps, salesVolume);
  let lookups: FormulaLookups | null = null;
  if (tables.length > 0) {
    try {
      lookups = lookupsFor(ctx.client, tables);
    } catch {
      lookups = null;
    }
  }
  const unitsRaw = readTransactionField(base.deal, 'units');
  const units = unitsRaw === undefined || unitsRaw === null || String(unitsRaw).trim() === '' ? 1 : Math.max(0, Number(unitsRaw) || 0);
  return {
    teamCaps,
    salesVolume,
    profiles: agents.map((agent) => ({
      agentId: agent.id,
      fields: base.knownAgents.find((known) => known.id === agent.id)?.fields || {},
    })),
    // GET /api/transaction-team-caps?history=1&exclude_transaction_id=…
    history: ctx.client.teamCapHistory
      .filter((row) => row.transactionId !== ctx.dealId)
      .map(({ agentId, amount, periodStart, teamCapId }) => ({ agentId, amount, periodStart, teamCapId })),
    overrides: storedOverrides(ctx.fx),
    deal: { ...(base.deal || {}) },
    dealDate: String(base.closingDate || '').substring(0, 10) || null,
    salesPrice: base.salesPrice,
    units,
    fieldTypes: Object.fromEntries(base.overviewFields.map((field) => [field.key, field.type])),
    lookups,
  };
}

/** Transaction Detail: everything the page computes from one state of the waterfall. */
function pageView(ctx: Ctx, state: PageState) {
  const base = pageBase(ctx);
  const { deal, knownAgents, knownEntities } = base;
  const agents = state.agents;
  const primaryAgentId = resolvePrimaryAgentId(deal.agent_id || base.primaryAgent, base.commissionItems, knownAgents);
  const allocationInput = allocationInputFor(ctx, base, agents);
  const allocationForWaterfall = { ...allocationInput, selectedTeamCapIds: state.selectedTeamCapIds };
  const templateReplay = templateReplayFor(ctx, base, state.pending);
  const storedAgentSplits = state.showingSaved
    ? base.commissionItems
      .filter((item) => item?.section === 'AGENT_SPLIT' && item.agent_id && item.final_amount != null)
      .map((item) => ({ agentId: String(item.agent_id), amount: Number(item.final_amount) || 0 }))
    : null;

  const run = (replay: typeof templateReplay) => computeTransactionWaterfall({
    salesPrice: base.salesPrice,
    gciPerc: base.gciPerc,
    offTheTopRules: state.offTheTopRules,
    preSplitRules: state.preSplitRules,
    postSplitRulesByAgent: state.postSplitRulesByAgent,
    postSplit2RulesByAgent: state.postSplit2RulesByAgent,
    agents,
    primaryAgentId,
    overviewFields: base.overviewFields,
    selectedDeal: deal,
    overviewFormValues: {},
    clientType: base.clientType,
    allocation: allocationForWaterfall,
    templateReplay: replay,
    storedAgentSplits,
  });
  const dealResult = run(templateReplay);

  const idleAgentIds = new Set<string>(dealResult.idleAgentIds || []);
  const isIdleAgentItem = (item: { agentId?: string | null }) => Boolean(item.agentId && idleAgentIds.has(item.agentId));

  // handleSave: commission_items and payments
  const commissionItems = [
    ...dealResult.offTheTopItems.map((item: any, idx: number) => {
      const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
      const splitType = item.type || 'PERCENT';
      const cleanVal = item.value !== undefined && item.value !== null
        ? (splitType === 'PERCENT' ? roundPercentRate(Number(item.value)) : roundCurrency(Number(item.value)))
        : null;
      return { step_number: idx + 1, rule_name: item.entity || item.ruleName || 'Off-the-Top Deduction', section: 'OFF_THE_TOP', split_type: splitType, split_value: cleanVal, note: item.note || null, payee_type: 'ENTITY', payee_entity_id: matchedEntity?.id || null, agent_id: null, final_amount: item.amount };
    }),
    ...(dealResult.preSplitItems || []).map((item: any, idx: number) => {
      const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
      const splitType = item.type || 'PERCENT';
      const cleanVal = item.value !== undefined && item.value !== null
        ? (splitType === 'PERCENT' ? roundPercentRate(Number(item.value)) : roundCurrency(Number(item.value)))
        : null;
      return { step_number: 10 + idx + 1, rule_name: item.entity || item.ruleName || 'Pre-Split Deduction', section: 'PRE_SPLIT', split_type: splitType, split_value: cleanVal, note: item.note || null, payee_type: 'ENTITY', payee_entity_id: matchedEntity?.id || null, agent_id: null, final_amount: item.amount };
    }),
    ...dealResult.agentSplitItems.filter((item: any) => !isIdleAgentItem(item)).map((item: any, idx: number) => {
      const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
      const splitType = item.splitType || 'PERCENT';
      let cleanSplitVal: number | null = null;
      if (splitType === 'PERCENT') {
        const raw = item.percent !== undefined && item.percent !== null ? item.percent : (item.splitVal !== undefined && item.splitVal !== null ? item.splitVal : null);
        cleanSplitVal = raw !== null ? roundPercentRate(Number(raw)) : null;
      } else {
        cleanSplitVal = item.splitVal !== undefined && item.splitVal !== null ? roundCurrency(Number(item.splitVal)) : (item.amount !== undefined ? roundCurrency(Number(item.amount)) : null);
      }
      return { step_number: idx + 1, rule_name: `${item.agentName} Split`, section: 'AGENT_SPLIT', split_type: splitType, split_value: cleanSplitVal, note: null, payee_type: 'AGENT', payee_entity_id: null, agent_id: matchedAgent?.id || item.agentId || null, final_amount: item.amount, custom_attributes: item.manualSplit ? { manual_split: true } : {} };
    }),
    ...dealResult.postSplitItems.filter((item: any) => !isIdleAgentItem(item)).map((item: any, idx: number) => {
      const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
      const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
      const splitType = item.type || 'PERCENT';
      const cleanVal = item.value !== undefined && item.value !== null
        ? (splitType === 'PERCENT' ? roundPercentRate(Number(item.value)) : roundCurrency(Number(item.value)))
        : null;
      return { step_number: 30 + idx + 1, rule_name: item.entity || item.ruleName || 'Post-Split Deduction', section: 'POST_SPLIT', split_type: splitType, split_value: cleanVal, note: item.note || null, payee_type: item.entity === 'Broker' || item.entity === 'Brokerage' ? 'BROKERAGE' : 'ENTITY', payee_entity_id: matchedEntity?.id || null, agent_id: matchedAgent?.id || item.agentId || null, final_amount: item.amount };
    }),
    ...(dealResult.postSplit2Items || []).filter((item: any) => !isIdleAgentItem(item)).map((item: any, idx: number) => {
      const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
      const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
      const splitType = item.type || 'PERCENT';
      const cleanVal = item.value !== undefined && item.value !== null
        ? (splitType === 'PERCENT' ? roundPercentRate(Number(item.value)) : roundCurrency(Number(item.value)))
        : null;
      return { step_number: 50 + idx + 1, rule_name: item.entity || item.ruleName || 'Post-Split L2 Deduction', section: 'POST_SPLIT_L2', split_type: splitType, split_value: cleanVal, note: item.note || null, payee_type: 'ENTITY', payee_entity_id: matchedEntity?.id || null, agent_id: matchedAgent?.id || item.agentId || null, final_amount: item.amount };
    }),
  ];
  const closingForPayments = base.closingDate || 'TODAY';
  const currentAgentDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => agents.some((a) => a.name === e && !idleAgentIds.has(a.id))) as [string, number][];
  const currentEntityDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => !agents.some((a) => a.name === e)) as [string, number][];
  const primaryAgentName = agents.find((agent) => isPrimaryAgent(agent, primaryAgentId))?.name || (typeof base.primaryAgent === 'string' ? base.primaryAgent : '') || 'Primary Agent';
  const payments = [
    ...currentAgentDisbursements.map(([agentName, amount]) => {
      const matchedAgent = knownAgents.find((a) => a.name === agentName || a.id === agentName);
      return { payee_type: 'AGENT', agent_id: matchedAgent?.id || null, payee_entity_id: null, amount_paid: amount, payment_method: 'ACH', payment_status: 'Ready to Pay', disbursement_type: 'AGENT_NET', notes: `${matchedAgent?.name || agentName} (Agent) - Primary: ${primaryAgentName}`, payment_date: closingForPayments };
    }),
    ...currentEntityDisbursements.map(([entityName, amount]) => {
      const matchedEntity = knownEntities.find((e) => e.name === entityName || e.id === entityName);
      return { payee_type: entityName.toLowerCase().includes('broker') ? 'BROKERAGE' : 'ENTITY', agent_id: null, payee_entity_id: matchedEntity?.id || null, amount_paid: amount, payment_method: 'Escrow Wire', payment_status: 'Pending Escrow Wire', disbursement_type: 'THIRD_PARTY_DISBURSEMENT', notes: `${matchedEntity?.name || entityName} (Entity) - Primary: ${primaryAgentName}`, payment_date: closingForPayments };
    }),
  ];

  // allocationSaveKey
  const allocationRows = (dealResult.allocationLines || [])
    .filter((line) => line.tracked !== false)
    .map((line) => ({
      agentId: line.agent_id,
      kind: line.kind,
      amount: line.amount,
      calculatedAmount: line.calculated_amount,
      isOverride: line.is_override,
      periodStart: line.period_start,
      teamCapId: line.team_cap_id || null,
    }));

  // Save blockers
  const agentSplitExcess = Number(dealResult.agentSplitExcess) || 0;
  const agentSplitsExceedCommission = agentSplitExcess > 0.009;
  const commissionTotal = roundCurrency(Number(dealResult.totalCommission) || 0);
  const totalPayments = roundCurrency(Object.values(dealResult.netPayouts || {}).reduce((sum: number, amount) => sum + (Number(amount) || 0), 0));
  const qualificationFieldTypes = Object.fromEntries((ctx.client.schema.catalog || []).flatMap((field) => {
    const key = String(field.field_key || '').trim();
    return key ? [[key, String(field.field_type || 'TEXT')]] : [];
  }));
  const templateQualifies = ctx.client.templates.some((template) => (
    template.is_active !== false && transactionQualifiesForTemplate({ ...deal }, template.eligibility_formula || '', qualificationFieldTypes)
  ));
  const paymentsShortOfCommission = templateQualifies !== false && commissionTotal > 0.009 && roundCurrency(commissionTotal - totalPayments) > 0.009;
  const caps = allocationInput.teamCaps ?? [];
  const owed = new Map<string, number>();
  for (const line of (dealResult.allocationLines || [])) {
    if (line.kind !== 'team_cap') continue;
    const recipientId = caps.find((cap) => cap.id === line.team_cap_id)?.recipientAgentId;
    if (!recipientId || recipientId === line.agent_id) continue;
    owed.set(recipientId, roundCurrency((owed.get(recipientId) || 0) + (Number(line.amount) || 0)));
  }
  const capRecipientShortfalls = [...owed].flatMap(([recipientId, receives]) => {
    const split = (dealResult.agentSplitItems || []).find((item: { agentId?: string }) => item?.agentId === recipientId);
    const has = roundCurrency(Number(split?.amount) || 0);
    if (receives - has <= 0.009) return [];
    const name = split?.agentName || knownAgents.find((agent) => agent.id === recipientId)?.name || 'A team cap recipient';
    return [{ recipientId, name: String(name), receives, has }];
  });
  const capShortfallMessage = capRecipientShortfalls
    .map(({ name, receives, has }) => `${name}'s agent split is $${has.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, less than the $${receives.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} team caps move to them.`)
    .join(' ');
  const saveBlockedReason = [
    agentSplitsExceedCommission ? 'Agent splits are more than the remaining balance.' : '',
    paymentsShortOfCommission ? 'The entire commission has to be allocated among agents and entities.' : '',
    capShortfallMessage,
  ].filter(Boolean).join(' ');

  return {
    dealResult,
    commissionItems,
    payments,
    allocationRows,
    capRecipientShortfalls,
    saveBlocked: agentSplitsExceedCommission || paymentsShortOfCommission || capRecipientShortfalls.length > 0,
    saveBlockedReason,
    waterfallAgents: agents.filter((agent) => !idleAgentIds.has(agent.id)),
    totalCommissionForPanel: dealResult.totalCommission || dealResult.grossCommission || 0,
    allocationInput,
  };
}

/** page.tsx handleApplyTemplateRules */
function applyTemplateToPage(base: ReturnType<typeof pageBase>, state: PageState, applied: AppliedTemplateRules, submission: PendingSubmission): PageState {
  const agents = state.agents;
  const knownAgents = base.knownAgents;
  const nextOff = applied.offTheTopRules ?? [];
  const nextPre = applied.preSplitRules ?? [];
  const nextPost = applied.postSplitRulesByAgent ?? {};
  const nextPost2 = applied.postSplit2RulesByAgent ?? {};
  const orderedSplits = applied.agentSplits ?? [];
  const namesMatch = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();
  const primary = agents[0]?.name?.trim() ? agents[0] : null;
  const seen = new Set<string>();
  const agentNames = (orderedSplits.length > 0
    ? [...orderedSplits.map((split) => split.name), ...Object.keys(nextPost), ...Object.keys(nextPost2)]
    : [...(primary ? [primary.name] : []), ...Object.keys(nextPost), ...Object.keys(nextPost2)]
  ).filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const templateAgents: AgentConfig[] = agentNames.map((name) => {
    const known = knownAgents.find((agent) => namesMatch(agent.name, name));
    const previous = agents.find((agent) => namesMatch(agent.name, name));
    const split = orderedSplits.find((item) => namesMatch(item.name, name));
    const keptPrimary = orderedSplits.length === 0 && primary && namesMatch(primary.name, name) ? primary : null;
    return {
      id: known?.id || previous?.id || `AGT_${name.trim()}`,
      name: known?.name || previous?.name || name.trim(),
      isTeamLead: known?.isTeamLead ?? previous?.isTeamLead ?? false,
      splitType: split?.splitType ?? keptPrimary?.splitType ?? 'PERCENT',
      splitVal: split?.splitVal ?? keptPrimary?.splitVal ?? 0,
      brokerCapLimit: 0,
      brokerCapPaidYTD: 0,
      riskCapLimit: 0,
      riskPaidYTD: 0,
    };
  });
  const primaryAgentId = resolvePrimaryAgentId(base.deal.agent_id || base.primaryAgent, base.commissionItems, knownAgents);
  const primaryIndex = templateAgents.findIndex((agent) => isPrimaryAgent(agent, primaryAgentId));
  const orderedAgents = primaryIndex > 0
    ? [templateAgents[primaryIndex], ...templateAgents.filter((_, index) => index !== primaryIndex)]
    : templateAgents;
  const chosenCapIds = submission.team_cap_ids ?? null;
  const nextAgents = chosenCapIds == null ? orderedAgents : [
    ...orderedAgents,
    ...(submission.team_cap_recipients ?? []).flatMap((recipient) => {
      if (orderedAgents.some((agent) => agent.id === recipient.id)) return [];
      return [{ id: recipient.id, name: recipient.name, isTeamLead: Boolean(recipient.isTeamLead), splitType: 'PERCENT' as const, splitVal: 0, brokerCapLimit: 0, brokerCapPaidYTD: 0, riskCapLimit: 0, riskPaidYTD: 0 }];
    }),
  ];
  return {
    agents: nextAgents,
    offTheTopRules: nextOff,
    preSplitRules: nextPre,
    postSplitRulesByAgent: nextPost,
    postSplit2RulesByAgent: nextPost2,
    selectedTeamCapIds: submission.team_cap_ids ? submission.team_cap_ids : state.selectedTeamCapIds,
    pending: submission,
    showingSaved: false,
  };
}

/**
 * CommissionTemplatePanel submitTemplate, resubmitting the stored parameters with the stored (or default) team
 * cap boxes, then the page applying the result.
 */
function popupResubmit(ctx: Ctx, saved: PageState, savedView: ReturnType<typeof pageView>) {
  const base = pageBase(ctx);
  const submitted = base.submitted;
  if (!submitted?.template_id) return null;
  const bundle = ctx.client.bundles[submitted.template_id];
  const savedParameters = parameterRecord(submitted.submitted_parameters);
  const parameterValues: Record<string, string> = {};
  for (const parameter of bundle.parameters) {
    parameterValues[parameter.parameter_key] = Object.prototype.hasOwnProperty.call(savedParameters, parameter.parameter_key)
      ? savedParameters[parameter.parameter_key]
      : '';
  }
  // Popup team cap boxes: the stored choice, else the caps that qualify.
  const teamCaps = (ctx.client.allocationConfig.teamCaps || []).flatMap((row) => {
    const id = String(row.id || '').trim();
    return id ? [teamCapFromRow(row)] : [];
  });
  const shownCaps = configuredTeamCaps(teamCaps);
  const panelFieldTypes = Object.fromEntries((ctx.client.schema.catalog || []).flatMap((field) => {
    const key = String(field.field_key || '').trim();
    return key ? [[key, String(field.field_type || 'TEXT')]] : [];
  }));
  const capTables = [...new Set([...allocationLookupTables(teamCaps), 'client_field_configurations'])];
  const capLookups = lookupsFor(ctx.client, capTables);
  const qualifyingIds = qualifyingTeamCaps(teamCaps, base.deal, panelFieldTypes, capLookups).map((cap) => cap.id);
  const stored = readTeamCapSelection(savedParameters);
  const checkedCapIds = stored == null ? qualifyingIds : stored.filter((id) => shownCaps.some((cap) => cap.id === id));
  const teamCapIds = checkedCapIds.filter((id) => shownCaps.some((cap) => cap.id === id));
  const templateAgentRoster = base.knownAgents.map((agent) => ({ id: agent.id, name: agent.name, isTeamLead: agent.isTeamLead, clientId: agent.clientId, fields: agent.fields }));
  const seenRecipients = new Set<string>();
  const teamCapRecipients = shownCaps.flatMap((cap) => {
    if (!teamCapIds.includes(cap.id) || !cap.recipientAgentId || seenRecipients.has(cap.recipientAgentId)) return [];
    const recipient = templateAgentRoster.find((agent) => agent.id === cap.recipientAgentId);
    if (!recipient) return [];
    seenRecipients.add(recipient.id);
    return [{ id: recipient.id, name: recipient.name, isTeamLead: Boolean(recipient.isTeamLead) }];
  });
  const steps = bundle.steps as TemplateLogicStep[];
  const needs = formulaDataNeeds(templateFormulaSources(steps, bundle.parameters));
  const applied = applyTemplateLogic({
    steps,
    parameters: parameterValues,
    parameterTypes: Object.fromEntries(bundle.parameters.map((parameter) => [parameter.parameter_key, parameter.data_type || ''])),
    deal: base.deal,
    entities: base.knownEntities as NamedParty[],
    rosterAgents: templateAgentRoster,
    dealAgents: savedView.waterfallAgents.map((agent) => ({ id: agent.id, name: agent.name, isTeamLead: agent.isTeamLead })),
    totalCommission: savedView.totalCommissionForPanel,
    ledger: needs.needsLedger ? ledgerFor(ctx.fx, base.knownEntities) : [],
    lookups: needs.lookupTables.length > 0 ? lookupsFor(ctx.client, needs.lookupTables) : { clientId: ctx.client.clientId, tables: {} },
  });
  const submission: PendingSubmission = {
    template_id: submitted.template_id,
    submitted_parameters: writeTeamCapSelection(parameterValues, teamCapIds),
    team_cap_ids: teamCapIds,
    team_cap_recipients: teamCapRecipients,
  };
  const next = applyTemplateToPage(base, saved, applied, submission);
  return { applied, submission, view: pageView(ctx, next) };
}

// ---------------------------------------------------------------------------------------------------------
// Out-of-date payments check (template button and Transactions list)
// ---------------------------------------------------------------------------------------------------------

type DriftAgents = KnownAgentInfo[];

function driftCheck(ctx: Ctx, items: ApiRow[], knownAgents: DriftAgents, entities: CommissionEntityOption[], overviewFields: FieldSetting[], fieldTypes: Record<string, string>, rows: { templateId: string; parameters: Record<string, string> }[]) {
  const { client, fx, dealId } = ctx;
  const bundles = rows.map((row) => {
    const bundle = client.bundles[row.templateId];
    return { templateId: row.templateId, steps: bundle.steps as TemplateLogicStep[], parameterTypes: Object.fromEntries(bundle.parameters.map((p) => [String(p.parameter_key || ''), p.data_type || ''])) };
  });
  const needs = formulaDataNeeds(bundles.flatMap((bundle) => templateFormulaSources(bundle.steps, [])));
  const ledger = needs.needsLedger ? ledgerFor(fx, entities) : [];
  const lookups = needs.lookupTables.length > 0 ? lookupsFor(client, needs.lookupTables) : { clientId: client.clientId, tables: {} };
  const saved = payoutSignature(savedPayouts(items as StoredCommissionItem[], knownAgents, entities));
  const catalog = {
    teamCaps: (client.allocationConfig.teamCaps || []).flatMap((row) => (String(row.id || '') ? [teamCapFromRow(row)] : [])),
    salesVolume: volumeFromRow(client.allocationConfig.salesVolume),
  };
  const agentIds = new Set(knownAgents.map((agent) => agent.id));
  const history = client.teamCapHistory.filter((row) => agentIds.has(row.agentId));
  const capTables = allocationLookupTables(catalog.teamCaps, catalog.salesVolume);
  let allocationLookups: FormulaLookups | null = null;
  try {
    allocationLookups = capTables.length > 0 ? lookupsFor(client, capTables) : null;
  } catch {
    allocationLookups = null;
  }
  const allocation = allocationForReplay({
    catalog,
    history,
    overrides: storedOverrides(fx),
    deal: fx.deal,
    transactionId: dealId,
    agents: knownAgents,
    fieldTypes,
    lookups: allocationLookups,
  });
  const replayed = rows.map((row) => {
    const bundle = bundles.find((item) => item.templateId === row.templateId)!;
    try {
      return replayedPaymentSignature({
        deal: fx.deal,
        steps: bundle.steps,
        parameters: row.parameters,
        parameterTypes: bundle.parameterTypes,
        items: items as StoredCommissionItem[],
        agents: knownAgents,
        entities,
        overviewFields,
        ledger,
        lookups,
        allocation,
      });
    } catch (error) {
      return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  return { saved, replayed, changed: replayed.some((signature) => !signature.startsWith('ERROR: ') && signature !== saved) };
}

/** CommissionTemplatePanel payment check (the template button on Transaction Detail). */
function panelDrift(ctx: Ctx, items: ApiRow[]) {
  const base = pageBase(ctx);
  const knownAgents: KnownAgentInfo[] = base.knownAgents.map((agent) => ({
    id: agent.id,
    name: normalizeAgentName(agent.name),
    isTeamLead: Boolean(agent.isTeamLead),
    clientId: agent.clientId,
    fields: agent.fields,
  }));
  const entities: CommissionEntityOption[] = base.knownEntities.map((entity) => ({ id: entity.id, name: entity.name }));
  const catalog = ctx.client.schema.catalog || [];
  const fieldTypes = Object.fromEntries(catalog.flatMap((field) => {
    const key = String(field.field_key || '').trim();
    return key ? [[key, String(field.field_type || 'TEXT')]] : [];
  }));
  const overviewFields: FieldSetting[] = catalog.flatMap((field, index) => {
    const key = String(field.field_key || '').trim();
    if (!key) return [];
    return [{ id: field.id || `schema_${index}`, label: field.field_label || key, key, type: field.field_type || 'TEXT', section: field.section_name || 'General', calculation_formula: field.calculation_formula?.trim() || undefined }];
  });
  const rows = ctx.fx.submissions.flatMap((row) => {
    const templateId = String(row?.template_id || '').trim();
    return templateId ? [{ templateId, parameters: parameterRecord(row?.submitted_parameters) }] : [];
  });
  return driftCheck(ctx, items, knownAgents, entities, overviewFields, fieldTypes, rows);
}

const LIST_AGENT_SKIP = AGENT_DIRECTORY_KEYS;

/** lib/fields isHiddenRecordId('transactions', key); lib/fields loads the Supabase client, so it is not imported here. */
const isHiddenRecordId = (_table: 'transactions', key: string) => key === 'id';

/** Transactions list payment check. */
function listDrift(ctx: Ctx, items: ApiRow[]) {
  const agents: KnownAgentInfo[] = ctx.client.agents.map((agent) => ({
    id: String(agent.id || ''),
    name: normalizeAgentName(agent.agent_name || agent.name || ''),
    isTeamLead: Boolean(agent.is_team_lead || agent.isTeamLead),
    clientId: agent.client_id ? String(agent.client_id) : undefined,
    fields: Object.fromEntries(Object.entries(agent).flatMap(([key, value]) => {
      if (LIST_AGENT_SKIP.has(key) || value === null || value === undefined || value === '' || typeof value === 'object') return [];
      return [[key, String(value)]];
    })),
  })).filter((agent) => agent.id && agent.name);
  const entities: CommissionEntityOption[] = ctx.client.entities.map((entity) => ({
    id: String(entity.id || ''),
    name: entity.entity_name || entity.name || 'Unnamed Entity',
    type: entity.entity_type,
  }));
  const rawCatalog = ctx.client.schema.catalog || [];
  const unique = new Map<string, ApiRow>();
  rawCatalog.forEach((field) => {
    if (field.is_enabled !== false && !isHiddenRecordId('transactions', field.field_key) && !unique.has(field.field_key)) unique.set(field.field_key, field);
  });
  const fieldTypes = Object.fromEntries([...unique.values()].map((field) => [field.field_key, field.field_type]));
  const overviewFields: FieldSetting[] = rawCatalog.map((field, index) => ({
    id: field.id || `schema_${index}`,
    label: field.field_label || field.field_key,
    key: field.field_key,
    type: field.field_type || 'TEXT',
    section: field.section_name || 'General',
    calculation_formula: field.calculation_formula?.trim() || undefined,
  }));
  const rows: { templateId: string; parameters: Record<string, string> }[] = [];
  for (const raw of ctx.fx.submissions) {
    const templateId = String(raw.template_id || '').trim();
    if (!templateId || rows.some((item) => item.templateId === templateId)) continue;
    rows.push({ templateId, parameters: parameterRecord(raw.submitted_parameters) });
  }
  return driftCheck(ctx, items, agents, entities, overviewFields, fieldTypes, rows);
}

// ---------------------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------------------

/** The first agent other than the primary: the one a hand-typed split is tried on. */
function nonPrimaryAgent(ctx: Ctx, state: PageState): AgentConfig | null {
  const base = pageBase(ctx);
  const primaryAgentId = resolvePrimaryAgentId(base.deal.agent_id || base.primaryAgent, base.commissionItems, base.knownAgents);
  return state.agents.find((agent) => !isPrimaryAgent(agent, primaryAgentId)) ?? null;
}

function viewOutput(view: ReturnType<typeof pageView>) {
  const { dealResult } = view;
  return {
    waterfall: {
      grossCommission: dealResult.grossCommission,
      totalCommission: dealResult.totalCommission,
      commissionAfterOffTop: dealResult.commissionAfterOffTop,
      commissionAfterPreSplit: dealResult.commissionAfterPreSplit,
      offTheTopItems: dealResult.offTheTopItems,
      preSplitItems: dealResult.preSplitItems,
      agentSplitItems: dealResult.agentSplitItems,
      allocationLines: dealResult.allocationLines,
      postSplitItems: dealResult.postSplitItems,
      postSplit2Items: dealResult.postSplit2Items,
      agentNetAfterLevel1: dealResult.agentNetAfterLevel1,
      netPayouts: dealResult.netPayouts,
      agentSplitTotal: dealResult.agentSplitTotal,
      agentSplitExcess: dealResult.agentSplitExcess,
      idleAgentIds: dealResult.idleAgentIds,
      capMovedMoney: dealResult.capMovedMoney,
    },
    save: {
      commissionItems: view.commissionItems,
      payments: view.payments,
      allocationRows: view.allocationRows,
    },
    capRecipientShortfalls: view.capRecipientShortfalls,
    saveBlocked: view.saveBlocked,
    saveBlockedReason: view.saveBlockedReason,
  };
}

export function runGoldenScenarios(client: ClientFixture, fx: DealFixture, dealId: string) {
  const ctx: Ctx = { client, fx, dealId };
  const saved = savedPageState(ctx);
  const savedView = pageView(ctx, saved);
  const result: Record<string, unknown> = {
    pageSaved: viewOutput(savedView),
  };

  // The waterfall before the submitted template's replay is ready (stored splits after team caps).
  const noReplayCtx: Ctx = { ...ctx, fx: { ...fx, submissions: [] } };
  result.pageBeforeReplay = viewOutput(pageView(noReplayCtx, { ...savedPageState(noReplayCtx), selectedTeamCapIds: saved.selectedTeamCapIds }));

  // A split typed by hand in the waterfall editor.
  const typed = nonPrimaryAgent(ctx, saved);
  if (typed) {
    const splitVal = typed.splitType === 'PERCENT' ? roundPercentRate(typed.splitVal * 0.9) : roundCurrency(typed.splitVal * 0.9);
    const edited: PageState = {
      ...saved,
      agents: saved.agents.map((agent) => (agent.id === typed.id ? { ...agent, splitVal, manualSplit: true } : agent)),
      showingSaved: false,
    };
    result.pageTypedSplit = { agentId: typed.id, splitVal, ...viewOutput(pageView(ctx, edited)) };
  }

  let resubmit: ReturnType<typeof popupResubmit> = null;
  try {
    resubmit = popupResubmit(ctx, saved, savedView);
  } catch (error) {
    // The popup shows this message and submits nothing.
    result.popupResubmit = { error: error instanceof Error ? error.message : String(error) };
  }
  if (resubmit) {
    result.popupResubmit = {
      applied: resubmit.applied,
      teamCapIds: resubmit.submission.team_cap_ids,
      teamCapRecipients: resubmit.submission.team_cap_recipients,
      ...viewOutput(resubmit.view),
    };
  }

  if (fx.submissions.length > 0) {
    result.driftPanel = panelDrift(ctx, fx.items);
    result.driftList = listDrift(ctx, fx.items);
    // A split saved as typed by hand (custom_attributes.manual_split) on the first non-primary agent's line.
    const manualAgentId = typed?.id;
    const manualIndex = manualAgentId ? fx.items.findIndex((item) => item.section === 'AGENT_SPLIT' && item.agent_id === manualAgentId) : -1;
    if (manualIndex >= 0) {
      const items = fx.items.map((item, index) => (index === manualIndex ? { ...item, custom_attributes: { ...(item.custom_attributes || {}), manual_split: true } } : item));
      result.driftPanelSavedManualSplit = panelDrift(ctx, items);
      result.driftListSavedManualSplit = listDrift(ctx, items);
    }
  }
  return result;
}
