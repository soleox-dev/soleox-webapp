'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { proposedExpPresetKey } from '@/lib/commission-engine';
import type { PlanDto, PlanSettingsDto, PlansResponse } from '@/app/api/commission-plans/route';
import { SETTINGS_PRIMARY_BUTTON } from '@/components/settings/SettingsHeader';
import type { AllocationSchemaField } from '../allocation-fields';
import { MenuField } from './plan-inputs';

type AgentRow = { id: string; name: string; status: string; planId: string; values: Record<string, unknown> };

const AMOUNT_TYPES = new Set(['CURRENCY', 'NUMBER']);
const DATE_TYPES = new Set(['DATE']);

function fieldChoices(fields: AllocationSchemaField[], types: Set<string> | null, emptyLabel: string) {
  return [
    { value: '', label: emptyLabel },
    ...fields.filter((field) => !types || types.has(field.field_type || '')).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key })),
  ];
}

/** The first field whose key matches, as a starting guess the user can change. */
const guess = (fields: AllocationSchemaField[], pattern: RegExp, types: Set<string> | null) =>
  fields.find((field) => pattern.test(field.field_key) && (!types || types.has(field.field_type || '')))?.field_key || '';

const show = (value: unknown) => (value === undefined || value === null || value === '' ? '—' : String(value));

/**
 * Proposes each agent's Commission Plan from today's cap fields (design: Migration step 1) for review before
 * anything is saved: a $4,000 or $8,000 cap is that eXp preset; a $16,000 cap is eXp $16,000 with a $250 fee cap
 * and eXp $16,000 Team Lead without one. Apply assigns the changed rows (copying presets the client has not
 * copied yet) and fills Plan Settings with the Cap Year Start and Stock fields. No deal is recalculated.
 */
