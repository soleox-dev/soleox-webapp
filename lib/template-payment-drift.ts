/**
 * Browser loaders for the out-of-date payments check (lib/commission-engine/drift.ts): the team caps catalog,
 * cap history and a deal's typed cap amounts, through the app's API.
 */
import { loadFormulaLookups } from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/applyTemplateLogic';
import { allocationLookupTables, type DealAllocationContext } from '@/lib/agent-allocations';
import {
  allocationCatalogFromConfig,
  overridesFromStoredRows,
  type AllocationCatalog,
  type AllocationHistoryRow,
} from '@/lib/commission-engine/allocation';
import type { FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

/** The tables the catalog's qualifying formulas look up (agents for XLOOKUP), or null when they need none. */
export async function loadAllocationLookups(clientId: string, catalog: AllocationCatalog): Promise<FormulaLookups | null> {
  const tables = allocationLookupTables(catalog.teamCaps, catalog.salesVolume);
  return tables.length > 0 ? loadFormulaLookups(clientId, tables) : null;
}

export async function loadAllocationCatalog(clientId: string): Promise<AllocationCatalog> {
  const response = await fetch(`/api/agent-allocations?client_id=${encodeURIComponent(clientId)}`, {
    headers: { 'x-client-id': clientId },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error || 'Failed to load team caps.');
  return allocationCatalogFromConfig(body);
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
  return overridesFromStoredRows(
    Array.isArray(capsBody.teamCaps) ? capsBody.teamCaps : [],
    Array.isArray(allocationsBody.allocations) ? allocationsBody.allocations : [],
  );
}
