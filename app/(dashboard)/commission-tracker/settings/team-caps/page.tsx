'use client';

import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useRegisterSave } from '@/components/save-leave-guard';
import { TrashIcon } from '@/components/ui/trash-icon';
import { UnderlineField, underlineControl } from '@/components/ui/underline-field';
import { generatePrefixedId } from '@/lib/id';
import { normalizeTeamCapKey, teamCapKeyFormatError, teamCapKeyFromName } from '@/lib/agent-allocations';
import { FormulaEditor } from '../commission-templates/FormulaEditor';
import { ALLOCATION_CLIENT_ID, AllocationFieldMenu, allocationFormulaHint, fieldOptions, useAllocationSchema, type AllocationAgent } from '../allocation-fields';

type TeamCapForm = {
  id: string;
  name: string;
  key: string;
  keyLocked: boolean;
  keyCustom: boolean;
  enabled: boolean;
  qualifyingFormula: string;
  splitPercentFieldKey: string;
  capAmountFieldKey: string;
  resetDateFieldKey: string;
  recipientAgentId: string;
};

const PERCENT_FIELD_TYPES = new Set(['PERCENT']);
const AMOUNT_FIELD_TYPES = new Set(['NUMBER', 'CURRENCY']);
const DATE_FIELD_TYPES = new Set(['DATE']);

function newTeamCap(): TeamCapForm {
  const name = 'Team Cap';
  return {
    id: generatePrefixedId('CTC'),
    name,
    key: teamCapKeyFromName(name),
    keyLocked: false,
    keyCustom: false,
    enabled: false,
    qualifyingFormula: '',
    splitPercentFieldKey: '',
    capAmountFieldKey: '',
    resetDateFieldKey: '',
    recipientAgentId: '',
  };
}

function teamCapFromRow(row: Record<string, unknown>): TeamCapForm {
  const name = String(row.name || 'Team Cap');
  const storedKey = normalizeTeamCapKey(String(row.key || ''));
  return {
    id: String(row.id || generatePrefixedId('CTC')),
    name,
    key: storedKey || teamCapKeyFromName(name),
    keyLocked: Boolean(storedKey),
    keyCustom: Boolean(storedKey),
    enabled: Boolean(row.enabled),
    qualifyingFormula: String(row.qualifying_formula || ''),
    splitPercentFieldKey: String(row.split_percent_field_key || ''),
    capAmountFieldKey: String(row.cap_amount_field_key || ''),
    resetDateFieldKey: String(row.reset_date_field_key || ''),
    recipientAgentId: String(row.recipient_agent_id || ''),
  };
}

