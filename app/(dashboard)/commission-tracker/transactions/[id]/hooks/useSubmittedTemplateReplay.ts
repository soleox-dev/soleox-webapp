import { useEffect, useRef, useState } from 'react';
import { TEAM_CAP_SELECTION_KEY } from '@/lib/agent-allocations';
import type { FormulaLedgerRow, FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import {
  formulaDataNeeds,
  loadCommissionLedger,
  loadFormulaLookups,
  loadTemplateBundle,
  peekFormulaLookups,
  peekTemplateBundle,
  templateFormulaSources,
  type NamedParty,
  type TemplateLogicStep,
} from '../components/applyTemplateLogic';

export type SubmittedTemplateReplay = {
  steps: TemplateLogicStep[];
  parameters: Record<string, string>;
  parameterTypes: Record<string, string | null | undefined>;
  entities: NamedParty[];
  rosterAgents: NamedParty[];
  ledger: FormulaLedgerRow[];
  lookups: FormulaLookups;
};

type LoadedReplay = Omit<SubmittedTemplateReplay, 'entities' | 'rosterAgents'> & {
  transactionId: string;
  templateId: string;
};

export type PendingTemplateReplay = {
  template_id?: string | null;
  submitted_parameters?: Record<string, string> | null;
};

function parameterRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    record[key] = raw === undefined || raw === null ? '' : String(raw);
  });
  return record;
}

function stripParameters(value: unknown): Record<string, string> {
  const saved = parameterRecord(value);
  const { [TEAM_CAP_SELECTION_KEY]: omittedCapSelection, ...parameters } = saved;
  void omittedCapSelection;
  return parameters;
}

