import { useEffect, useMemo, useRef, useState } from 'react';
import type { DealAllocationContext } from '@/lib/agent-allocations';
import { buildAgentCapCells, type AgentCapDefinition, type AgentCapHistoryRow } from '@/lib/agent-cap-progress';
import type { AgentConfig, KnownAgentInfo } from '../types';
import { readTransactionField } from '../types';

type TeamCapRow = {
  id?: string;
  name?: string | null;
  key?: string | null;
  enabled?: boolean;
  qualifying_formula?: string | null;
  split_percent_field_key?: string | null;
  cap_amount_field_key?: string | null;
  reset_date_field_key?: string | null;
  recipient_agent_id?: string | null;
};

type VolumeRow = {
  enabled?: boolean;
  qualifying_formula?: string | null;
  anchor?: string | null;
  assignment?: string | null;
};

function teamCapFrom(row: TeamCapRow) {
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

function volumeFrom(row: VolumeRow | null) {
  if (!row) return null;
  return {
    enabled: Boolean(row.enabled),
    qualifyingFormula: row.qualifying_formula || null,
    anchor: row.anchor === 'sales_price_x_units' ? 'sales_price_x_units' as const : 'sales_price' as const,
    assignment: row.assignment === 'primary_agent' ? 'primary_agent' as const : 'agent_share' as const,
  };
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
  const [history, setHistory] = useState<DealAllocationContext['history']>([]);
  const [overrides, setOverrides] = useState<DealAllocationContext['overrides']>([]);
  const loadedOverridesRef = useRef<DealAllocationContext['overrides']>([]);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const [loadedKey, setLoadedKey] = useState('');
  const [hasStoredRows, setHasStoredRows] = useState(false);
  const agentIds = agents.map((agent) => agent.id).join(',');
  const requestKey = `${clientId}:${transactionId}:${agentIds}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const configResponse = await fetch(`/api/agent-allocations?client_id=${encodeURIComponent(clientId)}`, {
          headers: { 'x-client-id': clientId },
        });
        const config = await configResponse.json().catch(() => ({}));
        if (!configResponse.ok || config.success === false) return;
        const ids = agentIds.split(',').filter(Boolean);
        const headers = { 'x-client-id': clientId };
        const historyUrl = `/api/transaction-team-caps?history=1&client_id=${encodeURIComponent(clientId)}&agent_ids=${encodeURIComponent(ids.join(','))}&exclude_transaction_id=${encodeURIComponent(transactionId)}`;
        const capsUrl = transactionId
          ? `/api/transaction-team-caps?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`
          : '';
        const allocationsUrl = transactionId
          ? `/api/transaction-agent-allocations?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`
          : '';
        const [historyResponse, capsResponse, allocationsResponse] = await Promise.all([
          fetch(historyUrl, { headers }),
          capsUrl ? fetch(capsUrl, { headers }) : Promise.resolve(null),
          allocationsUrl ? fetch(allocationsUrl, { headers }) : Promise.resolve(null),
        ]);
        const historyBody = await historyResponse.json().catch(() => ({}));
        const capsBody = capsResponse ? await capsResponse.json().catch(() => ({})) : { teamCaps: [] };
        const allocationsBody = allocationsResponse ? await allocationsResponse.json().catch(() => ({})) : { allocations: [] };
        if (cancelled || !historyResponse.ok || historyBody.success === false) return;
        if (capsResponse && (!capsResponse.ok || capsBody.success === false)) return;
        if (allocationsResponse && (!allocationsResponse.ok || allocationsBody.success === false)) return;
        const nextAgentCaps = agentCapsFrom(Array.isArray(config.agentCaps) ? config.agentCaps : []);
        const entityIds = [...new Set(nextAgentCaps.map((cap) => cap.entityId))];
        let nextHistory: AgentCapHistoryRow[] = [];
        if (entityIds.length > 0 && ids.length > 0) {
          const historyParams = new URLSearchParams({
            view: 'post-split-history',
            agent_ids: ids.join(','),
            entity_ids: entityIds.join(','),
          });
          if (transactionId) historyParams.set('exclude_transaction_id', transactionId);
          const postSplitResponse = await fetch(`/api/transaction-commission-items?${historyParams.toString()}`, { headers });
          const postSplitBody = await postSplitResponse.json().catch(() => ({}));
          if (!cancelled && postSplitResponse.ok && postSplitBody.success !== false) {
            nextHistory = Array.isArray(postSplitBody.history) ? postSplitBody.history : [];
          }
        }
        if (cancelled) return;
        setAgentCaps(nextAgentCaps);
        setPostSplitHistory(nextHistory);
        setTeamCaps((Array.isArray(config.teamCaps) ? config.teamCaps : []).map(teamCapFrom).filter((cap: { id: string }) => cap.id));
        setSalesVolume(volumeFrom(config.salesVolume));
        setHistory(Array.isArray(historyBody.history) ? historyBody.history : []);
        const capRows = Array.isArray(capsBody.teamCaps) ? capsBody.teamCaps : [];
        const allocationRows = Array.isArray(allocationsBody.allocations) ? allocationsBody.allocations : [];
        setHasStoredRows(capRows.length > 0 || allocationRows.length > 0);
        const loaded = [
          ...capRows.flatMap((row: { is_override?: boolean; agent_id?: string; amount?: number; team_cap_id?: string | null }) => {
            if (!row.is_override || !row.agent_id) return [];
            return [{ agentId: row.agent_id, kind: 'team_cap' as const, amount: Number(row.amount) || 0, teamCapId: row.team_cap_id || null }];
          }),
          ...allocationRows.flatMap((row: { is_override?: boolean; agent_id?: string; amount?: number }) => {
            if (!row.is_override || !row.agent_id) return [];
            return [{ agentId: row.agent_id, kind: 'sales_volume' as const, amount: Number(row.amount) || 0, teamCapId: null }];
          }),
        ];
        loadedOverridesRef.current = loaded;
        setOverrides(loaded);
        setLoadedKey(requestKey);
      } catch {
        if (!cancelled) setLoadedKey('');
      }
    })();
    return () => { cancelled = true; };
  }, [requestKey, clientId, transactionId, agentIds]);

  const ready = loadedKey === requestKey && loadedKey !== '';

  const agentCapCells = useMemo(() => buildAgentCapCells({
    caps: agentCaps,
    agents: agents.map((agent) => ({
      id: agent.id,
      fields: knownAgents.find((known) => known.id === agent.id)?.fields || {},
    })),
    history: postSplitHistory,
    dealDate,
  }), [agentCaps, agents, knownAgents, postSplitHistory, dealDate]);

  const unitsRaw = readTransactionField(deal, 'units');
  const units = unitsRaw === undefined || unitsRaw === null || String(unitsRaw).trim() === ''
    ? 1
    : Math.max(0, Number(unitsRaw) || 0);

  const input = useMemo<DealAllocationContext | null>(() => {
    if (!ready) return null;
    return {
      teamCaps,
      salesVolume,
      profiles: agents.map((agent) => ({
        agentId: agent.id,
        fields: knownAgents.find((known) => known.id === agent.id)?.fields || {},
      })),
      history,
      overrides,
      deal,
      dealDate,
      salesPrice,
      units,
      fieldTypes,
    };
  }, [ready, teamCaps, salesVolume, agents, knownAgents, history, overrides, deal, dealDate, salesPrice, units, fieldTypes]);

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

  return { ready, input, hasStoredRows, overrides, agentCapCells, setTeamCapOverride, replaceOverrides, restoreLoadedOverrides, commitOverrides };
}
