import { useEffect, useMemo, useRef, useState } from 'react';
import { allocationLookupTables, type DealAllocationContext } from '@/lib/agent-allocations';
import { allocationCatalogFromConfig, buildAllocationContext, dealUnitsField, overridesFromStoredRows } from '@/lib/commission-engine/allocation';
import type { FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { loadFormulaLookups } from '../components/applyTemplateLogic';
import { buildAgentCapCells, type AgentCapDefinition, type AgentCapHistoryRow } from '@/lib/agent-cap-progress';
import type { AgentConfig, KnownAgentInfo } from '../types';

type StoredOverride = DealAllocationContext['overrides'][number];

export function sameAllocationOverrides(left: StoredOverride[], right: StoredOverride[]) {
  const key = (rows: StoredOverride[]) => JSON.stringify([...rows]
    .map((row) => `${row.kind}:${row.agentId}:${row.teamCapId || ''}:${row.amount}`)
    .sort());
  return key(left) === key(right);
}

function copyOverrides(rows: StoredOverride[]): StoredOverride[] {
  return rows.map((row) => ({ ...row }));
}

function agentCapsFrom(rows: Array<Record<string, unknown>>): AgentCapDefinition[] {
  return rows.flatMap((row) => {
    const id = String(row.id || '').trim();
    const entityId = String(row.commission_entity_id || '').trim();
    if (!id || !entityId || !row.enabled) return [];
    return [{
      id,
      enabled: true,
      entityId,
      capAmountFieldKey: row.cap_amount_field_key ? String(row.cap_amount_field_key) : null,
      resetDateFieldKey: row.reset_date_field_key ? String(row.reset_date_field_key) : null,
      hideOverAllocations: Boolean(row.hide_over_allocations),
    }];
  });
}

export function useAgentAllocationInput({
  clientId,
  transactionId,
  agents,
  knownAgents,
  deal,
  dealDate,
  salesPrice,
  fieldTypes,
}: {
  clientId: string;
  transactionId: string;
  agents: AgentConfig[];
  knownAgents: KnownAgentInfo[];
  deal: Record<string, unknown> | null;
  dealDate: string | null;
  salesPrice: number;
  fieldTypes: Record<string, string>;
}) {
  const [teamCaps, setTeamCaps] = useState<DealAllocationContext['teamCaps']>([]);
  const [agentCaps, setAgentCaps] = useState<AgentCapDefinition[]>([]);
  const [postSplitHistory, setPostSplitHistory] = useState<AgentCapHistoryRow[]>([]);
  const [salesVolume, setSalesVolume] = useState<DealAllocationContext['salesVolume']>(null);
  // Tables the qualifying formulas look up (agents for XLOOKUP); a formula that needs one only qualifies with it.
  const [allocationLookups, setAllocationLookups] = useState<FormulaLookups | null>(null);
  const [history, setHistory] = useState<DealAllocationContext['history']>([]);
  const [overrides, setOverrides] = useState<DealAllocationContext['overrides']>([]);
  const loadedOverridesRef = useRef<DealAllocationContext['overrides']>([]);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const [loadedKey, setLoadedKey] = useState('');
  const [hasStoredRows, setHasStoredRows] = useState(false);
  // The request key whose load finished, whether or not it succeeded.
  const [settledKey, setSettledKey] = useState('');
  const agentIds = agents.map((agent) => agent.id).join(',');
  const requestKey = `${clientId}:${transactionId}:${agentIds}`;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const ids = agentIds.split(',').filter(Boolean);
    const headers = { 'x-client-id': clientId };
    const loadConfig = async () => {
      const configResponse = await fetch(`/api/agent-allocations?client_id=${encodeURIComponent(clientId)}`, { headers });
      const config = await configResponse.json().catch(() => ({}));
      return configResponse.ok && config.success !== false ? config : null;
    };
    // Agent cap history needs only the cap entities from the config, so it runs beside the team
    // cap requests instead of after them.
    const loadPostSplitHistory = async (nextAgentCaps: AgentCapDefinition[]): Promise<AgentCapHistoryRow[]> => {
      const entityIds = [...new Set(nextAgentCaps.map((cap) => cap.entityId))];
      if (entityIds.length === 0 || ids.length === 0) return [];
      const historyParams = new URLSearchParams({
        view: 'post-split-history',
        agent_ids: ids.join(','),
        entity_ids: entityIds.join(','),
      });
      if (transactionId) historyParams.set('exclude_transaction_id', transactionId);
      const postSplitResponse = await fetch(`/api/transaction-commission-items?${historyParams.toString()}`, { headers });
      const postSplitBody = await postSplitResponse.json().catch(() => ({}));
      if (!postSplitResponse.ok || postSplitBody.success === false) return [];
      return Array.isArray(postSplitBody.history) ? postSplitBody.history : [];
    };
    (async () => {
      try {
        const configPromise = loadConfig();
        const postSplitPromise = configPromise.then((config) => (
          config ? loadPostSplitHistory(agentCapsFrom(Array.isArray(config.agentCaps) ? config.agentCaps : [])) : []
        ));
        // Handled below; this keeps an early return from leaving the rejection unhandled.
        postSplitPromise.catch(() => {});
        const historyUrl = `/api/transaction-team-caps?history=1&client_id=${encodeURIComponent(clientId)}&agent_ids=${encodeURIComponent(ids.join(','))}&exclude_transaction_id=${encodeURIComponent(transactionId)}`;
        const capsUrl = transactionId
          ? `/api/transaction-team-caps?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`
          : '';
        const allocationsUrl = transactionId
          ? `/api/transaction-agent-allocations?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`
          : '';
        const [config, historyResponse, capsResponse, allocationsResponse] = await Promise.all([
          configPromise,
          fetch(historyUrl, { headers }),
          capsUrl ? fetch(capsUrl, { headers }) : Promise.resolve(null),
          allocationsUrl ? fetch(allocationsUrl, { headers }) : Promise.resolve(null),
        ]);
        if (!config) return;
        const historyBody = await historyResponse.json().catch(() => ({}));
        const capsBody = capsResponse ? await capsResponse.json().catch(() => ({})) : { teamCaps: [] };
        const allocationsBody = allocationsResponse ? await allocationsResponse.json().catch(() => ({})) : { allocations: [] };
        if (cancelled || !historyResponse.ok || historyBody.success === false) return;
        if (capsResponse && (!capsResponse.ok || capsBody.success === false)) return;
        if (allocationsResponse && (!allocationsResponse.ok || allocationsBody.success === false)) return;
        const nextAgentCaps = agentCapsFrom(Array.isArray(config.agentCaps) ? config.agentCaps : []);
        const { teamCaps: nextTeamCaps, salesVolume: nextVolume } = allocationCatalogFromConfig(config);
        const lookupTables = allocationLookupTables(nextTeamCaps, nextVolume);
        const [nextHistory, nextLookups] = await Promise.all([
          postSplitPromise,
          lookupTables.length > 0 ? loadFormulaLookups(clientId, lookupTables).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setAgentCaps(nextAgentCaps);
        setPostSplitHistory(nextHistory);
        setTeamCaps(nextTeamCaps);
        setSalesVolume(nextVolume);
        setAllocationLookups(nextLookups);
        setHistory(Array.isArray(historyBody.history) ? historyBody.history : []);
        const capRows = Array.isArray(capsBody.teamCaps) ? capsBody.teamCaps : [];
        const allocationRows = Array.isArray(allocationsBody.allocations) ? allocationsBody.allocations : [];
        setHasStoredRows(capRows.length > 0 || allocationRows.length > 0);
        const loaded = overridesFromStoredRows(capRows, allocationRows);
        loadedOverridesRef.current = loaded;
        setOverrides(loaded);
        setLoadedKey(requestKey);
      } catch {
        if (!cancelled) setLoadedKey('');
      } finally {
        if (!cancelled) setSettledKey(requestKey);
      }
    })();
    return () => { cancelled = true; };
  }, [requestKey, clientId, transactionId, agentIds]);

  const ready = loadedKey === requestKey && loadedKey !== '';
  /** False while this deal's caps and allocations are still loading. */
  const settled = Boolean(clientId) && settledKey === requestKey;

  const agentCapCells = useMemo(() => buildAgentCapCells({
    caps: agentCaps,
    agents: agents.map((agent) => ({
      id: agent.id,
      fields: knownAgents.find((known) => known.id === agent.id)?.fields || {},
    })),
    history: postSplitHistory,
    dealDate,
  }), [agentCaps, agents, knownAgents, postSplitHistory, dealDate]);

  const units = dealUnitsField(deal);

  const input = useMemo<DealAllocationContext | null>(() => {
    if (!ready) return null;
    return buildAllocationContext({
      catalog: { teamCaps, salesVolume },
      agents: agents.map((agent) => ({
        id: agent.id,
        fields: knownAgents.find((known) => known.id === agent.id)?.fields || {},
      })),
      // The request already leaves out this deal's own cap rows (exclude_transaction_id).
      history,
      overrides,
      deal,
      dealDate,
      salesPrice,
      units,
      fieldTypes,
      lookups: allocationLookups,
    });
  }, [ready, teamCaps, salesVolume, allocationLookups, agents, knownAgents, history, overrides, deal, dealDate, salesPrice, units, fieldTypes]);

  const setTeamCapOverride = (agentId: string, teamCapId: string, amount: number | null) => {
    setOverrides((current) => {
      const rest = current.filter((row) => !(row.kind === 'team_cap' && row.agentId === agentId && (row.teamCapId || '') === teamCapId));
      if (amount == null || !Number.isFinite(amount)) return rest;
      return [...rest, { agentId, kind: 'team_cap', amount: Math.max(0, amount), teamCapId }];
    });
  };
  const replaceOverrides = (next: DealAllocationContext['overrides']) => {
    setOverrides(copyOverrides(next));
  };
  const restoreLoadedOverrides = () => {
    setOverrides(copyOverrides(loadedOverridesRef.current));
  };
  const commitOverrides = () => {
    loadedOverridesRef.current = copyOverrides(overridesRef.current);
  };

  return { ready, settled, input, hasStoredRows, overrides, agentCapCells, setTeamCapOverride, replaceOverrides, restoreLoadedOverrides, commitOverrides };
}
