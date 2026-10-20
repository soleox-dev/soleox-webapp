'use client';

import React, { useEffect, useState } from 'react';
import { useRegisterSave } from '@/components/save-leave-guard';
import { UnderlineField, underlineControl } from '@/components/ui/underline-field';
import { FormulaEditor } from '../commission-templates/FormulaEditor';
import { ALLOCATION_CLIENT_ID, AllocationFieldMenu, allocationFormulaHint, useAllocationSchema } from '../allocation-fields';

type VolumeForm = {
  name: string;
  enabled: boolean;
  qualifyingFormula: string;
  anchor: 'sales_price' | 'sales_price_x_units';
  assignment: 'agent_share' | 'primary_agent';
};

const emptyVolume: VolumeForm = {
  name: 'Agent Allocation',
  enabled: false,
  qualifyingFormula: '',
  anchor: 'sales_price',
  assignment: 'agent_share',
};

function volumeFromRow(row: Record<string, unknown> | null): VolumeForm {
  if (!row) return emptyVolume;
  return {
    name: String(row.name || 'Agent Allocation'),
    enabled: Boolean(row.enabled),
    qualifyingFormula: String(row.qualifying_formula || ''),
    anchor: row.anchor === 'sales_price_x_units' ? 'sales_price_x_units' : 'sales_price',
    assignment: row.assignment === 'primary_agent' ? 'primary_agent' : 'agent_share',
  };
}

export default function AgentAllocationsPage() {
  const [volume, setVolume] = useState<VolumeForm>(emptyVolume);
  const [baseline, setBaseline] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { formulaNames } = useAllocationSchema();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/agent-allocations?client_id=${ALLOCATION_CLIENT_ID}`, {
          headers: { 'x-client-id': ALLOCATION_CLIENT_ID },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.error || 'The agent allocation could not be loaded.');
        if (cancelled) return;
        const nextVolume = volumeFromRow(data.salesVolume);
        setVolume(nextVolume);
        setBaseline(JSON.stringify(nextVolume));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The agent allocation could not be loaded.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dirty = baseline !== '' && JSON.stringify(volume) !== baseline;

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/agent-allocations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-client-id': ALLOCATION_CLIENT_ID },
        body: JSON.stringify({ clientId: ALLOCATION_CLIENT_ID, salesVolume: volume }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'The agent allocation could not be saved.');
      setBaseline(JSON.stringify(volume));
      setMessage('Agent allocation saved.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent allocation could not be saved.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useRegisterSave({
    id: 'agent-allocations',
    active: dirty,
    saving: isSaving,
    onSave: save,
    onDiscard: () => {
      setVolume(JSON.parse(baseline) as VolumeForm);
      setMessage(null);
      setError(null);
    },
  });

  const label = volume.name.trim() || 'Agent Allocation';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Agent allocations</h2>
          <p className="mt-1 max-w-2xl text-[11px] text-slate-500 dark:text-slate-400">
            One rule for the amount allocated to the agents on a deal. It can follow sales price, or sales price times units. It does not change the agent splits. A blank qualifying formula applies to every deal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || isSaving || isLoading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {message && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-md dark:border-slate-700 dark:bg-slate-800">
        <label className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-bold cursor-pointer ${volume.enabled ? 'bg-brand-500/15 text-brand-800 dark:text-brand-200' : 'bg-amber-500/15 text-amber-900 dark:text-amber-100'}`}>
          <input type="checkbox" checked={volume.enabled} onChange={(event) => setVolume({ ...volume, enabled: event.target.checked })} className="h-4 w-4 cursor-pointer accent-brand-600" />
          {`${label} is ${volume.enabled ? 'enabled' : 'disabled'}`}
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <UnderlineField label="Name">
            <input className={underlineControl} value={volume.name} onChange={(event) => setVolume({ ...volume, name: event.target.value })} />
          </UnderlineField>
          <AllocationFieldMenu
            label="Basis"
            value={volume.anchor}
            placeholder="Sales price"
            options={[{ value: 'sales_price', label: 'Sales price' }, { value: 'sales_price_x_units', label: 'Sales price × units' }]}
            onChange={(anchor) => setVolume({ ...volume, anchor: anchor === 'sales_price_x_units' ? 'sales_price_x_units' : 'sales_price' })}
          />
          <AllocationFieldMenu
            label="Assignment"
            value={volume.assignment}
            placeholder="Each agent’s share of the deal"
            options={[{ value: 'agent_share', label: 'Each agent’s share of the deal' }, { value: 'primary_agent', label: 'Primary agent' }]}
            onChange={(assignment) => setVolume({ ...volume, assignment: assignment === 'primary_agent' ? 'primary_agent' : 'agent_share' })}
          />
        </div>
        <FormulaEditor
          label="Qualifying formula"
          value={volume.qualifyingFormula}
          onChange={(qualifyingFormula) => setVolume({ ...volume, qualifyingFormula })}
          names={formulaNames}
          fitContent
          hint={allocationFormulaHint}
        />
      </section>
    </div>
  );
}