export default function TeamCapsPage() {
  const [teamCaps, setTeamCaps] = useState<TeamCapForm[]>([]);
  const [baseline, setBaseline] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { agentFields, agents, formulaNames } = useAllocationSchema();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/agent-allocations?client_id=${ALLOCATION_CLIENT_ID}`, {
          headers: { 'x-client-id': ALLOCATION_CLIENT_ID },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.error || 'The team caps could not be loaded.');
        if (cancelled) return;
        const nextTeam = (Array.isArray(data.teamCaps) ? data.teamCaps : []).map((row: Record<string, unknown>) => teamCapFromRow(row));
        setTeamCaps(nextTeam);
        setBaseline(JSON.stringify(nextTeam));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The team caps could not be loaded.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateCap = (id: string, patch: Partial<TeamCapForm>) => {
    setTeamCaps((current) => current.map((cap) => (cap.id === id ? { ...cap, ...patch } : cap)));
  };

  const keyErrorFor = (cap: TeamCapForm) => {
    const format = teamCapKeyFormatError(cap.key);
    if (format) return format;
    const key = normalizeTeamCapKey(cap.key);
    const other = teamCaps.find((item) => item.id !== cap.id && normalizeTeamCapKey(item.key) === key);
    if (!other) return null;
    return `That key is already used by ${other.name.trim() || 'Team Cap'}.`;
  };

  const recipientOptions = (selectedId: string): AllocationAgent[] => {
    if (selectedId && !agents.some((agent) => agent.id === selectedId)) {
      return [{ id: selectedId, name: selectedId }, ...agents];
    }
    return agents;
  };

  const dirty = baseline !== '' && JSON.stringify(teamCaps) !== baseline;

  const save = async () => {
    const invalid = teamCaps.find((cap) => keyErrorFor(cap));
    if (invalid) {
      setError(`${invalid.name.trim() || 'Team Cap'}: ${keyErrorFor(invalid)}`);
      return false;
    }
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/agent-allocations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-client-id': ALLOCATION_CLIENT_ID },
        body: JSON.stringify({
          clientId: ALLOCATION_CLIENT_ID,
          teamCaps: teamCaps.map(({ keyLocked, keyCustom, ...cap }) => cap),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'The team caps could not be saved.');
      const savedCaps = teamCaps.map((cap) => ({ ...cap, keyLocked: true, keyCustom: true }));
      setTeamCaps(savedCaps);
      setBaseline(JSON.stringify(savedCaps));
      setMessage('Team caps saved.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The team caps could not be saved.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useRegisterSave({
    id: 'team-caps',
    active: dirty,
    saving: isSaving,
    onSave: save,
    onDiscard: () => {
      setTeamCaps(JSON.parse(baseline) as TeamCapForm[]);
      setMessage(null);
      setError(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Team caps</h2>
          <p className="mt-1 max-w-2xl text-[11px] text-slate-500 dark:text-slate-400">
            A client can use several team caps. A deal uses every enabled cap whose formula is true, and the agent cannot pay more than their share. The agent split is that share before the cut paid to the selected agent. A blank qualifying formula applies to every deal. The selected agent has to be on the agent splits to receive the payment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || isSaving || isLoading}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {message && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Team caps</h3>
        <button
          type="button"
          onClick={() => setTeamCaps((current) => {
            const cap = newTeamCap();
            const taken = new Set(current.map((item) => normalizeTeamCapKey(item.key)));
            if (taken.has(cap.key)) {
              let suffix = 2;
              while (taken.has(`${cap.key}_${suffix}`)) suffix += 1;
              cap.key = `${cap.key}_${suffix}`;
            }
            return [...current, cap];
          })}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Add team cap
        </button>
      </div>
      {teamCaps.length === 0 ? (
        <p className="text-xs italic text-slate-400">No team caps. This client does not use a team cap until you add one.</p>
      ) : teamCaps.map((cap) => {
        const keyError = keyErrorFor(cap);
        const token = cap.key.trim() || 'this key';
        return (
          <section key={cap.id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-md dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2">
              <label className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-bold cursor-pointer ${cap.enabled ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'bg-amber-500/15 text-amber-900 dark:text-amber-100'}`}>
                <input type="checkbox" checked={cap.enabled} onChange={(event) => updateCap(cap.id, { enabled: event.target.checked })} className="h-4 w-4 cursor-pointer accent-emerald-500" />
                {`${cap.name.trim() || 'Team Cap'} is ${cap.enabled ? 'enabled' : 'disabled'}`}
              </label>
              <button
                type="button"
                onClick={() => setTeamCaps((current) => current.filter((item) => item.id !== cap.id))}
                className="ml-auto shrink-0 cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                title={`Remove ${cap.name.trim() || 'team cap'}`}
                aria-label={`Remove ${cap.name.trim() || 'team cap'}`}
              >
                <TrashIcon />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <UnderlineField label="Name">
                <input
                  className={underlineControl}
                  value={cap.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    if (cap.keyLocked || cap.keyCustom) {
                      updateCap(cap.id, { name });
                      return;
                    }
                    updateCap(cap.id, { name, key: teamCapKeyFromName(name) });
                  }}
                />
              </UnderlineField>
              <div>
                <UnderlineField label="Key" className={keyError ? '!border-b-rose-500 focus-within:!border-b-rose-500 focus-within:!shadow-none' : ''}>
                  <input
                    className={`${underlineControl} font-mono !text-sky-700 dark:!text-sky-300 ${cap.keyLocked ? 'cursor-default' : ''}`}
                    value={cap.key}
                    readOnly={cap.keyLocked}
                    tabIndex={cap.keyLocked ? -1 : undefined}
                    aria-invalid={Boolean(keyError)}
                    onChange={(event) => {
                      if (cap.keyLocked) return;
                      updateCap(cap.id, { key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''), keyCustom: true });
                    }}
                  />
                </UnderlineField>
                {keyError ? (
                  <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{keyError}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {`Formulas use ${token}.agent and ${token}.total.${cap.keyLocked ? '' : ' You can change it until the cap is saved.'}`}
                  </p>
                )}
              </div>
              <AllocationFieldMenu
                label="Allocated to"
                value={cap.recipientAgentId}
                placeholder="Choose an agent"
                options={recipientOptions(cap.recipientAgentId).map((agent) => ({ value: agent.id, label: agent.name }))}
                onChange={(recipientAgentId) => updateCap(cap.id, { recipientAgentId })}
              />
              <AllocationFieldMenu
                label="Agent split percent field"
                value={cap.splitPercentFieldKey}
                placeholder="Choose a field"
                options={fieldOptions(agentFields, PERCENT_FIELD_TYPES, cap.splitPercentFieldKey).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }))}
                onChange={(splitPercentFieldKey) => updateCap(cap.id, { splitPercentFieldKey })}
              />
              <AllocationFieldMenu
                label="Cap amount field"
                value={cap.capAmountFieldKey}
                placeholder="Choose a field"
                options={fieldOptions(agentFields, AMOUNT_FIELD_TYPES, cap.capAmountFieldKey).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }))}
                onChange={(capAmountFieldKey) => updateCap(cap.id, { capAmountFieldKey })}
              />
              <AllocationFieldMenu
                label="Reset date field"
                value={cap.resetDateFieldKey}
                placeholder="Choose a field"
                options={fieldOptions(agentFields, DATE_FIELD_TYPES, cap.resetDateFieldKey).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }))}
                onChange={(resetDateFieldKey) => updateCap(cap.id, { resetDateFieldKey })}
              />
            </div>
            <FormulaEditor
              label="Qualifying formula"
              value={cap.qualifyingFormula}
              onChange={(qualifyingFormula) => updateCap(cap.id, { qualifyingFormula })}
              names={formulaNames}
              fitContent
              hint={allocationFormulaHint}
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">This field is the percent of the agent’s share paid to the selected agent. An 80/20 agent is 20%. An agent with no cap amount pays that percent in full and is not tracked. The reset date is that agent’s cap anniversary.</p>
          </section>
        );
      })}
    </div>
  );
}
