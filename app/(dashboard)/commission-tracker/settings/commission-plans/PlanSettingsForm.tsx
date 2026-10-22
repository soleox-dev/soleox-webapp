'use client';

import React from 'react';
import type { PlanDto, PlanSettingsDto } from '@/app/api/commission-plans/route';
import type { PlanLine } from '@/lib/commission-engine';
import type { AllocationSchemaField } from '../allocation-fields';
import { MenuField, TextField } from './plan-inputs';

/** Comma-separated statuses, committed when the field loses focus so typing a comma does not jump. */
function StatusesField({ statuses, onChange }: { statuses: string[]; onChange: (statuses: string[]) => void }) {
  const [draft, setDraft] = React.useState(statuses.join(', '));
  React.useEffect(() => setDraft(statuses.join(', ')), [statuses]);
  return (
    <div onBlur={() => onChange([...new Set(draft.split(',').map((status) => status.trim()).filter(Boolean))])}>
      <TextField label="Statuses That Count Toward Caps" value={draft} onChange={setDraft} />
    </div>
  );
}

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
  entities,
}: {
  settings: PlanSettingsDto;
  onChange: (settings: PlanSettingsDto) => void;
  plans: PlanDto[];
  transactionFields: AllocationSchemaField[];
  agentFields: AllocationSchemaField[];
  /** The client's commission entities, for the lines earlier deals paid. */
  entities: { id: string; name: string }[];
}) {
  const yearly = linesBy(plans, (line) =>
    (line.type === 'capped_percent' && line.capAmount !== null && line.capAmount !== undefined)
    || (line.type === 'per_deal_fee' && (line.yearlyLimit !== undefined || Boolean(line.tiers?.length)))
    || (line.type === 'formula' && line.yearlyLimit !== undefined));
  const optIns = linesBy(plans, (line) => line.type === 'percent_of_net' && Boolean(line.optIn));
  const capped = linesBy(plans, (line) => line.type === 'capped_percent');
  const setMap = (name: 'startingBalanceFieldKeys' | 'optInFieldKeys' | 'capAmountFieldKeys' | 'historyEntityIds', key: string, value: string) => {
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
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Calculate Deals</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex cursor-pointer items-center gap-2 pb-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand-600" checked={settings.calculateDeals} onChange={(event) => onChange({ ...settings, calculateDeals: event.target.checked })} />
            Calculate deals with Commission Plans
          </label>
          {settings.calculateSince && (
            <span className="pb-1 text-xs text-slate-500 dark:text-slate-400">On since {new Date(settings.calculateSince).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          )}
        </div>
        <p className="max-w-3xl text-2xs text-slate-500 dark:text-slate-400">
          When on, deals created from now on calculate each agent&apos;s plan lines. Deals that already exist keep their saved lines exactly as they are: on each one, Calculate With Plans shows the plan result, and nothing changes until it is saved. A deal saved with plans keeps its saved lines when plans or these settings change. Finished deals never change. Leave it off until the template no longer has its own brokerage rules.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cap Year</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MenuField label="Cap Date (Orders Deals for Caps)" value={settings.capDateFieldKey} options={options(transactionDates, DATE_TYPES, settings.capDateFieldKey, 'Closing Date').filter((option) => option.value !== '')} onChange={(value) => onChange({ ...settings, capDateFieldKey: value || 'closing_date' })} />
          <MenuField label="Cap Year Start (Agent Field)" value={settings.capYearStartFieldKey} options={options(agentFields, DATE_TYPES, settings.capYearStartFieldKey, 'Not Set')} onChange={(value) => onChange({ ...settings, capYearStartFieldKey: value })} />
          <MenuField label="Starting Balances For (Agent Field)" value={settings.startingBalancesForFieldKey} options={options(agentFields, DATE_TYPES, settings.startingBalancesForFieldKey, 'Not Set')} onChange={(value) => onChange({ ...settings, startingBalancesForFieldKey: value })} />
        </div>
        <div className="sm:max-w-md">
          <StatusesField statuses={settings.countingStatuses} onChange={(countingStatuses) => onChange({ ...settings, countingStatuses })} />
        </div>
        <p className="max-w-3xl text-2xs text-slate-500 dark:text-slate-400">
          Deals with these statuses count toward each agent&apos;s cap year, in Cap Date order; deals on the same date count in the order they were first saved. An agent without Cap Year Start is not calculated; the deal asks for it.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Earlier Deals</h3>
        <p className="max-w-3xl text-2xs text-slate-500 dark:text-slate-400">Deals saved before plans calculated them paid these lines to the template&apos;s entities. Name each entity, and its saved lines count toward the agent&apos;s caps and yearly limits like plan lines.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {yearly.length === 0 && <span className="text-xs text-slate-400">No plan line keeps a yearly total yet.</span>}
          {yearly.map((line) => {
            const selected = settings.historyEntityIds[line.key] || '';
            const choices = [{ value: '', label: 'None' }, ...entities.map((entity) => ({ value: entity.id, label: entity.name }))];
            if (selected && !entities.some((entity) => entity.id === selected)) choices.push({ value: selected, label: selected });
            return <MenuField key={`history-${line.key}`} label={`${line.name} Was Paid To`} value={selected} options={choices} onChange={(value) => setMap('historyEntityIds', line.key, value)} />;
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Starting Balances</h3>
        <p className="max-w-3xl text-2xs text-slate-500 dark:text-slate-400">What each agent had paid in the cap year before their deals were in the app. They count only in the cap year Starting Balances For falls in.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {yearly.length === 0 && <span className="text-xs text-slate-400">No plan line keeps a yearly total yet.</span>}
          {yearly.map((line) => (
            <MenuField key={line.key} label={`Starting ${line.name}`} value={settings.startingBalanceFieldKeys[line.key] || ''} options={options(agentFields, AMOUNT_TYPES, settings.startingBalanceFieldKeys[line.key] || '', 'None')} onChange={(value) => setMap('startingBalanceFieldKeys', line.key, value)} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Opt-Ins and Agent Caps</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {optIns.map((line) => (
            <MenuField key={`opt-${line.key}`} label={`${line.name} (Yes/No Agent Field)`} value={settings.optInFieldKeys[line.key] || ''} options={options(agentFields, YES_NO_TYPES, settings.optInFieldKeys[line.key] || '', 'Nobody Opts In')} onChange={(value) => setMap('optInFieldKeys', line.key, value)} />
          ))}
          {capped.map((line) => (
            <MenuField key={`cap-${line.key}`} label={`${line.name} Cap Override (Agent Field)`} value={settings.capAmountFieldKeys[line.key] || ''} options={options(agentFields, AMOUNT_TYPES, settings.capAmountFieldKeys[line.key] || '', 'Plan Cap for Everyone')} onChange={(value) => setMap('capAmountFieldKeys', line.key, value)} />
          ))}
          {optIns.length === 0 && capped.length === 0 && <span className="text-xs text-slate-400">Add a plan first.</span>}
        </div>
      </section>
    </div>
  );
}
