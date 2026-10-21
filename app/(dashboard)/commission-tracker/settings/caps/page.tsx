'use client';

import { phoneSheet } from '@/lib/page-frame';
import React, { useEffect, useState } from 'react';
import { Copy, Gauge, Plus, User } from 'lucide-react';
import { useRegisterSave, useRequestLeave } from '@/components/save-leave-guard';
import { TrashIcon } from '@/components/ui/trash-icon';
import { EditPencil } from '@/components/ui/edit-pencil';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { CapKeyRenameCounts } from '@/app/api/agent-allocations/rename-key/route';
import { UnderlineField, underlineControl } from '@/components/ui/underline-field';
import { copyKey, generatePrefixedId } from '@/lib/id';
import { normalizeTeamCapKey, teamCapKeyFormatError, teamCapKeyFromName } from '@/lib/agent-allocations';
import { FormulaEditor, type FormulaName } from '../commission-templates/FormulaEditor';
import { ALLOCATION_CLIENT_ID, AllocationFieldMenu, allocationFormulaHint, fieldOptions, useAllocationSchema, type AllocationAgent } from '../allocation-fields';
import { useAccess } from '@/components/access-provider';
import { SettingsHeader, SETTINGS_CARD, SETTINGS_PRIMARY_BUTTON } from '@/components/settings/SettingsHeader';

type CapTab = 'team' | 'agent';

type CapBase = {
  id: string;
  name: string;
  key: string;
  keyLocked: boolean;
  keyCustom: boolean;
  enabled: boolean;
  capAmountFieldKey: string;
  resetDateFieldKey: string;
};

type TeamCapForm = CapBase & {
  qualifyingFormula: string;
  splitPercentFieldKey: string;
  recipientAgentId: string;
};

type AgentCapForm = CapBase & {
  commissionEntityId: string;
  hideOverAllocations: boolean;
};

type NamedKey = { id: string; name: string; key: string };

const PERCENT_FIELD_TYPES = new Set(['PERCENT']);
const AMOUNT_FIELD_TYPES = new Set(['NUMBER', 'CURRENCY']);
const DATE_FIELD_TYPES = new Set(['DATE']);

function uniqueKey(key: string, taken: Set<string>): string {
  if (!taken.has(key)) return key;
  let suffix = 2;
  while (taken.has(`${key}_${suffix}`)) suffix += 1;
  return `${key}_${suffix}`;
}

