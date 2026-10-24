'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildDealPlanContext, type DealPlanContext, type DealPlanDecision, type DealPlanIngredients, type EngineField } from '@/lib/commission-engine';
import { dealMatchesDefaultView } from '@/lib/transaction-default-view';

type Loaded = Omit<DealPlanIngredients, 'finished'> & {
  finishedFormula: string;
  /** Whose history came back: a saved deal's own agents. Null means everyone's (a new deal). */
  historyAgentIds?: string[] | null;
};

/**
 * Commission Plans for the deal on screen: loads the client's plan settings, plans, agent fields and history once
 * per deal, then decides with the deal as currently edited (a changed closing date or status counts at once).
 * `settling` is true while the switch is on and the plans have not loaded, so nothing saves without them.
 * A saved deal's history covers only its own agents; an agent added on the page (`agentIds`) is fetched again with
 * theirs, and the plans count as settling until it arrives.
 */
export function useDealPlanContext(
  transactionId: string,
  clientId: string,
  deal: Record<string, unknown> | null,
  fields: EngineField[],
  agentIds: string[] = [],
): {
  context: DealPlanContext | null;
  decision: DealPlanDecision;
  reason: string;
  settling: boolean;
  error: string | null;
  switchedOn: boolean;
  calculateSince: string | null;
} {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Agents on the page whose history the loaded data lacks; refetching for them keeps the loaded data meanwhile.
  const [extraAgentIds, setExtraAgentIds] = useState<string[]>([]);
  const [fetchingExtra, setFetchingExtra] = useState(false);
  const covered = loaded?.historyAgentIds;
  const missingKey = covered
    ? [...new Set(agentIds.filter((id) => id && !covered.includes(id)))].sort().join(',')
    : '';

  useEffect(() => {
    setExtraAgentIds([]);
  }, [transactionId, clientId]);

  useEffect(() => {
    if (!missingKey) return;
    setExtraAgentIds((current) => [...new Set([...current, ...missingKey.split(',')])].sort());
  }, [missingKey]);

  const extraKey = extraAgentIds.join(',');
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const refetch = Boolean(extraKey);
    if (refetch) setFetchingExtra(true);
    else {
      setLoaded(null);
      setError(null);
      setFetchingExtra(false);
    }
    void (async () => {
      try {
        const params = new URLSearchParams();
        if (transactionId) params.set('transaction_id', transactionId);
        if (extraKey) params.set('agent_ids', extraKey);
        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`/api/commission-plans/deal-context${query}`, { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.error || 'The Commission Plans for this deal could not be loaded.');
        if (!cancelled) setLoaded(result as Loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The Commission Plans for this deal could not be loaded.');
      } finally {
        if (!cancelled && refetch) setFetchingExtra(false);
      }
    })();
    return () => { cancelled = true; };
  }, [transactionId, clientId, extraKey]);

  const fieldTypes = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.key, String(field.type || 'TEXT')])),
    [fields],
  );

  return useMemo(() => {
    if (!loaded || !deal || fetchingExtra || missingKey) {
      // Until the settings load, a failed load or a deal not yet open counts as switched off only once known.
      return {
        context: null,
        decision: { context: null, reason: '' },
        reason: '',
        settling: !error && Boolean(deal) && (!loaded || fetchingExtra || Boolean(missingKey)),
        error,
        // While an added agent's history loads, the notice stays (the switch is known).
        switchedOn: Boolean(loaded?.settings.calculate_deals),
        calculateSince: loaded?.settings.calculate_since || null,
      };
    }
    // A FINISHED deal keeps its saved lines; a formula that cannot be read counts as finished, to stay safe.
    const finished = Boolean(loaded.finishedFormula) && dealMatchesDefaultView(deal, loaded.finishedFormula, fieldTypes);
    const decision = buildDealPlanContext(deal, { ...loaded, finished });
    return {
      context: decision.context,
      decision,
      reason: decision.reason,
      settling: false,
      error,
      switchedOn: Boolean(loaded.settings.calculate_deals),
      calculateSince: loaded.settings.calculate_since || null,
    };
  }, [loaded, deal, fieldTypes, error, fetchingExtra, missingKey]);
}
