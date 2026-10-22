'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { TrashIcon } from '@/components/ui/trash-icon';
import { OptionMenu } from '@/components/ui/option-menu';
import { FieldChevron, UnderlineField, underlineControl } from '@/components/ui/underline-field';
import { FormulaEditor, type FormulaName } from '../commission-templates/FormulaEditor';
import { planFormulaNames, type CommissionPlan, type FeeTier, type PlanLine } from '@/lib/commission-engine';
import { LINE_TYPES, MenuField, NumberField, TextField, fromPoints, lineTypeLabel, newLine, toPoints } from './plan-inputs';

const FORMULA_LABELS: Record<string, string> = {
  gci: 'GCI',
  side: 'Side',
  side_after_bonuses: 'Side After Bonuses',
  split_percent: 'Split %',
  fee_share: 'Fee Share',
  share_past_cap: 'Share Past the Cap',
  post_cap_fraction: 'Share Past the Cap (Old Name)',
};

const titleCase = (text: string) => text.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function formulaLabel(name: string): string {
  if (FORMULA_LABELS[name]) return FORMULA_LABELS[name];
  if (name.startsWith('share_past_cap_')) return `Share Past the Cap of ${titleCase(name.slice('share_past_cap_'.length))}`;
  if (name.startsWith('post_cap_fraction_')) return `Share Past the Cap of ${titleCase(name.slice('post_cap_fraction_'.length))} (Old Name)`;
  return titleCase(name);
}

function formulaNames(plan: CommissionPlan, index: number): FormulaName[] {
  return planFormulaNames(plan, index).map((name) => ({ name, label: formulaLabel(name), kind: 'field' }));
}

type TierRow = { amount: number; width: number | null };

/**
 * A per-deal fee's rates, in order. Each tier charges its Amount per Deal For the Next dollars of this fee paid in the
 * cap year; the last tier must have No Limit selected, and is the fee's amount once the tiers above are paid.
 * Stored as the bounded tiers' running yearly totals (untilPaid) and the last tier as the line's amount; until No Limit
 * is selected, every row stays in `tiers` with endsWithNoLimit false and the plan cannot be saved.
 */
