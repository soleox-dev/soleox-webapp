import { applyTemplateLogic, loadFormulaLookups, type AppliedTemplateRules, type NamedParty, type TemplateLogicStep } from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/applyTemplateLogic';
import { allocationLookupTables, readTeamCapSelection, TEAM_CAP_SELECTION_KEY, type DealAllocationContext } from '@/lib/agent-allocations';
import {
  isPrimaryAgent,
  resolvePrimaryAgentId,
  waterfallFromCommissionItems,
  type StoredCommissionItem,
} from '@/app/(dashboard)/commission-tracker/transactions/[id]/commissionItemState';
import { computeTransactionWaterfall } from '@/app/(dashboard)/commission-tracker/transactions/[id]/hooks/useTransactionWaterfall';
import {
  type AgentConfig,
  type CommissionEntityOption,
  type DynamicRule,
  type FieldSetting,
  type KnownAgentInfo,
  roundCurrency,
} from '@/app/(dashboard)/commission-tracker/transactions/[id]/types';
import type { FormulaLedgerRow, FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

function namesMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Payee name and rounded dollars. Zero amounts are omitted so an absent payee matches a $0 payee. */
export function payoutSignature(payouts: Record<string, number>): string {
  const totals = new Map<string, number>();
  for (const [name, amount] of Object.entries(payouts)) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    totals.set(key, roundCurrency((totals.get(key) || 0) + (Number(amount) || 0)));
  }
  return [...totals.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, amount]) => `${name}:${amount.toFixed(2)}`)
    .join('|');
}

