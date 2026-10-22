'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Library, Plus, Settings2 } from 'lucide-react';
import { useRegisterSave, useRequestLeave } from '@/components/save-leave-guard';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TrashIcon } from '@/components/ui/trash-icon';
import { useAccess } from '@/components/access-provider';
import { SettingsHeader, SETTINGS_CARD, SETTINGS_PRIMARY_BUTTON } from '@/components/settings/SettingsHeader';
import { validatePlan, type CommissionPlan, type PlanLine } from '@/lib/commission-engine';
import type { PlanDto, PlanSettingsDto, PlansResponse } from '@/app/api/commission-plans/route';
import { useAllocationSchema } from '../allocation-fields';
import { PlanEditor } from './PlanEditor';
import { PlanTestBench } from './PlanTestBench';
import { PlanSettingsForm } from './PlanSettingsForm';
import { MenuField, TextField } from './plan-inputs';
import { NativeDateInput } from '@/components/ui/NativeDateInput';
import { UnderlineField, underlineControl } from '@/components/ui/underline-field';

type Tab = 'plans' | 'settings' | 'presets';

type Draft = { id: string; preset: boolean; name: string; effectiveFrom: string; lines: PlanLine[] };

const today = () => new Date().toISOString().slice(0, 10);

function draftFrom(plan: PlanDto, versionId?: string): Draft {
  const version = plan.versions.find((item) => item.id === versionId) || plan.versions[plan.versions.length - 1];
  return { id: plan.id, preset: plan.isPreset, name: plan.name, effectiveFrom: version?.effectiveFrom || today(), lines: version?.lines || [] };
}

const longDate = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Commission Plans: what each agent owes the brokerage on a deal, written once per plan and applied to every
 * agent on it. Plans are copied from the preset library or built line by line, checked on the test bench,
 * and saved as a version from a date. Plan Settings says which fields feed them.
 */
