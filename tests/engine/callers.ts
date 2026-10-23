/**
 * Runs a golden fixture through the commission engine the way each screen does, and returns what the screen
 * shows or saves. The fixture is the API responses; the wiring here is the screens' own (each block names the
 * caller it follows), so a change in what a screen computes shows up as a golden diff.
 */
import { normalizeAgentName } from '@/lib/id';
import {
  configuredTeamCaps,
  dealTeamCaps,
  qualifyingTeamCaps,
  readTeamCapSelection,
  writeTeamCapSelection,
  allocationLookupTables,
  type DealAllocationContext,
} from '@/lib/agent-allocations';
import { transactionQualifiesForTemplate } from '@/lib/transaction-default-view';
import { formulaLookupSource } from '@/lib/formula-lookup-tables';
import {
  allocationCatalogFromConfig,
  allocationForReplay,
  applyTemplateLogic,
  buildAllocationContext,
  computeDealCommission,
  dealUnitsField,
  formulaDataNeeds,
  formulaLookupRow,
  formulaParameters,
  isPrimaryAgent,
  labelLedgerRows,
  overridesFromStoredRows,
  parameterRecord,
  payoutSignature,
  replayedPaymentSignature,
  resolvePrimaryAgentId,
  roundCurrency,
  roundPercentRate,
  savedPayouts,
  storedAgentSplitsFrom,
  templatePaymentsChanged,
  templateFormulaSources,
  waterfallAfterTemplate,
  waterfallFromCommissionItems,
  type AgentConfig,
  type AppliedTemplateRules,
  type CommissionEntityOption,
  type KnownAgentInfo,
  type NamedParty,
  type StoredCommissionItem,
  type TemplateLogicStep,
} from '@/lib/commission-engine';
import type { FieldSetting } from '@/app/(dashboard)/commission-tracker/transactions/[id]/types';
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

/** loadCommissionLedger: the raw ledger lines, labelled with entity names. */
function ledgerFor(fx: DealFixture, entities: { id: string; name: string }[]): FormulaLedgerRow[] {
  const items = (fx.ledger ?? []).map(([final_amount, agent_id, payee_entity_id, section, transaction_id, closing_date, transaction_status]) => (
    { final_amount, agent_id, payee_entity_id, section, transaction_id, closing_date, transaction_status }
  ));
  return labelLedgerRows(items, entities);
}

function catalogOf(client: ClientFixture) {
  return allocationCatalogFromConfig(client.allocationConfig);
}

function storedOverrides(fx: DealFixture): DealAllocationContext['overrides'] {
  return overridesFromStoredRows(fx.teamCapRows, fx.allocationRows);
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
    parameters: formulaParameters(pending ? pending.submitted_parameters : base.submitted?.submitted_parameters),
    parameterTypes: Object.fromEntries(bundle.parameters.map((parameter) => [String(parameter.parameter_key || ''), parameter.data_type || ''])),
    entities: base.knownEntities as NamedParty[],
    rosterAgents: base.knownAgents as NamedParty[],
    ledger: needs.needsLedger ? ledgerFor(ctx.fx, base.knownEntities) : [],
    lookups: needs.lookupTables.length > 0 ? lookupsFor(ctx.client, needs.lookupTables) : { clientId: ctx.client.clientId, tables: {} },
  };
}

