/**
 * The team cap and sales volume input for a deal (DealAllocationContext): the client's caps, each agent's profile
 * fields, the cap dollars already counted this year on other deals, and amounts typed on this deal.
 */
import type { DealAllocationContext, TeamCapRule } from '@/lib/agent-allocations';
import type { FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { readTransactionField } from './model';

export type AllocationCatalog = {
  teamCaps: TeamCapRule[];
  salesVolume: DealAllocationContext['salesVolume'];
};

export type TeamCapRow = {
  id?: unknown;
  name?: unknown;
  key?: unknown;
  enabled?: unknown;
  qualifying_formula?: unknown;
  split_percent_field_key?: unknown;
  cap_amount_field_key?: unknown;
  reset_date_field_key?: unknown;
  recipient_agent_id?: unknown;
};

export type SalesVolumeRow = {
  enabled?: unknown;
  qualifying_formula?: unknown;
  anchor?: unknown;
  assignment?: unknown;
};

const text = (value: unknown): string | null => (value ? String(value) : null);

/** A team cap from GET /api/agent-allocations. Null without an id. */
export function teamCapRuleFromRow(row: TeamCapRow): TeamCapRule | null {
  const id = String(row.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(row.name || 'Team Cap'),
    key: text(row.key),
    enabled: Boolean(row.enabled),
    qualifyingFormula: text(row.qualifying_formula),
    splitPercentFieldKey: text(row.split_percent_field_key),
    capAmountFieldKey: text(row.cap_amount_field_key),
    resetDateFieldKey: text(row.reset_date_field_key),
    recipientAgentId: text(row.recipient_agent_id),
  };
}

export function salesVolumeFromRow(row: SalesVolumeRow | null | undefined): DealAllocationContext['salesVolume'] {
  if (!row) return null;
  return {
    enabled: Boolean(row.enabled),
    qualifyingFormula: text(row.qualifying_formula),
    anchor: row.anchor === 'sales_price_x_units' ? 'sales_price_x_units' : 'sales_price',
    assignment: row.assignment === 'primary_agent' ? 'primary_agent' : 'agent_share',
  };
}

/** The caps and sales volume setting from GET /api/agent-allocations. */
export function allocationCatalogFromConfig(body: { teamCaps?: unknown; salesVolume?: unknown }): AllocationCatalog {
  return {
    teamCaps: (Array.isArray(body.teamCaps) ? body.teamCaps : []).flatMap((row: TeamCapRow) => {
      const cap = teamCapRuleFromRow(row);
      return cap ? [cap] : [];
    }),
    salesVolume: salesVolumeFromRow((body.salesVolume || null) as SalesVolumeRow | null),
  };
}

type StoredCapRow = { is_override?: boolean; agent_id?: string; amount?: number | string; team_cap_id?: string | null };
type StoredAllocationRow = { is_override?: boolean; agent_id?: string; amount?: number | string };

/** Amounts typed on this deal: team cap rows and sales volume rows saved with is_override. */
export function overridesFromStoredRows(capRows: StoredCapRow[], allocationRows: StoredAllocationRow[]): DealAllocationContext['overrides'] {
  return [
    ...capRows.flatMap((row) => {
      if (!row.is_override || !row.agent_id) return [];
      return [{ agentId: row.agent_id, kind: 'team_cap' as const, amount: Number(row.amount) || 0, teamCapId: row.team_cap_id || null }];
    }),
    ...allocationRows.flatMap((row) => {
      if (!row.is_override || !row.agent_id) return [];
      return [{ agentId: row.agent_id, kind: 'sales_volume' as const, amount: Number(row.amount) || 0, teamCapId: null }];
    }),
  ];
}

export type AllocationHistoryRow = DealAllocationContext['history'][number] & { transactionId?: string | null };

/** Units for Sales Price × Units: blank means 1. */
export function dealUnits(raw: unknown): number {
  return raw === undefined || raw === null || String(raw).trim() === '' ? 1 : Math.max(0, Number(raw) || 0);
}

export function buildAllocationContext({
  catalog,
  agents,
  history,
  excludeTransactionId = null,
  overrides,
  deal,
  dealDate,
  salesPrice,
  units,
  fieldTypes,
  lookups = null,
}: {
  catalog: AllocationCatalog;
  /** The agents whose profiles the caps read: their split percent, yearly cap and reset date fields. */
  agents: { id: string; fields?: Record<string, string> }[];
  history: AllocationHistoryRow[];
  /** History rows of this deal are left out: they are what is being calculated. */
  excludeTransactionId?: string | null;
  overrides: DealAllocationContext['overrides'];
  deal: Record<string, unknown> | null;
  dealDate: string | null;
  salesPrice: number;
  units: number;
  fieldTypes: Record<string, string>;
  /** Tables the qualifying formulas look up (allocationLookupTables). Without them such a formula does not qualify. */
  lookups?: FormulaLookups | null;
}): DealAllocationContext {
  return {
    teamCaps: catalog.teamCaps,
    salesVolume: catalog.salesVolume,
    profiles: agents.map((agent) => ({ agentId: agent.id, fields: agent.fields || {} })),
    history: history.flatMap((row) => {
      if (excludeTransactionId && row.transactionId && row.transactionId === excludeTransactionId) return [];
      return [{ agentId: row.agentId, amount: Number(row.amount) || 0, periodStart: row.periodStart, teamCapId: row.teamCapId }];
    }),
    overrides,
    deal,
    dealDate,
    salesPrice,
    units,
    fieldTypes,
    lookups,
  };
}

/**
 * The allocation input the template button and the Transactions list replay a saved deal with: every agent in
 * the directory, the deal's closing day, its sales price and its units column.
 */
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
  catalog: AllocationCatalog;
  history: AllocationHistoryRow[];
  overrides: DealAllocationContext['overrides'];
  deal: Record<string, unknown>;
  transactionId: string;
  agents: { id: string; fields?: Record<string, string> }[];
  fieldTypes: Record<string, string>;
  /** From loadAllocationLookups: without it a qualifying formula that looks up another table does not qualify. */
  lookups?: FormulaLookups | null;
}): DealAllocationContext {
  const closing = deal.closing_date == null ? '' : String(deal.closing_date);
  return buildAllocationContext({
    catalog,
    agents,
    history,
    excludeTransactionId: transactionId,
    overrides,
    deal,
    dealDate: closing.length >= 10 ? closing.slice(0, 10) : null,
    salesPrice: Math.abs(Number(deal.sales_price) || 0),
    units: dealUnits(deal.units),
    fieldTypes,
    lookups,
  });
}

/** The units Transaction Detail reads: the column or a custom field. */
export function dealUnitsField(deal: Record<string, unknown> | null): number {
  return dealUnits(readTransactionField(deal, 'units'));
}
