'use client';

import { useLayoutEffect, useRef } from 'react';
import { capProgressLabel } from '@/lib/agent-cap-progress';
import { toPercentPoints } from '@/lib/percent';
import { roundCurrency } from '../types';
import { DecimalInput } from './DecimalInput';
import { HoverNote } from './HoverNote';

export type AgentAllocationLine = {
  id: string;
  agent_id: string;
  kind: 'team_cap' | 'sales_volume';
  amount: number | null;
  calculated_amount: number | null;
  is_override: boolean | null;
  period_start: string | null;
  team_cap_id?: string | null;
  cap_name?: string | null;
  tracked?: boolean;
  cap_amount?: number | null;
  prior_amount?: number | null;
  team_percent?: number | null;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function adjustedSplitView(
  computed: { capAdjusted?: boolean; displayPercent?: number; amount?: number } | undefined,
): { percentPoints: number; dollar: number } | null {
  if (!computed?.capAdjusted) return null;
  return {
    percentPoints: toPercentPoints(Number(computed.displayPercent) || 0),
    dollar: Number(computed.amount) || 0,
  };
}

export type TeamCapGroup = {
  id: string;
  name: string;
  lines: AgentAllocationLine[];
};

export function teamCapStanding(line: AgentAllocationLine): { label: string; amount: string; limit: string; detail: string; share: number; exceeded: boolean } | null {
  if (line.kind !== 'team_cap' || line.tracked === false) return null;
  const cap = line.cap_amount == null ? null : Number(line.cap_amount);
  if (cap == null || !Number.isFinite(cap) || Math.abs(cap) < 0.005) return null;
  const prior = roundCurrency(Math.max(0, Number(line.prior_amount) || 0));
  const current = roundCurrency(Math.max(0, Number(line.amount) || 0));
  const after = roundCurrency(prior + current);
  const exceeded = Boolean(line.is_override) && after > cap + 0.005;
  const progress = capProgressLabel(after, cap);
  const percent = line.team_percent == null || !Number.isFinite(Number(line.team_percent))
    ? ''
    : `Pays ${Number(line.team_percent).toLocaleString('en-US', { maximumFractionDigits: 2 })}% of the agent split until ${money.format(cap)}.\n`;
  const detail = `${percent}Before this transaction: ${money.format(prior)}\nThis transaction: ${money.format(current)}\nIncluding this transaction: ${money.format(after)} of ${money.format(cap)}`;
  return { label: progress.label, amount: progress.amount, limit: progress.limit, detail, share: progress.share, exceeded };
}

export function teamCapGroups(allocations: AgentAllocationLine[]): TeamCapGroup[] {
  const groups = new Map<string, TeamCapGroup>();
  allocations.forEach((line) => {
    if (line.kind !== 'team_cap') return;
    const id = line.team_cap_id || line.cap_name || 'team_cap';
    const group = groups.get(id) || { id, name: line.cap_name || 'Team Cap', lines: [] };
    group.lines.push(line);
    groups.set(id, group);
  });
  return [...groups.values()];
}

export function TeamCapAmount({
  line,
  isEditing,
  onAmountChange,
}: {
  line: AgentAllocationLine | undefined;
  isEditing: boolean;
  onAmountChange?: (agentId: string, teamCapId: string, amount: number | null) => void;
}) {
  if (!line) {
    return <span className={`inline-flex w-[6.5rem] justify-end text-xs font-semibold text-slate-300 dark:text-slate-600 pr-2`}>—</span>;
  }
  const amount = Number(line.amount) || 0;
  const calculated = line.calculated_amount == null ? null : Number(line.calculated_amount);
  const canEdit = Boolean(isEditing && onAmountChange && line.team_cap_id);
  const edited = Boolean(line.is_override);
  const standing = teamCapStanding(line);
  const exceeded = Boolean(standing?.exceeded);
  const amountTone = exceeded ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200';
  const editedTone = exceeded ? 'text-rose-600/80 dark:text-rose-300/80' : 'text-amber-700/80 dark:text-amber-300/80';
  // In edit mode the bar lines up with the input's text, which sits inside its padding.
  const standingNote = standing ? (
    <span className={canEdit ? 'pr-2' : undefined}>
      <AgentCapNote amount={standing.amount} limit={standing.limit} detail={standing.detail} share={standing.share} />
    </span>
  ) : null;
  if (!canEdit) {
    // The table's amounts keep 8px clear on the right, so this one does too and lines up with the splits above.
    return (
      <span className="inline-flex flex-col items-end pr-2">
        {/* "edited" goes before the amount, so the amount keeps the split amounts' right edge above it. */}
        <span className="inline-flex items-baseline justify-end gap-1">
          {edited ? <span className={`text-2xs font-bold ${editedTone}`}>Edited</span> : null}
          <span className={`text-xs font-semibold ${amountTone}`}>{money.format(amount)}</span>
        </span>
        {standingNote}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
    <span className="inline-flex items-center justify-end gap-1">
      {edited && calculated != null ? (
        <button
          type="button"
          onClick={() => onAmountChange?.(line.agent_id, line.team_cap_id || '', null)}
          title={`Use the calculated ${money.format(calculated)}`}
          className={`text-2xs font-bold cursor-pointer ${editedTone} ${exceeded ? 'hover:text-rose-700 dark:hover:text-rose-200' : 'hover:text-amber-900 dark:hover:text-amber-100'}`}
        >
          Calculated
        </button>
      ) : null}
      <span className="underline-field relative inline-flex w-[6.5rem] rounded-t-md border-b border-b-slate-300 transition-colors dark:border-b-slate-600 focus-within:border-b-brand-500 focus-within:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)]">
        <DecimalInput
          value={amount}
          onChange={(next) => {
            if (calculated != null && Math.abs(next - calculated) < 0.005) {
              onAmountChange?.(line.agent_id, line.team_cap_id || '', null);
              return;
            }
            onAmountChange?.(line.agent_id, line.team_cap_id || '', roundCurrency(Math.max(0, next)));
          }}
          useCommas
          filled
          onKeyDown={(event) => { if (event.key === '-') event.preventDefault(); }}
          placeholder="0.00"
          className={`h-7 w-full border-0 bg-transparent pl-5 pr-2 text-right text-xs font-semibold focus:outline-none ${exceeded ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}
        />
        <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-xs font-semibold ${exceeded ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>$</span>
      </span>
    </span>
    {standingNote}
    </span>
  );
}

function matchCapBarWidths(bar: HTMLElement) {
  const root = bar.closest('#commission') ?? document.body;
  const bars = [...root.querySelectorAll<HTMLElement>('[data-cap-bar]')];
  if (bars.length === 0) return;
  for (const item of bars) item.style.width = 'max-content';
  const max = Math.max(...bars.map((item) => item.getBoundingClientRect().width));
  // Measured while hidden (the waterfall is still calculating): keep each bar's own width rather than 0.
  if (max < 1) return;
  const px = `${Math.ceil(max)}px`;
  for (const item of bars) item.style.width = px;
}

/** The cap standing: the cap's limit in small, light text, then the amount reached so far inside the bar, which ends at the cell's right edge. */
export function AgentCapNote({ amount, limit, detail, share }: { amount: string; limit: string; detail: string; share: number }) {
  const barRef = useRef<HTMLSpanElement>(null);
  const width = Math.min(100, Math.max(0, share * 100));
  const over = share > 1;
  const fill = over ? 'bg-rose-400 dark:bg-rose-500/50' : 'bg-emerald-400 dark:bg-emerald-500/50';
  // Quiet text in the bar's own colour, so the bar reads as a hint rather than a figure.
  // The empty part of the bar: a faint wash and thin outline in the bar's colour, so its full length shows.
  const track = over
    ? 'bg-rose-500/10 ring-1 ring-inset ring-rose-600/25 dark:bg-rose-400/10 dark:ring-rose-400/25'
    : 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-600/25 dark:bg-emerald-400/10 dark:ring-emerald-400/25';
  const text = over ? 'text-rose-900/75 dark:text-rose-200/75' : 'text-emerald-900/75 dark:text-emerald-200/75';
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    matchCapBarWidths(bar);
    // A bar first laid out while hidden matches the others once it shows.
    let shown = bar.getBoundingClientRect().width > 0;
    const observer = new ResizeObserver(() => {
      const visible = bar.getBoundingClientRect().width > 0;
      if (visible && !shown) matchCapBarWidths(bar);
      shown = visible;
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, [amount]);
  return (
    <HoverNote label={detail}>
      <span tabIndex={0} aria-label={`${amount} of ${limit}`} className="mt-0.5 inline-flex cursor-help items-center gap-1 outline-none">
        <span aria-hidden className="w-8 shrink-0 text-right text-2xs font-light leading-none tabular-nums text-slate-400 dark:text-slate-500">{limit}</span>
        <span ref={barRef} data-cap-bar className={`relative -mr-1 inline-flex h-4 shrink-0 items-center justify-end overflow-hidden rounded-sm ${track}`}>
          <span aria-hidden className={`absolute inset-y-0 left-0 z-0 ${fill}`} style={{ width: `${width}%` }} />
          <span aria-hidden className={`relative z-10 px-1 text-right text-2xs font-normal leading-none tabular-nums ${text}`}>{amount}</span>
        </span>
      </span>
    </HoverNote>
  );
}

export function AgentAllocationNotes({ agentId, allocations }: { agentId: string; allocations: AgentAllocationLine[] }) {
  const lines = allocations.filter((line) => line.agent_id === agentId && line.kind !== 'team_cap');
  if (lines.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-2xs font-semibold text-slate-500 dark:text-slate-400">
      {lines.map((line) => (
        <p key={line.id}>
          {line.kind === 'sales_volume' ? 'Agent Allocation' : `${line.cap_name || (line.tracked === false ? 'Team Lead' : 'Team Cap')}${line.tracked === false && line.cap_name ? ' · Team Lead' : ''}`} {money.format(Number(line.amount) || 0)}
          {line.is_override ? ' · Edited' : ''}
        </p>
      ))}
    </div>
  );
}