function waterfallAfterTemplate(
  applied: AppliedTemplateRules,
  previousAgents: AgentConfig[],
  knownAgents: KnownAgentInfo[],
  primaryAgentId: string | null,
): {
  agents: AgentConfig[];
  offTheTopRules: DynamicRule[];
  preSplitRules: DynamicRule[];
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent: Record<string, DynamicRule[]>;
} {
  const nextOff = applied.offTheTopRules ?? [];
  const nextPre = applied.preSplitRules ?? [];
  const nextPost = applied.postSplitRulesByAgent ?? {};
  const nextPost2 = applied.postSplit2RulesByAgent ?? {};
  const orderedSplits = applied.agentSplits ?? [];
  const primary = previousAgents[0]?.name?.trim() ? previousAgents[0] : null;
  const seen = new Set<string>();
  const agentNames = (orderedSplits.length > 0
    ? [...orderedSplits.map((split) => split.name), ...Object.keys(nextPost), ...Object.keys(nextPost2)]
    : [
        ...(primary ? [primary.name] : []),
        ...Object.keys(nextPost),
        ...Object.keys(nextPost2),
      ]
  ).filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  previousAgents.forEach((agent) => {
    const key = agent.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    agentNames.push(agent.name);
  });

  const templateAgents: AgentConfig[] = agentNames.map((name) => {
    const known = knownAgents.find((agent) => namesMatch(agent.name, name));
    const previous = previousAgents.find((agent) => namesMatch(agent.name, name));
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
  const primaryIndex = templateAgents.findIndex((agent) => isPrimaryAgent(agent, primaryAgentId));
  const agents = primaryIndex > 0
    ? [templateAgents[primaryIndex], ...templateAgents.filter((_, index) => index !== primaryIndex)]
    : templateAgents;

  return {
    agents,
    offTheTopRules: nextOff,
    preSplitRules: nextPre,
    postSplitRulesByAgent: nextPost,
    postSplit2RulesByAgent: nextPost2,
  };
}

/** Saved payment totals from stored commission-line dollars, without reapplying percent splits. */
export function savedPayouts(
  items: StoredCommissionItem[],
  agents: KnownAgentInfo[],
  entities: CommissionEntityOption[],
): Record<string, number> {
  const agentLabel = (id?: string | null) => agents.find((agent) => agent.id === id)?.name || '';
  const entityLabel = (item: StoredCommissionItem) => {
    if (item.payee_entity_id) {
      const match = entities.find((entity) => entity.id === item.payee_entity_id);
      if (match?.name) return match.name;
    }
    return String(item.rule_name || '').trim();
  };
  const splits = new Map<string, { name: string; split: number; level1: number; level2: number }>();
  const payouts: Record<string, number> = {};
  const add = (name: string, amount: number) => {
    const key = name.trim();
    if (!key) return;
    payouts[key] = roundCurrency((payouts[key] || 0) + amount);
  };
  const bucketFor = (name: string) => {
    const key = name.trim().toLowerCase();
    const existing = splits.get(key);
    if (existing) return existing;
    const created = { name: name.trim(), split: 0, level1: 0, level2: 0 };
    splits.set(key, created);
    return created;
  };

  for (const item of items) {
    const section = String(item.section || '').trim().toUpperCase();
    const amount = roundCurrency(Number(item.final_amount ?? item.calculated_amount ?? 0) || 0);
    if (section === 'AGENT_SPLIT') {
      const name = agentLabel(item.agent_id) || String(item.rule_name || '').replace(/ Split$/, '').trim();
      const bucket = bucketFor(name);
      bucket.split = roundCurrency(bucket.split + amount);
    } else if (section === 'POST_SPLIT' || section === 'POST_SPLIT_L2') {
      const agent = agentLabel(item.agent_id);
      if (agent) {
        const bucket = bucketFor(agent);
        if (section === 'POST_SPLIT') bucket.level1 = roundCurrency(bucket.level1 + amount);
        else bucket.level2 = roundCurrency(bucket.level2 + amount);
      }
      add(entityLabel(item), amount);
    } else if (section === 'OFF_THE_TOP' || section === 'PRE_SPLIT') {
      add(entityLabel(item), amount);
    }
  }

  for (const bucket of splits.values()) {
    const afterLevel1 = roundCurrency(Math.max(0, bucket.split - bucket.level1));
    add(bucket.name, roundCurrency(Math.max(0, afterLevel1 - bucket.level2)));
  }
  return payouts;
}

/**
 * Replays a submitted template with its stored parameters and returns the payment signature
 * submitting it again would write. Throws when the template cannot be calculated.
 */
export function replayedPaymentSignature({
  deal,
  steps,
  parameters,
  parameterTypes,
  items,
  agents,
  entities,
  overviewFields,
  ledger = [],
  lookups,
  allocation = null,
}: {
  deal: Record<string, unknown>;
  steps: TemplateLogicStep[];
  parameters: Record<string, string>;
  parameterTypes: Record<string, string | null | undefined>;
  items: StoredCommissionItem[];
  agents: KnownAgentInfo[];
  entities: CommissionEntityOption[];
  overviewFields: FieldSetting[];
  ledger?: FormulaLedgerRow[];
  lookups?: FormulaLookups;
  /** Team caps, the saved checkbox, and any typed cap amount. The replay applies these the same way a resubmit does. */
  allocation?: DealAllocationContext | null;
}): string {
  const salesPrice = Math.abs(Number(deal.sales_price) || 0);
  const gciPerc = Number(deal.gci_perc) || 0;
  const clientType = String(deal.client_type || deal.deal_type || deal.transaction_side || '');
  const transactionAgentId = deal.agent_id ? String(deal.agent_id) : null;
  const saved = waterfallFromCommissionItems(items, agents, entities, transactionAgentId);
  const primaryAgentId = resolvePrimaryAgentId(transactionAgentId, items, agents);
  const shared = {
    salesPrice,
    gciPerc,
    primaryAgentId,
    overviewFields,
    selectedDeal: deal,
    overviewFormValues: deal,
    clientType,
  };
  const baseline = computeTransactionWaterfall({
    ...shared,
    offTheTopRules: [],
    preSplitRules: [],
    postSplitRulesByAgent: {},
    postSplit2RulesByAgent: {},
    agents: [],
  }).totalCommission;

  const selectedTeamCapIds = readTeamCapSelection(parameters);
  const { [TEAM_CAP_SELECTION_KEY]: omittedCapSelection, ...formulaParameters } = parameters;
  void omittedCapSelection;
  const rosterAgents: NamedParty[] = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    isTeamLead: agent.isTeamLead,
    clientId: agent.clientId,
    fields: agent.fields,
  }));
  const applied = applyTemplateLogic({
    steps,
    parameters: formulaParameters,
    parameterTypes,
    deal,
    entities,
    rosterAgents,
    dealAgents: saved.agents,
    totalCommission: baseline,
    ledger,
    lookups,
  });
  const next = waterfallAfterTemplate(applied, saved.agents, agents, primaryAgentId);
  const allocationForReplay = allocation ? { ...allocation, selectedTeamCapIds } : null;
  const result = computeTransactionWaterfall({
    ...shared,
    ...next,
    allocation: allocationForReplay,
    templateReplay: allocationForReplay ? {
      steps,
      parameters: formulaParameters,
      parameterTypes,
      entities,
      rosterAgents,
      ledger,
      lookups,
    } : null,
  });
  return payoutSignature(result.netPayouts);
}

type AllocationHistoryRow = DealAllocationContext['history'][number] & { transactionId?: string | null };