export default function CommissionPlansPage() {
  const { access } = useAccess();
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const { fields: transactionFields, agentFields } = useAllocationSchema();
  const requestLeave = useRequestLeave();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();

  const [data, setData] = useState<PlansResponse | null>(null);
  const [entityNames, setEntityNames] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('plans');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [settingsDraft, setSettingsDraft] = useState<PlanSettingsDto | null>(null);
  const [settingsBaseline, setSettingsBaseline] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = (next: PlansResponse, selectId?: string | null, scope: Tab = tab) => {
    setData(next);
    setSettingsDraft(next.settings);
    setSettingsBaseline(JSON.stringify(next.settings));
    const list = scope === 'presets' ? next.presets : next.plans;
    const chosen = list.find((plan) => plan.id === selectId) || (selectId === undefined ? list[0] : undefined);
    const nextDraft = chosen ? draftFrom(chosen) : null;
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [plansResponse, entitiesResponse] = await Promise.all([fetch('/api/commission-plans'), fetch('/api/commission-entities')]);
        const plansData = await plansResponse.json().catch(() => ({}));
        const entityData = await entitiesResponse.json().catch(() => ({}));
        if (!plansResponse.ok || plansData.success === false) throw new Error(plansData.error || 'The commission plans could not be loaded.');
        if (cancelled) return;
        accept(plansData as PlansResponse);
        const roster: { entity_name?: string }[] = Array.isArray(entityData.entities) ? entityData.entities : [];
        setEntityNames(roster.map((entity) => String(entity.entity_name || '')).filter(Boolean));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The commission plans could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
    // Loaded once per client; accept() reads the tab it starts on.
  }, [access?.clientId]);

  const list = tab === 'presets' ? data?.presets || [] : data?.plans || [];
  const selected = draft ? list.find((plan) => plan.id === draft.id) : undefined;
  const planDirty = draft !== null && JSON.stringify(draft) !== baseline;
  const settingsDirty = settingsDraft !== null && JSON.stringify(settingsDraft) !== settingsBaseline;
  const dirty = tab === 'settings' ? settingsDirty : planDirty;
  const canEdit = tab !== 'presets' || isSuperAdmin;

  const enginePlan: CommissionPlan | null = useMemo(
    () => (draft ? { id: draft.id || 'draft', name: draft.name, lines: draft.lines } : null),
    [draft],
  );
  const problems = enginePlan ? validatePlan(enginePlan) : [];
  const lockedKeys = useMemo(() => new Set((selected?.versions || []).flatMap((version) => version.lines.map((line) => line.key))), [selected]);

  const call = async (init: RequestInit & { url?: string }, done: string) => {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(init.url || '/api/commission-plans', { ...init, headers: { 'Content-Type': 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || 'The change could not be saved.');
      setMessage(done);
      return result as PlansResponse & { savedId?: string; createdId?: string };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const save = async () => {
    if (tab === 'settings') {
      if (!settingsDraft) return false;
      const result = await call({ method: 'PUT', body: JSON.stringify({ settings: settingsDraft }) }, 'Plan settings saved.');
      if (result) accept(result, draft?.id ?? null);
      return Boolean(result);
    }
    if (!draft) return false;
    if (problems.length) {
      setError(problems[0]);
      return false;
    }
    const result = await call(
      { method: 'PUT', body: JSON.stringify({ plan: { id: draft.id || null, preset: draft.preset, name: draft.name, effectiveFrom: draft.effectiveFrom, lines: draft.lines } }) },
      `${draft.name} saved, effective ${longDate(draft.effectiveFrom)}.`,
    );
    if (result) accept(result, result.savedId ?? draft.id);
    return Boolean(result);
  };

  const discard = () => {
    if (tab === 'settings') setSettingsDraft(settingsBaseline ? (JSON.parse(settingsBaseline) as PlanSettingsDto) : null);
    else setDraft(baseline ? (JSON.parse(baseline) as Draft | null) : null);
    setMessage(null);
    setError(null);
  };

  useRegisterSave({ id: 'commission-plans', active: dirty && canEdit, saving: isSaving, onSave: save, onDiscard: discard });

  const choose = (next: () => void) => requestLeave(() => {
    next();
    setMessage(null);
    setError(null);
  });

  const chooseTab = (next: Tab) => {
    if (next === tab) return;
    choose(() => {
      setTab(next);
      const nextList = next === 'presets' ? data?.presets || [] : data?.plans || [];
      const first = nextList[0] ? draftFrom(nextList[0]) : null;
      setDraft(first);
      setBaseline(JSON.stringify(first));
      if (data) setSettingsDraft(data.settings);
    });
  };

  const choosePlan = (plan: PlanDto, versionId?: string) => choose(() => {
    const next = draftFrom(plan, versionId);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  });

  const startBlank = () => choose(() => {
    const next: Draft = { id: '', preset: tab === 'presets', name: tab === 'presets' ? 'New preset' : 'New plan', effectiveFrom: today(), lines: [] };
    setDraft(next);
    setBaseline('');
  });

  const copyPreset = async (presetId: string) => {
    if (!presetId) return;
    const result = await call({ method: 'POST', body: JSON.stringify({ presetId }) }, 'Preset copied into your plans.');
    if (result) accept(result, result.createdId ?? null, 'plans');
  };

  const remove = async (plan: PlanDto) => {
    const agents = data?.agentCounts[plan.id] || 0;
    const confirmed = await confirmAction({
      title: `Remove ${plan.name}?`,
      message: agents
        ? `${agents} agent${agents === 1 ? ' is' : 's are'} on this plan. Move them to another plan on Agents first.`
        : 'Saved deals keep the numbers they were calculated with. The plan stops being offered to agents.',
      confirmLabel: 'Remove Plan',
    });
    if (!confirmed) return;
    const result = await call({ method: 'DELETE', url: `/api/commission-plans?id=${encodeURIComponent(plan.id)}` }, `${plan.name} removed.`);
    if (result) accept(result);
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
          title="Commission Plans"
          description="What each agent owes the brokerage on a deal (company dollar, fees, stock), written once per plan and applied to every agent on it."
          actions={canEdit ? (
            <button type="button" onClick={() => void save()} disabled={!dirty || isSaving || !data} className={SETTINGS_PRIMARY_BUTTON}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          ) : undefined}
        />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900">
            <button type="button" onClick={() => chooseTab('plans')} className={tabClass(tab === 'plans')}>
              <ClipboardList className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Plans
            </button>
            <button type="button" onClick={() => chooseTab('settings')} className={tabClass(tab === 'settings')}>
              <Settings2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Plan Settings
            </button>
            {isSuperAdmin && (
              <button type="button" onClick={() => chooseTab('presets')} className={tabClass(tab === 'presets')}>
                <Library className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                Preset Library
              </button>
            )}
          </div>
        </div>
      </div>

      {message && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      {!data && !error && <p className="text-xs text-slate-400">Loading…</p>}

      {data && tab === 'settings' && settingsDraft && (
        <div className={SETTINGS_CARD}>
          <PlanSettingsForm settings={settingsDraft} onChange={setSettingsDraft} plans={data.plans} transactionFields={transactionFields} agentFields={agentFields} />
        </div>
      )}

      {data && tab !== 'settings' && (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <div className={`${SETTINGS_CARD} space-y-1 !p-3`}>
            {list.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">{tab === 'presets' ? 'No presets yet.' : 'No plans yet. Copy a preset or start a blank plan.'}</p>}
            {list.map((plan) => (
              <div key={plan.id} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${draft?.id === plan.id ? 'bg-brand-500/10' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}>
                <button type="button" onClick={() => choosePlan(plan)} className="min-w-0 flex-1 cursor-pointer text-left">
                  <div className={`truncate text-xs font-semibold ${draft?.id === plan.id ? 'text-brand-700 dark:text-brand-400' : 'text-slate-800 dark:text-slate-200'}`}>{plan.name}</div>
                  {tab === 'plans' && <div className="text-2xs text-slate-500 dark:text-slate-400">{data.agentCounts[plan.id] || 0} agents</div>}
                </button>
                {canEdit && (
                  <button type="button" onClick={() => void remove(plan)} className="cursor-pointer rounded p-1 text-rose-500 opacity-0 transition hover:bg-rose-500/10 group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${plan.name}`} title="Remove plan">
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                <button type="button" onClick={startBlank} className="inline-flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-brand-500/10 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-500/15 dark:hover:text-brand-400">
                  <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {tab === 'presets' ? 'Blank preset' : 'Blank plan'}
                </button>
                {tab === 'plans' && data.presets.length > 0 && (
                  <MenuField label="Copy a preset" value="" placeholder="Choose a preset" options={data.presets.map((preset) => ({ value: preset.id, label: preset.name }))} onChange={(id) => requestLeave(() => void copyPreset(id))} />
                )}
              </div>
            )}
          </div>

          {draft && enginePlan ? (
            <div className="space-y-6">
              <div className={`${SETTINGS_CARD} space-y-4`}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <TextField label="Plan name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
                  <UnderlineDate label="These lines take effect" value={draft.effectiveFrom} onChange={(effectiveFrom) => setDraft({ ...draft, effectiveFrom })} />
                </div>
                {selected && selected.versions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-2xs text-slate-500 dark:text-slate-400">
                    <span className="font-bold">Versions:</span>
                    {selected.versions.map((version) => (
                      <button key={version.id} type="button" onClick={() => choosePlan(selected, version.id)} className={`cursor-pointer rounded-md px-2 py-0.5 font-semibold transition ${draft.effectiveFrom === version.effectiveFrom ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}>
                        from {longDate(version.effectiveFrom)}
                      </button>
                    ))}
                    <span>Saving with a new date adds a version from that date; deals before it keep the earlier lines.</span>
                  </div>
                )}
                <PlanEditor plan={enginePlan} lockedKeys={lockedKeys} entityNames={entityNames} onChange={(plan) => setDraft({ ...draft, name: plan.name, lines: plan.lines })} />
                {problems.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400">
                    {problems.map((problem) => <li key={problem}>{problem}</li>)}
                  </ul>
                )}
              </div>

              <div className={`${SETTINGS_CARD} space-y-4`}>
                <SettingsHeader title="Test bench" description="Runs the plan as it stands above on a sample deal. Nothing here is saved." />
                <PlanTestBench plan={enginePlan} />
              </div>
            </div>
          ) : (
            <div className={SETTINGS_CARD}>
              <p className="text-sm text-slate-500 dark:text-slate-400">Choose a plan, copy a preset, or start a blank plan.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnderlineDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <UnderlineField label={label}>
      <NativeDateInput value={value} onChange={(event) => onChange(event.target.value)} className={`${underlineControl} overview-date dark:[color-scheme:dark]`} />
    </UnderlineField>
  );
}