function TierList({
  line,
  onChange,
}: {
  line: Extract<PlanLine, { type: 'per_deal_fee' }>;
  onChange: (patch: Partial<Extract<PlanLine, { type: 'per_deal_fee' }>>) => void;
}) {
  const tiers = line.tiers || [];
  const open = line.endsWithNoLimit !== false;
  const bounded: TierRow[] = tiers.map((tier, i) => ({ amount: tier.amount, width: tier.untilPaid - (i === 0 ? 0 : tiers[i - 1].untilPaid) }));
  const rows: TierRow[] = open ? [...bounded, { amount: line.amount, width: null }] : bounded;
  const save = (next: TierRow[], noLimit: boolean) => {
    let total = 0;
    const toTiers = (list: TierRow[]) => list.map((row) => {
      total += row.width ?? 0;
      return { amount: row.amount, untilPaid: total };
    });
    if (noLimit) {
      const nextTiers = toTiers(next.slice(0, -1));
      onChange({ tiers: nextTiers.length ? nextTiers : undefined, amount: next[next.length - 1].amount, endsWithNoLimit: undefined, ...(nextTiers.length ? {} : { skipTiersForRoles: undefined }) });
    } else {
      onChange({ tiers: toTiers(next), endsWithNoLimit: false });
    }
  };
  const setRow = (i: number, patch: Partial<TierRow>) => save(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)), open);
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    // Removing the last row leaves the one above it last, still waiting for No Limit to be selected.
    save(next, open && i !== rows.length - 1);
  };
  const setNoLimit = (checked: boolean) => {
    if (checked) save(rows.map((row, j) => (j === rows.length - 1 ? { ...row, width: null } : row)), true);
  };
  return (
    <div className="space-y-2 sm:col-span-3">
      <div className="text-2xs font-bold text-slate-500 dark:text-slate-400">{rows.length > 1 ? 'Tiers' : 'Amount'}</div>
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-3">
            <NumberField label={rows.length > 1 ? `Tier ${i + 1}: Amount per Deal` : 'Amount per Deal'} prefix="$" value={row.amount} onChange={(value) => setRow(i, { amount: value ?? 0 })} />
            {last ? (
              // The last tier's For the Next is an amount typed in, or No Limit picked from the field's menu.
              <UnderlineField label="For the Next">
                <OptionMenu
                  allowCustom
                  className={`${underlineControl} overview-field-select`}
                  value={open ? 'No Limit' : row.width ? String(row.width) : ''}
                  placeholder="Choose No Limit or Type an Amount"
                  options={[{ value: 'No Limit', label: 'No Limit' }]}
                  onChange={(value) => {
                    if (value === 'No Limit') {
                      setNoLimit(true);
                      return;
                    }
                    const amount = Number(value.replace(/[$,\s]/g, ''));
                    if (value.trim() === '' || Number.isFinite(amount)) save(rows.map((item, j) => (j === i ? { ...item, width: value.trim() === '' ? 0 : amount } : item)), false);
                  }}
                />
                <FieldChevron />
              </UnderlineField>
            ) : (
              <NumberField label="For the Next" prefix="$" value={row.width} onChange={(value) => setRow(i, { width: value ?? 0 })} />
            )}
            {rows.length > 1 ? (
              <button type="button" onClick={() => remove(i)} className="mb-1 cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600" aria-label={`Remove Tier ${i + 1}`} title={`Remove Tier ${i + 1}`}>
                <TrashIcon />
              </button>
            ) : <span />}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => save([...rows.map((row, j) => (j === rows.length - 1 && row.width === null ? { ...row, width: 0 } : row)), { amount: 0, width: 0 }], false)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-brand-500/10 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-500/15 dark:hover:text-brand-400"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Add Tier
      </button>
      {rows.length > 1 && (
        <p className="text-2xs text-slate-500 dark:text-slate-400">Charged in order, by what the agent has paid on this fee in the cap year; a deal that finishes a tier is charged the rest at the next one. Choose No Limit in the last tier&apos;s For the Next.</p>
      )}
    </div>
  );
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
                    label="Only on the Part Past the Cap Of"
                    value={line.multiplierFrom || ''}
                    placeholder="Not Multiplied"
                    options={[{ value: '', label: 'Not Multiplied' }, ...capped.map((other) => ({ value: other.key, label: other.name }))]}
                    onChange={(key) => setLine(index, { multiplierFrom: key || undefined })}
                  />
                  <TierList line={line} onChange={(patch) => setLine(index, patch)} />
                  {line.tiers?.length ? (
                    <label title="Agents marked Team Lead on Agents pay the last tier's amount from the start." className="flex items-center gap-2 self-end pb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-brand-600"
                        checked={Boolean(line.skipTiersForRoles?.includes('team_lead'))}
                        onChange={(event) => setLine(index, { skipTiersForRoles: event.target.checked ? ['team_lead'] : undefined })}
                      />
                      Skip the Tiers
                    </label>
                  ) : null}
                  <label className="flex items-center gap-2 self-end pb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-brand-600"
                      checked={line.appliesFeeShare !== false}
                      onChange={(event) => setLine(index, { appliesFeeShare: event.target.checked ? undefined : false })}
                    />
                    Times the deal&apos;s Fee Share
                  </label>
                </>
              )}

              {line.type === 'percent_of_net' && (
                <>
                  <NumberField label="Rate" suffix="%" value={toPoints(line.rate)} onChange={(points) => setLine(index, { rate: fromPoints(points ?? 0) })} />
                  <label className="flex items-center gap-2 self-end pb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand-600" checked={Boolean(line.optIn)} onChange={(event) => setLine(index, { optIn: event.target.checked || undefined })} />
                    Only agents who opt in
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
