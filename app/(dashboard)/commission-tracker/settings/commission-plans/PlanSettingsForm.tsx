'use client';

import React from 'react';
import type { PlanDto, PlanSettingsDto } from '@/app/api/commission-plans/route';
import type { PlanLine } from '@/lib/commission-engine';
import type { AllocationSchemaField } from '../allocation-fields';
import { MenuField } from './plan-inputs';

const DATE_TYPES = new Set(['DATE']);
const AMOUNT_TYPES = new Set(['CURRENCY', 'NUMBER']);
const YES_NO_TYPES = new Set(['BOOLEAN', 'SELECT', 'TEXT']);

function options(fields: AllocationSchemaField[], types: Set<string>, selected: string, emptyLabel: string) {
  const list = fields.filter((field) => types.has(field.field_type || '')).map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }));
  if (selected && !list.some((option) => option.value === selected)) list.unshift({ value: selected, label: selected });
  return [{ value: '', label: emptyLabel }, ...list];
}

/** Every line across the client's plans with that key, named by its first plan line. */
function linesBy(plans: PlanDto[], keep: (line: PlanLine) => boolean): { key: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const plan of plans) {
    const latest = plan.versions[plan.versions.length - 1];
    for (const line of latest?.lines || []) if (keep(line) && !seen.has(line.key)) seen.set(line.key, line.name);
  }
  return [...seen].map(([key, name]) => ({ key, name }));
}

/**
 * Which fields feed the plans: the transaction date that orders deals for caps, and the agent fields for Cap
 * Year Start, the starting balances, opt-ins and cap overrides. Line keys come from the client's own plans.
 */
export function PlanSettingsForm({
  settings,
  onChange,
  plans,
  transactionFields,
  agentFields,
}: {
  settings: PlanSettingsDto;
  onChange: (settings: PlanSettingsDto) => void;
  plans: PlanDto[];
  transactionFields: AllocationSchemaField[];
  agentFields: AllocationSchemaField[];
}) {
  const yearly = linesBy(plans, (line) =>
    (line.type === 'capped_percent' && line.capAmount !== null && line.capAmount !== undefined)
    || (line.type === 'per_deal_fee' && (line.yearlyLimit !== undefined || Boolean(line.tiers?.length)))
    || (line.type === 'formula' && line.yearlyLimit !== undefined));
  const optIns = linesBy(plans, (line) => line.type === 'percent_of_net' && Boolean(line.optIn));
  const capped = linesBy(plans, (line) => line.type === 'capped_percent');
  const setMap = (name: 'startingBalanceFieldKeys' | 'optInFieldKeys' | 'capAmountFieldKeys', key: string, value: string) => {
    const next = { ...settings[name] };
    if (value) next[key] = value;
    else delete next[key];
    onChange({ ...settings, [name]: next });
  };
  const transactionDates = [
    { field_key: 'closing_date', field_label: 'Closing Date', field_type: 'DATE' },
    ...transactionFields.filter((field) => field.field_key !== 'closing_date'),
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cap year</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MenuField label="Cap Date (orders deals for caps)" value={settings.capDateFieldKey} options={options(transactionDates, DATE_TYPES, settings.capDateFieldKey, 'Closing Date').filter((option) => option.value !== '')} onChange={(value) => onChange({ ...settings, capDateFieldKey: value || 'closing_date' })} />
          <MenuField label="Cap Year Start (agent field)" value={settings.capYearStartFieldKey} options={options(agentFields, DATE_TYPES, settings.capYearStartFieldKey, 'Not set')} onChange={(value) => onChange({ ...settings, capYearStartFieldKey: value })} />
          <MenuField label="Starting Balances For (agent field)" value={settings.startingBalancesForFieldKey} options={options(agentFields, DATE_TYPES, settings.startingBalancesForFieldKey, 'Not set')} onChange={(value) => onChange({ ...settings, startingBalancesForFieldKey: value })} />
        </div>
        <p className="max-w-3xl text-2xs text-slate-500 dark:text-slate-400">
          Deals count toward each agent&apos;s cap year in Cap Date order, ties by when the deal was first saved. An agent without Cap Year Start is not calculated; the deal asks for it.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Starting balances</h3>
        <p className="max-w-3xl text-2xs text-slate-500 dark:text-slate-400">What each agent had paid in the cap year before their deals were in the app. They count only in the cap year Starting Balances For falls in.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {yearly.length === 0 && <span className="text-xs text-slate-400">No plan line keeps a yearly total yet.</span>}
          {yearly.map((line) => (
            <MenuField key={line.key} label={`Starting ${line.name}`} value={settings.startingBalanceFieldKeys[line.key] || ''} options={options(agentFields, AMOUNT_TYPES, settings.startingBalanceFieldKeys[line.key] || '', 'None')} onChange={(value) => setMap('startingBalanceFieldKeys', line.key, value)} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Opt-ins and agent caps</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {optIns.map((line) => (
            <MenuField key={`opt-${line.key}`} label={`${line.name} (yes/no agent field)`} value={settings.optInFieldKeys[line.key] || ''} options={options(agentFields, YES_NO_TYPES, settings.optInFieldKeys[line.key] || '', 'Nobody opts in')} onChange={(value) => setMap('optInFieldKeys', line.key, value)} />
          ))}
          {capped.map((line) => (
            <MenuField key={`cap-${line.key}`} label={`${line.name} cap override (agent field)`} value={settings.capAmountFieldKeys[line.key] || ''} options={options(agentFields, AMOUNT_TYPES, settings.capAmountFieldKeys[line.key] || '', 'Plan cap for everyone')} onChange={(value) => setMap('capAmountFieldKeys', line.key, value)} />
          ))}
          {optIns.length === 0 && capped.length === 0 && <span className="text-xs text-slate-400">Add a plan first.</span>}
        </div>
      </section>
    </div>
  );
}