function teamCapFrom(row: {
  id?: string;
  name?: string | null;
  key?: string | null;
  enabled?: boolean;
  qualifying_formula?: string | null;
  split_percent_field_key?: string | null;
  cap_amount_field_key?: string | null;
  reset_date_field_key?: string | null;
  recipient_agent_id?: string | null;
}): DealAllocationContext['teamCaps'][number] | null {
  const id = String(row.id || '');
  if (!id) return null;
  return {
    id,
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

function volumeFrom(row: {
  enabled?: boolean;
  qualifying_formula?: string | null;
  anchor?: string | null;
  assignment?: string | null;
} | null): DealAllocationContext['salesVolume'] {
  if (!row) return null;
  return {
    enabled: Boolean(row.enabled),
    qualifyingFormula: row.qualifying_formula || null,
    anchor: row.anchor === 'sales_price_x_units' ? 'sales_price_x_units' : 'sales_price',
    assignment: row.assignment === 'primary_agent' ? 'primary_agent' : 'agent_share',
  };
}

/** The tables the catalog's qualifying formulas look up (agents for XLOOKUP), or null when they need none. */
export async function loadAllocationLookups(
  clientId: string,
  catalog: { teamCaps: DealAllocationContext['teamCaps']; salesVolume: DealAllocationContext['salesVolume'] },
): Promise<FormulaLookups | null> {
  const tables = allocationLookupTables(catalog.teamCaps, catalog.salesVolume);
  return tables.length > 0 ? loadFormulaLookups(clientId, tables) : null;
}

export async function loadAllocationCatalog(clientId: string): Promise<{
  teamCaps: DealAllocationContext['teamCaps'];
  salesVolume: DealAllocationContext['salesVolume'];
}> {
  const response = await fetch(`/api/agent-allocations?client_id=${encodeURIComponent(clientId)}`, {
    headers: { 'x-client-id': clientId },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error || 'Failed to load team caps.');
  return {
    teamCaps: (Array.isArray(body.teamCaps) ? body.teamCaps : []).flatMap((row: Parameters<typeof teamCapFrom>[0]) => {
      const cap = teamCapFrom(row);
      return cap ? [cap] : [];
    }),
    salesVolume: volumeFrom(body.salesVolume || null),
  };
}

export async function loadAllocationHistory(clientId: string, agentIds: string[]): Promise<AllocationHistoryRow[]> {
  if (agentIds.length === 0) return [];
  const response = await fetch(
    `/api/transaction-team-caps?history=1&client_id=${encodeURIComponent(clientId)}&agent_ids=${encodeURIComponent(agentIds.join(','))}`,
    { headers: { 'x-client-id': clientId } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error || 'Failed to load team cap history.');
  return Array.isArray(body.history) ? body.history : [];
}

export async function loadAllocationOverrides(clientId: string, transactionId: string): Promise<DealAllocationContext['overrides']> {
  if (!transactionId) return [];
  const headers = { 'x-client-id': clientId };
  const [capsResponse, allocationsResponse] = await Promise.all([
    fetch(`/api/transaction-team-caps?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`, { headers }),
    fetch(`/api/transaction-agent-allocations?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`, { headers }),
  ]);
  const capsBody = await capsResponse.json().catch(() => ({}));
  const allocationsBody = await allocationsResponse.json().catch(() => ({}));
  if (!capsResponse.ok || capsBody.success === false) throw new Error(capsBody.error || 'Failed to load team cap amounts.');
  if (!allocationsResponse.ok || allocationsBody.success === false) throw new Error(allocationsBody.error || 'Failed to load agent allocations.');
  const caps = Array.isArray(capsBody.teamCaps) ? capsBody.teamCaps : [];
  const allocations = Array.isArray(allocationsBody.allocations) ? allocationsBody.allocations : [];
  return [
    ...caps.flatMap((row: { is_override?: boolean; agent_id?: string; amount?: number; team_cap_id?: string | null }) => {
      if (!row.is_override || !row.agent_id) return [];
      return [{ agentId: row.agent_id, kind: 'team_cap' as const, amount: Number(row.amount) || 0, teamCapId: row.team_cap_id || null }];
    }),
    ...allocations.flatMap((row: { is_override?: boolean; agent_id?: string; amount?: number }) => {
      if (!row.is_override || !row.agent_id) return [];
      return [{ agentId: row.agent_id, kind: 'sales_volume' as const, amount: Number(row.amount) || 0, teamCapId: null }];
    }),
  ];
}

export function allocationForReplay({
  catalog,
  history,
  overrides,
  deal,
  transactionId,
  agents,
  fieldTypes,
  lookups = null,
}: {
  catalog: { teamCaps: DealAllocationContext['teamCaps']; salesVolume: DealAllocationContext['salesVolume'] };
  history: AllocationHistoryRow[];
  overrides: DealAllocationContext['overrides'];
  deal: Record<string, unknown>;
  transactionId: string;
  agents: KnownAgentInfo[];
  fieldTypes: Record<string, string>;
  /** From loadAllocationLookups: without it a qualifying formula that looks up another table does not qualify. */
  lookups?: FormulaLookups | null;
}): DealAllocationContext {
  const closing = deal.closing_date == null ? '' : String(deal.closing_date);
  const unitsRaw = deal.units;
  const units = unitsRaw === undefined || unitsRaw === null || String(unitsRaw).trim() === ''
    ? 1
    : Math.max(0, Number(unitsRaw) || 0);
  return {
    teamCaps: catalog.teamCaps,
    salesVolume: catalog.salesVolume,
    profiles: agents.map((agent) => ({ agentId: agent.id, fields: agent.fields || {} })),
    history: history.flatMap((row) => {
      if (row.transactionId && row.transactionId === transactionId) return [];
      return [{ agentId: row.agentId, amount: Number(row.amount) || 0, periodStart: row.periodStart, teamCapId: row.teamCapId }];
    }),
    overrides,
    deal,
    dealDate: closing.length >= 10 ? closing.slice(0, 10) : null,
    salesPrice: Math.abs(Number(deal.sales_price) || 0),
    units,
    fieldTypes,
    lookups,
  };
}
