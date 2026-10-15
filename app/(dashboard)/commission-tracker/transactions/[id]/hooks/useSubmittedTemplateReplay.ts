import { useEffect, useRef, useState } from 'react';
import { TEAM_CAP_SELECTION_KEY } from '@/lib/agent-allocations';
import type { FormulaLedgerRow, FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import {
  formulaDataNeeds,
  loadCommissionLedger,
  loadFormulaLookups,
  loadTemplateBundle,
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

export function useSubmittedTemplateReplay({
  clientId,
  transactionId,
  entities,
  rosterAgents,
  pendingSubmission = null,
  revision = 0,
  reset = 0,
}: {
  clientId: string;
  transactionId: string;
  entities: NamedParty[];
  rosterAgents: NamedParty[];
  /** The template submit still waiting to be saved. Its parameters win over the stored submission. */
  pendingSubmission?: PendingTemplateReplay | null;
  revision?: number;
  /** Discards the unsaved parameters and waits for the stored submission. */
  reset?: number;
}): SubmittedTemplateReplay | null {
  const [loaded, setLoaded] = useState<LoadedReplay | null>(null);
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
        return;
      }
      const bundle = await loadTemplateBundle(templateId);
      const steps = bundle.steps;
      const parameterRows = bundle.parameters;
      const needs = formulaDataNeeds(templateFormulaSources(steps, parameterRows));
      const [ledger, lookups] = await Promise.all([
        needs.needsLedger ? loadCommissionLedger(clientId, entitiesRef.current) : Promise.resolve([]),
        needs.lookupTables.length > 0 ? loadFormulaLookups(clientId, needs.lookupTables) : Promise.resolve({ clientId, tables: {} }),
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
    };
    void load().catch(() => {
      if (!cancelled) setLoaded(null);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, transactionId, entityKey, revision, pendingTemplateId]);

  if (reset !== seenReset || !loaded || loaded.transactionId !== transactionId) return null;
  if (pendingTemplateId && pendingTemplateId !== loaded.templateId) return null;
  const parameters = pendingParameters && pendingTemplateId === loaded.templateId
    ? pendingParameters
    : loaded.parameters;
  return {
    steps: loaded.steps,
    parameters,
    parameterTypes: loaded.parameterTypes,
    entities,
    rosterAgents,
    ledger: loaded.ledger,
    lookups: loaded.lookups,
  };
}