function sameParameters(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

export type SubmittedTemplateReplayState = {
  replay: SubmittedTemplateReplay | null;
  /** True while this transaction's submitted template is still loading, so the waterfall is not final yet. */
  settling: boolean;
};

export function useSubmittedTemplateReplay({
  clientId,
  transactionId,
  entities,
  rosterAgents,
  entitiesReady = true,
  pendingSubmission = null,
  revision = 0,
  reset = 0,
}: {
  clientId: string;
  transactionId: string;
  entities: NamedParty[];
  /** False until the entity list has loaded. The replay is not final before then. */
  entitiesReady?: boolean;
  rosterAgents: NamedParty[];
  /** The template submit still waiting to be saved. Its parameters win over the stored submission. */
  pendingSubmission?: PendingTemplateReplay | null;
  revision?: number;
  /** Discards the unsaved parameters and waits for the stored submission. */
  reset?: number;
}): SubmittedTemplateReplayState {
  const [loaded, setLoaded] = useState<LoadedReplay | null>(null);
  const [settledKey, setSettledKey] = useState('');
  // Cached rules and lookup rows from an earlier visit are fetched again once per page visit.
  const revalidatedRef = useRef(new Set<string>());
  const [seenReset, setSeenReset] = useState(reset);
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const pendingRef = useRef(pendingSubmission);
  pendingRef.current = pendingSubmission;
  const entityKey = entities.map((entity) => entity.id).join(',');
  const pendingTemplateId = String(pendingSubmission?.template_id || '').trim();
  const pendingParameters = pendingSubmission?.submitted_parameters
    ? stripParameters(pendingSubmission.submitted_parameters)
    : null;
  const requestKey = `${clientId}|${transactionId}|${entitiesReady ? entityKey : '…'}|${revision}|${pendingTemplateId}`;

  if (reset !== seenReset) {
    setSeenReset(reset);
    setLoaded(null);
  } else if (
    loaded
    && pendingParameters
    && loaded.transactionId === transactionId
    && pendingTemplateId === loaded.templateId
    && !sameParameters(pendingParameters, loaded.parameters)
  ) {
    setLoaded({ ...loaded, parameters: pendingParameters });
  }

  useEffect(() => {
    if (!clientId || !transactionId) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    const settle = () => {
      if (!cancelled && entitiesReady) setSettledKey(requestKey);
    };
    const load = async () => {
      const pending = pendingRef.current;
      const pendingId = String(pending?.template_id || '').trim();
      const headers = { 'x-client-id': clientId };
      let templateId = pendingId;
      let parameters = pending?.submitted_parameters ? stripParameters(pending.submitted_parameters) : null;
      if (!templateId) {
        const submissionResponse = await fetch(`/api/commission-template-submissions?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`, { headers, cache: 'no-store' });
        const submissionData = await submissionResponse.json();
        if (!submissionResponse.ok || submissionData.success === false) throw new Error(submissionData.error || 'Failed to load the template submission.');
        const submitted = Array.isArray(submissionData.submissions) ? submissionData.submissions[0] : null;
        templateId = String(submitted?.template_id || '').trim();
        parameters = stripParameters(submitted?.submitted_parameters);
      }
      if (!templateId) {
        if (!cancelled) setLoaded(null);
        settle();
        return;
      }
      // Rules and lookup rows are small, so rows left from an earlier visit are fetched again once in
      // case Settings or the Agents page changed them; a request already in flight is shared. The
      // whole-tenant ledger (tens of thousands of lines) comes from the session cache, which every
      // edit path empties with clearCommissionModuleCache().
      const revalidate = (key: string, cached: boolean) => {
        const seen = revalidatedRef.current.has(key);
        revalidatedRef.current.add(key);
        return cached && !seen;
      };
      const bundle = await loadTemplateBundle(templateId, {
        refresh: revalidate(`bundle:${templateId}`, peekTemplateBundle(templateId) !== null),
      });
      const steps = bundle.steps;
      const parameterRows = bundle.parameters;
      const needs = formulaDataNeeds(templateFormulaSources(steps, parameterRows));
      const refreshLookups = revalidate(
        `lookups:${clientId}:${needs.lookupTables.join(',')}`,
        peekFormulaLookups(clientId, needs.lookupTables) !== null,
      );
      // The ledger is cached per entity list, so it waits for the real one. The rules and lookups
      // are already loaded when the entities arrive.
      if (!entitiesReady) {
        if (needs.lookupTables.length > 0) await loadFormulaLookups(clientId, needs.lookupTables, { refresh: refreshLookups });
        return;
      }
      const [ledger, lookups] = await Promise.all([
        needs.needsLedger ? loadCommissionLedger(clientId, entitiesRef.current) : Promise.resolve([]),
        needs.lookupTables.length > 0 ? loadFormulaLookups(clientId, needs.lookupTables, { refresh: refreshLookups }) : Promise.resolve({ clientId, tables: {} }),
      ]);
      if (cancelled) return;
      const latestPending = pendingRef.current;
      const latestPendingId = String(latestPending?.template_id || '').trim();
      const resolvedParameters = latestPendingId === templateId && latestPending?.submitted_parameters
        ? stripParameters(latestPending.submitted_parameters)
        : (parameters ?? {});
      setLoaded({
        transactionId,
        templateId,
        steps,
        parameters: resolvedParameters,
        parameterTypes: Object.fromEntries(parameterRows.map((parameter) => [String(parameter.parameter_key || ''), parameter.data_type || ''])),
        ledger,
        lookups,
      });
      settle();
    };
    void load().catch(() => {
      if (!cancelled) setLoaded(null);
      settle();
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, transactionId, entityKey, entitiesReady, revision, pendingTemplateId, requestKey]);

  const current = reset === seenReset
    && loaded
    && loaded.transactionId === transactionId
    && (!pendingTemplateId || pendingTemplateId === loaded.templateId)
    ? loaded
    : null;
  // A replay already shown for this transaction and template stays up while it reloads.
  const settling = Boolean(transactionId) && settledKey !== requestKey && !current;
  if (!current) return { replay: null, settling };
  const parameters = pendingParameters && pendingTemplateId === current.templateId
    ? pendingParameters
    : current.parameters;
  return {
    settling,
    replay: {
      steps: current.steps,
      parameters,
      parameterTypes: current.parameterTypes,
      entities,
      rosterAgents,
      ledger: current.ledger,
      lookups: current.lookups,
    },
  };
}