function newTeamCap(taken: Set<string>): TeamCapForm {
  const name = 'Team Cap';
  return {
    id: generatePrefixedId('CTC'),
    name,
    key: uniqueKey(teamCapKeyFromName(name), taken),
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

// A copy of a cap, placed right after it: "<name> Copy", its key the original's with the first free number
// appended, and disabled until reviewed, so two
// identical caps never both apply by accident.
function copyOfCap<T extends TeamCapForm | AgentCapForm>(cap: T, taken: Set<string>, idPrefix: string, keyFallback?: string): T {
  const name = `${cap.name.trim() || (keyFallback === 'agent_cap' ? 'Agent Cap' : 'Team Cap')} Copy`;
  return {
    ...cap,
    id: generatePrefixedId(idPrefix),
    name,
    key: copyKey(cap.key.trim() || teamCapKeyFromName(name, keyFallback), taken),
    keyLocked: false,
    keyCustom: true,
    enabled: false,
  };
}

function insertAfter<T extends { id: string }>(list: T[], id: string, item: T): T[] {
  const index = list.findIndex((entry) => entry.id === id);
  return index < 0 ? [...list, item] : [...list.slice(0, index + 1), item, ...list.slice(index + 1)];
}

function newAgentCap(taken: Set<string>): AgentCapForm {
  const name = 'Agent Cap';
  return {
    id: generatePrefixedId('CAC'),
    name,
    key: uniqueKey(teamCapKeyFromName(name, 'agent_cap'), taken),
    keyLocked: false,
    keyCustom: false,
    enabled: false,
    capAmountFieldKey: '',
    resetDateFieldKey: '',
    commissionEntityId: '',
    hideOverAllocations: false,
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

function agentCapFromRow(row: Record<string, unknown>): AgentCapForm {
  const name = String(row.name || 'Agent Cap');
  const storedKey = normalizeTeamCapKey(String(row.key || ''));
  return {
    id: String(row.id || generatePrefixedId('CAC')),
    name,
    key: storedKey || teamCapKeyFromName(name, 'agent_cap'),
    keyLocked: Boolean(storedKey),
    keyCustom: Boolean(storedKey),
    enabled: Boolean(row.enabled),
    capAmountFieldKey: String(row.cap_amount_field_key || ''),
    resetDateFieldKey: String(row.reset_date_field_key || ''),
    commissionEntityId: String(row.commission_entity_id || ''),
    hideOverAllocations: Boolean(row.hide_over_allocations),
  };
}

function keyErrorFor(cap: NamedKey, caps: NamedKey[]): string | null {
  const format = teamCapKeyFormatError(cap.key);
  if (format) return format;
  const key = normalizeTeamCapKey(cap.key);
  const other = caps.find((item) => item.id !== cap.id && normalizeTeamCapKey(item.key) === key);
  if (!other) return null;
  return `That key is already used by ${other.name.trim() || 'another cap'}.`;
}

function lockKeys<T extends CapBase>(caps: T[]): T[] {
  return caps.map((cap) => ({ ...cap, keyLocked: true, keyCustom: true }));
}

export default function CapsPage() {
  const [tab, setTab] = useState<CapTab>('team');
  const [teamCaps, setTeamCaps] = useState<TeamCapForm[]>([]);
  const [agentCaps, setAgentCaps] = useState<AgentCapForm[]>([]);
  const [teamBaseline, setTeamBaseline] = useState('');
  const [agentBaseline, setAgentBaseline] = useState('');
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { access } = useAccess();
  const activeClientId = access?.clientId || ALLOCATION_CLIENT_ID;
  const { agentFields, agents, formulaNames } = useAllocationSchema();
  const requestLeave = useRequestLeave();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const headers = { 'x-client-id': activeClientId };
        const [capsResponse, entitiesResponse] = await Promise.all([
          fetch(`/api/agent-allocations?client_id=${encodeURIComponent(activeClientId)}`, { headers }),
          fetch('/api/commission-entities', { headers }),
        ]);
        const data = await capsResponse.json().catch(() => ({}));
        const entityData = await entitiesResponse.json().catch(() => ({}));
        if (!capsResponse.ok || data.success === false) throw new Error(data.error || 'The caps could not be loaded.');
        if (cancelled) return;
        const nextTeam = (Array.isArray(data.teamCaps) ? data.teamCaps : []).map((row: Record<string, unknown>) => teamCapFromRow(row));
        const nextAgent = (Array.isArray(data.agentCaps) ? data.agentCaps : []).map((row: Record<string, unknown>) => agentCapFromRow(row));
        setTeamCaps(nextTeam);
        setAgentCaps(nextAgent);
        setTeamBaseline(JSON.stringify(nextTeam));
        setAgentBaseline(JSON.stringify(nextAgent));
        const roster = Array.isArray(entityData.entities) ? entityData.entities : [];
        setEntities(roster.flatMap((entity: { id?: string; entity_name?: string }) => {
          const id = String(entity.id || '');
          if (!id) return [];
          return [{ id, name: String(entity.entity_name || id) }];
        }));
      } catch (err) {
        if (!cancelled) {
          setTeamBaseline('[]');
          setAgentBaseline('[]');
          setError(err instanceof Error ? err.message : 'The caps could not be loaded.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeClientId]);

  const namedKeys = (): NamedKey[] => [
    ...teamCaps.map((cap) => ({ id: cap.id, name: cap.name, key: cap.key })),
    ...agentCaps.map((cap) => ({ id: cap.id, name: cap.name, key: cap.key })),
  ];

  const teamDirty = teamBaseline !== '' && JSON.stringify(teamCaps) !== teamBaseline;
  const agentDirty = agentBaseline !== '' && JSON.stringify(agentCaps) !== agentBaseline;
  const dirty = tab === 'team' ? teamDirty : agentDirty;

  const recipientOptions = (selectedId: string): AllocationAgent[] => {
    if (selectedId && !agents.some((agent) => agent.id === selectedId)) {
      return [{ id: selectedId, name: selectedId }, ...agents];
    }
    return agents;
  };

  const entityOptions = (selectedId: string) => {
    const options = entities.map((entity) => ({ value: entity.id, label: entity.name }));
    if (selectedId && !options.some((option) => option.value === selectedId)) {
      return [{ value: selectedId, label: selectedId }, ...options];
    }
    return options;
  };

  const save = async () => {
    const savingTeam = tab === 'team';
    const caps = savingTeam ? teamCaps : agentCaps;
    const invalid = caps.find((cap) => keyErrorFor(cap, namedKeys()));
    if (invalid) {
      setError(`${invalid.name.trim() || (savingTeam ? 'Team Cap' : 'Agent Cap')}: ${keyErrorFor(invalid, namedKeys())}`);
      return false;
    }
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = caps.map(({ keyLocked, keyCustom, ...cap }) => cap);
      const response = await fetch('/api/agent-allocations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-client-id': activeClientId },
        body: JSON.stringify({
          clientId: activeClientId,
          ...(savingTeam ? { teamCaps: payload } : { agentCaps: payload }),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'The caps could not be saved.');
      if (savingTeam) {
        const saved = lockKeys(teamCaps);
        setTeamCaps(saved);
        setTeamBaseline(JSON.stringify(saved));
        setMessage('Team caps saved.');
      } else {
        const saved = lockKeys(agentCaps);
        setAgentCaps(saved);
        setAgentBaseline(JSON.stringify(saved));
        setMessage('Agent caps saved.');
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The caps could not be saved.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const discard = () => {
    if (tab === 'team') setTeamCaps(JSON.parse(teamBaseline) as TeamCapForm[]);
    else setAgentCaps(JSON.parse(agentBaseline) as AgentCapForm[]);
    setMessage(null);
    setError(null);
  };

  useRegisterSave({
    id: 'caps',
    active: dirty,
    saving: isSaving,
    onSave: save,
    onDiscard: discard,
  });

  const chooseTab = (next: CapTab) => {
    if (next === tab) return;
    requestLeave(() => {
      setTab(next);
      setMessage(null);
      setError(null);
    });
  };

  const takenKeys = () => new Set(namedKeys().map((cap) => normalizeTeamCapKey(cap.key)));

  // Renames a saved cap's key and every formula that uses it (migration 060), after showing what changes.
  // The cap's key is updated in place and in the saved baseline, so the rename is not an unsaved edit.
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
  const renameCapKey = async (capId: string, newKey: string): Promise<{ renamed: boolean; error?: string }> => {
    const call = async (apply: boolean): Promise<CapKeyRenameCounts> => {
      const response = await fetch('/api/agent-allocations/rename-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': activeClientId },
        body: JSON.stringify({ capId, newKey, apply }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'The cap key could not be renamed.');
      return data.counts as CapKeyRenameCounts;
    };
    try {
      const counts = await call(false);
      const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
      const parts = [
        counts.rules ? plural(counts.rules, 'template rule', 'template rules') : '',
        counts.parameters ? plural(counts.parameters, 'template parameter', 'template parameters') : '',
        counts.templates ? plural(counts.templates, 'template eligibility formula', 'template eligibility formulas') : '',
        counts.caps ? plural(counts.caps, 'cap qualifying formula', 'cap qualifying formulas') : '',
        counts.salesVolume ? 'the sales volume formula' : '',
        counts.fieldFormulas ? plural(counts.fieldFormulas, 'field formula', 'field formulas') : '',
      ].filter(Boolean);
      const confirmed = await confirmAction({
        title: 'Rename Cap Key?',
        message: parts.length
          ? `${counts.oldKey} becomes ${newKey}, and formulas that use it are updated: ${parts.join(', ')}. To go back later, rename it again.`
          : `${counts.oldKey} becomes ${newKey}. No formula uses this key yet.`,
        confirmLabel: 'Rename Key',
        tone: 'primary',
      });
      if (!confirmed) return { renamed: false };
      await call(true);
      const rekey = <T extends CapBase>(caps: T[]) => caps.map((cap) => (cap.id === capId ? { ...cap, key: newKey } : cap));
      const rekeyBaseline = (baseline: string) => (baseline ? JSON.stringify(rekey(JSON.parse(baseline) as CapBase[])) : baseline);
      setTeamCaps((current) => rekey(current));
      setAgentCaps((current) => rekey(current));
      setTeamBaseline((current) => rekeyBaseline(current));
      setAgentBaseline((current) => rekeyBaseline(current));
      setMessage(`Key renamed to ${newKey}.`);
      return { renamed: true };
    } catch (err) {
      return { renamed: false, error: err instanceof Error ? err.message : 'The cap key could not be renamed.' };
    }
  };

  const tabClass = (active: boolean) => `px-4 py-2 rounded-md text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer ${
    active
      ? 'bg-brand-500/10 dark:bg-brand-950/80 text-brand-700 dark:text-brand-400 border border-brand-500/30'
      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
  }`;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className={SETTINGS_CARD}>
      <SettingsHeader
        title="Caps"
        description="Team caps move part of an agent's split to their team until a yearly limit is reached. Agent caps limit what a post-split entity takes from one agent."
        actions={
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || isSaving || isLoading}
          className={SETTINGS_PRIMARY_BUTTON}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        }
      />
      <div className="mt-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
          <button type="button" onClick={() => chooseTab('team')} className={tabClass(tab === 'team')}>
            <Gauge className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Team Caps
          </button>
          <button type="button" onClick={() => chooseTab('agent')} className={tabClass(tab === 'agent')}>
            <User className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Agent Caps
          </button>
        </div>
      </div>
      </div>

      <p className="max-w-2xl text-2xs text-slate-500 dark:text-slate-400">
        {tab === 'team'
          ? 'A client can use several team caps. A deal uses every enabled cap whose formula is true, and the agent cannot pay more than their share. The agent split is that share before the cut paid to the selected agent. A blank qualifying formula applies to every deal. The selected agent has to be on the agent splits to receive the payment.'
          : 'An agent cap follows a post-split the commission template already calculates. It does not change the split. The report uses the name, the cap amount field, and the reset date. Hide Over-Allocations keeps the report and the waterfall at the cap amount when that fee continues past it.'}
      </p>
      {message && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      {tab === 'team' ? (
        <TeamCapList
          caps={teamCaps}
          named={namedKeys()}
          isLoading={isLoading}
          agentFields={agentFields}
          formulaNames={formulaNames}
          recipientOptions={recipientOptions}
          onAdd={() => setTeamCaps((current) => [...current, newTeamCap(takenKeys())])}
          onChange={(id, patch) => setTeamCaps((current) => current.map((cap) => (cap.id === id ? { ...cap, ...patch } : cap)))}
          onRemove={(id) => setTeamCaps((current) => current.filter((cap) => cap.id !== id))}
          onRenameKey={renameCapKey}
          onDuplicate={(id) => setTeamCaps((current) => {
            const source = current.find((cap) => cap.id === id);
            return source ? insertAfter(current, id, copyOfCap(source, takenKeys(), 'CTC')) : current;
          })}
        />
      ) : (
        <AgentCapList
          caps={agentCaps}
          named={namedKeys()}
          isLoading={isLoading}
          agentFields={agentFields}
          entityOptions={entityOptions}
          onAdd={() => setAgentCaps((current) => [...current, newAgentCap(takenKeys())])}
          onChange={(id, patch) => setAgentCaps((current) => current.map((cap) => (cap.id === id ? { ...cap, ...patch } : cap)))}
          onRemove={(id) => setAgentCaps((current) => current.filter((cap) => cap.id !== id))}
          onRenameKey={renameCapKey}
          onDuplicate={(id) => setAgentCaps((current) => {
            const source = current.find((cap) => cap.id === id);
            return source ? insertAfter(current, id, copyOfCap(source, takenKeys(), 'CAC', 'agent_cap')) : current;
          })}
        />
      )}
    </div>
  );
}

function CapHeading({
  action,
  onAdd,
}: {
  action: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-brand-500/10 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-500/15 dark:hover:text-brand-400 cursor-pointer"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {action}
      </button>
    </div>
  );
}

function EnabledRow({
  name,
  enabled,
  fallback,
  onEnabled,
  onRemove,
  onDuplicate,
}: {
  name: string;
  enabled: boolean;
  fallback: string;
  onEnabled: (enabled: boolean) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const label = name.trim() || fallback;
  return (
    <div className="flex items-center gap-2">
      <label className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-bold cursor-pointer ${enabled ? 'bg-brand-500/15 text-brand-800 dark:text-brand-200' : 'bg-amber-500/15 text-amber-900 dark:text-amber-100'}`}>
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} className="h-4 w-4 cursor-pointer accent-brand-600" />
        {`${label} is ${enabled ? 'enabled' : 'disabled'}`}
      </label>
      <button
        type="button"
        onClick={onDuplicate}
        className="ml-auto shrink-0 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-700 dark:hover:bg-slate-700 dark:hover:text-brand-400"
        title={`Duplicate ${label}`}
        aria-label={`Duplicate ${label}`}
      >
        <Copy className="h-[17px] w-[17px]" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
        title={`Remove ${label}`}
        aria-label={`Remove ${label}`}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function NameKeyFields({
  name,
  capKey,
  keyLocked,
  keyCustom,
  keyError,
  hint,
  emptyKey,
  onName,
  onKey,
  onRename,
}: {
  name: string;
  capKey: string;
  keyLocked: boolean;
  keyCustom: boolean;
  keyError: string | null;
  hint: string;
  emptyKey: string;
  onName: (name: string, key: string | null) => void;
  onKey: (key: string) => void;
  /** For a saved (locked) key: renames it everywhere. Resolves to an error message, or null when renamed or cancelled. */
  onRename?: (key: string) => Promise<{ renamed: boolean; error?: string }>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitRename = async () => {
    setBusy(true);
    const result = await onRename!(draft);
    setBusy(false);
    if (result.error) setRenameError(result.error);
    else if (result.renamed) setRenaming(false);
  };
  return (
    <>
      <UnderlineField label="Name">
        <input
          className={underlineControl}
          value={name}
          onChange={(event) => {
            const nextName = event.target.value;
            if (keyLocked || keyCustom) {
              onName(nextName, null);
              return;
            }
            onName(nextName, teamCapKeyFromName(nextName, emptyKey));
          }}
        />
      </UnderlineField>
      {renaming ? (
        <form
          className="space-y-1"
          onSubmit={(event) => {
            event.preventDefault();
            void submitRename();
          }}
        >
          <UnderlineField label={`Rename Key ${capKey}`}>
            <input
              autoFocus
              className={`${underlineControl} font-mono !text-sky-700 dark:!text-sky-300`}
              value={draft}
              aria-invalid={Boolean(renameError)}
              onChange={(event) => {
                setDraft(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                setRenameError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setRenaming(false);
              }}
            />
          </UnderlineField>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-full bg-brand-600 px-3 py-0.5 text-2xs font-bold text-white hover:bg-brand-500 disabled:opacity-50 cursor-pointer">
              {busy ? 'Checking…' : 'Rename'}
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="rounded-full px-2 py-0.5 text-2xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer">
              Cancel
            </button>
            {renameError && <span className="text-2xs font-semibold text-rose-600 dark:text-rose-400">{renameError}</span>}
          </div>
        </form>
      ) : (
      <div>
        <UnderlineField label="Key" className={keyError ? '!border-b-rose-500 focus-within:!border-b-rose-500 focus-within:!shadow-none' : ''}>
          <input
            className={`${underlineControl} font-mono !text-sky-700 dark:!text-sky-300 ${keyLocked ? 'cursor-default' : ''}`}
            value={capKey}
            readOnly={keyLocked}
            tabIndex={keyLocked ? -1 : undefined}
            aria-invalid={Boolean(keyError)}
            onChange={(event) => {
              if (keyLocked) return;
              onKey(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
            }}
          />
        </UnderlineField>
        {keyError ? (
          <p className="mt-1 text-2xs font-medium text-rose-600 dark:text-rose-400">{keyError}</p>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-2xs text-slate-500 dark:text-slate-400">
            <span>{hint}</span>
            {keyLocked && onRename && (
              <button
                type="button"
                onClick={() => {
                  setDraft(capKey);
                  setRenameError(null);
                  setRenaming(true);
                }}
                className="inline-flex items-center gap-1 rounded px-1 font-semibold text-brand-700 hover:bg-brand-500/10 dark:text-brand-400 cursor-pointer"
                title="Rename Key"
              >
                <EditPencil className="h-3.5 w-3.5" />
                Rename Key
              </button>
            )}
          </p>
        )}
      </div>
      )}
    </>
  );
}

function TeamCapList({
  caps,
  named,
  isLoading,
  agentFields,
  formulaNames,
  recipientOptions,
  onAdd,
  onChange,
  onRemove,
  onDuplicate,
  onRenameKey,
}: {
  caps: TeamCapForm[];
  named: NamedKey[];
  isLoading: boolean;
  agentFields: { field_key: string; field_label?: string; field_type?: string }[];
  formulaNames: FormulaName[];
  recipientOptions: (selectedId: string) => AllocationAgent[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<TeamCapForm>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRenameKey: (id: string, key: string) => Promise<{ renamed: boolean; error?: string }>;
}) {
  return (
    <div className="space-y-6">
      <CapHeading action="Add Team Cap" onAdd={onAdd} />
      {!isLoading && caps.length === 0 ? (
        <p className="text-xs italic text-slate-400">No team caps. This client does not use a team cap until you add one.</p>
      ) : caps.map((cap) => {
        const keyError = keyErrorFor(cap, named);
        const token = cap.key.trim() || 'this key';
        return (
          <section key={cap.id} className={`space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-800 ${phoneSheet}`}>
            <EnabledRow
              name={cap.name}
              enabled={cap.enabled}
              fallback="Team Cap"
              onEnabled={(enabled) => onChange(cap.id, { enabled })}
              onRemove={() => onRemove(cap.id)}
              onDuplicate={() => onDuplicate(cap.id)}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <NameKeyFields
                name={cap.name}
                capKey={cap.key}
                keyLocked={cap.keyLocked}
                keyCustom={cap.keyCustom}
                keyError={keyError}
                hint={`Formulas use ${token}.agent and ${token}.total.${cap.keyLocked ? '' : ' You can change it until the cap is saved.'}`}
                emptyKey="team_cap"
                onName={(name, key) => onChange(cap.id, key == null ? { name } : { name, key })}
                onKey={(key) => onChange(cap.id, { key, keyCustom: true })}
                onRename={cap.keyLocked ? (key) => onRenameKey(cap.id, key) : undefined}
              />
              <AllocationFieldMenu
                label="Allocated To"
                value={cap.recipientAgentId}
                placeholder="Choose an agent"
                options={recipientOptions(cap.recipientAgentId).map((agent) => ({ value: agent.id, label: agent.name }))}
                onChange={(recipientAgentId) => onChange(cap.id, { recipientAgentId })}
              />
              <AllocationFieldMenu
                label="Agent Split Percent Field"
                value={cap.splitPercentFieldKey}
                placeholder="Choose a field"
                options={fieldOptions(agentFields, PERCENT_FIELD_TYPES, cap.splitPercentFieldKey).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }))}
                onChange={(splitPercentFieldKey) => onChange(cap.id, { splitPercentFieldKey })}
              />
              <AllocationFieldMenu
                label="Cap Amount Field"
                value={cap.capAmountFieldKey}
                placeholder="Choose a field"
                options={fieldOptions(agentFields, AMOUNT_FIELD_TYPES, cap.capAmountFieldKey).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }))}
                onChange={(capAmountFieldKey) => onChange(cap.id, { capAmountFieldKey })}
              />
              <AllocationFieldMenu
                label="Reset Date Field"
                value={cap.resetDateFieldKey}
                placeholder="Choose a field"
                options={fieldOptions(agentFields, DATE_FIELD_TYPES, cap.resetDateFieldKey).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }))}
                onChange={(resetDateFieldKey) => onChange(cap.id, { resetDateFieldKey })}
              />
            </div>
            <FormulaEditor
              label="Qualifying Formula"
              value={cap.qualifyingFormula}
              onChange={(qualifyingFormula) => onChange(cap.id, { qualifyingFormula })}
              names={formulaNames}
              fitContent
              hint={allocationFormulaHint}
            />
            <p className="text-2xs text-slate-500 dark:text-slate-400">This field is the percent of the agent’s share paid to the selected agent. An 80/20 agent is 20%. An agent with no cap amount pays that percent in full and is not tracked. The reset date is that agent’s cap anniversary.</p>
          </section>
        );
      })}
    </div>
  );
}

function AgentCapList({
  caps,
  named,
  isLoading,
  agentFields,
  entityOptions,
  onAdd,
  onChange,
  onRemove,
  onDuplicate,
  onRenameKey,
}: {
  caps: AgentCapForm[];
  named: NamedKey[];
  isLoading: boolean;
  agentFields: { field_key: string; field_label?: string; field_type?: string }[];
  entityOptions: (selectedId: string) => { value: string; label: string }[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<AgentCapForm>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRenameKey: (id: string, key: string) => Promise<{ renamed: boolean; error?: string }>;
}) {
  return (
    <div className="space-y-6">
      <CapHeading action="Add Agent Cap" onAdd={onAdd} />
      {!isLoading && caps.length === 0 ? (
        <p className="text-xs italic text-slate-400">No agent caps. Add one for each post-split that has a cap amount.</p>
      ) : caps.map((cap) => {
        const keyError = keyErrorFor(cap, named);
        return (
          <section key={cap.id} className={`space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-800 ${phoneSheet}`}>
            <EnabledRow
              name={cap.name}
              enabled={cap.enabled}
              fallback="Agent Cap"
              onEnabled={(enabled) => onChange(cap.id, { enabled })}
              onRemove={() => onRemove(cap.id)}
              onDuplicate={() => onDuplicate(cap.id)}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <NameKeyFields
                name={cap.name}
                capKey={cap.key}
                keyLocked={cap.keyLocked}
                keyCustom={cap.keyCustom}
                keyError={keyError}
                hint={cap.keyLocked ? 'Formulas use this key.' : 'You can change the key until the cap is saved.'}
                emptyKey="agent_cap"
                onName={(name, key) => onChange(cap.id, key == null ? { name } : { name, key })}
                onKey={(key) => onChange(cap.id, { key, keyCustom: true })}
                onRename={cap.keyLocked ? (key) => onRenameKey(cap.id, key) : undefined}
              />
              <AllocationFieldMenu
                label="Post-Split Entity"
                value={cap.commissionEntityId}
                placeholder="Choose an entity"
                options={entityOptions(cap.commissionEntityId)}
                onChange={(commissionEntityId) => onChange(cap.id, { commissionEntityId })}
              />
              <AllocationFieldMenu
                label="Cap Amount Field"
                value={cap.capAmountFieldKey}
                placeholder="Choose a field"
                options={fieldOptions(agentFields, AMOUNT_FIELD_TYPES, cap.capAmountFieldKey).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }))}
                onChange={(capAmountFieldKey) => onChange(cap.id, { capAmountFieldKey })}
              />
              <AllocationFieldMenu
                label="Reset Date Field"
                value={cap.resetDateFieldKey}
                placeholder="Choose a field"
                options={fieldOptions(agentFields, DATE_FIELD_TYPES, cap.resetDateFieldKey).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }))}
                onChange={(resetDateFieldKey) => onChange(cap.id, { resetDateFieldKey })}
              />
            </div>
            <label className="inline-flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={cap.hideOverAllocations}
                onChange={(event) => onChange(cap.id, { hideOverAllocations: event.target.checked })}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600"
              />
              <span>
                <span className="font-semibold">Hide Over-Allocations</span>
                <span className="mt-0.5 block text-2xs font-normal text-slate-500 dark:text-slate-400">Reports and the waterfall stay at the cap amount. A fee that continues after the cap, such as the smaller Flat Cap Fee, is not shown as going past it.</span>
              </span>
            </label>
            <p className="text-2xs text-slate-500 dark:text-slate-400">The cap amount and reset date come from that agent’s fields. The post-split entity is the fee this cap tracks.</p>
          </section>
        );
      })}
    </div>
  );
}
