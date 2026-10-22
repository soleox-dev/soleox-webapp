'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { TrashIcon } from '@/components/ui/trash-icon';
import { FormulaEditor, type FormulaName } from '../commission-templates/FormulaEditor';
import { planFormulaNames, type CommissionPlan, type PlanLine } from '@/lib/commission-engine';
import { LINE_TYPES, MenuField, NumberField, TextField, fromPoints, lineTypeLabel, newLine, toPoints } from './plan-inputs';

const FORMULA_LABELS: Record<string, string> = {
  gci: 'GCI',
  side: 'Side',
  side_after_bonuses: 'Side After Bonuses',
  split_percent: 'Split %',
  fee_share: 'Fee Share',
  post_cap_fraction: 'Post-Cap Fraction',
};

function formulaNames(plan: CommissionPlan, index: number): FormulaName[] {
  return planFormulaNames(plan, index).map((name) => ({ name, label: FORMULA_LABELS[name] || name.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: 'field' }));
}

/** The plan's lines in order, each with the settings of its rule type. */
export function PlanEditor({
  plan,
  onChange,
  entityNames,
  lockedKeys,
}: {
  plan: CommissionPlan;
  onChange: (plan: CommissionPlan) => void;
  entityNames: string[];
  /** Keys of lines already saved: year-to-date totals and the plan settings refer to them, so they stay fixed. */
  lockedKeys: Set<string>;
}) {
  const setLine = (index: number, patch: Partial<PlanLine>) =>
    onChange({ ...plan, lines: plan.lines.map((line, i) => (i === index ? ({ ...line, ...patch } as PlanLine) : line)) });
  const move = (index: number, by: number) => {
    const lines = [...plan.lines];
    const [line] = lines.splice(index, 1);
    lines.splice(index + by, 0, line);
    onChange({ ...plan, lines });
  };
  const add = (type: PlanLine['type']) => onChange({ ...plan, lines: [...plan.lines, newLine(type, new Set(plan.lines.map((line) => line.key)))] });
  const payeeOptions = entityNames.map((name) => ({ value: name, label: name }));

  return (
    <div className="space-y-3">
      {plan.lines.map((line, index) => {
        const earlier = plan.lines.slice(0, index);
        const capped = earlier.filter((other) => other.type === 'capped_percent');
        return (
          <div key={index} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-slate-500 dark:bg-slate-900 dark:text-slate-400">{index + 1}</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{line.name || 'Untitled Line'}</span>
              <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400">{lineTypeLabel(line.type)}</span>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-default disabled:opacity-30 dark:hover:bg-slate-700" aria-label={`Move ${line.name} up`} title="Move Up">
                  <ArrowUp className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button type="button" disabled={index === plan.lines.length - 1} onClick={() => move(index, 1)} className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-default disabled:opacity-30 dark:hover:bg-slate-700" aria-label={`Move ${line.name} down`} title="Move Down">
                  <ArrowDown className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button type="button" onClick={() => onChange({ ...plan, lines: plan.lines.filter((_, i) => i !== index) })} className="cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600" aria-label={`Remove ${line.name}`} title="Remove Line">
                  <TrashIcon />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TextField label="Name" value={line.name} onChange={(name) => setLine(index, { name })} />
              {lockedKeys.has(line.key) ? (
                <div title="Saved keys stay fixed: year-to-date totals and the plan settings use them.">
                  <TextField label="Key (Saved)" mono readOnly value={line.key} onChange={() => undefined} />
                </div>
              ) : (
                <TextField label="Key" mono value={line.key} onChange={(key) => setLine(index, { key: key.trim() })} />
              )}
              <MenuField label="Payee" value={line.payee} options={payeeOptions.some((option) => option.value === line.payee) || !line.payee ? payeeOptions : [{ value: line.payee, label: line.payee }, ...payeeOptions]} onChange={(payee) => setLine(index, { payee })} placeholder="Choose an Entity" />

              {line.type === 'capped_percent' && (
                <>
                  <NumberField label="Rate" suffix="%" value={toPoints(line.rate)} onChange={(points) => setLine(index, { rate: fromPoints(points ?? 0) })} />
                  <NumberField label="Yearly Cap" prefix="$" allowEmpty placeholder="No Cap" value={line.capAmount ?? null} onChange={(capAmount) => setLine(index, { capAmount })} />
                </>
              )}

              {line.type === 'per_deal_fee' && (
                <>
                  <NumberField label="Amount per Deal" prefix="$" value={line.amount} onChange={(amount) => setLine(index, { amount: amount ?? 0 })} />
                  <NumberField label="Yearly Limit" prefix="$" allowEmpty placeholder="No Limit" value={line.yearlyLimit ?? null} onChange={(limit) => setLine(index, { yearlyLimit: limit ?? undefined })} />
                  <NumberField
                    label="No More Than (of the Split)"
                    suffix="%"
                    allowEmpty
                    placeholder="No Limit"
                    value={line.maxPercentOfSide === undefined ? null : toPoints(line.maxPercentOfSide)}
                    onChange={(points) => setLine(index, { maxPercentOfSide: points === null ? undefined : fromPoints(points) })}
                  />
                  <MenuField
                    label="Times the Post-Cap Fraction Of"
                    value={line.multiplierFrom || ''}
                    placeholder="Not Multiplied"
                    options={[{ value: '', label: 'Not Multiplied' }, ...capped.map((other) => ({ value: other.key, label: other.name }))]}
                    onChange={(key) => setLine(index, { multiplierFrom: key || undefined })}
                  />
                  <NumberField
                    label="First Tier Amount"
                    prefix="$"
                    allowEmpty
                    placeholder="No Tier"
                    value={line.tiers?.[0]?.amount ?? null}
                    onChange={(amount) => setLine(index, { tiers: amount === null ? undefined : [{ amount, untilPaid: line.tiers?.[0]?.untilPaid ?? 0 }] })}
                  />
                  {line.tiers?.length ? (
                    <>
                      <NumberField label="Until Paid This Year" prefix="$" value={line.tiers[0].untilPaid} onChange={(untilPaid) => setLine(index, { tiers: [{ amount: line.tiers![0].amount, untilPaid: untilPaid ?? 0 }] })} />
                      <label className="flex items-center gap-2 self-end pb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-brand-600"
                          checked={Boolean(line.skipTiersForRoles?.includes('team_lead'))}
                          onChange={(event) => setLine(index, { skipTiersForRoles: event.target.checked ? ['team_lead'] : undefined })}
                        />
                        Team Leads Skip the Tier
                      </label>
                    </>
                  ) : null}
                  <label className="flex items-center gap-2 self-end pb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-brand-600"
                      checked={line.appliesFeeShare !== false}
                      onChange={(event) => setLine(index, { appliesFeeShare: event.target.checked ? undefined : false })}
                    />
                    Times the Deal&apos;s Fee Share
                  </label>
                </>
              )}

              {line.type === 'percent_of_net' && (
                <>
                  <NumberField label="Rate" suffix="%" value={toPoints(line.rate)} onChange={(points) => setLine(index, { rate: fromPoints(points ?? 0) })} />
                  <label className="flex items-center gap-2 self-end pb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand-600" checked={Boolean(line.optIn)} onChange={(event) => setLine(index, { optIn: event.target.checked || undefined })} />
                    Only Agents Who Opt In
                  </label>
                  <div className="sm:col-span-3">
                    <div className="mb-1 text-2xs font-bold text-slate-500 dark:text-slate-400">Taken Off the Side First</div>
                    <div className="flex flex-wrap gap-3">
                      {earlier.length === 0 && <span className="text-xs text-slate-400">Add lines above this one to take them off first.</span>}
                      {earlier.map((other) => (
                        <label key={other.key} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-brand-600"
                            checked={line.after.includes(other.key)}
                            onChange={(event) => setLine(index, { after: event.target.checked ? [...line.after, other.key] : line.after.filter((key) => key !== other.key) })}
                          />
                          {other.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {line.type === 'formula' && (
                <>
                  <NumberField label="Yearly Limit" prefix="$" allowEmpty placeholder="No Limit" value={line.yearlyLimit ?? null} onChange={(limit) => setLine(index, { yearlyLimit: limit ?? undefined })} />
                  <MenuField
                    label="Counts Toward the Cap Of"
                    value={line.countsTowardCap || ''}
                    placeholder="No Cap"
                    options={[{ value: '', label: 'No Cap' }, ...plan.lines.filter((other) => other.type === 'capped_percent').map((other) => ({ value: other.key, label: other.name }))]}
                    onChange={(key) => setLine(index, { countsTowardCap: key || undefined })}
                  />
                  <div className="sm:col-span-3">
                    <FormulaEditor value={line.formula} onChange={(formula) => setLine(index, { formula })} names={formulaNames(plan, index)} fitContent hint="An amount in dollars. line_<key> reads a line above; ytd_<key> what was paid this cap year." />
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        {LINE_TYPES.map((item) => (
          <button
            key={item.type}
            type="button"
            title={item.hint}
            onClick={() => add(item.type)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-brand-500/10 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-500/15 dark:hover:text-brand-400"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
