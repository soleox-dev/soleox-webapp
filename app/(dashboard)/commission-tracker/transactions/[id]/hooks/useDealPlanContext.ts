'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildDealPlanContext, type DealPlanContext, type DealPlanDecision, type DealPlanIngredients, type EngineField } from '@/lib/commission-engine';
import { dealMatchesDefaultView } from '@/lib/transaction-default-view';

type Loaded = Omit<DealPlanIngredients, 'finished'> & { finishedFormula: string };

/**
 * Commission Plans for the deal on screen: loads the client's plan settings, plans, agent fields and history once
 * per deal, then decides with the deal as currently edited (a changed closing date or status counts at once).
 * `settling` is true while the switch is on and the plans have not loaded, so nothing saves without them.
 */
export function useDealPlanContext(
  transactionId: string,
  clientId: string,
  deal: Record<string, unknown> | null,
  fields: EngineField[],
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

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoaded(null);
    setError(null);
    void (async () => {
      try {
        const query = transactionId ? `?transaction_id=${encodeURIComponent(transactionId)}` : '';
        const response = await fetch(`/api/commission-plans/deal-context${query}`, { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.error || 'The Commission Plans for this deal could not be loaded.');
        if (!cancelled) setLoaded(result as Loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The Commission Plans for this deal could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, [transactionId, clientId]);

  const fieldTypes = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.key, String(field.type || 'TEXT')])),
    [fields],
  );

  return useMemo(() => {
    if (!loaded || !deal) {
      // Until the settings load, a failed load or a deal not yet open counts as switched off only once known.
      return { context: null, decision: { context: null, reason: '' }, reason: '', settling: !error && Boolean(deal) && !loaded, error, switchedOn: false, calculateSince: null };
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
  }, [loaded, deal, fieldTypes, error]);
}