function allocationInputFor(ctx: Ctx, base: ReturnType<typeof pageBase>, agents: AgentConfig[]): DealAllocationContext {
  // useAgentAllocationInput
  const { teamCaps, salesVolume } = catalogOf(ctx.client);
  const tables = allocationLookupTables(teamCaps, salesVolume);
  let lookups: FormulaLookups | null = null;
  if (tables.length > 0) {
    try {
      lookups = lookupsFor(ctx.client, tables);
    } catch {
      lookups = null;
    }
  }
  return buildAllocationContext({
    catalog: { teamCaps, salesVolume },
    agents: agents.map((agent) => ({ id: agent.id, fields: base.knownAgents.find((known) => known.id === agent.id)?.fields || {} })),
    // GET /api/transaction-team-caps?history=1&exclude_transaction_id=…
    history: ctx.client.teamCapHistory.filter((row) => row.transactionId !== ctx.dealId),
    overrides: storedOverrides(ctx.fx),
    deal: { ...(base.deal || {}) },
    dealDate: String(base.closingDate || '').substring(0, 10) || null,
    salesPrice: base.salesPrice,
    units: dealUnitsField(base.deal),
    fieldTypes: Object.fromEntries(base.overviewFields.map((field) => [field.key, field.type])),
    lookups,
  });
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
  const storedAgentSplits = state.showingSaved ? storedAgentSplitsFrom(base.commissionItems) : null;
  const qualificationFieldTypes = Object.fromEntries((ctx.client.schema.catalog || []).flatMap((field) => {
    const key = String(field.field_key || '').trim();
    return key ? [[key, String(field.field_type || 'TEXT')]] : [];
  }));
  const templateQualifies = ctx.client.templates.some((template) => (
    template.is_active !== false && transactionQualifiesForTemplate({ ...deal }, template.eligibility_formula || '', qualificationFieldTypes)
  ));

  const dealResult = computeDealCommission({
    deal,
    form: {},
    salesPrice: base.salesPrice,
    gciPerc: base.gciPerc,
    clientType: base.clientType,
    fields: base.overviewFields,
    waterfall: state,
    primaryAgentId,
    allocation: allocationForWaterfall,
    template: templateReplay,
    storedAgentSplits,
  }, {
    knownAgents,
    knownEntities,
    primaryAgentFallback: typeof base.primaryAgent === 'string' ? base.primaryAgent : '',
    paymentDate: base.closingDate || 'TODAY',
    templateQualifies,
  });
  const idleAgentIds = new Set<string>(dealResult.idleAgentIds || []);

  return {
    dealResult,
    commissionItems: dealResult.save.commissionItems,
    payments: dealResult.save.payments,
    allocationRows: dealResult.save.allocationRows,
    capRecipientShortfalls: dealResult.save.blockers.capRecipientShortfalls,
    saveBlocked: dealResult.save.blockers.blocked,
    saveBlockedReason: dealResult.save.blockers.reason,
    waterfallAgents: agents.filter((agent) => !idleAgentIds.has(agent.id)),
    totalCommissionForPanel: dealResult.totalCommission || dealResult.grossCommission || 0,
    allocationInput,
  };
}

/** page.tsx handleApplyTemplateRules */
function applyTemplateToPage(base: ReturnType<typeof pageBase>, state: PageState, applied: AppliedTemplateRules, submission: PendingSubmission): PageState {
  // page.tsx handleApplyTemplateRules
  const primaryAgentId = resolvePrimaryAgentId(base.deal.agent_id || base.primaryAgent, base.commissionItems, base.knownAgents);
  const next = waterfallAfterTemplate(applied, state.agents, base.knownAgents, primaryAgentId, {
    teamCapRecipients: submission.team_cap_ids == null ? null : (submission.team_cap_recipients ?? []),
  });
  return {
    ...next,
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
  const teamCaps = catalogOf(ctx.client).teamCaps;
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
  const teamCapRecipients = dealTeamCaps(shownCaps, base.deal, panelFieldTypes, capLookups).flatMap((cap) => (teamCapIds.includes(cap.id) ? cap.recipients : []).flatMap(({ agentId }) => {
    if (seenRecipients.has(agentId)) return [];
    const recipient = templateAgentRoster.find((agent) => agent.id === agentId);
    if (!recipient) return [];
    seenRecipients.add(recipient.id);
    return [{ id: recipient.id, name: recipient.name, isTeamLead: Boolean(recipient.isTeamLead) }];
  }));
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
  const catalog = catalogOf(client);
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
  // What the template button and the list show.
  const changed = templatePaymentsChanged({
    deal: fx.deal,
    submissions: rows.map((row) => {
      const bundle = bundles.find((item) => item.templateId === row.templateId)!;
      return { steps: bundle.steps, parameters: row.parameters, parameterTypes: bundle.parameterTypes };
    }),
    items: items as StoredCommissionItem[],
    agents: knownAgents,
    entities,
    overviewFields,
    ledger,
    lookups,
    allocation,
  });
  return { saved, replayed, changed };
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

export function runGoldenScenarios(client: ClientFixture, deal: DealFixture, dealId: string) {
  const fx: DealFixture = deal.ledger ? deal : { ...deal, ledger: client.ledger ?? [] };
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