export function ProposePlansDialog({
  data,
  agentFields,
  onClose,
  onApplied,
}: {
  data: PlansResponse;
  agentFields: AllocationSchemaField[];
  onClose: () => void;
  onApplied: (next: PlansResponse, message: string) => void;
}) {
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [capField, setCapField] = useState('');
  const [feeCapField, setFeeCapField] = useState('');
  const [capYearField, setCapYearField] = useState(data.settings.capYearStartFieldKey);
  const [stockField, setStockField] = useState(data.settings.optInFieldKeys.stock || '');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCapField((current) => current || guess(agentFields, /company_comm_cap|cap_amount|broker_cap$/i, AMOUNT_TYPES));
    setFeeCapField((current) => current || guess(agentFields, /250|flat_fee_cap|fee_cap/i, AMOUNT_TYPES));
    setCapYearField((current) => current || guess(agentFields, /cap_date|cap_year/i, DATE_TYPES));
    setStockField((current) => current || guess(agentFields, /stock/i, null));
  }, [agentFields]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/agents');
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(result.agents)) throw new Error(result.error || 'The agents could not be loaded.');
        if (cancelled) return;
        setAgents(result.agents.map((agent: Record<string, unknown>) => ({
          id: String(agent.id),
          name: String(agent.agent_name || agent.id),
          status: String(agent.agent_status || ''),
          planId: String(agent.commission_plan_id || ''),
          values: agent,
        })).sort((a: AgentRow, b: AgentRow) => a.name.localeCompare(b.name)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The agents could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // A preset the client already copied is offered as that copy, so applying does not copy it twice.
  const options = useMemo(() => {
    const copied = new Set(data.plans.map((plan) => plan.presetKey).filter(Boolean));
    return [
      { value: '', label: 'No Plan' },
      ...data.plans.map((plan) => ({ value: `plan:${plan.id}`, label: plan.name })),
      ...data.presets.filter((preset) => !copied.has(preset.presetKey)).map((preset) => ({ value: `preset:${preset.id}`, label: `${preset.name} (Copy Preset)` })),
    ];
  }, [data]);

  const proposalFor = (agent: AgentRow): string => {
    const key = proposedExpPresetKey(capField ? agent.values[capField] : null, feeCapField ? agent.values[feeCapField] : null);
    if (!key) return '';
    const copy: PlanDto | undefined = data.plans.find((plan) => plan.presetKey === key);
    if (copy) return `plan:${copy.id}`;
    const preset = data.presets.find((item) => item.presetKey === key);
    return preset ? `preset:${preset.id}` : '';
  };
  const choiceFor = (agent: AgentRow) => choices[agent.id] ?? (agent.planId ? `plan:${agent.planId}` : proposalFor(agent));
  const changed = (agents || []).filter((agent) => choiceFor(agent) !== (agent.planId ? `plan:${agent.planId}` : ''));
  const settingsChanged = capYearField !== data.settings.capYearStartFieldKey || stockField !== (data.settings.optInFieldKeys.stock || '');

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      let next: PlansResponse = data;
      if (changed.length) {
        const response = await fetch('/api/commission-plans/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignments: changed.map((agent) => {
              const [kind, id] = choiceFor(agent).split(':');
              return { agentId: agent.id, planId: kind === 'plan' ? id : null, presetId: kind === 'preset' ? id : null };
            }),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.error || 'The plans could not be assigned.');
        next = result;
      }
      if (settingsChanged) {
        const settings: PlanSettingsDto = {
          ...next.settings,
          capYearStartFieldKey: capYearField,
          optInFieldKeys: { ...next.settings.optInFieldKeys, ...(stockField ? { stock: stockField } : {}) },
        };
        if (!stockField) delete settings.optInFieldKeys.stock;
        const response = await fetch('/api/commission-plans', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.error || 'The plan settings could not be saved.');
        next = result;
      }
      onApplied(next, `${changed.length} agent${changed.length === 1 ? '' : 's'} assigned${settingsChanged ? ', and Plan Settings updated' : ''}. No deal was recalculated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The plans could not be assigned.');
    } finally {
      setSaving(false);
    }
  };

  const planName = (value: string) => options.find((option) => option.value === value)?.label || '—';

  return (
    <div className="app-modal fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <div className="shrink-0 space-y-4 px-6 pb-3 pt-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Propose Plans</h3>
            <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
              Proposes each agent&apos;s eXp plan from today&apos;s cap fields: a $4,000 or $8,000 cap is that eXp plan; a $16,000 cap is eXp $16,000 with a first tier limit and eXp $16,000 Team Lead without one. Review and change any row, or pick any of your plans; nothing is saved until Apply, and no deal is recalculated.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <MenuField label="Cap Field" hint={"The agent field with each agent's company dollar cap today: $4,000, $8,000 or $16,000 picks that eXp plan."} value={capField} options={fieldChoices(agentFields, AMOUNT_TYPES, 'Not Set')} onChange={setCapField} />
            <MenuField label="First Tier Limit Field" hint={"The agent field with how much of the $250 post-cap fee the agent pays before it drops to $75. Above zero with a $16,000 cap: eXp $16,000; zero or empty: eXp $16,000 Team Lead."} value={feeCapField} options={fieldChoices(agentFields, AMOUNT_TYPES, 'Not Set')} onChange={setFeeCapField} />
            <MenuField label="Cap Year Start Field" hint={"The agent date field with each agent's cap anniversary. Apply saves it in Plan Settings."} value={capYearField} options={fieldChoices(agentFields, DATE_TYPES, 'Not Set')} onChange={setCapYearField} />
            <MenuField label="Opt-In Field (Yes or a Rate)" hint={"The agent field that says whether the agent buys stock: Yes, or a rate above zero. Apply saves it in Plan Settings."} value={stockField} options={fieldChoices(agentFields, null, 'Nobody Opts In')} onChange={setStockField} />
          </div>
          {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-4">
          {!agents && !error && <p className="text-xs text-slate-400">Loading agents…</p>}
          {agents && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white dark:bg-slate-800">
                <tr className="border-b border-slate-200 text-left text-2xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Cap</th>
                  <th className="py-2 pr-3 text-right">First Tier Limit</th>
                  <th className="py-2 pr-3">Current Plan</th>
                  <th className="py-2 pr-3">Plan</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const choice = choiceFor(agent);
                  const isChange = choice !== (agent.planId ? `plan:${agent.planId}` : '');
                  return (
                    <tr key={agent.id} className={`border-b border-slate-100 dark:border-slate-700/60 ${isChange ? 'bg-brand-500/5' : ''}`}>
                      <td className="py-1.5 pr-3 font-semibold text-slate-800 dark:text-slate-200">{agent.name}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{agent.status || '—'}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{show(capField ? agent.values[capField] : '')}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{show(feeCapField ? agent.values[feeCapField] : '')}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{agent.planId ? planName(`plan:${agent.planId}`) : '—'}</td>
                      <td className="min-w-56 py-1 pr-3">
                        <MenuField label={isChange ? 'Changes To' : 'Stays'} value={choice} options={options} onChange={(value) => setChoices((current) => ({ ...current, [agent.id]: value }))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {changed.length} agent{changed.length === 1 ? '' : 's'} will change{settingsChanged ? '; Plan Settings will be updated' : ''}.
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="cursor-pointer rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</button>
            <button type="button" onClick={() => void apply()} disabled={saving || !agents || (!changed.length && !settingsChanged)} className={SETTINGS_PRIMARY_BUTTON}>
              {saving ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
